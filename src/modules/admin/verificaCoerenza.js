import { query } from "../../shared/db/pool.js";

export async function verificaCoerenza() {
  const oggi = new Date().toISOString().slice(0, 10);

  // 1. Appartamenti senza nessun proprietario associato
  const appartamentiSenzaProprietario = await query(`
    SELECT a.id, a.nome
    FROM appartamenti a
    WHERE a.attivo = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM appartamento_proprietari ap WHERE ap.appartamento_id = a.id
      )
    ORDER BY a.nome
  `);

  // 2. Percentuale di proprietà ≠ 100% sul periodo corrente
  const percentualiScorrette = await query(`
    SELECT a.nome AS appartamento_nome,
           ROUND(SUM(ap.percentuale_proprieta)::numeric, 2) AS totale_pct,
           json_agg(
             json_build_object(
               'proprietario', p.nome || COALESCE(' ' || p.cognome, ''),
               'pct', ap.percentuale_proprieta,
               'dal', ap.data_inizio,
               'al',  ap.data_fine
             ) ORDER BY ap.data_inizio
           ) AS dettaglio
    FROM appartamento_proprietari ap
    JOIN appartamenti a  ON a.id  = ap.appartamento_id
    JOIN proprietari  p  ON p.id  = ap.proprietario_id
    WHERE ap.data_inizio <= $1
      AND (ap.data_fine IS NULL OR ap.data_fine >= $1)
    GROUP BY a.id, a.nome
    HAVING ABS(SUM(ap.percentuale_proprieta) - 100) > 0.01
    ORDER BY a.nome
  `, [oggi]);

  // 3. Periodi di proprietà sovrapposti per stesso proprietario+appartamento
  const periodiSovrapposti = await query(`
    SELECT a.nome  AS appartamento_nome,
           p.nome || COALESCE(' ' || p.cognome, '') AS proprietario_nome,
           ap1.data_inizio AS da1, ap1.data_fine AS a1,
           ap2.data_inizio AS da2, ap2.data_fine AS a2
    FROM appartamento_proprietari ap1
    JOIN appartamento_proprietari ap2
         ON  ap2.proprietario_id   = ap1.proprietario_id
         AND ap2.appartamento_id   = ap1.appartamento_id
         AND ap2.id                > ap1.id
    JOIN proprietari  p ON p.id = ap1.proprietario_id
    JOIN appartamenti a ON a.id = ap1.appartamento_id
    WHERE ap1.data_inizio < COALESCE(ap2.data_fine, 'infinity'::date)
      AND ap2.data_inizio < COALESCE(ap1.data_fine, 'infinity'::date)
    ORDER BY a.nome, p.cognome, p.nome
  `);

  // 4. Entrate (movimenti) che referenziano un proprietario inattivo
  const movimentiProprietarioInattivo = await query(`
    SELECT m.id,
           COALESCE(m.data_versamento, m.validita_da) AS data_riferimento,
           m.importo, m.mese_riferimento,
           p.nome || COALESCE(' ' || p.cognome, '') AS proprietario_nome,
           a.nome AS appartamento_nome
    FROM movimenti m
    JOIN proprietari  p ON p.id  = m.incassato_da_proprietario_id AND p.attivo = FALSE
    JOIN appartamenti a ON a.id  = m.appartamento_id
    WHERE m.incassato_da_proprietario_id IS NOT NULL
    ORDER BY a.nome, data_riferimento
  `);

  // 5. Spese (documenti) che referenziano un proprietario inattivo
  const documentiProprietarioInattivo = await query(`
    SELECT d.id, d.data_caricamento AS data_riferimento,
           d.importo, COALESCE(d.fornitore, d.nome_file) AS descrizione,
           p.nome || COALESCE(' ' || p.cognome, '') AS proprietario_nome,
           a.nome AS appartamento_nome
    FROM documenti d
    JOIN proprietari  p ON p.id  = d.pagato_da_proprietario_id AND p.attivo = FALSE
    JOIN appartamenti a ON a.id  = d.appartamento_id
    WHERE d.pagato_da_proprietario_id IS NOT NULL
    ORDER BY a.nome, d.data_caricamento
  `);

  // 6. Entrate fuori dal periodo di validità del proprietario
  const movimentiFuoriValidita = await query(`
    SELECT m.id,
           COALESCE(m.data_versamento, m.validita_da) AS data_riferimento,
           m.importo, m.mese_riferimento,
           p.nome || COALESCE(' ' || p.cognome, '') AS proprietario_nome,
           a.nome AS appartamento_nome
    FROM movimenti m
    JOIN proprietari  p ON p.id = m.incassato_da_proprietario_id AND p.attivo = TRUE
    JOIN appartamenti a ON a.id = m.appartamento_id
    WHERE m.incassato_da_proprietario_id IS NOT NULL
      AND COALESCE(m.data_versamento, m.validita_da) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM appartamento_proprietari ap
        WHERE ap.proprietario_id = m.incassato_da_proprietario_id
          AND ap.appartamento_id = m.appartamento_id
          AND COALESCE(m.data_versamento, m.validita_da) >= ap.data_inizio
          AND (ap.data_fine IS NULL OR COALESCE(m.data_versamento, m.validita_da) <= ap.data_fine)
      )
    ORDER BY a.nome, data_riferimento
  `);

  // 7. Spese fuori dal periodo di validità del proprietario
  const documentiFuoriValidita = await query(`
    SELECT d.id, d.data_caricamento AS data_riferimento,
           d.importo, COALESCE(d.fornitore, d.nome_file) AS descrizione,
           p.nome || COALESCE(' ' || p.cognome, '') AS proprietario_nome,
           a.nome AS appartamento_nome
    FROM documenti d
    JOIN proprietari  p ON p.id = d.pagato_da_proprietario_id AND p.attivo = TRUE
    JOIN appartamenti a ON a.id = d.appartamento_id
    WHERE d.pagato_da_proprietario_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM appartamento_proprietari ap
        WHERE ap.proprietario_id = d.pagato_da_proprietario_id
          AND ap.appartamento_id = d.appartamento_id
          AND d.data_caricamento >= ap.data_inizio
          AND (ap.data_fine IS NULL OR d.data_caricamento <= ap.data_fine)
      )
    ORDER BY a.nome, d.data_caricamento
  `);

  // 8. Regole di riparto con proprietari non più associati all'appartamento o inattivi
  const regoleRipartoAnomale = await query(`
    SELECT r.id AS regola_id,
           a.nome AS appartamento_nome,
           p.nome || COALESCE(' ' || p.cognome, '') AS proprietario_nome,
           p.attivo AS proprietario_attivo,
           EXISTS (
             SELECT 1 FROM appartamento_proprietari ap
             WHERE ap.proprietario_id = rip.proprietario_id
               AND ap.appartamento_id = r.appartamento_id
           ) AS ha_associazione,
           'incluso' AS tipo_riferimento
    FROM regole_riparto_inclusi_prop rip
    JOIN regole_riparto r ON r.id  = rip.regola_id
    JOIN proprietari    p ON p.id  = rip.proprietario_id
    JOIN appartamenti   a ON a.id  = r.appartamento_id
    WHERE p.attivo = FALSE
       OR NOT EXISTS (
         SELECT 1 FROM appartamento_proprietari ap
         WHERE ap.proprietario_id = rip.proprietario_id
           AND ap.appartamento_id = r.appartamento_id
       )
    UNION ALL
    SELECT r.id,
           a.nome,
           p.nome || COALESCE(' ' || p.cognome, ''),
           p.attivo,
           EXISTS (
             SELECT 1 FROM appartamento_proprietari ap
             WHERE ap.proprietario_id = rep.proprietario_id
               AND ap.appartamento_id = r.appartamento_id
           ),
           'escluso'
    FROM regole_riparto_esclusi_prop rep
    JOIN regole_riparto r ON r.id  = rep.regola_id
    JOIN proprietari    p ON p.id  = rep.proprietario_id
    JOIN appartamenti   a ON a.id  = r.appartamento_id
    WHERE p.attivo = FALSE
       OR NOT EXISTS (
         SELECT 1 FROM appartamento_proprietari ap
         WHERE ap.proprietario_id = rep.proprietario_id
           AND ap.appartamento_id = r.appartamento_id
       )
    ORDER BY appartamento_nome, proprietario_nome
  `);

  const totale =
    appartamentiSenzaProprietario.length +
    percentualiScorrette.length +
    periodiSovrapposti.length +
    movimentiProprietarioInattivo.length +
    documentiProprietarioInattivo.length +
    movimentiFuoriValidita.length +
    documentiFuoriValidita.length +
    regoleRipartoAnomale.length;

  return {
    generato_il: new Date().toISOString(),
    totale_anomalie: totale,
    appartamenti_senza_proprietario:   appartamentiSenzaProprietario,
    percentuali_scorrette:             percentualiScorrette,
    periodi_sovrapposti:               periodiSovrapposti,
    movimenti_proprietario_inattivo:   movimentiProprietarioInattivo,
    documenti_proprietario_inattivo:   documentiProprietarioInattivo,
    movimenti_fuori_validita:          movimentiFuoriValidita,
    documenti_fuori_validita:          documentiFuoriValidita,
    regole_riparto_anomale:            regoleRipartoAnomale,
  };
}
