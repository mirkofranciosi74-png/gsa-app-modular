import { query } from "../../shared/db/pool.js";

function dateStr(v) {
  if (!v || v === "") return null;
  return String(v).slice(0, 10);
}

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

async function validaDate(componenteId, validita_da, validita_a, periodicita) {
  if (!componenteId) throw new Error("Componente obbligatorio");
  const rows = await query(
    `SELECT validita_da, validita_a FROM componenti WHERE id=$1`, [componenteId]
  );
  if (!rows[0]) throw new Error(`Componente ${componenteId} non trovato`);

  const cDa = dateStr(rows[0].validita_da);
  const cA  = dateStr(rows[0].validita_a);
  const mDa = dateStr(validita_da);
  const mA  = dateStr(validita_a);

  if (cDa && mDa && mDa < cDa)
    throw new Error(`Data inizio (${mDa}) antecedente alla validità del componente (${cDa}).`);
  if (periodicita !== "una_tantum") {
    if (cA && mA && mA > cA)
      throw new Error(`Data fine (${mA}) successiva alla validità del componente (${cA}).`);
  }
  if (cA && mDa && mDa > cA)
    throw new Error(`Data inizio (${mDa}) successiva alla fine validità del componente (${cA}).`);
}

export async function listAll({ appartamentoId, componenteId } = {}) {
  const conds = ["1=1"], p = []; let i = 1;
  if (appartamentoId) { conds.push(`m.appartamento_id=$${i++}`); p.push(appartamentoId); }
  if (componenteId)   { conds.push(`m.componente_id=$${i++}`);   p.push(componenteId); }
  return query(
    `SELECT * FROM v_movimenti_dettaglio
     WHERE ${conds.join(" AND ")}
     ORDER BY validita_da DESC NULLS LAST, created_at DESC`,
    p
  );
}

export async function create(m) {
  const peri  = m.periodicita || "una_tantum";
  const { importo, segno } = _splitSegno(m.importo_netto ?? m.importo, m.segno);

  await validaDate(
    m.componente_id, m.validita_da,
    peri === "una_tantum" ? null : m.validita_a, peri
  );
  const rows = await query(
    `INSERT INTO movimenti
       (appartamento_id, componente_id, tipo, segno, periodicita,
        importo, validita_da, validita_a, descrizione,
        tipo_versamento, data_versamento, mese_riferimento,
        incassato_da_proprietario_id)
     VALUES ($1,$2,'Versamento',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [m.appartamento_id, m.componente_id,
     segno, peri, importo,
     dateStr(m.validita_da),
     peri === "una_tantum" ? null : dateStr(m.validita_a),
     m.descrizione || null,
     m.tipo_versamento  || "affitto",
     peri === "una_tantum" ? (dateStr(m.data_versamento)  || null) : null,
     peri === "una_tantum" ? (m.mese_riferimento || null) : null,
     m.incassato_da_proprietario_id || null]
  );
  return rows[0];
}

export async function update(id, m) {
  const existing = await query(`SELECT * FROM movimenti WHERE id=$1`, [id]);
  if (!existing[0]) throw new Error(`Movimento ${id} non trovato`);

  const compId = m.componente_id   || existing[0].componente_id;
  const peri   = m.periodicita     || existing[0].periodicita;

  const nettoRaw = m.importo_netto !== undefined
    ? m.importo_netto
    : (parseFloat(existing[0].importo) * (parseInt(existing[0].segno) || 1));
  const { importo, segno } = _splitSegno(nettoRaw, undefined);

  await validaDate(
    compId, m.validita_da,
    peri === "una_tantum" ? null : m.validita_a, peri
  );

  const rows = await query(
    `UPDATE movimenti
     SET segno=$1, periodicita=$2, importo=$3,
         validita_da=$4, validita_a=$5, descrizione=$6,
         componente_id=$7, appartamento_id=$8,
         tipo_versamento=$9, data_versamento=$10, mese_riferimento=$11,
         incassato_da_proprietario_id=$12
     WHERE id=$13 RETURNING *`,
    [segno, peri, importo,
     dateStr(m.validita_da),
     peri === "una_tantum" ? null : dateStr(m.validita_a),
     m.descrizione !== undefined ? m.descrizione : existing[0].descrizione,
     compId,
     m.appartamento_id || existing[0].appartamento_id,
     m.tipo_versamento !== undefined ? (m.tipo_versamento || "affitto") : (existing[0].tipo_versamento || "affitto"),
     peri === "una_tantum" ? (dateStr(m.data_versamento)  || null) : null,
     peri === "una_tantum" ? (m.mese_riferimento !== undefined ? m.mese_riferimento : existing[0].mese_riferimento) : null,
     m.incassato_da_proprietario_id !== undefined ? (m.incassato_da_proprietario_id || null) : (existing[0].incassato_da_proprietario_id || null),
     id]
  );
  return rows[0];
}

export async function remove(id) {
  await query(`DELETE FROM movimenti WHERE id=$1`, [id]);
}
