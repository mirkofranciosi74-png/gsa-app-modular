import { query } from "../../shared/db/pool.js";

// ── PROPRIETARI ───────────────────────────────────────────────────────────────

export async function listAll() {
  const rows = await query(
    `SELECT p.*,
       json_agg(
         json_build_object(
           'id',                    ap.id,
           'appartamento_id',       ap.appartamento_id,
           'appartamento_nome',     a.nome,
           'percentuale_proprieta', ap.percentuale_proprieta,
           'data_inizio',           ap.data_inizio,
           'data_fine',             ap.data_fine,
           'proprietario_default',  ap.proprietario_default
         ) ORDER BY ap.data_inizio
       ) FILTER (WHERE ap.id IS NOT NULL) AS associazioni
     FROM proprietari p
     LEFT JOIN appartamento_proprietari ap ON ap.proprietario_id = p.id
     LEFT JOIN appartamenti a ON a.id = ap.appartamento_id
     WHERE p.attivo = TRUE
     GROUP BY p.id
     ORDER BY p.cognome, p.nome`
  );
  return rows;
}

export async function findById(id) {
  const rows = await query(
    `SELECT p.*,
       json_agg(
         json_build_object(
           'id',                    ap.id,
           'appartamento_id',       ap.appartamento_id,
           'appartamento_nome',     a.nome,
           'percentuale_proprieta', ap.percentuale_proprieta,
           'data_inizio',           ap.data_inizio,
           'data_fine',             ap.data_fine,
           'proprietario_default',  ap.proprietario_default
         ) ORDER BY ap.data_inizio
       ) FILTER (WHERE ap.id IS NOT NULL) AS associazioni
     FROM proprietari p
     LEFT JOIN appartamento_proprietari ap ON ap.proprietario_id = p.id
     LEFT JOIN appartamenti a ON a.id = ap.appartamento_id
     WHERE p.id = $1
     GROUP BY p.id`,
    [id]
  );
  return rows[0] || null;
}

export async function create({ nome, cognome, indirizzo, telefono, email }) {
  const rows = await query(
    `INSERT INTO proprietari (nome, cognome, indirizzo, telefono, email)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [nome, cognome || null, indirizzo || null, telefono || null, email || null]
  );
  return rows[0];
}

export async function update(id, { nome, cognome, indirizzo, telefono, email }) {
  const rows = await query(
    `UPDATE proprietari
     SET nome=$1, cognome=$2, indirizzo=$3, telefono=$4, email=$5, updated_at=NOW()
     WHERE id=$6 AND attivo=TRUE
     RETURNING *`,
    [nome, cognome || null, indirizzo || null, telefono || null, email || null, id]
  );
  return rows[0];
}

export async function remove(id) {
  // Controlla se referenziato da documenti o movimenti
  const [{ cnt: cntD }] = await query(
    `SELECT COUNT(*)::int AS cnt FROM documenti WHERE pagato_da_proprietario_id=$1`, [id]
  );
  const [{ cnt: cntM }] = await query(
    `SELECT COUNT(*)::int AS cnt FROM movimenti WHERE incassato_da_proprietario_id=$1`, [id]
  );
  if (cntD + cntM > 0) {
    const err = new Error("Proprietario referenziato: impossibile eliminare.");
    err.status = 409;
    throw err;
  }
  await query(`UPDATE proprietari SET attivo=FALSE, updated_at=NOW() WHERE id=$1`, [id]);
}

// ── ASSOCIAZIONI PROPRIETARIO-APPARTAMENTO ────────────────────────────────────

export async function listAssociazioni(appartamentoId) {
  return query(
    `SELECT ap.*, p.nome AS proprietario_nome, p.cognome AS proprietario_cognome
     FROM appartamento_proprietari ap
     JOIN proprietari p ON p.id = ap.proprietario_id
     WHERE ap.appartamento_id = $1
     ORDER BY ap.data_inizio`,
    [appartamentoId]
  );
}

export async function createAssociazione(d) {
  const rows = await query(
    `INSERT INTO appartamento_proprietari
       (appartamento_id, proprietario_id, percentuale_proprieta,
        data_inizio, data_fine, proprietario_default)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      d.appartamento_id,
      d.proprietario_id,
      d.percentuale_proprieta ?? 100,
      d.data_inizio,
      d.data_fine || null,
      d.proprietario_default ?? false,
    ]
  );
  return rows[0];
}

export async function updateAssociazione(id, d) {
  const rows = await query(
    `UPDATE appartamento_proprietari
     SET percentuale_proprieta=$1, data_inizio=$2, data_fine=$3,
         proprietario_default=$4, updated_at=NOW()
     WHERE id=$5
     RETURNING *`,
    [
      d.percentuale_proprieta ?? 100,
      d.data_inizio,
      d.data_fine || null,
      d.proprietario_default ?? false,
      id,
    ]
  );
  return rows[0];
}

export async function removeAssociazione(id) {
  await query(`DELETE FROM appartamento_proprietari WHERE id=$1`, [id]);
}

// Restituisce il proprietario_default valido per un appartamento in una certa data
export async function defaultPerData(appartamentoId, data) {
  const rows = await query(
    `SELECT ap.proprietario_id, p.nome, p.cognome
     FROM appartamento_proprietari ap
     JOIN proprietari p ON p.id = ap.proprietario_id
     WHERE ap.appartamento_id = $1
       AND ap.proprietario_default = TRUE
       AND ap.data_inizio <= $2
       AND (ap.data_fine IS NULL OR ap.data_fine >= $2)
     ORDER BY ap.data_inizio DESC
     LIMIT 1`,
    [appartamentoId, data]
  );
  return rows[0] || null;
}
