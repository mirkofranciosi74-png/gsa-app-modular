import { query } from "../../shared/db/pool.js";
import pool from "../../shared/db/pool.js";

// ─────────────────────────────────────────────────────────────────────────────
// TIPI DOCUMENTO
// ─────────────────────────────────────────────────────────────────────────────

export async function listTipi() {
  return query(
    `SELECT * FROM archivio_tipi_documento ORDER BY nome`
  );
}

export async function createTipo({ nome, descrizione = null, entita = [] }) {
  const rows = await query(
    `INSERT INTO archivio_tipi_documento (nome, descrizione, entita)
     VALUES ($1, $2, $3) RETURNING *`,
    [nome.trim(), descrizione || null, entita]
  );
  return rows[0];
}

export async function updateTipo(id, { nome, descrizione = null, entita = [] }) {
  const rows = await query(
    `UPDATE archivio_tipi_documento
     SET nome=$1, descrizione=$2, entita=$3
     WHERE id=$4 RETURNING *`,
    [nome.trim(), descrizione || null, entita, id]
  );
  return rows[0] || null;
}

export async function deleteTipo(id) {
  await query(`DELETE FROM archivio_tipi_documento WHERE id=$1`, [id]);
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTI
// ─────────────────────────────────────────────────────────────────────────────

export async function listDocumenti({ tipoId, entitaTipo, entitaId } = {}) {
  const conds = ["1=1"];
  const p = [];
  let i = 1;

  if (tipoId)    { conds.push(`d.tipo_documento_id=$${i++}`); p.push(tipoId); }
  if (entitaTipo && entitaId) {
    conds.push(`EXISTS (
      SELECT 1 FROM archivio_associazioni aa
      WHERE aa.documento_id=d.id
        AND aa.entita_tipo=$${i++} AND aa.entita_id=$${i++}
    )`);
    p.push(entitaTipo, entitaId);
  }

  const rows = await query(
    `SELECT d.*,
            t.nome AS tipo_nome, t.entita AS tipo_entita
     FROM   archivio_documenti d
     LEFT JOIN archivio_tipi_documento t ON t.id = d.tipo_documento_id
     WHERE  ${conds.join(" AND ")}
     ORDER  BY d.created_at DESC`,
    p
  );

  // Carica associazioni per ogni documento
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const assocs = await query(
    `SELECT aa.*,
            COALESCE(
              a.nome,
              c.nome || ' ' || COALESCE(c.cognome,''),
              pr.nome || ' ' || COALESCE(pr.cognome,''),
              d.nome_file
            ) AS entita_nome
     FROM archivio_associazioni aa
     LEFT JOIN appartamenti a  ON aa.entita_tipo='appartamento' AND a.id=aa.entita_id
     LEFT JOIN componenti   c  ON aa.entita_tipo='inquilino'    AND c.id=aa.entita_id
     LEFT JOIN proprietari  pr ON aa.entita_tipo='proprietario' AND pr.id=aa.entita_id
     LEFT JOIN documenti    d  ON aa.entita_tipo='spesa'        AND d.id::text=aa.entita_id
     WHERE aa.documento_id = ANY($1)`,
    [ids]
  );

  const assocMap = {};
  for (const a of assocs) {
    if (!assocMap[a.documento_id]) assocMap[a.documento_id] = [];
    assocMap[a.documento_id].push(a);
  }
  return rows.map(r => ({ ...r, associazioni: assocMap[r.id] || [] }));
}

export async function getDocumento(id) {
  const rows = await query(
    `SELECT d.*,
            t.nome AS tipo_nome, t.entita AS tipo_entita
     FROM   archivio_documenti d
     LEFT JOIN archivio_tipi_documento t ON t.id = d.tipo_documento_id
     WHERE  d.id=$1`,
    [id]
  );
  if (!rows[0]) return null;
  const assocs = await query(
    `SELECT aa.*,
            COALESCE(
              a.nome,
              c.nome || ' ' || COALESCE(c.cognome,''),
              pr.nome || ' ' || COALESCE(pr.cognome,''),
              d.nome_file
            ) AS entita_nome
     FROM archivio_associazioni aa
     LEFT JOIN appartamenti a  ON aa.entita_tipo='appartamento' AND a.id=aa.entita_id
     LEFT JOIN componenti   c  ON aa.entita_tipo='inquilino'    AND c.id=aa.entita_id
     LEFT JOIN proprietari  pr ON aa.entita_tipo='proprietario' AND pr.id=aa.entita_id
     LEFT JOIN documenti    d  ON aa.entita_tipo='spesa'        AND d.id::text=aa.entita_id
     WHERE aa.documento_id=$1`,
    [id]
  );
  return { ...rows[0], associazioni: assocs };
}

export async function createDocumento({ tipo_documento_id, nome_file, file_hash, mime_type, estensione, note }) {
  const rows = await query(
    `INSERT INTO archivio_documenti
       (tipo_documento_id, nome_file, file_hash, mime_type, estensione, note)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [tipo_documento_id || null, nome_file, file_hash || null,
     mime_type || null, estensione || null, note || null]
  );
  return rows[0];
}

export async function updateDocumento(id, { tipo_documento_id, note, nome_file }) {
  const rows = await query(
    `UPDATE archivio_documenti
     SET tipo_documento_id = $1,
         note              = $2,
         nome_file         = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE nome_file END
     WHERE id=$4 RETURNING *`,
    [tipo_documento_id || null, note || null, nome_file || null, id]
  );
  return rows[0] || null;
}

export async function deleteDocumento(id) {
  // Recupera estensione prima di eliminare
  const rows = await query(`SELECT estensione FROM archivio_documenti WHERE id=$1`, [id]);
  const ext = rows[0]?.estensione || "";
  await query(`DELETE FROM archivio_documenti WHERE id=$1`, [id]);
  return ext;
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSOCIAZIONI
// ─────────────────────────────────────────────────────────────────────────────

export async function setAssociazioni(docId, assocs) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM archivio_associazioni WHERE documento_id=$1`, [docId]);
    for (const a of assocs) {
      await client.query(
        `INSERT INTO archivio_associazioni (documento_id, entita_tipo, entita_id)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [docId, a.entita_tipo, a.entita_id]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
