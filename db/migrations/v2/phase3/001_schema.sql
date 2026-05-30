-- ============================================================
-- FASE 3 — RUOLO PERSONA: Schema
-- Semantica inquilino/proprietario nelle relazioni, non nell'entità.
-- ============================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE v2.ruolo_tipo AS ENUM ('inquilino','proprietario');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS v2.ruolo_persona (
  id             UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id     UUID             NOT NULL REFERENCES v2.persona(id)  ON DELETE RESTRICT,
  immobile_id    UUID             NOT NULL REFERENCES v2.immobile(id) ON DELETE RESTRICT,
  ruolo          v2.ruolo_tipo    NOT NULL,
  validita_da    DATE,
  validita_a     DATE,
  quota          NUMERIC(5,2),
  quota_affitto  NUMERIC(10,2),
  caparra        NUMERIC(10,2),
  default_flag   BOOLEAN          NOT NULL DEFAULT FALSE,
  legacy_id      UUID,
  created_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  CONSTRAINT ruolo_validita_chk
    CHECK (validita_a IS NULL OR validita_da IS NULL OR validita_a >= validita_da),
  CONSTRAINT ruolo_quota_chk
    CHECK (quota IS NULL OR quota BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_v2_ruolo_persona_pid   ON v2.ruolo_persona(persona_id);
CREATE INDEX IF NOT EXISTS idx_v2_ruolo_persona_iid   ON v2.ruolo_persona(immobile_id);
CREATE INDEX IF NOT EXISTS idx_v2_ruolo_persona_ruolo ON v2.ruolo_persona(ruolo);
CREATE INDEX IF NOT EXISTS idx_v2_ruolo_validita      ON v2.ruolo_persona(validita_da, validita_a);

DROP TRIGGER IF EXISTS trg_v2_ruolo_persona_updated_at ON v2.ruolo_persona;
CREATE TRIGGER trg_v2_ruolo_persona_updated_at
  BEFORE UPDATE ON v2.ruolo_persona
  FOR EACH ROW EXECUTE FUNCTION v2.fn_set_updated_at();

INSERT INTO v2._phase_log (phase, step, note)
VALUES ('phase3', 'schema', 'Tabella v2.ruolo_persona creata')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW();

COMMIT;

SELECT 'Phase 3 schema applicato — ' || NOW()::TEXT AS esito;
