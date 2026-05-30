-- Migrazione 019: riparto percentuale spese tra proprietari

BEGIN;

-- ── 1. Tabella quote riparto ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spese_proprietari_quote (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spesa_id        UUID         NOT NULL REFERENCES spese_proprietari(id) ON DELETE CASCADE,
  proprietario_id UUID         NOT NULL REFERENCES proprietari(id)       ON DELETE RESTRICT,
  percentuale     NUMERIC(5,2) NOT NULL CHECK (percentuale > 0 AND percentuale <= 100),
  CONSTRAINT spese_quote_uq UNIQUE (spesa_id, proprietario_id)
);

CREATE INDEX IF NOT EXISTS idx_spese_quote_spesa ON spese_proprietari_quote(spesa_id);
CREATE INDEX IF NOT EXISTS idx_spese_quote_prop  ON spese_proprietari_quote(proprietario_id);

-- ── 2. Migra dati esistenti: 100% al proprietario già salvato ─────────────────
INSERT INTO spese_proprietari_quote (spesa_id, proprietario_id, percentuale)
SELECT id, proprietario_id, 100
FROM spese_proprietari
WHERE proprietario_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── 3. Ricrea la vista includendo le quote ────────────────────────────────────
DROP VIEW IF EXISTS v_spese_proprietari_dettaglio;

CREATE VIEW v_spese_proprietari_dettaglio AS
SELECT
  s.id,
  s.proprietario_id,
  s.appartamento_id,
  s.tipo_spesa,
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
  (p.nome || ' ' || COALESCE(p.cognome, ''))  AS proprietario_nome,
  a.nome                                       AS appartamento_nome,
  -- quote di riparto come array JSON
  COALESCE(
    (SELECT json_agg(json_build_object(
       'proprietario_id', q.proprietario_id,
       'proprietario_nome', (pr.nome || ' ' || COALESCE(pr.cognome,'')),
       'percentuale', q.percentuale
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
JOIN proprietari  p ON p.id = s.proprietario_id
JOIN appartamenti a ON a.id = s.appartamento_id;

COMMIT;

SELECT '019_spese_quote completata — ' || NOW()::TEXT AS esito;
