import { query } from "../../shared/db/pool.js";
import { regolaAttiva, regolaAttivaProp, regolaAttivaVers, regolaAttivaVersProp, calcolaQuote, calcolaQuoteProp } from "./ripartiRepo.js";
import { pdfEsiste } from "../../shared/storage.js";

function toYM(v)  { if (!v) return null; return String(v).slice(0, 7); }
const oggiYM = () => new Date().toISOString().slice(0, 7);
const MESI_P = {
  una_tantum: 0, mensile: 1, bimestrale: 2,
  trimestrale: 3, semestrale: 6, annuale: 12,
};

function _splitSegno(importoNetto, segnoEsplicito) {
  if (segnoEsplicito !== undefined && segnoEsplicito !== null) {
    return {
      importo: Math.abs(parseFloat(importoNetto || 0)),
      segno:   parseInt(segnoEsplicito) >= 0 ? 1 : -1,
    };
  }
  const v = parseFloat(importoNetto || 0);
  return { importo: Math.abs(v), segno: v >= 0 ? 1 : -1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// VERSATO NEL PERIODO
// ─────────────────────────────────────────────────────────────────────────────
export async function versatoNelPeriodo(appId, compId, filtroDA, filtroA) {
  const movs = await query(
    `SELECT m.*, c.validita_da AS c_vda, c.validita_a AS c_va
     FROM movimenti m
     JOIN componenti c ON c.id = m.componente_id
     WHERE m.appartamento_id=$1 AND m.componente_id=$2`,
    [appId, compId]
  );
  const dataOggi = oggiYM();
  let totale = 0;
  for (const m of movs) {
    const occ   = _occorrenzeMovimento(m, filtroDA || null, filtroA || dataOggi);
    const segno = parseInt(m.segno) || 1;
    totale += parseFloat(m.importo) * occ * segno;
  }
  return totale;
}

// ─────────────────────────────────────────────────────────────────────────────
// GRIGLIA ECONOMICA
// ─────────────────────────────────────────────────────────────────────────────
export async function righeGriglia(appId, periodoDA, periodoA, componenteId = null) {
  const dataOggi  = oggiYM();
  const FUTURO    = "2999-12";   // data sentinella per validita_a aperta (NULL)
  const fDA       = periodoDA || "2000-01";
  const fA        = periodoA  || dataOggi;

  // ── 1. Carica dati ────────────────────────────────────────────────────────

  // Inquilini attivi almeno in parte nel periodo griglia
  let comps = await query(
    `SELECT c.*, (c.nome || ' ' || COALESCE(c.cognome,'')) AS label
     FROM   componenti c
     WHERE  c.appartamento_id = $1
       AND  c.attivo = TRUE
       AND  (c.validita_da IS NULL OR c.validita_da <= $3::date)
       AND  (c.validita_a  IS NULL OR c.validita_a  >= $2::date)
     ORDER  BY c.nome`,
    [appId, fDA + "-01", fA + "-" + _ultimoGiorno(fA)]
  );

  // Fatture elaborate che si sovrappongono al filtro
  const docs = await query(
    `SELECT d.*, ts.descrizione AS tipo_descrizione
     FROM   documenti d
     LEFT   JOIN tipi_spesa ts ON ts.id = d.tipo_spesa_id
     WHERE  d.appartamento_id = $1
       AND  d.stato = 'elaborato'
       AND  d.periodo_da <= $3
       AND  COALESCE(d.periodo_a, d.periodo_da) >= $2
     ORDER  BY d.periodo_da`,
    [appId, fDA, fA]
  );

  // Versamenti dell'appartamento (tutti, per calcolo occorrenze nel filtro)
  const movs = await query(
    `SELECT m.*,
            (c.nome || ' ' || COALESCE(c.cognome,'')) AS comp_label,
            c.validita_da AS c_vda,
            c.validita_a  AS c_va
     FROM   movimenti m
     JOIN   componenti c ON c.id = m.componente_id
     WHERE  m.appartamento_id = $1
     ORDER  BY m.validita_da, m.componente_id`,
    [appId]
  );

  // Cache regole di riparto spese
  const cacheRegole = new Map();
  async function getRegola(tipoSpesaId, mese) {
    const key = `${tipoSpesaId || ""}::${mese}`;
    if (cacheRegole.has(key)) return cacheRegole.get(key);
    const r = await regolaAttiva(appId, tipoSpesaId || null, mese);
    cacheRegole.set(key, r);
    return r;
  }

  // Cache regole di riparto versamenti
  const cacheRegoleVers = new Map();
  async function getRegolaVers(tipoVersamento, mese) {
    const key = `${tipoVersamento || ""}::${mese}`;
    if (cacheRegoleVers.has(key)) return cacheRegoleVers.get(key);
    const r = await regolaAttivaVers(appId, tipoVersamento || null, mese);
    cacheRegoleVers.set(key, r);
    return r;
  }

  // ── 2. SEZIONE SPESE ──────────────────────────────────────────────────────
  //
  // Per ogni fattura:
  //   VAL = importo_fattura / mesi_totali_fattura   (quota mensile)
  //
  //   Per ogni mese nell'intersezione [fattura ∩ filtro_griglia]:
  //     - trova gli inquilini attivi in quel mese
  //     - recupera la regola di riparto attiva (o null → riparto standard)
  //     - calcola la quota di ogni inquilino con calcolaQuote(VAL, attivi, regola)
  //     - accumula
  //
  //   Al termine: quotePerComp[id] = quota dell'inquilino nel periodo griglia
  // ──────────────────────────────────────────────────────────────────────────
  const righeDocumenti = [];

  for (const doc of docs) {
    const dDA = doc.periodo_da;
    const dA  = doc.periodo_a || doc.periodo_da;

    const mesiTotaliDoc = _mesiRange(dDA, dA);
    if (mesiTotaliDoc.length === 0) continue;

    // VAL = quota mensile della fattura
    const VAL = parseFloat(doc.importo || 0) / mesiTotaliDoc.length;

    // Mesi comuni tra fattura e filtro griglia
    const mesiNelFiltro = _mesiRange(_max(dDA, fDA), _min(dA, fA));
    if (mesiNelFiltro.length === 0) continue;

    // Accumulo quote per inquilino
    const quotePerComp = {};
    for (const c of comps) quotePerComp[c.id] = 0;

    for (const mese of mesiNelFiltro) {
      // Inquilini attivi in questo mese (validita_a NULL = attivi a tempo indeterminato)
      const attivi = comps.filter(c => {
        const da = toYM(c.validita_da) || "2000-01";
        const a  = toYM(c.validita_a)  || FUTURO;
        return mese >= da && mese <= a;
      });
      if (attivi.length === 0) continue;

      // Regola attiva (null = nessuna regola → riparto standard)
      const regola = await getRegola(doc.tipo_spesa_id, mese);

      // Quote del mese per ogni inquilino
      const quoteDelMese = calcolaQuote(mese, VAL, attivi, regola);

      // Accumula
      for (const c of comps) {
        quotePerComp[c.id] += quoteDelMese[c.id] || 0;
      }
    }

    righeDocumenti.push({
      label:            `${doc.tipo_descrizione || doc.nome_file} ${_mesLabel(dDA)}` +
                        (dA !== dDA ? ` → ${_mesLabel(dA)}` : ""),
      tipo_descrizione: doc.tipo_descrizione || null,
      nome_file:        doc.nome_file        || null,
      fornitore:        doc.fornitore        || null,
      periodo_da:       dDA,
      periodo_a:        dA,
      importo_fattura:  parseFloat(doc.importo || 0),
      importo:          VAL * mesiNelFiltro.length,
      mesi_fattura:     mesiTotaliDoc.length,
      mesi_filtro:      mesiNelFiltro.length,
      quote:            quotePerComp,
      documento_id:     doc.id,
      pdf_disponibile:  pdfEsiste(doc.id),
    });
  }

  // ── 3. SEZIONE VERSAMENTI ─────────────────────────────────────────────────
  //
  // Per ogni movimento che ha occorrenze nel filtro griglia:
  //   valore = importo × occorrenze × segno
  //   attribuito interamente all'inquilino del movimento
  // ──────────────────────────────────────────────────────────────────────────
  const PERI_LABEL = {
    una_tantum: "Una tantum", mensile:     "Mensile",
    bimestrale: "Bimestrale", trimestrale: "Trimestrale",
    semestrale: "Semestrale", annuale:     "Annuale",
  };

  const righeMovimenti = [];

  for (const m of movs) {
    if (!comps.find(c => c.id === m.componente_id)) continue;

    const occ = _occorrenzeMovimento(m, fDA, fA);
    if (occ === 0) continue;

    const segno  = parseInt(m.segno) || 1;
    const valore = parseFloat(m.importo) * occ * segno;

    // Quote reali: l'intero importo va al componente che ha versato
    const quotePerComp = {};
    for (const c of comps) quotePerComp[c.id] = 0;
    quotePerComp[m.componente_id] = valore;

    // Periodo effettivo del versamento (intersezione movimento/componente/filtro)
    const da = _max(toYM(m.validita_da), toYM(m.c_vda), fDA) || fDA;
    const a  = _min(
      toYM(m.validita_a) || FUTURO,
      toYM(m.c_va)       || FUTURO,
      fA
    ) || fA;

    // Quote teoriche tramite regola versamento (se esiste)
    const meseVers = toYM(m.validita_da) || da;
    const regolaV  = await getRegolaVers(m.tipo_versamento, meseVers);
    let quotaTeorica = null;
    if (regolaV) {
      const attiviVers = comps.filter(c => {
        const cda = toYM(c.validita_da) || "2000-01";
        const ca  = toYM(c.validita_a)  || FUTURO;
        return meseVers >= cda && meseVers <= ca;
      });
      if (attiviVers.length > 0) {
        quotaTeorica = {};
        for (const c of comps) quotaTeorica[c.id] = 0;
        const qt = calcolaQuote(meseVers, valore, attiviVers, regolaV);
        for (const c of attiviVers) quotaTeorica[c.id] = qt[c.id] || 0;
      }
    }

    // Label: descrizione se compilata, altrimenti periodicità + nome inquilino
    const label = m.descrizione && m.descrizione.trim()
      ? m.descrizione.trim()
      : `${PERI_LABEL[m.periodicita] || m.periodicita}${segno < 0 ? " [rimborso]" : ""} ${m.comp_label}`;

    // For una_tantum: use accounting month (mese_riferimento) for display period
    const meseContabile = m.periodicita === "una_tantum" && m.mese_riferimento
      ? String(m.mese_riferimento).slice(0, 7)
      : null;

    righeMovimenti.push({
      label,
      descrizione:      m.descrizione      || null,
      comp_label:       m.comp_label       || null,
      periodicita:      m.periodicita      || null,
      tipo_versamento:  m.tipo_versamento  || "affitto",
      mese_riferimento: m.mese_riferimento || null,
      segno,
      periodo_da:    meseContabile || da,
      periodo_a:     meseContabile || a,
      importo:       valore,
      quote:         quotePerComp,
      quotaTeorica,                          // null se nessuna regola versamento
    });
  }

  // ── 4. TOTALI ─────────────────────────────────────────────────────────────

  const totaliDovuto  = _sommaQuote(righeDocumenti, comps);
  const totaliVersato = _sommaQuote(righeMovimenti, comps);

  const conguagli = {};
  for (const c of comps)
    conguagli[c.id] = (totaliVersato[c.id] || 0) - (totaliDovuto[c.id] || 0);

  // Filtro per singolo inquilino: calcolo già fatto con tutti i componenti
  // (quote proporzionali corrette); ora restringe l'output a quell'inquilino.
  if (componenteId) {
    const cid = componenteId;
    return {
      comps:          comps.filter(c => c.id === cid),
      righeDocumenti: righeDocumenti.filter(r => (r.quote[cid] || 0) !== 0),
      righeMovimenti: righeMovimenti.filter(r =>
        (r.quote[cid] || 0) !== 0 ||
        (r.quotaTeorica && (r.quotaTeorica[cid] || 0) !== 0)
      ),
      totaliDovuto:  { [cid]: totaliDovuto[cid]  || 0 },
      totaliVersato: { [cid]: totaliVersato[cid] || 0 },
      conguagli:     { [cid]: conguagli[cid]     || 0 },
    };
  }

  return {
    comps,
    righeDocumenti,
    righeMovimenti,
    totaliDovuto,
    totaliVersato,
    conguagli,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CALCOLO OCCORRENZE
// ─────────────────────────────────────────────────────────────────────────────
function _occorrenzeMovimento(m, fDA, fA) {
  const peri    = m.periodicita || "una_tantum";
  const mesiP   = MESI_P[peri]  ?? 0;
  const FUTURO  = "2999-12";                          // sentinella per date aperte
  const fA_eff  = fA || oggiYM();

  const movDa = toYM(m.validita_da);
  const movA  = peri === "una_tantum" ? movDa : (toYM(m.validita_a) || FUTURO);
  const cDa   = toYM(m.c_vda);
  const cA    = toYM(m.c_va) || FUTURO;              // NULL = componente ancora attivo

  if (peri === "una_tantum") {
    // Use accounting month (mese_riferimento) for filter bounds when available
    const meseContabile = m.mese_riferimento
      ? String(m.mese_riferimento).slice(0, 7)
      : movDa;
    if (!meseContabile)                        return 0;
    if (fDA    && meseContabile < fDA)         return 0;
    if (fA_eff && meseContabile > fA_eff)      return 0;
    // Component validity: checked against payment date
    if (cDa && movDa && movDa < cDa)          return 0;
    if (cA  && movDa && movDa > cA)           return 0;
    return 1;
  }

  const da = _max(movDa, cDa, fDA);
  const a  = _min(movA,  cA,  fA_eff);
  if (!da || !a || da > a) return 0;

  const start = movDa || da;
  let [cy, cm] = start.split("-").map(Number);
  let count = 0;
  for (let i = 0; i < 600; i++) {
    const mese = `${cy}-${String(cm).padStart(2, "0")}`;
    if (mese > a) break;
    if (mese >= da) count++;
    if (mesiP === 0) break;
    cm += mesiP;
    while (cm > 12) { cm -= 12; cy++; }
  }
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────
function _max(...dates) {
  const v = dates.filter(Boolean);
  return v.length ? v.reduce((a, b) => a > b ? a : b) : null;
}
function _min(...dates) {
  const v = dates.filter(Boolean);
  return v.length ? v.reduce((a, b) => a < b ? a : b) : null;
}
function _mesiRange(da, a) {
  if (!da || !a || da > a) return [];
  const res = [];
  let [cy, cm] = da.split("-").map(Number);
  const [ey, em] = a.split("-").map(Number);
  while (cy < ey || (cy === ey && cm <= em)) {
    res.push(`${cy}-${String(cm).padStart(2, "0")}`);
    cm++; if (cm > 12) { cm = 1; cy++; }
  }
  return res;
}
function _mesLabel(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return ["Gen","Feb","Mar","Apr","Mag","Giu",
          "Lug","Ago","Set","Ott","Nov","Dic"][parseInt(m, 10) - 1] + " " + y;
}
function _ultimoGiorno(ym) {
  if (!ym) return "28";
  const [y, m] = ym.split("-").map(Number);
  return String(new Date(y, m, 0).getDate()).padStart(2, "0");
}
function _sommaQuote(righe, comps) {
  const tot = {};
  for (const c of comps) tot[c.id] = 0;
  for (const r of righe)
    for (const c of comps) tot[c.id] = (tot[c.id] || 0) + (r.quote[c.id] || 0);
  return tot;
}

// ─────────────────────────────────────────────────────────────────────────────
// GRIGLIA PROPRIETARI — riparto per-mese con regole proprietari (speculare a righeGriglia)
// ─────────────────────────────────────────────────────────────────────────────
export async function grigliaPropretari(appId, periodoDA, periodoA) {
  const dataOggi = oggiYM();
  const fDA = periodoDA || "2000-01";
  const fA  = periodoA  || dataOggi;
  const fDaDate = fDA + "-01";
  const fADate  = fA  + "-" + _ultimoGiorno(fA);

  // Tutte le associazioni nel periodo con le date di validità (per filtraggio per-mese)
  const assocAll = await query(
    `SELECT ap.proprietario_id,
            ap.percentuale_proprieta,
            to_char(ap.data_inizio, 'YYYY-MM') AS data_inizio_ym,
            CASE WHEN ap.data_fine IS NULL THEN NULL
                 ELSE to_char(ap.data_fine, 'YYYY-MM') END AS data_fine_ym,
            p.nome    AS proprietario_nome,
            p.cognome AS proprietario_cognome
     FROM appartamento_proprietari ap
     JOIN proprietari p ON p.id = ap.proprietario_id
     WHERE ap.appartamento_id = $1
       AND ap.data_inizio <= $3
       AND (ap.data_fine IS NULL OR ap.data_fine >= $2)
     ORDER BY ap.data_inizio, p.cognome, p.nome`,
    [appId, fDaDate, fADate]
  );

  if (assocAll.length === 0) return { props: [], righeDocumenti: [], righeMovimenti: [], periodoDA: fDA, periodoA: fA };

  // Lista unica proprietari per intestazioni colonne (con percentuale dell'associazione più recente)
  const propsMap = new Map();
  for (const a of assocAll) {
    propsMap.set(a.proprietario_id, {
      proprietario_id:       a.proprietario_id,
      proprietario_nome:     a.proprietario_nome,
      proprietario_cognome:  a.proprietario_cognome,
      percentuale_proprieta: parseFloat(a.percentuale_proprieta || 0),
    });
  }
  const props = Array.from(propsMap.values())
    .sort((a, b) =>
      (a.proprietario_cognome || "").localeCompare(b.proprietario_cognome || "") ||
      (a.proprietario_nome    || "").localeCompare(a.proprietario_nome    || "")
    );

  // Helper: proprietari attivi in un determinato mese (YYYY-MM), con percentuale aggregata
  function _propsForMese(mese) {
    const activeMap = new Map();
    for (const a of assocAll) {
      const da = a.data_inizio_ym || "2000-01";
      const fa = a.data_fine_ym   || "2999-12";
      if (mese >= da && mese <= fa) {
        const pid = a.proprietario_id;
        if (!activeMap.has(pid)) {
          activeMap.set(pid, {
            proprietario_id: pid,
            percentuale_proprieta: 0,
          });
        }
        activeMap.get(pid).percentuale_proprieta += parseFloat(a.percentuale_proprieta || 0);
      }
    }
    return Array.from(activeMap.values());
  }

  // Periodi proprietario_default (per fallback quando incassato/pagato non è esplicito)
  const defaultPeriods = await query(
    `SELECT ap.proprietario_id,
            to_char(ap.data_inizio, 'YYYY-MM-DD') AS data_inizio,
            CASE WHEN ap.data_fine IS NULL THEN NULL
                 ELSE to_char(ap.data_fine, 'YYYY-MM-DD') END AS data_fine
     FROM appartamento_proprietari ap
     WHERE ap.appartamento_id = $1
       AND ap.proprietario_default = TRUE
     ORDER BY ap.data_inizio`,
    [appId]
  );

  // Restituisce il proprietario_default alla data (YYYY-MM o YYYY-MM-DD)
  function _defaultPropPerData(dataStr) {
    if (!dataStr) return null;
    const d = String(dataStr).length === 7 ? dataStr + "-01" : String(dataStr).slice(0, 10);
    for (const p of defaultPeriods) {
      const da = p.data_inizio || "2000-01-01";
      const fa = p.data_fine   || "2999-12-31";
      if (d >= da && d <= fa) return p.proprietario_id;
    }
    return null;
  }

  // Cache regole proprietari (evita query ripetute per stesso tipo+mese)
  const cacheRegole = new Map();
  async function getRegolaProp(tipoSpesaId, mese) {
    if (!tipoSpesaId) return null;
    const key = `${tipoSpesaId}::${mese}`;
    if (cacheRegole.has(key)) return cacheRegole.get(key);
    const r = await regolaAttivaProp(appId, tipoSpesaId, mese);
    cacheRegole.set(key, r);
    return r;
  }

  // Cache regole versamento proprietari
  const cacheRegoleVers = new Map();
  async function getRegolaVersProp(tipoVersamento, mese) {
    const key = `${tipoVersamento || ""}::${mese}`;
    if (cacheRegoleVers.has(key)) return cacheRegoleVers.get(key);
    const r = await regolaAttivaVersProp(appId, tipoVersamento || null, mese);
    cacheRegoleVers.set(key, r);
    return r;
  }

  // Spese elaborate nel periodo
  const docsRows = await query(
    `SELECT d.id, d.importo, d.periodo_da, d.periodo_a,
            d.pagato_da_proprietario_id, d.tipo_spesa_id,
            d.nome_file, d.fornitore,
            ts.descrizione AS tipo_descrizione
     FROM documenti d
     LEFT JOIN tipi_spesa ts ON ts.id = d.tipo_spesa_id
     WHERE d.appartamento_id = $1
       AND d.stato = 'elaborato'
       AND d.periodo_da <= $3
       AND COALESCE(d.periodo_a, d.periodo_da) >= $2
     ORDER BY d.periodo_da`,
    [appId, fDA, fA]
  );

  // Versamenti: carica TUTTI (senza filtro data) — le occorrenze nel periodo
  // vengono calcolate con _occorrenzeMovimento, come in righeGriglia.
  // Il filtro per data sulla sola validita_da escluderebbe i versamenti ricorrenti
  // (es. affitto mensile) che sono iniziati prima del periodo di filtro.
  const movsRows = await query(
    `SELECT m.id, m.importo, m.segno,
            m.tipo_versamento, m.mese_riferimento,
            m.validita_da, m.validita_a, m.periodicita,
            m.incassato_da_proprietario_id,
            (c.nome || ' ' || COALESCE(c.cognome,'')) AS comp_label,
            c.validita_da AS c_vda,
            c.validita_a  AS c_va
     FROM movimenti m
     LEFT JOIN componenti c ON c.id = m.componente_id
     WHERE m.appartamento_id = $1
       AND m.tipo = 'Versamento'
     ORDER BY COALESCE(m.mese_riferimento, to_char(m.validita_da,'YYYY-MM'))`,
    [appId]
  );

  // ── SPESE: per-mese con regole proprietari ─────────────────────────────────
  //
  // Per ogni documento multi-mese:
  //   VAL = importo / mesi_totali  (quota mensile)
  //   Per ogni mese nell'intersezione [documento ∩ filtro]:
  //     - proprietari attivi in quel mese
  //     - regola proprietari attiva per quel tipo_spesa e mese
  //     - calcolaQuoteProp(VAL, propsAttivi, regola)
  // ──────────────────────────────────────────────────────────────────────────
  const righeDocumenti = [];

  for (const d of docsRows) {
    const dDA = (d.periodo_da || "").slice(0, 7);
    const dA  = (d.periodo_a  || d.periodo_da || "").slice(0, 7);

    const mesiTotaliDoc = _mesiRange(dDA, dA);
    if (mesiTotaliDoc.length === 0) continue;

    const VAL = parseFloat(d.importo || 0) / mesiTotaliDoc.length;

    const mesiNelFiltro = _mesiRange(_max(dDA, fDA), _min(dA, fA));
    if (mesiNelFiltro.length === 0) continue;

    const quotePerProp = {};
    for (const p of props) quotePerProp[p.proprietario_id] = 0;

    for (const mese of mesiNelFiltro) {
      const propsAttivi = _propsForMese(mese);
      if (propsAttivi.length === 0) continue;

      const regola = await getRegolaProp(d.tipo_spesa_id, mese);
      const quoteDelMese = calcolaQuoteProp(VAL, propsAttivi, regola);

      for (const p of props) {
        quotePerProp[p.proprietario_id] += quoteDelMese[p.proprietario_id] || 0;
      }
    }

    // Fallback pagato_da: se non esplicito, usa proprietario_default alla data del documento
    const pagato_da = d.pagato_da_proprietario_id
      || _defaultPropPerData(dDA);

    righeDocumenti.push({
      tipo_descrizione:          d.tipo_descrizione || d.nome_file,
      nome_file:                 d.nome_file        || null,
      fornitore:                 d.fornitore,
      periodo_da:                dDA,
      periodo_a:                 dA,
      importo:                   VAL * mesiNelFiltro.length,
      pagato_da_proprietario_id: pagato_da,
      quote:                     quotePerProp,
      documento_id:              d.id,
      pdf_disponibile:           pdfEsiste(d.id),
    });
  }

  // ── VERSAMENTI ─────────────────────────────────────────────────────────────
  const righeMovimenti = [];
  const FUTURO = "2999-12";

  for (const m of movsRows) {
    // Conta le occorrenze nel filtro (gestisce ricorrenti, una_tantum, ecc.)
    const occ = _occorrenzeMovimento(m, fDA, fA);
    if (occ === 0) continue;

    const segno  = parseInt(m.segno ?? 1);
    const importo = parseFloat(m.importo || 0) * occ * segno;

    // Periodo effettivo nel filtro (usato per display e regola)
    const movDa = toYM(m.validita_da);
    const movA  = m.periodicita === "una_tantum" ? movDa : (toYM(m.validita_a) || FUTURO);
    const cDa   = toYM(m.c_vda);
    const cA    = toYM(m.c_va) || FUTURO;
    const dispDa = _max(movDa, cDa, fDA) || fDA;
    const dispA  = _min(movA,  cA,  fA)  || fA;

    const mese = m.mese_riferimento || dispDa;

    // Quote teoriche: cerca regola versamento proprietari, poi calcola per mese
    const propsAttivi  = mese ? _propsForMese(mese) : props;
    const attiviUsati  = propsAttivi.length > 0 ? propsAttivi : props;
    const regolaVersP  = await getRegolaVersProp(m.tipo_versamento, mese || fDA);
    const quoteTeor    = calcolaQuoteProp(importo, attiviUsati, regolaVersP);

    const quoteTeorica = {};
    for (const p of props) quoteTeorica[p.proprietario_id] = quoteTeor[p.proprietario_id] || 0;

    // Fallback incassato_da: se non esplicito, usa proprietario_default alla data del versamento
    const incassato_da = m.incassato_da_proprietario_id
      || _defaultPropPerData(mese);

    const quoteReale = {};
    for (const p of props) quoteReale[p.proprietario_id] = 0;
    if (incassato_da) {
      quoteReale[incassato_da] = importo;
    }

    righeMovimenti.push({
      tipo_versamento:              m.tipo_versamento || "affitto",
      mese:                         dispDa,
      periodo_a:                    dispA !== dispDa ? dispA : null,
      comp_label:                   m.comp_label,
      importo,
      incassato_da_proprietario_id: incassato_da,
      quoteTeorica,
      quoteReale,
    });
  }

  // Totali
  const totaliDareTeorico  = {};
  const totaliAvereTeorico = {};
  const totaliPagato       = {};
  const totaliIncassato    = {};
  for (const p of props) {
    totaliDareTeorico[p.proprietario_id]  = righeDocumenti.reduce((s, r) => s + (r.quote[p.proprietario_id]         || 0), 0);
    totaliAvereTeorico[p.proprietario_id] = righeMovimenti.reduce((s, r) => s + (r.quoteTeorica[p.proprietario_id]  || 0), 0);
    totaliPagato[p.proprietario_id]       = righeDocumenti
      .filter(r => r.pagato_da_proprietario_id === p.proprietario_id)
      .reduce((s, r) => s + r.importo, 0);
    totaliIncassato[p.proprietario_id]    = righeMovimenti.reduce((s, r) => s + (r.quoteReale[p.proprietario_id]    || 0), 0);
  }

  return {
    props,
    righeDocumenti,
    righeMovimenti,
    totaliDareTeorico,
    totaliAvereTeorico,
    totaliPagato,
    totaliIncassato,
    periodoDA: fDA,
    periodoA:  fA,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD — dal primo inquilino ad oggi
// ─────────────────────────────────────────────────────────────────────────────
export async function dashboardAnno() {
  const today   = new Date();
  const FUTURO  = "2999-12";
  const periodoA = today.toISOString().slice(0, 7);

  const apps = await query(
    `SELECT a.id, a.nome FROM appartamenti a
     WHERE a.attivo=TRUE AND LOWER(a.nome) NOT LIKE '%parma%'
     ORDER BY a.nome`
  );

  const perAppartamento = [];
  for (const app of apps) {
    // Periodo da: data del primo inquilino mai registrato (attivi e non)
    const primaRows = await query(
      `SELECT MIN(validita_da) AS prima_data FROM componenti WHERE appartamento_id=$1`,
      [app.id]
    );
    const primaData = primaRows[0]?.prima_data
      ? toYM(primaRows[0].prima_data)
      : null;
    // fallback: mese corrente (intervallo vuoto → tutti i totali a zero)
    const periodoDA = primaData || periodoA;
    const mesiPer   = _mesiRange(periodoDA, periodoA);

    const g = await righeGriglia(app.id, periodoDA, periodoA);
    const { comps, righeMovimenti, totaliDovuto, totaliVersato } = g;

    // Affitto server-side (somma quote_affitto per mese per componente attivo)
    const totAff = {};
    for (const c of comps) totAff[c.id] = 0;
    for (const mese of mesiPer) {
      for (const c of comps) {
        const cDa = toYM(c.validita_da) || "2000-01";
        const cA  = toYM(c.validita_a)  || FUTURO;
        if (mese >= cDa && mese <= cA)
          totAff[c.id] += parseFloat(c.quota_affitto || 0);
      }
    }

    const totSpese   = comps.reduce((s, c) => s + (totaliDovuto[c.id]  || 0), 0);
    const totVers    = comps.reduce((s, c) => s + (totaliVersato[c.id] || 0), 0);
    const totAffGlob = comps.reduce((s, c) => s + (totAff[c.id]        || 0), 0);
    const saldo      = totVers - totSpese - totAffGlob;

    // Mesi senza versamento "affitto" per ogni inquilino con quota_affitto > 0
    const mesiScoperti = [];
    for (const c of comps) {
      if (!parseFloat(c.quota_affitto)) continue;
      const cDa = toYM(c.validita_da) || "2000-01";
      const cA  = toYM(c.validita_a)  || FUTURO;

      const mancanti = [];
      for (const mese of mesiPer) {
        if (mese < cDa || mese > cA) continue;
        const coperto = righeMovimenti.some(r => {
          if ((r.tipo_versamento || "affitto") !== "affitto") return false;
          if ((r.quote[c.id] || 0) === 0) return false;
          if (r.periodicita === "una_tantum")
            return (r.mese_riferimento || r.periodo_da) === mese;
          return r.periodo_da <= mese && mese <= r.periodo_a;
        });
        if (!coperto) mancanti.push(mese);
      }
      if (mancanti.length > 0) {
        mesiScoperti.push({
          componenteId:    c.id,
          componenteLabel: (c.label || `${c.nome} ${(c.cognome || "").trim()}`).trim(),
          mesi:            mancanti,
        });
      }
    }

    perAppartamento.push({
      id:               app.id,
      nome:             app.nome,
      periodoDA,
      totaleSpese:      totSpese,
      totaleVersamenti: totVers,
      totaleAffitto:    totAffGlob,
      saldo,
      mesiScoperti,
    });
  }

  return {
    periodoA,
    totaleSpese:      perAppartamento.reduce((s, a) => s + a.totaleSpese,      0),
    totaleVersamenti: perAppartamento.reduce((s, a) => s + a.totaleVersamenti, 0),
    totaleAffitto:    perAppartamento.reduce((s, a) => s + a.totaleAffitto,    0),
    saldoGlobale:     perAppartamento.reduce((s, a) => s + a.saldo,            0),
    perAppartamento,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD PROPRIETARI
// ─────────────────────────────────────────────────────────────────────────────
export async function dashboardProprietari() {
  const today    = new Date();
  const periodoA = today.toISOString().slice(0, 7);

  const apps = await query(
    `SELECT a.id, a.nome FROM appartamenti a
     WHERE a.attivo=TRUE
     ORDER BY a.nome`
  );

  const perAppartamento = [];
  for (const app of apps) {
    // Periodo da: prima associazione proprietario
    const primaRows = await query(
      `SELECT MIN(ap.data_inizio) AS prima_data
       FROM appartamento_proprietari ap WHERE ap.appartamento_id=$1`,
      [app.id]
    );
    const primaData = primaRows[0]?.prima_data ? toYM(primaRows[0].prima_data) : null;
    const periodoDA = primaData || periodoA;

    const g = await grigliaPropretari(app.id, periodoDA, periodoA);
    const { props, totaliDareTeorico, totaliAvereTeorico,
            totaliPagato, totaliIncassato } = g;

    if (props.length === 0) continue;

    const r2 = v => Math.round(v * 100) / 100;

    const perProprietario = props.map(p => {
      const pid  = p.proprietario_id;
      const cong = r2((totaliPagato[pid] || 0) - (totaliIncassato[pid] || 0)
                    - (totaliDareTeorico[pid] || 0) + (totaliAvereTeorico[pid] || 0));
      return {
        id:          pid,
        nome:        `${p.proprietario_nome} ${p.proprietario_cognome || ""}`.trim(),
        dareTeorico:  r2(totaliDareTeorico[pid]  || 0),
        avereTeorico: r2(totaliAvereTeorico[pid] || 0),
        pagato:       r2(totaliPagato[pid]       || 0),
        incassato:    r2(totaliIncassato[pid]    || 0),
        conguaglio:   cong,
      };
    });

    const saldoGlobale     = r2(perProprietario.reduce((s, p) => s + p.conguaglio,  0));
    const totaleIncassato  = r2(perProprietario.reduce((s, p) => s + p.incassato,   0));
    const totalePagato     = r2(perProprietario.reduce((s, p) => s + p.pagato,      0));
    const saldoReale       = r2(totaleIncassato - totalePagato);

    perAppartamento.push({
      id:          app.id,
      nome:        app.nome,
      periodoDA,
      saldoGlobale,
      saldoReale,
      totaleIncassato,
      totalePagato,
      perProprietario,
    });
  }

  return {
    periodoA,
    saldoGlobale:    perAppartamento.reduce((s, a) => s + a.saldoGlobale, 0),
    saldoReale:      perAppartamento.reduce((s, a) => s + a.saldoReale,   0),
    perAppartamento,
  };
}

