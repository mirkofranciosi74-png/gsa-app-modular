import { query, transaction } from "../../shared/db/pool.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: carica una regola con i suoi sotto-elenchi
// ─────────────────────────────────────────────────────────────────────────────
async function _loadReg(reg) {
  reg.esclusi      = await _loadEsclusi(reg.id);
  reg.inclusi      = await _loadInclusi(reg.id);
  reg.esclusi_prop = await _loadEsclusiProp(reg.id);
  reg.inclusi_prop = await _loadIncludiProp(reg.id);
  return reg;
}

// Costruisce il label della regola (tipo_spesa, versamento o default)
function _labelRegola(row) {
  if (row.tipo_spesa_nome)   return row.tipo_spesa_nome;
  if (row.tipo_versamento)   return `Versamento: ${row.tipo_versamento}`;
  return "Default (tutte le spese)";
}

// ─────────────────────────────────────────────────────────────────────────────
// LETTURA
// ─────────────────────────────────────────────────────────────────────────────

export async function listByAppartamento(appartamentoId) {
  const regole = await query(
    `SELECT r.*,
            ts.descrizione AS tipo_spesa_nome
     FROM   regole_riparto r
     LEFT   JOIN tipi_spesa ts ON ts.id = r.tipo_spesa_id
     WHERE  r.appartamento_id = $1
     ORDER  BY COALESCE(ts.descrizione, r.tipo_versamento, 'zzz'),
               r.validita_da NULLS FIRST`,
    [appartamentoId]
  );
  for (const reg of regole) {
    reg.label = _labelRegola(reg);
    await _loadReg(reg);
  }
  return regole;
}

// ── Regola per SPESE (inquilini): specifica → default ──────────────────────
export async function regolaAttiva(appartamentoId, tipoSpesaId, mese) {
  // 1. Regola specifica per tipo_spesa
  if (tipoSpesaId) {
    const rows = await query(
      `SELECT r.*, ts.descrizione AS tipo_spesa_nome
       FROM   regole_riparto r
       LEFT   JOIN tipi_spesa ts ON ts.id = r.tipo_spesa_id
       WHERE  r.appartamento_id = $1
         AND  r.tipo_spesa_id   = $2
         AND  r.tipo_versamento IS NULL
         AND  COALESCE(r.target,'inquilini') = 'inquilini'
         AND  (r.validita_da IS NULL OR r.validita_da <= $3)
         AND  (r.validita_a  IS NULL OR r.validita_a  >= $3)
       ORDER  BY r.validita_da DESC NULLS LAST
       LIMIT  1`,
      [appartamentoId, tipoSpesaId, mese]
    );
    if (rows[0]) {
      const reg   = rows[0];
      reg.esclusi = await _loadEsclusi(reg.id);
      reg.inclusi = await _loadInclusi(reg.id);
      return reg;
    }
  }
  // 2. Regola default (tipo_spesa_id IS NULL, tipo_versamento IS NULL)
  const def = await query(
    `SELECT r.*
     FROM   regole_riparto r
     WHERE  r.appartamento_id  = $1
       AND  r.tipo_spesa_id    IS NULL
       AND  r.tipo_versamento  IS NULL
       AND  COALESCE(r.target,'inquilini') = 'inquilini'
       AND  (r.validita_da IS NULL OR r.validita_da <= $2)
       AND  (r.validita_a  IS NULL OR r.validita_a  >= $2)
     ORDER  BY r.validita_da DESC NULLS LAST
     LIMIT  1`,
    [appartamentoId, mese]
  );
  if (!def[0]) return null;
  const reg   = def[0];
  reg.esclusi = await _loadEsclusi(reg.id);
  reg.inclusi = await _loadInclusi(reg.id);
  return reg;
}

// ── Regola per SPESE (proprietari): specifica → default ───────────────────
export async function regolaAttivaProp(appartamentoId, tipoSpesaId, mese) {
  if (tipoSpesaId) {
    const rows = await query(
      `SELECT r.*, ts.descrizione AS tipo_spesa_nome
       FROM   regole_riparto r
       LEFT   JOIN tipi_spesa ts ON ts.id = r.tipo_spesa_id
       WHERE  r.appartamento_id = $1
         AND  r.tipo_spesa_id   = $2
         AND  r.tipo_versamento IS NULL
         AND  r.target = 'proprietari'
         AND  (r.validita_da IS NULL OR r.validita_da <= $3)
         AND  (r.validita_a  IS NULL OR r.validita_a  >= $3)
       ORDER  BY r.validita_da DESC NULLS LAST
       LIMIT  1`,
      [appartamentoId, tipoSpesaId, mese]
    );
    if (rows[0]) {
      const reg        = rows[0];
      reg.esclusi_prop = await _loadEsclusiProp(reg.id);
      reg.inclusi_prop = await _loadIncludiProp(reg.id);
      return reg;
    }
  }
  const def = await query(
    `SELECT r.*
     FROM   regole_riparto r
     WHERE  r.appartamento_id  = $1
       AND  r.tipo_spesa_id    IS NULL
       AND  r.tipo_versamento  IS NULL
       AND  r.target = 'proprietari'
       AND  (r.validita_da IS NULL OR r.validita_da <= $2)
       AND  (r.validita_a  IS NULL OR r.validita_a  >= $2)
     ORDER  BY r.validita_da DESC NULLS LAST
     LIMIT  1`,
    [appartamentoId, mese]
  );
  if (!def[0]) return null;
  const reg        = def[0];
  reg.esclusi_prop = await _loadEsclusiProp(reg.id);
  reg.inclusi_prop = await _loadIncludiProp(reg.id);
  return reg;
}

// ── Regola per VERSAMENTI (inquilini): specifica → default ─────────────────
export async function regolaAttivaVers(appartamentoId, tipoVersamento, mese) {
  // 1. Regola specifica per tipo_versamento
  if (tipoVersamento) {
    const rows = await query(
      `SELECT r.*
       FROM   regole_riparto r
       WHERE  r.appartamento_id  = $1
         AND  r.tipo_versamento  = $2
         AND  COALESCE(r.target,'inquilini') = 'inquilini'
         AND  (r.validita_da IS NULL OR r.validita_da <= $3)
         AND  (r.validita_a  IS NULL OR r.validita_a  >= $3)
       ORDER  BY r.validita_da DESC NULLS LAST
       LIMIT  1`,
      [appartamentoId, tipoVersamento, mese]
    );
    if (rows[0]) {
      const reg   = rows[0];
      reg.esclusi = await _loadEsclusi(reg.id);
      reg.inclusi = await _loadInclusi(reg.id);
      return reg;
    }
  }
  // 2. Regola default (tipo_spesa_id IS NULL, tipo_versamento IS NULL)
  const def = await query(
    `SELECT r.*
     FROM   regole_riparto r
     WHERE  r.appartamento_id  = $1
       AND  r.tipo_spesa_id    IS NULL
       AND  r.tipo_versamento  IS NULL
       AND  COALESCE(r.target,'inquilini') = 'inquilini'
       AND  (r.validita_da IS NULL OR r.validita_da <= $2)
       AND  (r.validita_a  IS NULL OR r.validita_a  >= $2)
     ORDER  BY r.validita_da DESC NULLS LAST
     LIMIT  1`,
    [appartamentoId, mese]
  );
  if (!def[0]) return null;
  const reg   = def[0];
  reg.esclusi = await _loadEsclusi(reg.id);
  reg.inclusi = await _loadInclusi(reg.id);
  return reg;
}

export async function regolaAttivaVersProp(appartamentoId, tipoVersamento, mese) {
  // 1. Regola specifica per tipo_versamento (target=proprietari)
  if (tipoVersamento) {
    const rows = await query(
      `SELECT r.*
       FROM   regole_riparto r
       WHERE  r.appartamento_id  = $1
         AND  r.tipo_versamento  = $2
         AND  r.target           = 'proprietari'
         AND  (r.validita_da IS NULL OR r.validita_da <= $3)
         AND  (r.validita_a  IS NULL OR r.validita_a  >= $3)
       ORDER  BY r.validita_da DESC NULLS LAST
       LIMIT  1`,
      [appartamentoId, tipoVersamento, mese]
    );
    if (rows[0]) {
      const reg        = rows[0];
      reg.esclusi_prop = await _loadEsclusiProp(reg.id);
      reg.inclusi_prop = await _loadIncludiProp(reg.id);
      return reg;
    }
  }
  // 2. Regola default proprietari (tipo_spesa_id IS NULL, tipo_versamento IS NULL)
  const def = await query(
    `SELECT r.*
     FROM   regole_riparto r
     WHERE  r.appartamento_id  = $1
       AND  r.tipo_spesa_id    IS NULL
       AND  r.tipo_versamento  IS NULL
       AND  r.target           = 'proprietari'
       AND  (r.validita_da IS NULL OR r.validita_da <= $2)
       AND  (r.validita_a  IS NULL OR r.validita_a  >= $2)
     ORDER  BY r.validita_da DESC NULLS LAST
     LIMIT  1`,
    [appartamentoId, mese]
  );
  if (!def[0]) return null;
  const reg        = def[0];
  reg.esclusi_prop = await _loadEsclusiProp(reg.id);
  reg.inclusi_prop = await _loadIncludiProp(reg.id);
  return reg;
}

async function _loadEsclusi(regolaId) {
  return query(
    `SELECT e.componente_id,
            (c.nome || ' ' || COALESCE(c.cognome,'')) AS componente_nome
     FROM   regole_riparto_esclusi e
     JOIN   componenti c ON c.id = e.componente_id
     WHERE  e.regola_id = $1`,
    [regolaId]
  );
}

async function _loadInclusi(regolaId) {
  return query(
    `SELECT i.componente_id,
            (c.nome || ' ' || COALESCE(c.cognome,'')) AS componente_nome
     FROM   regole_riparto_inclusi i
     JOIN   componenti c ON c.id = i.componente_id
     WHERE  i.regola_id = $1`,
    [regolaId]
  );
}

async function _loadEsclusiProp(regolaId) {
  return query(
    `SELECT e.proprietario_id,
            (p.nome || ' ' || COALESCE(p.cognome,'')) AS proprietario_nome
     FROM   regole_riparto_esclusi_prop e
     JOIN   proprietari p ON p.id = e.proprietario_id
     WHERE  e.regola_id = $1`,
    [regolaId]
  );
}

async function _loadIncludiProp(regolaId) {
  return query(
    `SELECT i.proprietario_id, i.percentuale,
            (p.nome || ' ' || COALESCE(p.cognome,'')) AS proprietario_nome
     FROM   regole_riparto_inclusi_prop i
     JOIN   proprietari p ON p.id = i.proprietario_id
     WHERE  i.regola_id = $1`,
    [regolaId]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CALCOLO QUOTE INQUILINI
// ─────────────────────────────────────────────────────────────────────────────
export function calcolaQuote(mese, importoMensile, compsAttivi, regola) {
  const quote = {};
  for (const c of compsAttivi) quote[c.id] = 0;
  if (compsAttivi.length === 0) return quote;

  if (!regola) {
    // Nessuna regola: ogni inquilino paga importo × (sua percentuale / 100)
    for (const c of compsAttivi) {
      const perc  = parseFloat(c.percentuale || 0);
      quote[c.id] = importoMensile * perc / 100;
    }
    return quote;
  }

  const quotaPct  = parseFloat(regola.quota_totale_pct ?? 100) / 100;
  const modalita  = regola.modalita || "escludi";
  const importoR  = importoMensile * quotaPct;

  let paganti;
  if (modalita === "includi") {
    const ids = new Set((regola.inclusi || []).map(i => i.componente_id));
    paganti = compsAttivi.filter(c => ids.has(c.id));
  } else {
    const ids = new Set((regola.esclusi || []).map(e => e.componente_id));
    paganti = compsAttivi.filter(c => !ids.has(c.id));
  }

  if (paganti.length > 0) {
    const quotaEqua = importoR / paganti.length;
    for (const c of paganti) quote[c.id] += quotaEqua;
  }

  return quote;
}

// ─────────────────────────────────────────────────────────────────────────────
// CALCOLO QUOTE PROPRIETARI
// ─────────────────────────────────────────────────────────────────────────────
export function calcolaQuoteProp(importoMensile, propsAttivi, regola) {
  const quote = {};
  for (const p of propsAttivi) quote[p.proprietario_id] = 0;
  if (propsAttivi.length === 0) return quote;

  if (!regola) {
    // Nessuna regola: proporzionale alle quote di proprietà
    const totPerc = propsAttivi.reduce((s, p) => s + parseFloat(p.percentuale_proprieta || 0), 0);
    for (const p of propsAttivi) {
      const perc = parseFloat(p.percentuale_proprieta || 0);
      quote[p.proprietario_id] = totPerc > 0
        ? importoMensile * perc / totPerc
        : importoMensile / propsAttivi.length;
    }
    return quote;
  }

  const quotaPct      = parseFloat(regola.quota_totale_pct ?? 100) / 100;
  const modalita      = regola.modalita || "escludi";
  const importoRegola = importoMensile * quotaPct;
  const splitUguale   = regola.split_uguale === true;

  let paganti;
  if (modalita === "includi") {
    const ids = new Set((regola.inclusi_prop || []).map(i => i.proprietario_id));
    paganti = propsAttivi.filter(p => ids.has(p.proprietario_id));
  } else {
    const ids = new Set((regola.esclusi_prop || []).map(e => e.proprietario_id));
    paganti = propsAttivi.filter(p => !ids.has(p.proprietario_id));
  }
  if (paganti.length === 0) return quote;

  if (splitUguale) {
    // Parti uguali tra i paganti
    const quota = importoRegola / paganti.length;
    for (const p of paganti) quote[p.proprietario_id] = quota;
  } else if (modalita === "includi") {
    // Percentuali personalizzate se presenti, altrimenti proporzionale alla proprietà
    const inclusiMap = new Map(
      (regola.inclusi_prop || []).map(i => [i.proprietario_id, parseFloat(i.percentuale || 0)])
    );
    const hasPct = [...inclusiMap.values()].some(v => v > 0);
    if (hasPct) {
      const totPct = paganti.reduce((s, p) => s + (inclusiMap.get(p.proprietario_id) || 0), 0);
      for (const p of paganti) {
        const pct = inclusiMap.get(p.proprietario_id) || 0;
        quote[p.proprietario_id] = totPct > 0 ? importoRegola * pct / totPct : importoRegola / paganti.length;
      }
    } else {
      const totPerc = paganti.reduce((s, p) => s + parseFloat(p.percentuale_proprieta || 0), 0);
      for (const p of paganti) {
        const perc = parseFloat(p.percentuale_proprieta || 0);
        quote[p.proprietario_id] = totPerc > 0 ? importoRegola * perc / totPerc : importoRegola / paganti.length;
      }
    }
  } else {
    // escludi mode: proporzionale alla proprietà tra i rimanenti
    const totPerc = paganti.reduce((s, p) => s + parseFloat(p.percentuale_proprieta || 0), 0);
    for (const p of paganti) {
      const perc = parseFloat(p.percentuale_proprieta || 0);
      quote[p.proprietario_id] = totPerc > 0 ? importoRegola * perc / totPerc : importoRegola / paganti.length;
    }
  }
  return quote;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRITTURA
// ─────────────────────────────────────────────────────────────────────────────

export async function create({
  appartamento_id, tipo_spesa_id, tipo_versamento, descrizione,
  target = "inquilini",
  modalita = "escludi", quota_totale_pct = 100,
  split_uguale = false,
  validita_da, validita_a,
  esclusi = [], inclusi = [],
  esclusi_prop = [], inclusi_prop = [],
  inclusi_prop_pct = {},
}) {
  _validaDates(validita_da, validita_a);
  return transaction(async client => {
    const res = await client.query(
      `INSERT INTO regole_riparto
         (appartamento_id, tipo_spesa_id, tipo_versamento, descrizione,
          target, modalita, quota_totale_pct, split_uguale, validita_da, validita_a)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [appartamento_id,
       tipo_spesa_id    || null,
       tipo_versamento  || null,
       descrizione      || null,
       target, modalita, quota_totale_pct, split_uguale,
       validita_da || null, validita_a || null]
    );
    const reg         = res.rows[0];
    reg.esclusi       = await _insertEsclusi(client, reg.id, esclusi);
    reg.inclusi       = await _insertInclusi(client, reg.id, inclusi);
    reg.esclusi_prop  = await _insertEsclusiProp(client, reg.id, esclusi_prop);
    reg.inclusi_prop  = await _insertIncludiProp(client, reg.id, inclusi_prop, inclusi_prop_pct);
    return reg;
  });
}

export async function update(id, {
  tipo_spesa_id, tipo_versamento, descrizione,
  target = "inquilini",
  modalita = "escludi", quota_totale_pct = 100,
  split_uguale = false,
  validita_da, validita_a,
  esclusi = [], inclusi = [],
  esclusi_prop = [], inclusi_prop = [],
  inclusi_prop_pct = {},
}) {
  _validaDates(validita_da, validita_a);
  return transaction(async client => {
    const res = await client.query(
      `UPDATE regole_riparto
       SET tipo_spesa_id=$1, tipo_versamento=$2, descrizione=$3, target=$4,
           modalita=$5, quota_totale_pct=$6, split_uguale=$7, validita_da=$8, validita_a=$9
       WHERE id=$10 RETURNING *`,
      [tipo_spesa_id   || null,
       tipo_versamento || null,
       descrizione     || null,
       target, modalita, quota_totale_pct, split_uguale,
       validita_da || null, validita_a || null,
       id]
    );
    const reg = res.rows[0];
    if (!reg) throw new Error(`Regola ${id} non trovata`);
    await client.query(`DELETE FROM regole_riparto_esclusi      WHERE regola_id=$1`, [id]);
    await client.query(`DELETE FROM regole_riparto_inclusi      WHERE regola_id=$1`, [id]);
    await client.query(`DELETE FROM regole_riparto_esclusi_prop WHERE regola_id=$1`, [id]);
    await client.query(`DELETE FROM regole_riparto_inclusi_prop WHERE regola_id=$1`, [id]);
    reg.esclusi      = await _insertEsclusi(client, id, esclusi);
    reg.inclusi      = await _insertInclusi(client, id, inclusi);
    reg.esclusi_prop = await _insertEsclusiProp(client, id, esclusi_prop);
    reg.inclusi_prop = await _insertIncludiProp(client, id, inclusi_prop, inclusi_prop_pct);
    return reg;
  });
}

export async function remove(id) {
  await query(`DELETE FROM regole_riparto WHERE id=$1`, [id]);
}

// ── Helper privati ────────────────────────────────────────────────────────
async function _insertEsclusi(client, regolaId, esclusi) {
  const out = [];
  for (const compId of esclusi) {
    await client.query(
      `INSERT INTO regole_riparto_esclusi (regola_id, componente_id)
       VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [regolaId, compId]
    );
    out.push({ componente_id: compId });
  }
  return out;
}

async function _insertInclusi(client, regolaId, inclusi) {
  const out = [];
  for (const compId of inclusi) {
    await client.query(
      `INSERT INTO regole_riparto_inclusi (regola_id, componente_id)
       VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [regolaId, compId]
    );
    out.push({ componente_id: compId });
  }
  return out;
}

async function _insertEsclusiProp(client, regolaId, esclusi) {
  const out = [];
  for (const propId of esclusi) {
    await client.query(
      `INSERT INTO regole_riparto_esclusi_prop (regola_id, proprietario_id)
       VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [regolaId, propId]
    );
    out.push({ proprietario_id: propId });
  }
  return out;
}

async function _insertIncludiProp(client, regolaId, includi, pctMap = {}) {
  const out = [];
  for (const propId of includi) {
    const pct = pctMap[propId] != null ? parseFloat(pctMap[propId]) : null;
    await client.query(
      `INSERT INTO regole_riparto_inclusi_prop (regola_id, proprietario_id, percentuale)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [regolaId, propId, pct]
    );
    out.push({ proprietario_id: propId, percentuale: pct });
  }
  return out;
}

function _validaDates(da, a) {
  if (da && a && da > a)
    throw new Error(`Data inizio regola (${da}) successiva alla data fine (${a})`);
}
