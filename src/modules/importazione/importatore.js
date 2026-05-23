import pdfParse            from "pdf-parse";
import Fuse                from "fuse.js";
import { createRequire }   from "module";
import { query }           from "../../shared/db/pool.js";

const _require = createRequire(import.meta.url);
const XLSX     = _require("xlsx");

// ── Normalizzazione ───────────────────────────────────────────────────────────

function norm(s) {
  return (s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // rimuovi accenti
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function parseData(s) {
  const t = (s || "").toString().trim();
  const m = t.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return null;
}

function parseImporto(s) {
  if (s == null || s === "") return null;
  const raw = String(s).replace(/\s/g,"").replace(/[^\d,.\-+]/g,"");
  if (!raw) return null;
  let v;
  if (raw.includes(",") && raw.includes(".")) {
    // Formato italiano: 1.234,56
    v = parseFloat(raw.replace(/\./g,"").replace(",","."));
  } else if (raw.includes(",")) {
    v = parseFloat(raw.replace(",","."));
  } else {
    v = parseFloat(raw);
  }
  return isNaN(v) ? null : v;
}

// ── Rilevazione mese dalla descrizione ────────────────────────────────────────

const MESI_IT = [
  ["gennaio","01"],["febbraio","02"],["marzo","03"],
  ["aprile","04"],["maggio","05"],["giugno","06"],
  ["luglio","07"],["agosto","08"],["settembre","09"],
  ["ottobre","10"],["novembre","11"],["dicembre","12"],
];

function detectMese(descrizione, fallbackData) {
  const d = (descrizione || "").toLowerCase().replace(/\s+/g,"");
  for (const [nome, mm] of MESI_IT) {
    const pos = d.indexOf(nome);
    if (pos === -1) continue;
    const after = d.slice(pos + nome.length, pos + nome.length + 15);
    const m4 = after.match(/(20\d{2})(?!\d)/);
    if (m4) return `${m4[1]}-${mm}`;
    const m2 = after.match(/^([2-9]\d)(?!\d)/);
    if (m2) return `20${m2[1]}-${mm}`;
    if (fallbackData) return `${fallbackData.slice(0,4)}-${mm}`;
    return null;
  }
  return fallbackData ? fallbackData.slice(0,7) : null;
}

// ── Parser PDF ────────────────────────────────────────────────────────────────

async function parsePDF(buffer) {
  const { text } = await pdfParse(buffer);
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.length < 8) continue;

    // Cerca data all'inizio della riga
    const dm = t.match(/^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}|\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2})/);
    if (!dm) continue;
    const data = parseData(dm[1]);
    if (!data) continue;

    // Cerca importo alla fine (con segno opzionale)
    const am = t.match(/([+\-]?\s*\d[\d.,]*)\s*(?:EUR|€)?\s*$/i);
    if (!am) continue;
    const raw = parseImporto(am[1].replace(/\s/g,""));
    if (raw == null || raw === 0) continue;

    const descrizione = t.slice(dm[0].length, t.lastIndexOf(am[0])).trim();

    rows.push({
      data, importo: Math.abs(raw),
      segno: raw < 0 ? -1 : 1,
      descrizione_raw: descrizione,
    });
  }
  return rows;
}

// ── Pulizia descrizione bancaria ──────────────────────────────────────────────
// Molti estratti conto mettono il testo utile DOPO "ORD." o separatori fissi.
// Questa funzione tenta di estrarlo; se non trova nulla restituisce la stringa
// originale (troncata a 200 chars per leggibilità).

function cleanDesc(s) {
  const t = (s || "").trim();
  // "RIF:12345ORD. Mario Rossi AFFITTO MAGGIO/SEPASCT/" → "Mario Rossi AFFITTO MAGGIO"
  const ordM = t.match(/ORD(?:INANTE)?\.\s*(.+?)(?:\/SEPASCT\/.*)?$/i);
  if (ordM) {
    // rimuovi code tipo "/SEPASCT/", "INST" iniziale, e RIF numerici
    return ordM[1]
      .replace(/^INST\s+/i, "")
      .replace(/\s*\/SEPASCT\/.*$/i, "")
      .trim()
      .slice(0, 120);
  }
  // Rimuovi prefissi tipo "Bonif. v/fav. - " / "Addeb. diretto - "
  const cleaned = t.replace(/^[\w\s.\/]+\s*-\s*/, "").trim();
  return (cleaned || t).slice(0, 200);
}

// ── Parser Excel / XLS  (SheetJS — supporta sia .xlsx che .xls BIFF8) ─────────

async function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];

  // Converte in matrice di stringhe
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  // Rileva riga header nelle prime 10 righe
  let headerIdx = -1;
  let colData = 0, colDesc = 1, colImp = -1, colDare = -1, colAver = -1;

  for (let i = 0; i < Math.min(10, matrix.length); i++) {
    const vals = matrix[i].map(v => norm(String(v ?? "")));
    const idx  = kws => vals.findIndex(v => v != null && kws.some(k => v.includes(k)));

    const di = idx(["data op", "data val", "data", "date"]);
    if (di >= 0) {
      const descIdx = idx(["descri", "causale", "operaz", "detail"]);
      const impIdx  = idx(["importo", "amount", "totale"]);
      const dareIdx = idx(["dare", "addebit", "debit", "uscita"]);
      const averIdx = idx(["avere", "accredit", "credit", "entrata"]);
      // Richiedi almeno un'altra colonna riconosciuta oltre alla data,
      // per evitare falsi positivi su righe tipo "Data estrazione: ..."
      if (descIdx < 0 && impIdx < 0 && dareIdx < 0 && averIdx < 0) continue;
      headerIdx = i;
      colData = di;
      colDesc = descIdx >= 0 ? descIdx : di + 1;
      colImp  = impIdx;
      colDare = dareIdx;
      colAver = averIdx;
      break;
    }
  }

  const rows = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row  = matrix[i];
    let   data = null;
    const rawD = row[colData];
    if (rawD instanceof Date) data = rawD.toISOString().slice(0, 10);
    else                      data = parseData(String(rawD ?? ""));
    if (!data) continue;

    const descrizione = cleanDesc(String(row[colDesc] ?? "").trim());
    let importo, segno;

    if (colDare >= 0 && colAver >= 0) {
      const avereV = parseImporto(String(row[colAver] ?? ""));
      const dareV  = parseImporto(String(row[colDare] ?? ""));
      // Avere (credito) → entrata; Dare (debito) → uscita con valore pos o neg
      if      (avereV != null && avereV > 0) { importo = avereV;           segno =  1; }
      else if (dareV  != null && dareV  !== 0) { importo = Math.abs(dareV); segno = -1; }
      else continue;
    } else if (colImp >= 0) {
      const v = parseImporto(String(row[colImp] ?? ""));
      if (v == null) continue;
      importo = Math.abs(v); segno = v < 0 ? -1 : 1;
    } else {
      // Ultima cella numerica come fallback
      let lastV = null;
      for (let j = row.length - 1; j >= 0; j--) {
        const v = parseImporto(String(row[j] ?? ""));
        if (v != null) { lastV = v; break; }
      }
      if (lastV == null) continue;
      importo = Math.abs(lastV); segno = lastV < 0 ? -1 : 1;
    }

    rows.push({ data, importo, segno, descrizione_raw: descrizione });
  }

  return rows;
}

// ── Parser CSV/TXT ────────────────────────────────────────────────────────────

function parseCSV(buffer) {
  const text  = buffer.toString("utf-8");
  const lines = text.split(/\r?\n/);
  if (!lines.length) return [];

  const sep = (lines[0] || "").includes(";") ? ";" : ",";

  const parseRow = line =>
    line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ""));

  // Rilevazione header
  let headerIdx  = -1;
  let colData = 0, colDesc = 1, colImp = -1, colDare = -1, colAver = -1;
  const first = parseRow(lines[0] || "").map(h => norm(h));

  const idxOf = (kws) => first.findIndex(v => kws.some(k => v.includes(k)));
  const di = idxOf(["data op","data val","data","date","giorno"]);
  if (di >= 0) {
    headerIdx = 0;
    colData = di;
    colDesc = idxOf(["descri","causale","operaz"]);
    if (colDesc < 0) colDesc = di + 1;
    colImp  = idxOf(["importo","amount"]);
    colDare = idxOf(["dare","addebit","debit"]);
    colAver = idxOf(["avere","accredit","credit"]);
  }

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    const cells = parseRow(t);

    const data = parseData(cells[colData]);
    if (!data) continue;

    const descrizione = (cells[colDesc] || "").trim();
    let importo, segno;

    if (colDare >= 0 && colAver >= 0) {
      const dare  = parseImporto(cells[colDare])  ?? 0;
      const avere = parseImporto(cells[colAver]) ?? 0;
      if      (dare  > 0) { importo = dare;  segno = -1; }
      else if (avere > 0) { importo = avere; segno =  1; }
      else continue;
    } else if (colImp >= 0) {
      const v = parseImporto(cells[colImp]);
      if (v == null) continue;
      importo = Math.abs(v); segno = v < 0 ? -1 : 1;
    } else {
      // ultima cella numerica
      let lastV = null;
      for (let j = cells.length - 1; j >= 0; j--) {
        const v = parseImporto(cells[j]);
        if (v != null) { lastV = v; break; }
      }
      if (lastV == null) continue;
      importo = Math.abs(lastV); segno = lastV < 0 ? -1 : 1;
    }

    rows.push({ data, importo, segno, descrizione_raw: descrizione });
  }
  return rows;
}

// ── Entry point parsing ───────────────────────────────────────────────────────

export async function parseFile(buffer, filename) {
  const ext = (filename || "").split(".").pop().toLowerCase();
  if (ext === "pdf")              return parsePDF(buffer);
  if (ext === "xlsx" || ext === "xls") return parseExcel(buffer);
  return parseCSV(buffer);
}

// ── Matching intelligente ─────────────────────────────────────────────────────

export async function matchRows(righe) {
  const [appartamenti, regole] = await Promise.all([
    query(`
      SELECT a.id, a.nome,
             json_agg(json_build_object(
               'id', c.id, 'nome', c.nome, 'cognome', c.cognome
             ) ORDER BY c.cognome) FILTER (WHERE c.id IS NOT NULL) AS componenti
      FROM appartamenti a
      LEFT JOIN componenti c ON c.appartamento_id = a.id AND c.attivo = TRUE
      WHERE a.attivo = TRUE
      GROUP BY a.id, a.nome ORDER BY a.nome
    `),
    query(`SELECT * FROM regole_importazione ORDER BY uso_count DESC, LENGTH(stringa) DESC`),
  ]);

  // Costruisci lista componenti flat con token di ricerca
  const tuttiComp = [];
  for (const app of appartamenti) {
    for (const c of (app.componenti || [])) {
      if (!c.id) continue;
      tuttiComp.push({
        _id:      String(c.id),
        _appId:   String(app.id),
        nome:     c.nome,
        cognome:  c.cognome,
        _cognome: norm(c.cognome || ""),
        _nome:    norm(c.nome    || ""),
      });
    }
  }

  // Fuse solo per nomi appartamento (query corta su item corto → funziona bene)
  const fuseApp = new Fuse(appartamenti, {
    keys: [{ name: "nome", weight: 1 }], threshold: 0.4, includeScore: true,
  });

  const result = righe.map(riga => {
    const desc = norm(riga.descrizione_raw);
    let appartamento_id = null, componente_id = null;
    let confidenza = 0, motivo = "";

    // 1 — regole salvate (match esatto su sottostringa)
    let tipo_versamento_default = null;
    let ignora = false;
    for (const r of regole) {
      if (desc.includes(norm(r.stringa))) {
        appartamento_id = r.appartamento_id ? String(r.appartamento_id) : null;
        componente_id   = r.componente_id   ? String(r.componente_id)   : null;
        confidenza = 100;
        if (r.tipo_riga === "ignora") {
          ignora = true;
          motivo = `Regola: ignora`;
        } else {
          tipo_versamento_default = r.tipo_riga || null;
          motivo = `Regola: "${r.stringa}"`;
        }
        break;
      }
    }

    // 2 — ricerca per cognome (sottostringa esatta, min 3 chars)
    if (!appartamento_id) {
      for (const c of tuttiComp) {
        if (c._cognome.length >= 3 && desc.includes(c._cognome)) {
          appartamento_id = c._appId;
          componente_id   = c._id;
          confidenza = 90;
          motivo = `Cognome: ${c.cognome || ""}`;
          break;
        }
      }
    }

    // 3 — ricerca per nome (sottostringa esatta, min 3 chars)
    if (!appartamento_id) {
      for (const c of tuttiComp) {
        if (c._nome.length >= 3 && desc.includes(c._nome)) {
          appartamento_id = c._appId;
          componente_id   = c._id;
          confidenza = 70;
          motivo = `Nome: ${c.nome || ""}`;
          break;
        }
      }
    }

    // 4 — Fuse su nome appartamento
    if (!appartamento_id) {
      // cerca ogni parola della descrizione di almeno 4 chars nell'elenco appartamenti
      const words = desc.split(/\s+/).filter(w => w.length >= 4);
      let bestScore = 1;
      let bestApp   = null;
      for (const w of words) {
        const hits = fuseApp.search(w);
        if (hits.length && hits[0].score < bestScore) {
          bestScore = hits[0].score;
          bestApp   = hits[0].item;
        }
      }
      if (bestApp && bestScore < 0.35) {
        appartamento_id = String(bestApp.id);
        confidenza = Math.round((1 - bestScore) * 65);
        motivo = `Appartamento: ${bestApp.nome}`;
      }
    }

    return {
      ...riga,
      appartamento_id,
      componente_id,
      confidenza,
      motivo,
      tipo_versamento: tipo_versamento_default || null,
      mese_riferimento: detectMese(riga.descrizione_raw, riga.data),
      includi: !ignora && confidenza > 0,
    };
  });

  return { righe: result, appartamenti };
}

// ── Regole importazione ───────────────────────────────────────────────────────

export async function listRegole() {
  return query(`
    SELECT ri.*,
           c.nome AS comp_nome, c.cognome AS comp_cognome,
           a.nome AS app_nome
    FROM regole_importazione ri
    LEFT JOIN componenti   c ON c.id = ri.componente_id
    LEFT JOIN appartamenti a ON a.id = ri.appartamento_id
    ORDER BY ri.uso_count DESC, ri.stringa
  `);
}

export async function upsertRegola({ stringa, componente_id, appartamento_id, tipo_riga, note }) {
  const rows = await query(
    `INSERT INTO regole_importazione (stringa, componente_id, appartamento_id, tipo_riga, note)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (stringa) DO UPDATE
       SET componente_id=$2, appartamento_id=$3, tipo_riga=$4, note=$5,
           uso_count = regole_importazione.uso_count + 1
     RETURNING *`,
    [norm(stringa), componente_id || null, appartamento_id || null, tipo_riga || null, note || null]
  );
  return rows[0];
}

export async function updateRegola(id, { stringa, componente_id, appartamento_id, tipo_riga, note }) {
  const rows = await query(
    `UPDATE regole_importazione
     SET stringa=$1, componente_id=$2, appartamento_id=$3, tipo_riga=$4, note=$5, updated_at=NOW()
     WHERE id=$6 RETURNING *`,
    [norm(stringa), componente_id || null, appartamento_id || null, tipo_riga || null, note || null, id]
  );
  return rows[0];
}

export async function deleteRegola(id) {
  await query(`DELETE FROM regole_importazione WHERE id=$1`, [id]);
}
