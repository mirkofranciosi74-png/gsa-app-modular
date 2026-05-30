import pool from "../../../shared/db/pool.js";
import { query } from "../../../shared/db/pool.js";

// ── Tipi documento ────────────────────────────────────────────────────────────

export async function listTipi() {
  return query(`SELECT * FROM v2.archivio_tipo_documento ORDER BY nome`);
}

export async function createTipo({ nome, descrizione = null }) {
  const rows = await query(
    `INSERT INTO v2.archivio_tipo_documento (nome, descrizione)
     VALUES ($1,$2) RETURNING *`,
    [nome.trim(), descrizione || null]
  );
  return rows[0];
}

export async function updateTipo(id, { nome, descrizione = null }) {
  const rows = await query(
    `UPDATE v2.archivio_tipo_documento SET nome=$1, descrizione=$2 WHERE id=$3 RETURNING *`,
    [nome.trim(), descrizione || null, id]
  );
  return rows[0] || null;
}

export async function deleteTipo(id) {
  await query(`DELETE FROM v2.archivio_tipo_documento WHERE id=$1`, [id]);
}

// ── Documenti ─────────────────────────────────────────────────────────────────

export async function listDocumenti({ tipoId, entitaTipo, entitaId } = {}) {
  const conds = ["1=1"];
  const p = [];
  let i = 1;

  if (tipoId) { conds.push(`d.tipo_documento_id=$${i++}`); p.push(tipoId); }
  if (entitaTipo && entitaId) {
    conds.push(`EXISTS (
      SELECT 1 FROM v2.archivio_associazione aa
      WHERE aa.documento_id=d.id AND aa.entita_tipo=$${i++} AND aa.entita_id=$${i++}::uuid
    )`);
    p.push(entitaTipo, entitaId);
  }

  const rows = await query(
    `SELECT d.*, t.nome AS tipo_nome
     FROM v2.archivio_documento d
     LEFT JOIN v2.archivio_tipo_documento t ON t.id = d.tipo_documento_id
     WHERE ${conds.join(" AND ")}
     ORDER BY d.created_at DESC`,
    p
  );

  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const assocs = await query(
    `SELECT aa.*,
            COALESCE(im.nome, COALESCE(pe.cognome||' '||pe.nome, pe.ragione_sociale)) AS entita_nome
     FROM v2.archivio_associazione aa
     LEFT JOIN v2.immobile im ON aa.entita_tipo='immobile' AND im.id=aa.entita_id
     LEFT JOIN v2.persona  pe ON aa.entita_tipo='persona'  AND pe.id=aa.entita_id
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
    `SELECT d.*, t.nome AS tipo_nome
     FROM v2.archivio_documento d
     LEFT JOIN v2.archivio_tipo_documento t ON t.id = d.tipo_documento_id
     WHERE d.id=$1`,
    [id]
  );
  if (!rows[0]) return null;
  const assocs = await query(
    `SELECT aa.*,
            COALESCE(im.nome, COALESCE(pe.cognome||' '||pe.nome, pe.ragione_sociale)) AS entita_nome
     FROM v2.archivio_associazione aa
     LEFT JOIN v2.immobile im ON aa.entita_tipo='immobile' AND im.id=aa.entita_id
     LEFT JOIN v2.persona  pe ON aa.entita_tipo='persona'  AND pe.id=aa.entita_id
     WHERE aa.documento_id=$1`,
    [id]
  );
  return { ...rows[0], associazioni: assocs };
}

export async function createDocumento({ tipo_documento_id, nome_file, file_hash, mime_type, estensione, note, validita_da, validita_a }) {
  const rows = await query(
    `INSERT INTO v2.archivio_documento
       (tipo_documento_id, nome_file, file_hash, mime_type, estensione, note, validita_da, validita_a)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [tipo_documento_id || null, nome_file, file_hash || null,
     mime_type || null, estensione || null, note || null,
     validita_da || null, validita_a || null]
  );
  return rows[0];
}

export async function updateDocumento(id, { tipo_documento_id, note, nome_file, validita_da, validita_a }) {
  const rows = await query(
    `UPDATE v2.archivio_documento SET
       tipo_documento_id = $1,
       note              = $2,
       nome_file         = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE nome_file END,
       validita_da       = $5,
       validita_a        = $6
     WHERE id=$4 RETURNING *`,
    [tipo_documento_id || null, note || null, nome_file || null, id,
     validita_da || null, validita_a || null]
  );
  return rows[0] || null;
}

export async function deleteDocumento(id) {
  const rows = await query(`SELECT estensione FROM v2.archivio_documento WHERE id=$1`, [id]);
  const ext = rows[0]?.estensione || "";
  await query(`DELETE FROM v2.archivio_documento WHERE id=$1`, [id]);
  return ext;
}

export async function setAssociazioni(docId, assocs) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM v2.archivio_associazione WHERE documento_id=$1`, [docId]);
    for (const a of assocs) {
      await client.query(
        `INSERT INTO v2.archivio_associazione (documento_id, entita_tipo, entita_id)
         VALUES ($1,$2,$3::uuid) ON CONFLICT DO NOTHING`,
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
