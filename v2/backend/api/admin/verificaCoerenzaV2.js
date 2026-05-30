import { query } from "../../shared/db/pool.js";

export async function verificaCoerenzaV2() {
  const oggi = new Date().toISOString().slice(0, 10);

  // 1. Immobili senza proprietario
  const immobiliSenzaProprietario = await query(`
    SELECT i.id, i.nome
    FROM v2.immobile i
    WHERE i.attivo = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM v2.ruolo_persona rp
        WHERE rp.immobile_id = i.id AND rp.ruolo = 'proprietario'
      )
    ORDER BY i.nome
  `);

  // 2. Percentuale proprietà ≠ 100% (periodo corrente)
  const percentualiScorrette = await query(`
    SELECT i.nome AS immobile_nome,
           ROUND(SUM(COALESCE(rp.quota, 0))::numeric, 2) AS totale_pct,
           json_agg(
             json_build_object(
               'persona', COALESCE(p.cognome || ' ' || p.nome, p.ragione_sociale),
               'pct',     rp.quota,
               'dal',     rp.validita_da,
               'al',      rp.validita_a
             ) ORDER BY rp.validita_da
           ) AS dettaglio
    FROM v2.ruolo_persona rp
    JOIN v2.immobile i ON i.id = rp.immobile_id
    JOIN v2.persona  p ON p.id = rp.persona_id
    WHERE rp.ruolo = 'proprietario'
      AND (rp.validita_da IS NULL OR rp.validita_da <= $1)
      AND (rp.validita_a  IS NULL OR rp.validita_a  >= $1)
    GROUP BY i.id, i.nome
    HAVING ABS(SUM(COALESCE(rp.quota, 0)) - 100) > 0.01
    ORDER BY i.nome
  `, [oggi]);

  // 3. Periodi di proprietà sovrapposti
  const periodiSovrapposti = await query(`
    SELECT i.nome AS immobile_nome,
           COALESCE(p.cognome || ' ' || p.nome, p.ragione_sociale) AS persona_nome,
           rp1.validita_da AS da1, rp1.validita_a AS a1,
           rp2.validita_da AS da2, rp2.validita_a AS a2
    FROM v2.ruolo_persona rp1
    JOIN v2.ruolo_persona rp2
         ON  rp2.persona_id  = rp1.persona_id
         AND rp2.immobile_id = rp1.immobile_id
         AND rp2.ruolo       = rp1.ruolo
         AND rp2.id > rp1.id
    JOIN v2.persona  p ON p.id = rp1.persona_id
    JOIN v2.immobile i ON i.id = rp1.immobile_id
    WHERE rp1.ruolo = 'proprietario'
      AND rp1.validita_da < COALESCE(rp2.validita_a, 'infinity'::date)
      AND rp2.validita_da < COALESCE(rp1.validita_a, 'infinity'::date)
    ORDER BY i.nome, p.cognome
  `);

  // 4. Entrate con soggetto pagante inattivo
  const entratePersonaInattiva = await query(`
    SELECT fe.id, fe.nome, fe.importo, fe.periodo_da,
           fe.data_pagamento::text AS data_riferimento,
           COALESCE(p.cognome || ' ' || p.nome, p.ragione_sociale) AS persona_nome,
           i.nome AS immobile_nome
    FROM v2.fatto_economico fe
    JOIN v2.persona  p ON p.id = fe.soggetto_pagante_id AND p.attivo = FALSE
    LEFT JOIN v2.immobile i ON i.id = fe.immobile_id
    WHERE fe.tipo = 'entrata'
    ORDER BY i.nome, fe.data_pagamento
  `);

  // 5. Spese con soggetto pagante inattivo
  const spesePersonaInattiva = await query(`
    SELECT fe.id, fe.nome, fe.importo, fe.periodo_da,
           fe.data_pagamento::text AS data_riferimento,
           COALESCE(p.cognome || ' ' || p.nome, p.ragione_sociale) AS persona_nome,
           i.nome AS immobile_nome
    FROM v2.fatto_economico fe
    JOIN v2.persona  p ON p.id = fe.soggetto_pagante_id AND p.attivo = FALSE
    LEFT JOIN v2.immobile i ON i.id = fe.immobile_id
    WHERE fe.tipo = 'spesa'
    ORDER BY i.nome, fe.data_pagamento
  `);

  // 6. Entrate fuori dal periodo di validità del proprietario
  // Segnala solo chi ha GIÀ un ruolo proprietario sull'immobile ma fuori dal periodo valido.
  // Inquilini/clienti (es. b&b) che pagano entrate non vengono segnalati.
  const entrateFuoriValidita = await query(`
    SELECT fe.id, fe.nome, fe.importo, fe.periodo_da,
           fe.data_pagamento::text AS data_riferimento,
           COALESCE(p.cognome || ' ' || p.nome, p.ragione_sociale) AS persona_nome,
           i.nome AS immobile_nome
    FROM v2.fatto_economico fe
    JOIN v2.persona  p ON p.id = fe.soggetto_pagante_id AND p.attivo = TRUE
    LEFT JOIN v2.immobile i ON i.id = fe.immobile_id
    WHERE fe.tipo = 'entrata'
      AND fe.immobile_id IS NOT NULL
      AND fe.periodo_da IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM v2.ruolo_persona rp0
        WHERE rp0.persona_id  = fe.soggetto_pagante_id
          AND rp0.immobile_id = fe.immobile_id
          AND rp0.ruolo = 'proprietario'
      )
      AND NOT EXISTS (
        SELECT 1 FROM v2.ruolo_persona rp
        WHERE rp.persona_id  = fe.soggetto_pagante_id
          AND rp.immobile_id = fe.immobile_id
          AND rp.ruolo = 'proprietario'
          AND (rp.validita_da IS NULL OR fe.periodo_da >= to_char(rp.validita_da, 'YYYY-MM'))
          AND (rp.validita_a  IS NULL OR fe.periodo_da <= to_char(rp.validita_a,  'YYYY-MM'))
      )
    ORDER BY i.nome, fe.data_pagamento
  `);

  // 7. Spese fuori dal periodo di validità del proprietario
  // Segnala solo chi ha GIÀ un ruolo proprietario sull'immobile ma fuori dal periodo valido.
  const speseFuoriValidita = await query(`
    SELECT fe.id, fe.nome, fe.importo, fe.periodo_da,
           fe.data_pagamento::text AS data_riferimento,
           COALESCE(p.cognome || ' ' || p.nome, p.ragione_sociale) AS persona_nome,
           i.nome AS immobile_nome
    FROM v2.fatto_economico fe
    JOIN v2.persona  p ON p.id = fe.soggetto_pagante_id AND p.attivo = TRUE
    LEFT JOIN v2.immobile i ON i.id = fe.immobile_id
    WHERE fe.tipo = 'spesa'
      AND fe.immobile_id IS NOT NULL
      AND fe.periodo_da IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM v2.ruolo_persona rp0
        WHERE rp0.persona_id  = fe.soggetto_pagante_id
          AND rp0.immobile_id = fe.immobile_id
          AND rp0.ruolo = 'proprietario'
      )
      AND NOT EXISTS (
        SELECT 1 FROM v2.ruolo_persona rp
        WHERE rp.persona_id  = fe.soggetto_pagante_id
          AND rp.immobile_id = fe.immobile_id
          AND rp.ruolo = 'proprietario'
          AND (rp.validita_da IS NULL OR fe.periodo_da >= to_char(rp.validita_da, 'YYYY-MM'))
          AND (rp.validita_a  IS NULL OR fe.periodo_da <= to_char(rp.validita_a,  'YYYY-MM'))
      )
    ORDER BY i.nome, fe.data_pagamento
  `);

  // 8. Regole di riparto con persone non valide
  const regoleRipartoAnomale = await query(`
    SELECT rr.id AS regola_id,
           i.nome AS immobile_nome,
           COALESCE(p.cognome || ' ' || p.nome, p.ragione_sociale) AS persona_nome,
           p.attivo AS persona_attiva,
           rrd.includi,
           EXISTS (
             SELECT 1 FROM v2.ruolo_persona rp
             WHERE rp.persona_id  = rrd.persona_id
               AND rp.immobile_id = rr.immobile_id
               AND rp.ruolo = 'proprietario'
           ) AS ha_ruolo
    FROM v2.regola_riparto_dettaglio rrd
    JOIN v2.regola_riparto rr ON rr.id = rrd.regola_id
    JOIN v2.immobile        i  ON i.id  = rr.immobile_id
    JOIN v2.persona         p  ON p.id  = rrd.persona_id
    WHERE p.attivo = FALSE
       OR NOT EXISTS (
         SELECT 1 FROM v2.ruolo_persona rp
         WHERE rp.persona_id  = rrd.persona_id
           AND rp.immobile_id = rr.immobile_id
           AND rp.ruolo = 'proprietario'
       )
    ORDER BY i.nome, p.cognome
  `);

  // 9. Spese senza soggetto pagante
  const speseSenzaPagante = await query(`
    SELECT fe.id, fe.nome, fe.importo,
           fe.data_pagamento::text AS data_riferimento,
           fe.periodo_da,
           i.nome AS immobile_nome,
           c.nome AS condominio_nome
    FROM v2.fatto_economico fe
    LEFT JOIN v2.immobile   i ON i.id = fe.immobile_id
    LEFT JOIN v2.condominio c ON c.id = COALESCE(fe.condominio_id, i.condominio_id)
    WHERE fe.tipo = 'spesa'
      AND fe.soggetto_pagante_id IS NULL
    ORDER BY i.nome NULLS LAST, fe.data_pagamento
  `);

  // 10. Entrate senza soggetto incassante
  const entrateSenzaIncassante = await query(`
    SELECT fe.id, fe.nome, fe.importo,
           fe.data_pagamento::text AS data_riferimento,
           fe.periodo_da,
           i.nome AS immobile_nome,
           c.nome AS condominio_nome
    FROM v2.fatto_economico fe
    LEFT JOIN v2.immobile   i ON i.id = fe.immobile_id
    LEFT JOIN v2.condominio c ON c.id = COALESCE(fe.condominio_id, i.condominio_id)
    WHERE fe.tipo = 'entrata'
      AND fe.soggetto_incassante_id IS NULL
    ORDER BY i.nome NULLS LAST, fe.data_pagamento
  `);

  // 9a. Fatti con file duplicato (hash identico) — esclude quelli già marcati 'duplicato'
  const hashDuplicatiFatti = await query(`
    WITH dup AS (
      SELECT file_hash
      FROM v2.fatto_economico
      WHERE file_hash IS NOT NULL AND file_path IS NOT NULL AND stato != 'duplicato'
      GROUP BY file_hash
      HAVING COUNT(*) > 1
    )
    SELECT fe.id, fe.nome, fe.tipo, fe.importo, fe.stato,
           fe.nome_file, fe.file_hash,
           fe.data_pagamento::text AS data,
           fe.periodo_da,
           i.nome AS immobile_nome,
           COALESCE(p.cognome || ' ' || p.nome, p.ragione_sociale) AS persona_nome
    FROM v2.fatto_economico fe
    JOIN dup ON dup.file_hash = fe.file_hash
    LEFT JOIN v2.immobile i ON i.id = fe.immobile_id
    LEFT JOIN v2.persona  p ON p.id = fe.soggetto_pagante_id
    ORDER BY fe.file_hash, fe.data_pagamento
  `);

  // 9b. Fatti senza hash ma con allegato
  const hashMancantiFatti = await query(`
    SELECT fe.id, fe.nome, fe.tipo, fe.importo,
           fe.nome_file,
           fe.data_pagamento::text AS data,
           i.nome AS immobile_nome
    FROM v2.fatto_economico fe
    LEFT JOIN v2.immobile i ON i.id = fe.immobile_id
    WHERE fe.file_path IS NOT NULL AND fe.file_hash IS NULL
    ORDER BY fe.data_pagamento
  `);

  const dupGruppi = new Set(hashDuplicatiFatti.map(r => r.file_hash)).size;

  const totale_anomalie =
    immobiliSenzaProprietario.length +
    percentualiScorrette.length +
    periodiSovrapposti.length +
    entratePersonaInattiva.length +
    spesePersonaInattiva.length +
    entrateFuoriValidita.length +
    speseFuoriValidita.length +
    regoleRipartoAnomale.length +
    speseSenzaPagante.length +
    entrateSenzaIncassante.length +
    dupGruppi +
    hashMancantiFatti.length;

  return {
    generato_il:                 new Date().toISOString(),
    totale_anomalie,
    immobili_senza_proprietario: immobiliSenzaProprietario,
    percentuali_scorrette:       percentualiScorrette,
    periodi_sovrapposti:         periodiSovrapposti,
    entrate_persona_inattiva:    entratePersonaInattiva,
    spese_persona_inattiva:      spesePersonaInattiva,
    entrate_fuori_validita:      entrateFuoriValidita,
    spese_fuori_validita:        speseFuoriValidita,
    regole_riparto_anomale:      regoleRipartoAnomale,
    spese_senza_pagante:          speseSenzaPagante,
    entrate_senza_incassante:     entrateSenzaIncassante,
    hash_duplicati_fatti:        hashDuplicatiFatti,
    hash_mancanti_fatti:         hashMancantiFatti,
  };
}
