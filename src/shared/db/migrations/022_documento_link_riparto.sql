-- Migrazione 022: collega spese_proprietari.documento_id a documenti (non archivio_documenti)

BEGIN;

-- 1. Rimuove FK che puntava alla tabella sbagliata (archivio_documenti)
ALTER TABLE spese_proprietari
  DROP CONSTRAINT IF EXISTS spese_proprietari_documento_id_fkey;

-- 2. Azzera eventuali riferimenti stale (puntavano ad archivio_documenti, ora non validi)
UPDATE spese_proprietari SET documento_id = NULL WHERE documento_id IS NOT NULL;

-- 3. Nuovo FK verso documenti
ALTER TABLE spese_proprietari
  ADD CONSTRAINT spese_proprietari_documento_id_fkey
  FOREIGN KEY (documento_id) REFERENCES documenti(id) ON DELETE SET NULL;

-- 4. Ricrea la vista con JOIN a documenti per esporre i campi del documento collegato
DROP VIEW IF EXISTS v_spese_proprietari_dettaglio;
CREATE VIEW v_spese_proprietari_dettaglio AS
SELECT
  s.id,
  s.proprietario_id,
  s.appartamento_id,
  s.tipo_spesa_id,
  COALESCE(ts.descrizione, 'Altro')                AS tipo_spesa,
  COALESCE(ts.categoria,   'Altro')                AS tipo_spesa_categoria,
  s.importo,
  s.periodicita,
  s.validita_da,
  s.validita_a,
  s.data_pagamento,
  s.mese_competenza,
  s.fornitore,
  s.numero_fattura,
  s.descrizione,
  s.stato,
  s.documento_id,
  d2.nome_file                                     AS documento_nome_file,
  d2.periodo_da                                    AS documento_periodo_da,
  d2.periodo_a                                     AS documento_periodo_a,
  d2.importo                                       AS documento_importo,
  s.created_at,
  s.updated_at,
  (p.nome || ' ' || COALESCE(p.cognome, ''))       AS proprietario_nome,
  a.nome                                            AS appartamento_nome,
  COALESCE(
    (SELECT json_agg(json_build_object(
       'proprietario_id',   q.proprietario_id,
       'proprietario_nome', (pr.nome || ' ' || COALESCE(pr.cognome, '')),
       'percentuale',       q.percentuale
     ) ORDER BY q.percentuale DESC)
     FROM spese_proprietari_quote q
     JOIN proprietari pr ON pr.id = q.proprietario_id
     WHERE q.spesa_id = s.id),
    '[]'::json
  ) AS quote,
  CASE
    WHEN s.periodicita != 'una_tantum' THEN (
      SELECT CASE
        WHEN ap.data_fine IS NOT NULL AND s.validita_da > ap.data_fine THEN TRUE
        WHEN ap.data_inizio IS NOT NULL AND s.validita_a IS NOT NULL
             AND s.validita_a < ap.data_inizio THEN TRUE
        ELSE FALSE
      END
      FROM appartamento_proprietari ap
      WHERE ap.proprietario_id = s.proprietario_id
        AND ap.appartamento_id = s.appartamento_id
      ORDER BY ap.data_inizio DESC NULLS LAST
      LIMIT 1
    )
    ELSE FALSE
  END AS fuori_validita,
  EXISTS (
    SELECT 1 FROM spese_proprietari s2
    WHERE  s2.id              != s.id
      AND  s2.proprietario_id  = s.proprietario_id
      AND  s2.appartamento_id  = s.appartamento_id
      AND  s2.importo          = s.importo
      AND  (
        (s2.data_pagamento  IS NOT NULL AND s.data_pagamento  IS NOT NULL
         AND s2.data_pagamento  = s.data_pagamento)
        OR
        (s2.mese_competenza IS NOT NULL AND s.mese_competenza IS NOT NULL
         AND s2.mese_competenza = s.mese_competenza)
      )
  ) AS duplicato_rilevato
FROM spese_proprietari s
JOIN proprietari  p  ON p.id = s.proprietario_id
JOIN appartamenti a  ON a.id = s.appartamento_id
LEFT JOIN tipi_spesa ts ON ts.id = s.tipo_spesa_id
LEFT JOIN documenti  d2 ON d2.id = s.documento_id;

COMMIT;

SELECT '022_documento_link_riparto completata — ' || NOW()::TEXT AS esito;
