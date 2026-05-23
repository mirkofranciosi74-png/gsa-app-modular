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
  await query(`UPDATE proprietari SET attivo=FALSE, updated_at=NOW() WHERE id=$1`, [id]);
}

// Restituisce il conteggio delle dipendenze e i proprietari alternativi (stessi appartamenti)
export async function getDipendenze(id) {
  const [{ cnt_m }] = await query(
    `SELECT COUNT(*)::int AS cnt_m FROM movimenti WHERE incassato_da_proprietario_id=$1`, [id]
  );
  const [{ cnt_d }] = await query(
    `SELECT COUNT(*)::int AS cnt_d FROM documenti WHERE pagato_da_proprietario_id=$1`, [id]
  );
  const [{ cnt_r }] = await query(
    `SELECT (
       (SELECT COUNT(*) FROM regole_riparto_inclusi_prop WHERE proprietario_id=$1) +
       (SELECT COUNT(*) FROM regole_riparto_esclusi_prop WHERE proprietario_id=$1)
     )::int AS cnt_r`, [id]
  );
  const alternativi = await query(
    `SELECT DISTINCT p.id, p.nome, p.cognome
     FROM appartamento_proprietari ap
     JOIN appartamento_proprietari ap2
          ON ap2.appartamento_id = ap.appartamento_id
         AND ap2.proprietario_id != $1
     JOIN proprietari p ON p.id = ap2.proprietario_id AND p.attivo = TRUE
     WHERE ap.proprietario_id = $1
     ORDER BY p.cognome, p.nome`,
    [id]
  );
  return { movimenti: cnt_m, documenti: cnt_d, regole: cnt_r, alternativi };
}

// Riassegna tutte le dipendenze a nuovoId (null = metti NULL) poi soft-elimina
export async function reassignAndRemove(id, nuovoId) {
  if (nuovoId) {
    await query(`UPDATE movimenti SET incassato_da_proprietario_id=$1 WHERE incassato_da_proprietario_id=$2`, [nuovoId, id]);
    await query(`UPDATE documenti  SET pagato_da_proprietario_id=$1  WHERE pagato_da_proprietario_id=$2`,  [nuovoId, id]);
  } else {
    await query(`UPDATE movimenti SET incassato_da_proprietario_id=NULL WHERE incassato_da_proprietario_id=$1`, [id]);
    await query(`UPDATE documenti  SET pagato_da_proprietario_id=NULL  WHERE pagato_da_proprietario_id=$1`,  [id]);
  }
  // Rimuovi dalle regole di riparto (la soft-delete non triggerisce ON DELETE CASCADE)
  await query(`DELETE FROM regole_riparto_inclusi_prop WHERE proprietario_id=$1`, [id]);
  await query(`DELETE FROM regole_riparto_esclusi_prop WHERE proprietario_id=$1`, [id]);
  // Soft-delete
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

export async function getAssociazione(id) {
  const rows = await query(
    `SELECT ap.*, p.nome AS proprietario_nome, p.cognome AS proprietario_cognome
     FROM appartamento_proprietari ap
     JOIN proprietari p ON p.id = ap.proprietario_id
     WHERE ap.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function removeAssociazione(id) {
  await query(`DELETE FROM appartamento_proprietari WHERE id=$1`, [id]);
}

// Dipendenze per una specifica coppia proprietario+appartamento (con dettaglio record)
export async function getDipendenzeAssociazione(proprietarioId, appartamentoId) {
  const movimenti = await query(
    `SELECT m.id,
            COALESCE(m.data_versamento, m.validita_da) AS data_riferimento,
            m.importo, m.mese_riferimento, m.tipo_versamento
     FROM movimenti m
     WHERE m.incassato_da_proprietario_id=$1 AND m.appartamento_id=$2
     ORDER BY COALESCE(m.data_versamento, m.validita_da) DESC NULLS LAST`,
    [proprietarioId, appartamentoId]
  );
  const documenti = await query(
    `SELECT d.id, d.data_caricamento AS data_riferimento,
            d.importo, COALESCE(d.fornitore, d.nome_file) AS descrizione,
            d.periodo_da, d.periodo_a
     FROM documenti d
     WHERE d.pagato_da_proprietario_id=$1 AND d.appartamento_id=$2
     ORDER BY d.data_caricamento DESC NULLS LAST`,
    [proprietarioId, appartamentoId]
  );
  const alternativi = await query(
    `SELECT p.id, p.nome, p.cognome
     FROM appartamento_proprietari ap
     JOIN proprietari p ON p.id = ap.proprietario_id AND p.attivo = TRUE
     WHERE ap.appartamento_id = $1 AND ap.proprietario_id != $2
     ORDER BY p.cognome, p.nome`,
    [appartamentoId, proprietarioId]
  );
  return { movimenti, documenti, alternativi };
}

// Record fuori da QUALSIASI periodo di validità per questo proprietario+appartamento
export async function getAnomalieAssociazione(proprietarioId, appartamentoId) {
  const movimenti = await query(`
    SELECT m.id, COALESCE(m.data_versamento, m.validita_da) AS data_riferimento,
           m.importo, m.mese_riferimento
    FROM movimenti m
    WHERE m.incassato_da_proprietario_id = $1
      AND m.appartamento_id = $2
      AND COALESCE(m.data_versamento, m.validita_da) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM appartamento_proprietari ap
        WHERE ap.proprietario_id = $1
          AND ap.appartamento_id = $2
          AND COALESCE(m.data_versamento, m.validita_da) >= ap.data_inizio
          AND (ap.data_fine IS NULL OR COALESCE(m.data_versamento, m.validita_da) <= ap.data_fine)
      )
    ORDER BY data_riferimento
  `, [proprietarioId, appartamentoId]);

  const documenti = await query(`
    SELECT d.id, d.data_caricamento AS data_riferimento,
           d.importo, COALESCE(d.fornitore, d.nome_file) AS descrizione
    FROM documenti d
    WHERE d.pagato_da_proprietario_id = $1
      AND d.appartamento_id = $2
      AND NOT EXISTS (
        SELECT 1 FROM appartamento_proprietari ap
        WHERE ap.proprietario_id = $1
          AND ap.appartamento_id = $2
          AND d.data_caricamento >= ap.data_inizio
          AND (ap.data_fine IS NULL OR d.data_caricamento <= ap.data_fine)
      )
    ORDER BY d.data_caricamento
  `, [proprietarioId, appartamentoId]);

  const alternativi = await query(`
    SELECT p.id, p.nome, p.cognome
    FROM appartamento_proprietari ap
    JOIN proprietari p ON p.id = ap.proprietario_id AND p.attivo = TRUE
    WHERE ap.appartamento_id = $1 AND ap.proprietario_id != $2
    ORDER BY p.cognome, p.nome
  `, [appartamentoId, proprietarioId]);

  return { movimenti, documenti, alternativi };
}

// Riassegna solo i record ANOMALI (fuori periodo) per questo proprietario+appartamento
export async function riassegnaAnomalieAssociazione(proprietarioId, appartamentoId, nuovoId) {
  const subM = `
    SELECT id FROM movimenti
    WHERE incassato_da_proprietario_id = $1
      AND appartamento_id = $2
      AND COALESCE(data_versamento, validita_da) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM appartamento_proprietari ap
        WHERE ap.proprietario_id = $1
          AND ap.appartamento_id = $2
          AND COALESCE(data_versamento, validita_da) >= ap.data_inizio
          AND (ap.data_fine IS NULL OR COALESCE(data_versamento, validita_da) <= ap.data_fine)
      )
  `;
  const subD = `
    SELECT id FROM documenti
    WHERE pagato_da_proprietario_id = $1
      AND appartamento_id = $2
      AND NOT EXISTS (
        SELECT 1 FROM appartamento_proprietari ap
        WHERE ap.proprietario_id = $1
          AND ap.appartamento_id = $2
          AND data_caricamento >= ap.data_inizio
          AND (ap.data_fine IS NULL OR data_caricamento <= ap.data_fine)
      )
  `;
  await query(
    `UPDATE movimenti SET incassato_da_proprietario_id = $3
     WHERE id IN (${subM})`,
    [proprietarioId, appartamentoId, nuovoId || null]
  );
  await query(
    `UPDATE documenti SET pagato_da_proprietario_id = $3
     WHERE id IN (${subD})`,
    [proprietarioId, appartamentoId, nuovoId || null]
  );
}

// Riassegna movimenti/documenti per prop+appartamento, poi elimina l'associazione
export async function reassignAndRemoveAssociazione(assocId, proprietarioId, appartamentoId, nuovoId) {
  if (nuovoId) {
    await query(
      `UPDATE movimenti SET incassato_da_proprietario_id=$1
       WHERE incassato_da_proprietario_id=$2 AND appartamento_id=$3`,
      [nuovoId, proprietarioId, appartamentoId]
    );
    await query(
      `UPDATE documenti SET pagato_da_proprietario_id=$1
       WHERE pagato_da_proprietario_id=$2 AND appartamento_id=$3`,
      [nuovoId, proprietarioId, appartamentoId]
    );
  } else {
    await query(
      `UPDATE movimenti SET incassato_da_proprietario_id=NULL
       WHERE incassato_da_proprietario_id=$1 AND appartamento_id=$2`,
      [proprietarioId, appartamentoId]
    );
    await query(
      `UPDATE documenti SET pagato_da_proprietario_id=NULL
       WHERE pagato_da_proprietario_id=$1 AND appartamento_id=$2`,
      [proprietarioId, appartamentoId]
    );
  }
  await query(`DELETE FROM appartamento_proprietari WHERE id=$1`, [assocId]);
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

// Rimuove il flag default dagli altri proprietari dello stesso appartamento
export async function unsetOtherDefaults(appartamentoId, excludeAssocId) {
  await query(
    `UPDATE appartamento_proprietari
     SET proprietario_default = FALSE
     WHERE appartamento_id = $1 AND id != $2 AND proprietario_default = TRUE`,
    [appartamentoId, excludeAssocId]
  );
}

// Aggiorna incassato_da_proprietario_id nei movimenti a partire da una data
export async function bulkUpdateIncassatoreMovimenti(appartamentoId, proprietarioId, dataFrom) {
  const rows = await query(
    `UPDATE movimenti
     SET incassato_da_proprietario_id = $1
     WHERE appartamento_id = $2 AND data_versamento >= $3
     RETURNING id`,
    [proprietarioId, appartamentoId, dataFrom]
  );
  return rows.length;
}

// Aggiorna pagato_da_proprietario_id nei documenti a partire da una data
export async function bulkUpdatePagatoreDocumenti(appartamentoId, proprietarioId, dataFrom) {
  const rows = await query(
    `UPDATE documenti
     SET pagato_da_proprietario_id = $1
     WHERE appartamento_id = $2 AND data_caricamento >= $3
     RETURNING id`,
    [proprietarioId, appartamentoId, dataFrom]
  );
  return rows.length;
}

// Trova registrazioni dove il proprietario compare fuori dal suo periodo di validità
export async function verificaAnomalieProprietari() {
  const movimenti = await query(`
    SELECT m.id,
           COALESCE(m.data_versamento, m.validita_da) AS data_riferimento,
           m.appartamento_id, m.importo, m.mese_riferimento,
           p.nome || COALESCE(' ' || p.cognome, '') AS proprietario_nome,
           a.nome AS appartamento_nome
    FROM movimenti m
    JOIN proprietari p ON p.id = m.incassato_da_proprietario_id
    JOIN appartamenti a ON a.id = m.appartamento_id
    WHERE m.incassato_da_proprietario_id IS NOT NULL
      AND COALESCE(m.data_versamento, m.validita_da) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM appartamento_proprietari ap
        WHERE ap.proprietario_id = m.incassato_da_proprietario_id
          AND ap.appartamento_id = m.appartamento_id
          AND COALESCE(m.data_versamento, m.validita_da) >= ap.data_inizio
          AND (ap.data_fine IS NULL
               OR COALESCE(m.data_versamento, m.validita_da) <= ap.data_fine)
      )
    ORDER BY data_riferimento
  `);

  const documenti = await query(`
    SELECT d.id, d.data_caricamento, d.appartamento_id, d.importo,
           COALESCE(d.fornitore, d.nome_file) AS descrizione,
           p.nome || COALESCE(' ' || p.cognome, '') AS proprietario_nome,
           a.nome AS appartamento_nome
    FROM documenti d
    JOIN proprietari p ON p.id = d.pagato_da_proprietario_id
    JOIN appartamenti a ON a.id = d.appartamento_id
    WHERE d.pagato_da_proprietario_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM appartamento_proprietari ap
        WHERE ap.proprietario_id = d.pagato_da_proprietario_id
          AND ap.appartamento_id = d.appartamento_id
          AND d.data_caricamento >= ap.data_inizio
          AND (ap.data_fine IS NULL OR d.data_caricamento <= ap.data_fine)
      )
    ORDER BY d.data_caricamento
  `);

  return { movimenti, documenti };
}
