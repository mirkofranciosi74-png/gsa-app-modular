-- Migrazione 020: unifica tipi spesa proprietari con tipi_spesa degli inquilini

BEGIN;

-- ── 1. Aggiungi tipi specifici per proprietari in tipi_spesa ──────────────────
INSERT INTO tipi_spesa (descrizione, categoria, riparto) VALUES
  ('Arredi',                   'Proprietari', 'Percentuale'),
  ('Ristrutturazione',         'Proprietari', 'Percentuale'),
  ('Mutuo',                    'Proprietari', 'Percentuale'),
  ('Manutenzione Ordinaria',   'Proprietari', 'Percentuale'),
  ('Manutenzione Straordinaria','Proprietari', 'Percentuale'),
  ('Assicurazione',            'Proprietari', 'Percentuale'),
  ('Tasse e Imposte',          'Proprietari', 'Percentuale')
ON CONFLICT (descrizione) DO NOTHING;

-- ── 2. Dropa la vista esistente che dipende da tipo_spesa ────────────────────
DROP VIEW IF EXISTS v_spese_proprietari_dettaglio;

-- ── 3. Aggiunge colonna FK tipo_spesa_id a spese_proprietari ─────────────────
ALTER TABLE spese_proprietari
  ADD COLUMN tipo_spesa_id UUID REFERENCES tipi_spesa(id) ON DELETE SET NULL;

-- ── 4. Migra i valori testuali esistenti al corrispondente UUID ───────────────
UPDATE spese_proprietari sp
SET tipo_spesa_id = ts.id
FROM tipi_spesa ts
WHERE ts.descrizione = CASE sp.tipo_spesa
  WHEN 'arredi'           THEN 'Arredi'
  WHEN 'ristrutturazione' THEN 'Ristrutturazione'
  WHEN 'mutuo'            THEN 'Mutuo'
  WHEN 'manutenzione_ord' THEN 'Manutenzione Ordinaria'
  WHEN 'manutenzione_str' THEN 'Manutenzione Straordinaria'
  WHEN 'assicurazione'    THEN 'Assicurazione'
  WHEN 'tasse_imposte'    THEN 'Tasse e Imposte'
  ELSE 'Altro'
END;

-- ── 5. Rimuove la vecchia colonna testuale ────────────────────────────────────
ALTER TABLE spese_proprietari DROP COLUMN tipo_spesa;

-- ── 6. Elimina la tabella tipi_spesa_prop ora non più necessaria ──────────────
DROP TABLE IF EXISTS tipi_spesa_prop CASCADE;

-- ── 7. Ricrea la vista con tipo_spesa_id e tipo_spesa (testo derivato) ────────

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
  s.created_at,
  s.updated_at,
  (p.nome || ' ' || COALESCE(p.cognome, ''))       AS proprietario_nome,
  a.nome                                            AS appartamento_nome,
  -- quote di riparto come array JSON
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
  -- fuori periodo
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
  -- duplicato automatico
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
LEFT JOIN tipi_spesa ts ON ts.id = s.tipo_spesa_id;

COMMIT;

SELECT '020_tipo_spesa_unificato completata — ' || NOW()::TEXT AS esito;
