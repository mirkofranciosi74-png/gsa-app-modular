-- ============================================================
-- FASE 4 — FATTO ECONOMICO: Schema
-- Modello neutro che unifica documenti + movimenti + spese_proprietari.
-- ============================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE v2.fatto_tipo AS ENUM ('spesa','entrata');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS v2.fatto_economico (
  id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  immobile_id     UUID             REFERENCES v2.immobile(id) ON DELETE RESTRICT,
  persona_id      UUID             REFERENCES v2.persona(id)  ON DELETE SET NULL,
  tipo            v2.fatto_tipo    NOT NULL,
  tipo_spesa_id   UUID             REFERENCES tipi_spesa(id)  ON DELETE SET NULL,
  importo         NUMERIC(12,2)    NOT NULL CHECK (importo > 0),
  segno           SMALLINT         NOT NULL DEFAULT 1 CHECK (segno IN (1,-1)),
  periodo_da      VARCHAR(7),
  periodo_a       VARCHAR(7),
  data_evento     DATE,
  descrizione     TEXT,
  fornitore       TEXT,
  numero_doc      TEXT,
  stato           TEXT             NOT NULL DEFAULT 'normale',
  periodicita     TEXT,
  legacy_tipo     TEXT             CHECK (legacy_tipo IN ('documento','movimento','spesa_proprietario')),
  legacy_id       UUID,
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  CONSTRAINT fe_periodo_chk
    CHECK (periodo_a IS NULL OR periodo_da IS NULL OR periodo_a >= periodo_da)
);

CREATE INDEX IF NOT EXISTS idx_v2_fe_immobile    ON v2.fatto_economico(immobile_id);
CREATE INDEX IF NOT EXISTS idx_v2_fe_persona     ON v2.fatto_economico(persona_id);
CREATE INDEX IF NOT EXISTS idx_v2_fe_tipo        ON v2.fatto_economico(tipo);
CREATE INDEX IF NOT EXISTS idx_v2_fe_tipo_spesa  ON v2.fatto_economico(tipo_spesa_id);
CREATE INDEX IF NOT EXISTS idx_v2_fe_periodo     ON v2.fatto_economico(periodo_da, periodo_a);
CREATE INDEX IF NOT EXISTS idx_v2_fe_legacy      ON v2.fatto_economico(legacy_tipo, legacy_id);

DROP TRIGGER IF EXISTS trg_v2_fe_updated_at ON v2.fatto_economico;
CREATE TRIGGER trg_v2_fe_updated_at
  BEFORE UPDATE ON v2.fatto_economico
  FOR EACH ROW EXECUTE FUNCTION v2.fn_set_updated_at();

INSERT INTO v2._phase_log (phase, step, note)
VALUES ('phase4', 'schema', 'Tabella v2.fatto_economico creata')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW();

COMMIT;

SELECT 'Phase 4 schema applicato — ' || NOW()::TEXT AS esito;
