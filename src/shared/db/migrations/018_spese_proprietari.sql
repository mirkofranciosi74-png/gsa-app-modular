-- Migrazione 018: Spese sostenute dai proprietari per gestione/manutenzione immobili

BEGIN;

-- ── 1. Tabella tipi_spesa_prop ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tipi_spesa_prop (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       VARCHAR(50) UNIQUE NOT NULL,
  colore     VARCHAR(20) NOT NULL DEFAULT 'gray',
  attivo     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tipi_spesa_prop (nome, colore) VALUES
  ('arredi',           'orange'),
  ('ristrutturazione', 'red'),
  ('mutuo',            'purple'),
  ('manutenzione_ord', 'blue'),
  ('manutenzione_str', 'yellow'),
  ('assicurazione',    'green'),
  ('tasse_imposte',    'gray'),
  ('altro',            'gray')
ON CONFLICT (nome) DO NOTHING;

-- ── 2. Tabella spese_proprietari ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spese_proprietari (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proprietario_id UUID       NOT NULL REFERENCES proprietari(id)  ON DELETE RESTRICT,
  appartamento_id UUID       NOT NULL REFERENCES appartamenti(id) ON DELETE RESTRICT,
  tipo_spesa     TEXT        NOT NULL DEFAULT 'altro',
  importo        NUMERIC(12,2) NOT NULL CHECK (importo > 0),
  periodicita    TEXT        NOT NULL DEFAULT 'una_tantum'
                              CHECK (periodicita IN
                               ('una_tantum','mensile','bimestrale','trimestrale','semestrale','annuale')),
  validita_da    DATE        NOT NULL,
  validita_a     DATE,
  data_pagamento DATE,
  mese_competenza TEXT,
  fornitore      TEXT,
  numero_fattura TEXT,
  descrizione    TEXT,
  stato          VARCHAR(20) NOT NULL DEFAULT 'normale'
                              CHECK (stato IN ('normale','verificato','da_verificare')),
  documento_id   UUID        REFERENCES archivio_documenti(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spese_prop_proprietario ON spese_proprietari(proprietario_id);
CREATE INDEX IF NOT EXISTS idx_spese_prop_appartamento ON spese_proprietari(appartamento_id);
CREATE INDEX IF NOT EXISTS idx_spese_prop_stato        ON spese_proprietari(stato);
CREATE INDEX IF NOT EXISTS idx_spese_prop_dup_data
  ON spese_proprietari(proprietario_id, appartamento_id, importo, data_pagamento)
  WHERE data_pagamento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spese_prop_dup_mese
  ON spese_proprietari(proprietario_id, appartamento_id, importo, mese_competenza)
  WHERE mese_competenza IS NOT NULL;

-- ── 3. Vista dettaglio ────────────────────────────────────────────────────────
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
  -- fuori periodo: la spesa ricorrente è fuori dalla finestra dell'associazione
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
  -- duplicato automatico: stesso proprietario + appartamento + importo + data o mese
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

SELECT '018_spese_proprietari completata — ' || NOW()::TEXT AS esito;
