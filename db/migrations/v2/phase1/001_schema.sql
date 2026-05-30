-- ============================================================
-- FASE 1 — PERSONA: Schema
-- Entità unificata che sostituisce componenti + proprietari.
-- ============================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS v2;

-- ── v2.persona ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS v2.persona (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT        NOT NULL,
  cognome     TEXT,
  email       TEXT,
  telefono    TEXT,
  indirizzo   TEXT,
  note        TEXT,
  attivo      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v2_persona_email ON v2.persona(LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_v2_persona_nome  ON v2.persona(LOWER(nome), LOWER(COALESCE(cognome,'')));

-- ── v2.persona_legacy ─────────────────────────────────────────────────────────
-- Traccia ogni record legacy che ha contribuito a questa persona.
CREATE TABLE IF NOT EXISTS v2.persona_legacy (
  persona_id  UUID NOT NULL REFERENCES v2.persona(id) ON DELETE CASCADE,
  legacy_tipo TEXT NOT NULL CHECK (legacy_tipo IN ('componente','proprietario')),
  legacy_id   UUID NOT NULL,

  PRIMARY KEY (legacy_tipo, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_v2_persona_legacy_pid ON v2.persona_legacy(persona_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION v2.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_v2_persona_updated_at ON v2.persona;
CREATE TRIGGER trg_v2_persona_updated_at
  BEFORE UPDATE ON v2.persona
  FOR EACH ROW EXECUTE FUNCTION v2.fn_set_updated_at();

INSERT INTO v2._phase_log (phase, step, note)
VALUES ('phase1', 'schema', 'Tabelle v2.persona e v2.persona_legacy create')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW();

COMMIT;

SELECT 'Phase 1 schema applicato — ' || NOW()::TEXT AS esito;
