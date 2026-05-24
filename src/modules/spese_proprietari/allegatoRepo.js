import { query } from "../../shared/db/pool.js";

export async function listBySpesa(spesaId) {
  return query(
    `SELECT * FROM spese_proprietari_allegati WHERE spesa_id=$1 ORDER BY created_at`,
    [spesaId]
  );
}

export async function create(spesaId, { nome_file, mime_type, estensione, file_hash }) {
  const rows = await query(
    `INSERT INTO spese_proprietari_allegati (spesa_id, nome_file, mime_type, estensione, file_hash)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [spesaId, nome_file, mime_type, estensione, file_hash || null]
  );
  return rows[0];
}

export async function findById(id) {
  const rows = await query(`SELECT * FROM spese_proprietari_allegati WHERE id=$1`, [id]);
  return rows[0] || null;
}

export async function remove(id) {
  const rows = await query(`DELETE FROM spese_proprietari_allegati WHERE id=$1 RETURNING *`, [id]);
  return rows[0] || null;
}

// Cerca duplicati per hash — restituisce primo match in allegati e/o in documenti
export async function findDuplicates(hash, excludeSpesaId) {
  const allegati = await query(
    `SELECT sa.id, sa.nome_file, sa.spesa_id,
            sp.descrizione AS spesa_descrizione,
            sp.importo, sp.data_pagamento, sp.validita_da,
            sp.fornitore, sp.mese_competenza,
            ts.descrizione AS tipo_spesa,
            a.nome AS appartamento_nome,
            pr.nome AS proprietario_nome, pr.cognome AS proprietario_cognome
     FROM spese_proprietari_allegati sa
     JOIN spese_proprietari sp ON sp.id = sa.spesa_id
     JOIN appartamenti      a  ON a.id  = sp.appartamento_id
     LEFT JOIN tipi_spesa   ts ON ts.id = sp.tipo_spesa_id
     LEFT JOIN proprietari  pr ON pr.id = sp.proprietario_id
     WHERE sa.file_hash = $1
       AND ($2::UUID IS NULL OR sa.spesa_id != $2)
     LIMIT 3`,
    [hash, excludeSpesaId || null]
  );

  const documenti = await query(
    `SELECT d.id, d.nome_file, d.importo, d.data_caricamento::text AS data,
            d.fornitore, d.note_ai AS note,
            ts.descrizione AS tipo_spesa,
            a.nome AS appartamento_nome
     FROM documenti d
     JOIN appartamenti a ON a.id = d.appartamento_id
     LEFT JOIN tipi_spesa ts ON ts.id = d.tipo_spesa_id
     WHERE d.file_hash = $1
     LIMIT 3`,
    [hash]
  );

  return { allegati, documenti };
}
