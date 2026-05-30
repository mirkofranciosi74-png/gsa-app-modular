import { query } from "../../shared/db/pool.js";
import { calcolaRipartoPuro } from "../../domain/riparto/MotoreRiparto.js";

function toYM(v)  { if (!v) return null; return String(v).slice(0, 7); }
const oggiYM  = () => new Date().toISOString().slice(0, 7);
const FUTURO  = "2999-12";
const MESI_P  = { mensile: 1, bimestrale: 2, trimestrale: 3, semestrale: 6, annuale: 12 };

function _max(...dates) { const v = dates.filter(Boolean); return v.length ? v.reduce((a, b) => a > b ? a : b) : null; }
function _min(...dates) { const v = dates.filter(Boolean); return v.length ? v.reduce((a, b) => a < b ? a : b) : null; }

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

function _ultimoGiorno(ym) {
  if (!ym) return "28";
  const [y, m] = ym.split("-").map(Number);
  return String(new Date(y, m, 0).getDate()).padStart(2, "0");
}

// Occorrenze di un fatto ricorrente nel filtro
function _occorrenze(rifDa, rifA, peri, fDA, fA) {
  const fA_eff = fA || oggiYM();
  const mesiP  = MESI_P[peri] ?? 0;
  if (!mesiP) return 0;
  const movDa  = toYM(rifDa);
  const movA   = toYM(rifA) || FUTURO;
  const da = _max(movDa, fDA);
  const a  = _min(movA, fA_eff);
  if (!da || !a || da > a) return 0;
  const start = movDa || da;
  let [cy, cm] = start.split("-").map(Number);
  let count = 0;
  for (let i = 0; i < 600; i++) {
    const mese = `${cy}-${String(cm).padStart(2, "0")}`;
    if (mese > a) break;
    if (mese >= da) count++;
    cm += mesiP;
    while (cm > 12) { cm -= 12; cy++; }
  }
  return count;
}

/**
 * Distribuisce valore tra persone usando regola v2 + MotoreRiparto.
 * Gestisce modalita='escludi' (default): i dettagli con includi=false escludono la persona;
 * e modalita='includi': solo i dettagli con includi=true e percentuale>0 ricevono quota.
 */
function _calcolaQuote(valore, attiviIds, attiviMap, regola) {
  if (!attiviIds.length) return {};
  const absVal = Math.abs(valore);
  if (absVal < 0.001) return {};
  const sign = valore < 0 ? -1 : 1;

  let soggetti;
  let effVal = absVal;

  const activeSet = new Set(attiviIds);

  if (!regola) {
    const sommQ = attiviIds.reduce((s, id) => s + (attiviMap.get(id)?.quota || 0), 0);
    soggetti = sommQ > 0
      ? attiviIds.map(id => ({ id, nome: attiviMap.get(id)?.nome || id, quota: attiviMap.get(id)?.quota || 0 })).filter(s => s.quota > 0)
      : attiviIds.map(id => ({ id, nome: attiviMap.get(id)?.nome || id, quota: 1 }));
  } else {
    effVal = absVal * (regola.quota_totale_pct != null ? Number(regola.quota_totale_pct) : 100) / 100;
    const det = Array.isArray(regola.dettagli) ? regola.dettagli : [];
    const modalita = regola.modalita || "escludi";

    if (modalita === "escludi") {
      // det con includi=false → escluse; le restanti ottengono la quota
      const excludedSet = new Set(
        det.filter(d => d.includi === false || d.includi === "false").map(d => d.persona_id)
      );
      const eligible = attiviIds.filter(id => !excludedSet.has(id));
      if (!eligible.length) return {};

      // se ci sono percentuali esplicite per gli eligibili, usale
      const withPct = det
        .filter(d => (d.includi === true || d.includi === "true") && parseFloat(d.percentuale || 0) > 0 && activeSet.has(d.persona_id))
        .map(d => ({ id: d.persona_id, nome: attiviMap.get(d.persona_id)?.nome || d.persona_id, quota: parseFloat(d.percentuale) }));

      if (withPct.length > 0) {
        soggetti = withPct;
      } else if (regola.split_uguale) {
        soggetti = eligible.map(id => ({ id, nome: attiviMap.get(id)?.nome || id, quota: 1 }));
      } else {
        const sommQ = eligible.reduce((s, id) => s + (attiviMap.get(id)?.quota || 0), 0);
        soggetti = sommQ > 0
          ? eligible.map(id => ({ id, nome: attiviMap.get(id)?.nome || id, quota: attiviMap.get(id)?.quota || 0 })).filter(s => s.quota > 0)
          : eligible.map(id => ({ id, nome: attiviMap.get(id)?.nome || id, quota: 1 }));
      }
    } else {
      // modalita='includi': solo i dettagli con includi=true e percentuale>0
      const fromDet = det
        .filter(d => d.includi && activeSet.has(d.persona_id))
        .map(d => ({ id: d.persona_id, nome: attiviMap.get(d.persona_id)?.nome || d.persona_id, quota: parseFloat(d.percentuale || 0) }))
        .filter(s => s.quota > 0);

      if (fromDet.length > 0) {
        soggetti = fromDet;
      } else if (regola.split_uguale) {
        soggetti = attiviIds.map(id => ({ id, nome: attiviMap.get(id)?.nome || id, quota: 1 }));
      } else {
        const sommQ = attiviIds.reduce((s, id) => s + (attiviMap.get(id)?.quota || 0), 0);
        soggetti = sommQ > 0
          ? attiviIds.map(id => ({ id, nome: attiviMap.get(id)?.nome || id, quota: attiviMap.get(id)?.quota || 0 })).filter(s => s.quota > 0)
          : attiviIds.map(id => ({ id, nome: attiviMap.get(id)?.nome || id, quota: 1 }));
      }
    }
  }

  if (!soggetti.length || effVal < 0.001) return {};

  try {
    const result = calcolaRipartoPuro({ importoTotale: effVal, quote: soggetti });
    return Object.fromEntries(result.quote.map(r => [r.id, r.importo * sign]));
  } catch {
    const each = (effVal / soggetti.length) * sign;
    return Object.fromEntries(soggetti.map(s => [s.id, each]));
  }
}

// Cache regole riparto appartamento (inquilini o proprietari)
function makeCacheRegola(immobileId, target) {
  const cache = new Map();
  return async function getRegola(tipoSpesaId, mese) {
    const key = `${tipoSpesaId ?? ""}::${mese}`;
    if (cache.has(key)) return cache.get(key);
    const rows = await query(`
      SELECT rr.*,
        COALESCE(
          JSON_AGG(JSON_BUILD_OBJECT(
            'persona_id', rrd.persona_id, 'includi', rrd.includi, 'percentuale', rrd.percentuale
          )) FILTER (WHERE rrd.id IS NOT NULL),
          '[]'::JSON
        ) AS dettagli
      FROM v2.regola_riparto rr
      LEFT JOIN v2.regola_riparto_dettaglio rrd ON rrd.regola_id = rr.id
      WHERE rr.immobile_id = $1
        AND rr.target = $2
        AND ($3::UUID IS NULL OR rr.tipo_spesa_id = $3 OR rr.tipo_spesa_id IS NULL)
        AND (rr.validita_da IS NULL OR rr.validita_da <= $4::DATE)
        AND (rr.validita_a  IS NULL OR rr.validita_a  >= $4::DATE)
      GROUP BY rr.id
      ORDER BY (rr.tipo_spesa_id IS NOT NULL) DESC,
               (rr.validita_da IS NOT NULL OR rr.validita_a IS NOT NULL) DESC
      LIMIT 1
    `, [immobileId, target, tipoSpesaId || null, mese + "-01"]);
    const regola = rows[0] || null;
    cache.set(key, regola);
    return regola;
  };
}

// Cache quota condominio → appartamento (percentuale da applicare all'importo del fatto condominiale).
// defaultPct: valore di fallback da v2.immobile.percentuale_condominio (0-100), usato se non c'è regola esplicita.
function makeCacheRegolaCondominio(condominioId, immobileId, defaultPct = null) {
  const fallback = defaultPct != null ? Number(defaultPct) / 100 : null;
  if (!condominioId) return async () => fallback;
  const cache = new Map();
  return async function getQuota(tipoSpesaId, mese) {
    const key = `${tipoSpesaId ?? ""}::${mese}`;
    if (cache.has(key)) return cache.get(key);
    const rows = await query(`
      SELECT rrcd.percentuale
      FROM v2.regola_riparto_condominio rrc
      JOIN v2.regola_riparto_condominio_dettaglio rrcd ON rrcd.regola_id = rrc.id
      WHERE rrc.condominio_id = $1
        AND rrcd.immobile_id  = $2
        AND ($3::UUID IS NULL OR rrc.tipo_spesa_id = $3 OR rrc.tipo_spesa_id IS NULL)
        AND (rrc.validita_da IS NULL OR rrc.validita_da <= $4::DATE)
        AND (rrc.validita_a  IS NULL OR rrc.validita_a  >= $4::DATE)
      ORDER BY (rrc.tipo_spesa_id IS NOT NULL) DESC, rrc.validita_da DESC NULLS LAST
      LIMIT 1
    `, [condominioId, immobileId, tipoSpesaId || null, mese + "-01"]);
    // Se non c'è regola esplicita, usa la percentuale_condominio dell'immobile come default
    const pct = rows[0]?.percentuale != null ? parseFloat(rows[0].percentuale) / 100 : fallback;
    cache.set(key, pct);
    return pct;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GRIGLIA INQUILINI
// ─────────────────────────────────────────────────────────────────────────────
export async function righeGrigliaV2(immobileId, periodoDa, periodoA, personaId = null) {
  const fDA = periodoDa || "2000-01";
  const fA  = periodoA  || oggiYM();
  const fDaDate = fDA + "-01";
  const fADate  = fA  + "-" + _ultimoGiorno(fA);

  // 0. condominio_id + quota default dell'immobile (serve per spese condominiali)
  const immRow = await query(`SELECT condominio_id, percentuale_condominio FROM v2.immobile WHERE id = $1`, [immobileId]);
  const condominioId          = immRow[0]?.condominio_id || null;
  const defaultQuotaCondominio = immRow[0]?.percentuale_condominio != null ? Number(immRow[0].percentuale_condominio) : null;

  // 1. Inquilini attivi almeno parzialmente nel periodo
  const inqRows = await query(`
    SELECT rp.persona_id, rp.quota, rp.quota_affitto, rp.validita_da, rp.validita_a,
           TRIM(COALESCE(p.cognome,'') || ' ' || COALESCE(p.nome,'')) AS label
    FROM v2.ruolo_persona rp
    JOIN v2.persona p ON p.id = rp.persona_id
    WHERE rp.immobile_id = $1
      AND rp.ruolo = 'inquilino'
      AND (rp.validita_da IS NULL OR rp.validita_da <= $3::date)
      AND (rp.validita_a  IS NULL OR rp.validita_a  >= $2::date)
    ORDER BY p.cognome NULLS LAST, p.nome
  `, [immobileId, fDaDate, fADate]);

  if (!inqRows.length) return { persone: [], righeSpese: [], righeEntrate: [], totaliDovuto: {}, totaliVersato: {} };

  const persone = inqRows.map(r => ({
    id:          r.persona_id,
    label:       r.label.trim() || r.persona_id,
    quota:       r.quota != null ? Number(r.quota) : null,
    quotaAffitto:r.quota_affitto != null ? Number(r.quota_affitto) : null,
    validitaDa:  toYM(r.validita_da),
    validitaA:   toYM(r.validita_a),
  }));
  const personeMap = new Map(persone.map(p => [p.id, p]));
  const initQ = () => Object.fromEntries(persone.map(p => [p.id, 0]));

  function attiviInMese(mese) {
    return persone.filter(p => {
      const da = p.validitaDa || "2000-01";
      const a  = p.validitaA  || FUTURO;
      return mese >= da && mese <= a;
    });
  }

  const getRegola          = makeCacheRegola(immobileId, "inquilini");
  const getQuotaCondominio = makeCacheRegolaCondominio(condominioId, immobileId, defaultQuotaCondominio);

  // 2. Spese: dirette sull'immobile + condominiali ripartite sull'appartamento
  const [speseDirecte, speseCondominio] = await Promise.all([
    query(`
      SELECT fe.id, fe.tipo_spesa_id, fe.importo, fe.periodicita, fe.segno,
             fe.periodo_da, fe.periodo_a, fe.rif_da, fe.rif_a,
             fe.nome, fe.nome_file, fe.fornitore, fe.file_path, fe.stato,
             fe.soggetto_pagante_id,
             ts.descrizione AS tipo_spesa_desc
      FROM v2.fatto_economico fe
      LEFT JOIN tipi_spesa ts ON ts.id = fe.tipo_spesa_id
      WHERE fe.immobile_id = $1 AND fe.tipo = 'spesa'
      ORDER BY COALESCE(fe.periodo_da::text, fe.rif_da::text) NULLS LAST
    `, [immobileId]),
    condominioId ? query(`
      SELECT fe.id, fe.tipo_spesa_id, fe.importo, fe.periodicita, fe.segno,
             fe.periodo_da, fe.periodo_a, fe.rif_da, fe.rif_a,
             fe.nome, fe.nome_file, fe.fornitore, fe.file_path, fe.stato,
             fe.soggetto_pagante_id,
             ts.descrizione AS tipo_spesa_desc
      FROM v2.fatto_economico fe
      LEFT JOIN tipi_spesa ts ON ts.id = fe.tipo_spesa_id
      WHERE fe.condominio_id = $1 AND fe.immobile_id IS NULL AND fe.tipo = 'spesa'
      ORDER BY COALESCE(fe.periodo_da::text, fe.rif_da::text) NULLS LAST
    `, [condominioId]) : Promise.resolve([]),
  ]);

  const speseRows = speseDirecte;   // processate normalmente
  const righeSpese = [];

  async function processaSpesa(fe, quotaFattore = 1) {
    const peri = fe.periodicita || "una_tantum";

    if (peri === "una_tantum") {
      const dDA = toYM(fe.periodo_da) || toYM(fe.rif_da);
      const dA  = toYM(fe.periodo_a)  || dDA;
      if (!dDA) return;
      const mesiTot = _mesiRange(dDA, dA);
      if (!mesiTot.length) return;
      const importoAppartamento = parseFloat(fe.importo || 0) * quotaFattore;
      const VAL = importoAppartamento / mesiTot.length;
      const mesiF = _mesiRange(_max(dDA, fDA), _min(dA, fA));
      if (!mesiF.length) return;
      const quote = initQ();
      for (const mese of mesiF) {
        const att = attiviInMese(mese);
        if (!att.length) continue;
        const regola = await getRegola(fe.tipo_spesa_id, mese);
        const am = new Map(att.map(a => [a.id, { quota: a.quota, nome: a.label }]));
        const qm = _calcolaQuote(VAL, att.map(a => a.id), am, regola);
        for (const p of persone) quote[p.id] += qm[p.id] || 0;
      }
      righeSpese.push({
        id: fe.id,
        label:          fe.tipo_spesa_desc || fe.nome || "Spesa",
        tipoSpesaDesc:  fe.tipo_spesa_desc || null,
        nomeFile:       fe.nome_file || fe.nome || null,
        fornitore:      fe.fornitore || null,
        periodoDa: dDA, periodoA: dA,
        importoFattura: parseFloat(fe.importo || 0),
        importo: VAL * mesiF.length,
        mesiTotali: mesiTot.length,
        mesiFiltro: mesiF.length,
        quote, hasPdf: !!fe.file_path,
        daCondominio: quotaFattore < 1,
      });
    } else {
      const rifDa = toYM(fe.rif_da) || toYM(fe.periodo_da);
      const rifA  = toYM(fe.rif_a)  || toYM(fe.periodo_a) || FUTURO;
      if (!rifDa) return;
      const occ = _occorrenze(rifDa, rifA, peri, fDA, fA);
      if (!occ) return;
      const mesePer = _max(rifDa, fDA) || rifDa;
      // per le condominiali: calcola la quota condominio nel mese di riferimento
      const qCond = quotaFattore < 1 ? quotaFattore : await (async () => 1)();
      const importo = parseFloat(fe.importo || 0) * occ * qCond;
      const att = attiviInMese(mesePer);
      const regola = await getRegola(fe.tipo_spesa_id, mesePer);
      const am = new Map(att.map(a => [a.id, { quota: a.quota, nome: a.label }]));
      const quote = initQ();
      const qm = _calcolaQuote(importo, att.map(a => a.id), am, regola);
      for (const p of persone) quote[p.id] += qm[p.id] || 0;
      const dispDa = _max(rifDa, fDA) || rifDa;
      const dispA  = _min(rifA, fA)   || fA;
      righeSpese.push({
        id: fe.id,
        label:          fe.tipo_spesa_desc || fe.nome || "Spesa",
        tipoSpesaDesc:  fe.tipo_spesa_desc || null,
        nomeFile:       fe.nome_file || fe.nome || null,
        fornitore:      fe.fornitore || null,
        periodoDa: dispDa, periodoA: dispA,
        importoFattura: parseFloat(fe.importo || 0),
        importo, mesiTotali: occ, mesiFiltro: occ,
        quote, hasPdf: !!fe.file_path,
        daCondominio: qCond < 1,
      });
    }
  }

  // Spese dirette sull'immobile
  for (const fe of speseDirecte) {
    await processaSpesa(fe, 1);
  }

  // Spese condominiali: prima trova la quota dell'appartamento, poi ripartisce
  for (const fe of speseCondominio) {
    const peri  = fe.periodicita || "una_tantum";
    const mese  = peri === "una_tantum"
      ? (toYM(fe.periodo_da) || toYM(fe.rif_da))
      : (_max(toYM(fe.rif_da) || toYM(fe.periodo_da), fDA));
    if (!mese) continue;
    const quota = await getQuotaCondominio(fe.tipo_spesa_id, mese);
    if (quota == null) continue; // nessuna regola → appartamento escluso da questa spesa
    await processaSpesa(fe, quota);
  }

  // 3. Entrate
  const entrateRows = await query(`
    SELECT fe.id, fe.tipo_spesa_id, fe.importo, fe.periodicita, fe.segno,
           fe.periodo_da, fe.periodo_a, fe.rif_da, fe.rif_a,
           fe.nome, fe.descrizione, fe.soggetto_pagante_id, fe.persona_id,
           ts.descrizione AS tipo_spesa_desc
    FROM v2.fatto_economico fe
    LEFT JOIN tipi_spesa ts ON ts.id = fe.tipo_spesa_id
    WHERE fe.immobile_id = $1 AND fe.tipo = 'entrata'
    ORDER BY COALESCE(fe.rif_da::text, fe.periodo_da::text) NULLS LAST
  `, [immobileId]);

  const righeEntrate = [];
  for (const fe of entrateRows) {
    const peri  = fe.periodicita || "una_tantum";
    const segno = parseInt(fe.segno ?? 1);
    const paganteId = fe.soggetto_pagante_id || fe.persona_id;
    if (!paganteId || !personeMap.has(paganteId)) continue;

    let occ, dispDa, dispA;
    if (peri === "una_tantum") {
      const mese = toYM(fe.periodo_da) || toYM(fe.rif_da);
      if (!mese || mese < fDA || mese > fA) continue;
      occ = 1; dispDa = mese; dispA = mese;
    } else {
      const rifDa = toYM(fe.rif_da) || toYM(fe.periodo_da);
      const rifA  = toYM(fe.rif_a)  || toYM(fe.periodo_a) || FUTURO;
      occ = _occorrenze(rifDa, rifA, peri, fDA, fA);
      if (!occ) continue;
      dispDa = _max(rifDa, fDA) || rifDa;
      dispA  = _min(rifA, fA)   || fA;
    }

    const valore = parseFloat(fe.importo || 0) * occ * segno;
    const quote = initQ();
    quote[paganteId] = valore;

    const regolaV = await getRegola(fe.tipo_spesa_id, dispDa);
    let quotaTeorica = null;
    if (regolaV) {
      const att = attiviInMese(dispDa);
      if (att.length > 0) {
        const am = new Map(att.map(a => [a.id, { quota: a.quota, nome: a.label }]));
        quotaTeorica = initQ();
        const qt = _calcolaQuote(valore, att.map(a => a.id), am, regolaV);
        for (const p of persone) quotaTeorica[p.id] = qt[p.id] || 0;
      }
    }

    righeEntrate.push({
      id: fe.id,
      label:         fe.descrizione?.trim() || fe.nome?.trim() || fe.tipo_spesa_desc || "Entrata",
      tipoVersamento:fe.tipo_spesa_desc || null,
      paganteId,
      paganteLabel:  personeMap.get(paganteId)?.label || paganteId,
      segno,
      periodoDa: dispDa,
      periodoA:  dispA !== dispDa ? dispA : null,
      importo:   valore,
      quote,
      quotaTeorica,
    });
  }

  // 4. Totali
  const totaliDovuto  = Object.fromEntries(persone.map(p => [p.id, righeSpese.reduce((s, r)   => s + (r.quote[p.id]  || 0), 0)]));
  const totaliVersato = Object.fromEntries(persone.map(p => [p.id, righeEntrate.reduce((s, r) => s + (r.quote[p.id]  || 0), 0)]));

  if (personaId) {
    return {
      persone:       persone.filter(p => p.id === personaId),
      righeSpese:    righeSpese.filter(r => (r.quote[personaId]   || 0) !== 0),
      righeEntrate:  righeEntrate.filter(r => (r.quote[personaId] || 0) !== 0 ||
                       (r.quotaTeorica && (r.quotaTeorica[personaId] || 0) !== 0)),
      totaliDovuto:  { [personaId]: totaliDovuto[personaId]  || 0 },
      totaliVersato: { [personaId]: totaliVersato[personaId] || 0 },
    };
  }
  return { persone, righeSpese, righeEntrate, totaliDovuto, totaliVersato };
}

// ─────────────────────────────────────────────────────────────────────────────
// GRIGLIA PROPRIETARI
// ─────────────────────────────────────────────────────────────────────────────
export async function grigliaProprietariV2(immobileId, periodoDa, periodoA) {
  const fDA = periodoDa || "2000-01";
  const fA  = periodoA  || oggiYM();
  const fDaDate = fDA + "-01";
  const fADate  = fA  + "-" + _ultimoGiorno(fA);

  // 0. condominio_id + quota default
  const immRow = await query(`SELECT condominio_id, percentuale_condominio FROM v2.immobile WHERE id = $1`, [immobileId]);
  const condominioId           = immRow[0]?.condominio_id || null;
  const defaultQuotaCondominio = immRow[0]?.percentuale_condominio != null ? Number(immRow[0].percentuale_condominio) : null;

  const propRows = await query(`
    SELECT rp.persona_id, rp.quota, rp.validita_da, rp.validita_a,
           rp.default_incassante, rp.default_pagante,
           TRIM(COALESCE(p.cognome,'') || ' ' || COALESCE(p.nome,'')) AS label
    FROM v2.ruolo_persona rp
    JOIN v2.persona p ON p.id = rp.persona_id
    WHERE rp.immobile_id = $1
      AND rp.ruolo = 'proprietario'
      AND (rp.validita_da IS NULL OR rp.validita_da <= $3::date)
      AND (rp.validita_a  IS NULL OR rp.validita_a  >= $2::date)
    ORDER BY p.cognome NULLS LAST, p.nome
  `, [immobileId, fDaDate, fADate]);

  if (!propRows.length) return { props: [], righeSpese: [], righeEntrate: [], totaliDareTeorico: {}, totaliAvereTeorico: {}, totaliPagato: {}, totaliIncassato: {} };

  const props = propRows.map(r => ({
    id:              r.persona_id,
    label:           r.label.trim() || r.persona_id,
    quota:           r.quota != null ? Number(r.quota) : null,
    validitaDa:      toYM(r.validita_da),
    validitaA:       toYM(r.validita_a),
    defaultIncassante: r.default_incassante,
    defaultPagante:  r.default_pagante,
  }));
  const initQ = () => Object.fromEntries(props.map(p => [p.id, 0]));

  function propsForMese(mese) {
    return props.filter(p => {
      const da = p.validitaDa || "2000-01";
      const a  = p.validitaA  || FUTURO;
      return mese >= da && mese <= a;
    });
  }

  function defaultProp(mese) {
    const p = props.find(p => p.defaultIncassante && (p.validitaDa || "2000-01") <= mese && (p.validitaA || FUTURO) >= mese);
    return p?.id || props[0]?.id || null;
  }

  // Chi paga per default (default_pagante=true); fallback a defaultProp se non trovato.
  function defaultPagante(mese) {
    const p = props.find(p => p.defaultPagante && (p.validitaDa || "2000-01") <= mese && (p.validitaA || FUTURO) >= mese);
    return p?.id || defaultProp(mese);
  }

  const getRegola          = makeCacheRegola(immobileId, "proprietari");
  const getQuotaCondominio = makeCacheRegolaCondominio(condominioId, immobileId, defaultQuotaCondominio);

  // Set dei proprietari di QUESTO appartamento — usato per validare soggetto_pagante/incassante
  // sulle voci condominiali: un pagante esterno non va accreditato come pagante locale.
  const propIds = new Set(props.map(p => p.id));

  // Spese dirette + condominiali
  const [speseDirecte, speseCondominio] = await Promise.all([
    query(`
      SELECT fe.id, fe.tipo_spesa_id, fe.importo, fe.periodicita,
             fe.periodo_da, fe.periodo_a, fe.rif_da, fe.rif_a,
             fe.nome, fe.nome_file, fe.fornitore, fe.file_path,
             fe.soggetto_pagante_id,
             ts.descrizione AS tipo_spesa_desc
      FROM v2.fatto_economico fe
      LEFT JOIN tipi_spesa ts ON ts.id = fe.tipo_spesa_id
      WHERE fe.immobile_id = $1 AND fe.tipo = 'spesa'
      ORDER BY COALESCE(fe.periodo_da::text, fe.rif_da::text) NULLS LAST
    `, [immobileId]),
    condominioId ? query(`
      SELECT fe.id, fe.tipo_spesa_id, fe.importo, fe.periodicita,
             fe.periodo_da, fe.periodo_a, fe.rif_da, fe.rif_a,
             fe.nome, fe.nome_file, fe.fornitore, fe.file_path,
             fe.soggetto_pagante_id,
             ts.descrizione AS tipo_spesa_desc
      FROM v2.fatto_economico fe
      LEFT JOIN tipi_spesa ts ON ts.id = fe.tipo_spesa_id
      WHERE fe.condominio_id = $1 AND fe.immobile_id IS NULL AND fe.tipo = 'spesa'
      ORDER BY COALESCE(fe.periodo_da::text, fe.rif_da::text) NULLS LAST
    `, [condominioId]) : Promise.resolve([]),
  ]);

  const righeSpese = [];

  async function processaSpesaProp(fe, quotaFattore = 1) {
    const peri = fe.periodicita || "una_tantum";
    if (peri === "una_tantum") {
      const dDA = toYM(fe.periodo_da) || toYM(fe.rif_da);
      const dA  = toYM(fe.periodo_a)  || dDA;
      if (!dDA) return;
      const mesiTot = _mesiRange(dDA, dA);
      if (!mesiTot.length) return;
      const importoAppartamento = parseFloat(fe.importo || 0) * quotaFattore;
      const VAL = importoAppartamento / mesiTot.length;
      const mesiF = _mesiRange(_max(dDA, fDA), _min(dA, fA));
      if (!mesiF.length) return;
      const quote = initQ();
      for (const mese of mesiF) {
        const att = propsForMese(mese);
        if (!att.length) continue;
        const regola = await getRegola(fe.tipo_spesa_id, mese);
        const am = new Map(att.map(p => [p.id, { quota: p.quota, nome: p.label }]));
        const qm = _calcolaQuote(VAL, att.map(p => p.id), am, regola);
        for (const p of props) quote[p.id] += qm[p.id] || 0;
      }
      // Pagante reale: soggetto_pagante_id grezzo (per display in GrigliaV2), fallback a defaultPagante.
      const pagato_da = fe.soggetto_pagante_id || defaultPagante(dDA);
      righeSpese.push({
        id: fe.id,
        tipoSpesaDesc: fe.tipo_spesa_desc || fe.nome || "Spesa",
        nomeFile:      fe.nome_file || fe.nome || null,
        fornitore:     fe.fornitore || null,
        periodoDa: dDA, periodoA: dA,
        importo:   VAL * mesiF.length,
        pagatoDaPropId: pagato_da, quote, hasPdf: !!fe.file_path,
        daCondominio: quotaFattore < 1,
      });
    } else {
      const rifDa = toYM(fe.rif_da) || toYM(fe.periodo_da);
      const rifA  = toYM(fe.rif_a)  || toYM(fe.periodo_a) || FUTURO;
      if (!rifDa) return;
      const occ = _occorrenze(rifDa, rifA, peri, fDA, fA);
      if (!occ) return;
      const dispDa  = _max(rifDa, fDA) || rifDa;
      const dispA   = _min(rifA, fA)   || fA;
      const importo = parseFloat(fe.importo || 0) * occ * quotaFattore;
      const att = propsForMese(dispDa);
      const regola = await getRegola(fe.tipo_spesa_id, dispDa);
      const am = new Map(att.map(p => [p.id, { quota: p.quota, nome: p.label }]));
      const quote = initQ();
      const qm = _calcolaQuote(importo, att.map(p => p.id), am, regola);
      for (const p of props) quote[p.id] += qm[p.id] || 0;
      const pagato_da = fe.soggetto_pagante_id || defaultPagante(dispDa);
      righeSpese.push({
        id: fe.id,
        tipoSpesaDesc: fe.tipo_spesa_desc || fe.nome || "Spesa",
        nomeFile:      fe.nome_file || fe.nome || null,
        fornitore:     fe.fornitore || null,
        periodoDa: dispDa, periodoA: dispA,
        importo, pagatoDaPropId: pagato_da, quote, hasPdf: !!fe.file_path,
        daCondominio: quotaFattore < 1,
      });
    }
  }

  for (const fe of speseDirecte) {
    await processaSpesaProp(fe, 1);
  }

  for (const fe of speseCondominio) {
    const peri = fe.periodicita || "una_tantum";
    const mese = peri === "una_tantum"
      ? (toYM(fe.periodo_da) || toYM(fe.rif_da))
      : (_max(toYM(fe.rif_da) || toYM(fe.periodo_da), fDA));
    if (!mese) continue;
    const quota = await getQuotaCondominio(fe.tipo_spesa_id, mese);
    if (quota == null) continue;
    await processaSpesaProp(fe, quota);
  }

  // Entrate
  const entrateRows = await query(`
    SELECT fe.id, fe.tipo_spesa_id, fe.importo, fe.periodicita, fe.segno,
           fe.periodo_da, fe.periodo_a, fe.rif_da, fe.rif_a,
           fe.soggetto_incassante_id, fe.soggetto_pagante_id, fe.persona_id,
           ts.descrizione AS tipo_spesa_desc
    FROM v2.fatto_economico fe
    LEFT JOIN tipi_spesa ts ON ts.id = fe.tipo_spesa_id
    WHERE fe.immobile_id = $1 AND fe.tipo = 'entrata'
    ORDER BY COALESCE(fe.rif_da::text, fe.periodo_da::text) NULLS LAST
  `, [immobileId]);

  const righeEntrate = [];
  for (const fe of entrateRows) {
    const peri  = fe.periodicita || "una_tantum";
    const segno = parseInt(fe.segno ?? 1);
    let occ, dispDa, dispA;
    if (peri === "una_tantum") {
      const mese = toYM(fe.periodo_da) || toYM(fe.rif_da);
      if (!mese || mese < fDA || mese > fA) continue;
      occ = 1; dispDa = mese; dispA = mese;
    } else {
      const rifDa = toYM(fe.rif_da) || toYM(fe.periodo_da);
      const rifA  = toYM(fe.rif_a)  || toYM(fe.periodo_a) || FUTURO;
      occ = _occorrenze(rifDa, rifA, peri, fDA, fA);
      if (!occ) continue;
      dispDa = _max(rifDa, fDA) || rifDa;
      dispA  = _min(rifA, fA)   || fA;
    }
    const importo = parseFloat(fe.importo || 0) * occ * segno;
    // Se soggetto_incassante_id è esterno all'appartamento (es. amministratore di condominio)
    // ricade su defaultProp, altrimenti il valore finirebbe in una chiave fuori da initQ()
    // e totaliIncassato darebbe 0 per tutti i proprietari di questo appartamento.
    const incassatoRaw = fe.soggetto_incassante_id;
    const incassato_da = (incassatoRaw && propIds.has(incassatoRaw))
      ? incassatoRaw
      : defaultProp(dispDa);
    const quoteReale = initQ();
    if (incassato_da) quoteReale[incassato_da] = importo;

    const att = propsForMese(dispDa);
    const regola = await getRegola(fe.tipo_spesa_id, dispDa);
    const am = new Map(att.map(p => [p.id, { quota: p.quota, nome: p.label }]));
    const quotaTeorica = initQ();
    if (att.length) {
      const qt = _calcolaQuote(importo, att.map(p => p.id), am, regola);
      for (const p of props) quotaTeorica[p.id] = qt[p.id] || 0;
    }

    righeEntrate.push({
      id: fe.id,
      tipoVersamento: fe.tipo_spesa_desc || "Entrata",
      dispDa, dispA: dispA !== dispDa ? dispA : null,
      importo, incassatoDaId: incassato_da,
      quoteReale, quotaTeorica,
    });
  }

  const totaliDareTeorico  = Object.fromEntries(props.map(p => [p.id, righeSpese.reduce((s, r)   => s + (r.quote[p.id]        || 0), 0)]));
  const totaliAvereTeorico = Object.fromEntries(props.map(p => [p.id, righeEntrate.reduce((s, r) => s + (r.quotaTeorica[p.id]  || 0), 0)]));
  const totaliIncassato    = Object.fromEntries(props.map(p => [p.id, righeEntrate.reduce((s, r) => s + (r.quoteReale[p.id]    || 0), 0)]));

  // Per il pagato reale: se il pagante registrato non appartiene a questo appartamento
  // si ricade su defaultPagante (chi ha default_pagante=true tra i proprietari dell'appartamento).
  const totaliPagato = Object.fromEntries(props.map(p => [
    p.id,
    righeSpese.reduce((s, r) => {
      const raw = r.pagatoDaPropId;
      const effPayer = (raw && propIds.has(raw)) ? raw : defaultPagante(r.periodoDa);
      return s + (effPayer === p.id ? r.importo : 0);
    }, 0),
  ]));

  return { props, righeSpese, righeEntrate, totaliDareTeorico, totaliAvereTeorico, totaliPagato, totaliIncassato };
}
