import pdfParse       from "pdf-parse";
import Tesseract       from "tesseract.js";
import Fuse            from "fuse.js";
import { fromBuffer }  from "pdf2pic";
import crypto          from "crypto";

const MIN_CHARS = Number(process.env.OCR_MIN_CHARS) || 120;
const TESS_LANG = process.env.TESSERACT_LANG        || "ita";

export async function extract(pdfBuffer, filename, { appartamenti = [], tipi = [] } = {}) {
  const fileHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

  let testo  = "";
  let metodo = "pdf-parse";
  try {
    const parsed = await pdfParse(pdfBuffer);
    testo = parsed.text || "";
  } catch { /* PDF protetto */ }

  if (testo.replace(/\s/g, "").length < MIN_CHARS) {
    metodo = "tesseract-ocr";
    testo  = await _ocr(pdfBuffer);
  }

  console.log(`[extractor] ${filename} | ${metodo} | ${testo.length} chars`);

  const raw = _parse(testo);

  const { appartamento_id, appartamento_nome, match_score } =
    _matchAppartamento(testo, appartamenti);

  const tipo_descrizione = _matchTipo(raw.tipoRaw, tipi);

  // Sanity check: periodo_da deve essere <= periodo_a
  let periodo_da = raw.periodo;
  let periodo_a  = raw.periodoA || raw.periodo;
  if (periodo_da && periodo_a && periodo_da > periodo_a) {
    [periodo_da, periodo_a] = [periodo_a, periodo_da];
  }

  const confidenza =
    (raw.importo        != null ? 30 : 0) +
    (periodo_da         != null ? 25 : 0) +
    (tipo_descrizione   != null ? 20 : 0) +
    (appartamento_id    != null ? 25 : 0);

  return {
    file_hash:         fileHash,
    nome_file:         filename,
    tipo_descrizione,
    appartamento_id,
    appartamento_nome,
    match_score,
    periodo_da,
    periodo_a,
    importo:           raw.importo,
    fornitore:         raw.fornitore,
    numero_doc:        raw.numerodoc,
    confidenza,
    note_ai:           `metodo:${metodo} | match:${match_score?.toFixed(2) ?? "n/a"}`,
    metodo_estrazione: metodo,
  };
}

// ─── OCR ──────────────────────────────────────────────────────────────────────
async function _ocr(buf) {
  const conv  = fromBuffer(buf, { density:300, format:"png", width:2480, height:3508 });
  const pages = await conv.bulk(3, { responseType:"buffer" });
  const texts = [];
  for (const p of pages) {
    if (!p?.buffer) continue;
    const { data } = await Tesseract.recognize(p.buffer, TESS_LANG, { logger:()=>{} });
    texts.push(data.text || "");
  }
  return texts.join("\n\n");
}

// ─── PARSING ──────────────────────────────────────────────────────────────────
function _parse(t) {
  const tipoRaw = _tipoRaw(t);
  return {
    importo:   _importo(t),
    periodo:   _periodo(t, tipoRaw),
    periodoA:  _periodoA(t, tipoRaw),
    fornitore: _fornitore(t),
    numerodoc: _numerodoc(t),
    tipoRaw,
  };
}

// ── Importo ───────────────────────────────────────────────────────────────────
function _importo(t) {
  const patterns = [
    /(?:totale\s+(?:dovuto|fattura|bolletta|da\s+pagare|a\s+pagare)|importo\s+(?:totale|dovuto|da\s+pagare)|da\s+pagare|saldo\s+(?:da\s+pagare|dovuto))\D{0,25}([\d]{1,6}[.,][\d]{2})/gi,
    /€\s*([\d]{1,6}[.,][\d]{2})/g,
    /([\d]{1,6}[.,][\d]{2})\s*(?:euro|EUR|€)/gi,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    const m = re.exec(t);
    if (m) {
      const v = parseFloat(m[1].replace(/\./g,"").replace(",","."));
      if (!isNaN(v) && v > 0.5 && v < 100000) return v;
    }
  }
  return null;
}

// ── Periodo ───────────────────────────────────────────────────────────────────
const MESI_IT = {
  gen:1,feb:2,mar:3,apr:4,mag:5,giu:6,lug:7,ago:8,set:9,ott:10,nov:11,dic:12,
  gennaio:1,febbraio:2,marzo:3,aprile:4,maggio:5,giugno:6,luglio:7,agosto:8,
  settembre:9,ottobre:10,novembre:11,dicembre:12,
};

function _ymd(y, m) {
  return `${y}-${String(m).padStart(2,"0")}`;
}

function _parseDate(s) {
  const m = s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})/);
  if (!m) return null;
  return { d:parseInt(m[1]), m:parseInt(m[2]), y:parseInt(m[3]) };
}

function _periodo(t, tipoRaw) {
  // ── TARI: cerca l'anno di riferimento
  if (tipoRaw === "TARI") {
    const reAnno = /anno\s+(?:di\s+riferimento\s+|d['']imposta\s+|tributario\s+)?(20\d{2})/gi;
    let m;
    reAnno.lastIndex = 0;
    while ((m = reAnno.exec(t)) !== null) {
      return `${m[1]}-01`;
    }
    const reY = /\b(20\d{2})\b/g;
    const anni = [];
    reY.lastIndex = 0;
    while ((m = reY.exec(t)) !== null) anni.push(parseInt(m[1]));
    if (anni.length) {
      const anno = anni.sort((a,b)=>anni.filter(v=>v===b).length-anni.filter(v=>v===a).length)[0];
      return `${anno}-01`;
    }
  }

  // ── ACQUA / GAS / LUCE: cerca "dal <data> al <data>"
  if (tipoRaw === "Acqua" || tipoRaw === "Gas" || tipoRaw === "Luce") {
    const reRange = /dal\s+(\d{1,2}[\/.\-]\d{1,2}[\/.\-]20\d{2})\s+al\s+(\d{1,2}[\/.\-]\d{1,2}[\/.\-]20\d{2})/gi;
    reRange.lastIndex = 0;
    const mr = reRange.exec(t);
    if (mr) {
      const da = _parseDate(mr[1]);
      const a  = _parseDate(mr[2]);
      if (da && a) return _ymd(da.y, da.m);
    }
    const reRange2 = /(?:periodo|consumo[i]?|fornitura)\s+dal\s+(\d{1,2}[\/.\-]\d{1,2}[\/.\-]20\d{2})/gi;
    reRange2.lastIndex = 0;
    const mr2 = reRange2.exec(t);
    if (mr2) {
      const da = _parseDate(mr2[1]);
      if (da) return _ymd(da.y, da.m);
    }
  }

  // ── Generico: mese+anno testuale
  const reIT = /(?:competenza|periodo\s+di\s+riferimento|periodo|consumi?)\s+(?:del\s+mese\s+di\s+|del\s+|di\s+)?([a-zA-Zàèéìòù]{3,12})\s+(20\d{2})/gi;
  reIT.lastIndex = 0;
  let m;
  while ((m = reIT.exec(t)) !== null) {
    const mese = MESI_IT[m[1].toLowerCase().slice(0,8)];
    if (mese) return _ymd(m[2], mese);
  }

  // "01/2024" o "01-2024" o "01.2024"
  const mS = t.match(/\b(0[1-9]|1[0-2])[\/\-\.](20\d{2})\b/);
  if (mS) return _ymd(mS[2], parseInt(mS[1]));

  // ISO "2024-01"
  const mI = t.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (mI) return _ymd(mI[1], parseInt(mI[2]));

  // Fallback: data emissione → mese precedente
  const mD = t.match(/\b(\d{2})[\/.\-](\d{2})[\/.\-](20\d{2})\b/);
  if (mD) {
    let y = parseInt(mD[3]), mo = parseInt(mD[2]) - 1;
    if (mo === 0) { mo = 12; y--; }
    return _ymd(y, mo);
  }
  return null;
}

function _periodoA(t, tipoRaw) {
  // ── TARI: periodo_a = dicembre dello stesso anno
  if (tipoRaw === "TARI") {
    const reAnno = /anno\s+(?:di\s+riferimento\s+|d['']imposta\s+|tributario\s+)?(20\d{2})/gi;
    reAnno.lastIndex = 0;
    const m = reAnno.exec(t);
    if (m) return `${m[1]}-12`;
    const mY = t.match(/\b(20\d{2})\b/);
    if (mY) return `${mY[1]}-12`;
  }

  // ── ACQUA/GAS/LUCE: fine del range "dal … al …"
  if (tipoRaw === "Acqua" || tipoRaw === "Gas" || tipoRaw === "Luce") {
    const reRange = /dal\s+(\d{1,2}[\/.\-]\d{1,2}[\/.\-]20\d{2})\s+al\s+(\d{1,2}[\/.\-]\d{1,2}[\/.\-]20\d{2})/gi;
    reRange.lastIndex = 0;
    const mr = reRange.exec(t);
    if (mr) {
      const a = _parseDate(mr[2]);
      if (a) return _ymd(a.y, a.m);
    }
  }

  const m = t.match(
    /(?:al|fino\s+al|a|periodo\s+al)[:\s]+(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})/i
  );
  return m ? _ymd(parseInt(m[3]), parseInt(m[2])) : null;
}

// ── Fornitore ─────────────────────────────────────────────────────────────────
const FORNITORI = [
  "HERA","Enel","ENI","A2A","Iren","Italgas","2i Rete Gas","Edison","Acea",
  "Alia","Regas","BrianzAcque","Lario Reti","CAP Holding","Metropolitana Milanese",
  "AGSM","ACSM","Ascotrade","Bluenergy","E.ON","Alperia","Dolomiti Energia",
  "Acque Bresciane","Garda Uno","Padania Acque","Acquedotto Pugliese",
  "AMGA","AMAP","ACEA ATO","Enel Energia","Enel Servizio Elettrico",
  "Sorgenia","Illumia","Plenitude","Engie","Eni gas e luce",
];
function _fornitore(t) {
  for (const f of FORNITORI) {
    if (new RegExp(`\\b${f}\\b`,"i").test(t)) return f;
  }
  const m = t.match(/^([A-ZÀÈÉÌÒÙ][A-Za-zÀ-ÿ\s&.,]{2,50}?)\n/m);
  return m ? m[1].trim().slice(0,50) : null;
}

// ── Numero documento ──────────────────────────────────────────────────────────
function _numerodoc(t) {
  const patterns = [
    /(?:fattura|bolletta|documento|ricevuta|nota)\s+n[°.\s]*[:\s]*([A-Z0-9\/\-]{3,25})/gi,
    /\bn[°r.\s]{1,3}[:\s]*([A-Z0-9\/\-]{4,25})/gi,
    /codice\s+(?:documento|fatt(?:ura)?|bolletta)[:\s]+([A-Z0-9\/\-]{4,25})/gi,
    /(?:doc(?:umento)?|rif(?:erimento)?)[.:\s]+([A-Z0-9\/\-]{4,25})/gi,
    /numero[:\s]+([A-Z0-9\/\-]{4,25})/gi,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    const m = re.exec(t);
    if (m) {
      const val = m[1].trim();
      if (val.length >= 3 && !/^\d{1,3}$/.test(val)) return val;
    }
  }
  return null;
}

// ── Tipo spesa ────────────────────────────────────────────────────────────────
const TIPI_KW = {
  Acqua:        ["acqua","idrico","fognatura","acquedotto","servizio idrico","depurazione"],
  Luce:         ["energia elettrica","luce","elettricità","kwh","kilowattora","pod","punto di prelievo","enel"],
  Gas:          ["gas naturale","gas metano","metano","pdr","punto di riconsegna","smc","gigajoule","remi"],
  TARI:         ["tari","tariffa rifiuti","raccolta rifiuti","tributo rifiuti","igiene urbana","smaltimento rifiuti"],
  Condominio:   ["condominio","spese comuni","parti comuni","millesimi","amministratore"],
  Manutenzione: ["manutenzione","riparazione","intervento tecnico","lavori","assistenza"],
};
function _tipoRaw(t) {
  const tl = t.toLowerCase();
  for (const [tipo, kw] of Object.entries(TIPI_KW)) {
    if (kw.some(k => tl.includes(k))) return tipo;
  }
  return null;
}

// ── Match appartamento ────────────────────────────────────────────────────────
function _matchAppartamento(testo, appartamenti) {
  if (!appartamenti.length)
    return { appartamento_id:null, appartamento_nome:null, match_score:null };

  const corpus = appartamenti.map(a => ({
    id:   a.id,
    nome: a.nome,
    searchText: [
      a.nome,
      (a.via   || "").replace(/^(via|viale|piazza|corso|strada|vicolo|largo)\s+/i,""),
      a.citta  || "",
    ].join(" ").toLowerCase().trim(),
  }));

  const testoLower = testo.toLowerCase();

  // Pass 1: match su parole significative (>3 char) di via+città
  for (const app of corpus) {
    const parti = app.searchText.split(/\s+/).filter(p => p.length > 3);
    const matched = parti.filter(p => testoLower.includes(p));
    if (matched.length >= 2) {
      return {
        appartamento_id:   app.id,
        appartamento_nome: app.nome,
        match_score:       matched.length / parti.length,
      };
    }
  }

  // Pass 2: fuzzy su indirizzi estratti dal testo
  const indirizzi = _estraiIndirizzi(testo);
  const fuse = new Fuse(corpus, {
    keys: ["searchText","nome"],
    threshold: 0.45,
    ignoreLocation: true,
    minMatchCharLength: 4,
    includeScore: true,
  });
  const results = fuse.search(indirizzi);
  if (results.length > 0) {
    const best  = results[0];
    const score = 1 - (best.score ?? 1);
    if (score > 0.4) {
      return {
        appartamento_id:   best.item.id,
        appartamento_nome: best.item.nome,
        match_score:       score,
      };
    }
  }

  return { appartamento_id:null, appartamento_nome:null, match_score:0 };
}

function _estraiIndirizzi(t) {
  const righe = t.match(
    /(?:via|viale|piazza|p\.za|corso|c\.so|str\.|strada|vicolo|largo|v\.le)[^\n]{5,60}/gi
  );
  return righe ? righe.join(" ") : t.slice(0,500);
}

function _matchTipo(tipoRaw, tipiRegistrati) {
  if (!tipoRaw) return null;
  if (tipiRegistrati.includes(tipoRaw)) return tipoRaw;
  const fuse = new Fuse(tipiRegistrati.map(t=>({nome:t})), { keys:["nome"], threshold:0.4 });
  const r = fuse.search(tipoRaw);
  return r.length ? r[0].item.nome : tipoRaw;
}
