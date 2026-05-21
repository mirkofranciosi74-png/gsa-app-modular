-- ============================================================
-- Migrazione 004 — Regole di riparto per eccezioni
-- ============================================================
BEGIN;

-- Tabella regole di riparto
-- Ogni regola definisce per un appartamento + tipo_spesa
-- come ripartire quella spesa tra i componenti,
-- con un range temporale opzionale di validità.
CREATE TABLE IF NOT EXISTS regole_riparto (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appartamento_id  UUID NOT NULL REFERENCES appartamenti(id) ON DELETE CASCADE,
  tipo_spesa_id    UUID NOT NULL REFERENCES tipi_spesa(id)   ON DELETE CASCADE,
  descrizione      TEXT,
  validita_da      DATE,          -- NULL = sempre valida dall'inizio
  validita_a       DATE,          -- NULL = ancora valida
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT regole_validita_chk
    CHECK (validita_a IS NULL OR validita_da IS NULL OR validita_a >= validita_da)
);

CREATE INDEX IF NOT EXISTS idx_regole_appartamento
  ON regole_riparto(appartamento_id);
CREATE INDEX IF NOT EXISTS idx_regole_tipo_spesa
  ON regole_riparto(tipo_spesa_id);

-- Dettaglio delle quote per ogni componente nella regola
-- La somma delle quote deve essere 100 (controllo applicativo)
CREATE TABLE IF NOT EXISTS regole_riparto_quote (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regola_id     UUID NOT NULL REFERENCES regole_riparto(id) ON DELETE CASCADE,
  componente_id UUID NOT NULL REFERENCES componenti(id)     ON DELETE CASCADE,
  percentuale   NUMERIC(5,2) NOT NULL CHECK (percentuale BETWEEN 0 AND 100),

  CONSTRAINT regole_quote_uq UNIQUE (regola_id, componente_id)
);

CREATE INDEX IF NOT EXISTS idx_regole_quote_regola
  ON regole_riparto_quote(regola_id);
CREATE INDEX IF NOT EXISTS idx_regole_quote_componente
  ON regole_riparto_quote(componente_id);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_regole_riparto_updated_at ON regole_riparto;
CREATE TRIGGER trg_regole_riparto_updated_at
  BEFORE UPDATE ON regole_riparto
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMIT;

SELECT 'Migrazione 004 completata — ' || NOW()::TEXT AS esito;
