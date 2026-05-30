-- 015: tabella regole_importazione per l'import intelligente di estratti conto
CREATE TABLE IF NOT EXISTS regole_importazione (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  stringa         TEXT    NOT NULL UNIQUE,           -- pattern (lowercase normalizzato)
  componente_id   UUID    REFERENCES componenti(id)   ON DELETE SET NULL,
  appartamento_id UUID    REFERENCES appartamenti(id) ON DELETE SET NULL,
  tipo_riga       TEXT    CHECK (tipo_riga IN ('entrata','spesa','ignora')),
  note            TEXT,
  uso_count       INT     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_regole_importazione_stringa ON regole_importazione(stringa);

DROP TRIGGER IF EXISTS trg_regole_importazione_updated_at ON regole_importazione;
CREATE TRIGGER trg_regole_importazione_updated_at
  BEFORE UPDATE ON regole_importazione
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
