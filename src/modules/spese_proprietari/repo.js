import { query, transaction } from "../../shared/db/pool.js";

function dateStr(v) {
  if (!v || v === "") return null;
  return String(v).slice(0, 10);
}

const STATI_VALIDI = ["normale", "verificato", "da_verificare"];

// Salva le quote: cancella quelle esistenti e reinserisce
async function saveQuote(client, spesaId, quote, defaultProprietarioId) {
  await client.query(`DELETE FROM spese_proprietari_quote WHERE spesa_id=$1`, [spesaId]);

  const righe = (quote && quote.length > 0)
    ? quote
    : [{ proprietario_id: defaultProprietarioId, percentuale: 100 }];

  const tot = righe.reduce((s, q) => s + parseFloat(q.percentuale || 0), 0);
  if (Math.abs(tot - 100) > 0.1)
    throw Object.assign(new Error(`Le percentuali sommano a ${tot.toFixed(2)}% invece di 100%`), { status: 400 });

  for (const q of righe) {
    await client.query(
      `INSERT INTO spese_proprietari_quote (spesa_id, proprietario_id, percentuale)
       VALUES ($1,$2,$3)`,
      [spesaId, q.proprietario_id, parseFloat(q.percentuale)]
    );
  }
}

export async function listAll({ proprietarioId, appartamentoId, tipoSpesa, da, a } = {}) {
  const conds = ["1=1"];
  const p = []; let i = 1;
  if (proprietarioId) { conds.push(`s.proprietario_id=$${i++}`); p.push(proprietarioId); }
  if (appartamentoId) { conds.push(`s.appartamento_id=$${i++}`); p.push(appartamentoId); }
  if (tipoSpesa)      { conds.push(`s.tipo_spesa_id=$${i++}`);   p.push(tipoSpesa); }
  if (da)             { conds.push(`s.validita_da>=$${i++}`);    p.push(da); }
  if (a)              { conds.push(`s.validita_da<=$${i++}`);    p.push(a); }
  return query(
    `SELECT * FROM v_spese_proprietari_dettaglio s
     WHERE ${conds.join(" AND ")}
     ORDER BY s.validita_da DESC NULLS LAST, s.created_at DESC`,
    p
  );
}

export async function create(d) {
  if (!d.proprietario_id) throw new Error("Proprietario obbligatorio");
  if (!d.appartamento_id) throw new Error("Appartamento obbligatorio");
  const importo = parseFloat(d.importo);
  if (!importo || importo <= 0) throw new Error("Importo deve essere > 0");

  const peri = d.periodicita || "una_tantum";
  const una  = peri === "una_tantum";

  return transaction(async client => {
    const res = await client.query(
      `INSERT INTO spese_proprietari
         (proprietario_id, appartamento_id, tipo_spesa_id, importo, periodicita,
          validita_da, validita_a, data_pagamento, mese_competenza,
          fornitore, numero_fattura, descrizione, stato, documento_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        d.proprietario_id, d.appartamento_id,
        d.tipo_spesa_id || null, importo, peri,
        dateStr(d.validita_da),
        una ? null : dateStr(d.validita_a),
        una ? dateStr(d.data_pagamento) : null,
        una ? (d.mese_competenza || null) : null,
        d.fornitore      || null, d.numero_fattura || null,
        d.descrizione    || null, d.stato || "normale",
        d.documento_id   || null,
      ]
    );
    const spesa = res.rows[0];
    await saveQuote(client, spesa.id, d.quote, d.proprietario_id);
    return spesa;
  });
}

export async function update(id, d) {
  const existing = (await query(`SELECT * FROM spese_proprietari WHERE id=$1`, [id]))[0];
  if (!existing) throw new Error(`Spesa ${id} non trovata`);

  const peri    = d.periodicita !== undefined ? d.periodicita : existing.periodicita;
  const una     = peri === "una_tantum";
  const importo = d.importo !== undefined ? parseFloat(d.importo) : parseFloat(existing.importo);
  if (!importo || importo <= 0) throw new Error("Importo deve essere > 0");

  const propId = d.proprietario_id ?? existing.proprietario_id;

  return transaction(async client => {
    const res = await client.query(
      `UPDATE spese_proprietari
       SET proprietario_id=$1, appartamento_id=$2, tipo_spesa_id=$3, importo=$4, periodicita=$5,
           validita_da=$6, validita_a=$7, data_pagamento=$8, mese_competenza=$9,
           fornitore=$10, numero_fattura=$11, descrizione=$12, stato=$13,
           documento_id=$14, updated_at=NOW()
       WHERE id=$15 RETURNING *`,
      [
        propId,
        d.appartamento_id  ?? existing.appartamento_id,
        d.tipo_spesa_id !== undefined ? (d.tipo_spesa_id || null) : existing.tipo_spesa_id,
        importo, peri,
        dateStr(d.validita_da !== undefined ? d.validita_da : existing.validita_da),
        una ? null : dateStr(d.validita_a !== undefined ? d.validita_a : existing.validita_a),
        una ? dateStr(d.data_pagamento !== undefined ? d.data_pagamento : existing.data_pagamento) : null,
        una ? (d.mese_competenza !== undefined ? d.mese_competenza : existing.mese_competenza) : null,
        d.fornitore      !== undefined ? (d.fornitore      || null) : existing.fornitore,
        d.numero_fattura !== undefined ? (d.numero_fattura || null) : existing.numero_fattura,
        d.descrizione    !== undefined ? (d.descrizione    || null) : existing.descrizione,
        d.stato          !== undefined && STATI_VALIDI.includes(d.stato) ? d.stato : existing.stato,
        d.documento_id   !== undefined ? (d.documento_id   || null) : existing.documento_id,
        id,
      ]
    );
    const spesa = res.rows[0];
    if (d.quote !== undefined) {
      await saveQuote(client, spesa.id, d.quote, propId);
    }
    return spesa;
  });
}

export async function updateStato(id, stato) {
  if (!STATI_VALIDI.includes(stato))
    throw Object.assign(new Error(`Stato non valido: ${stato}`), { status: 400 });
  await query(`UPDATE spese_proprietari SET stato=$1, updated_at=NOW() WHERE id=$2`, [stato, id]);
}

export async function remove(id) {
  await query(`DELETE FROM spese_proprietari WHERE id=$1`, [id]);
}
