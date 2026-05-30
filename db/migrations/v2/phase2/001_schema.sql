-- ============================================================
-- FASE 2 — CONDOMINIO + IMMOBILE: Schema
-- ============================================================

BEGIN;

-- ── v2.condominio ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS v2.condominio (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT        NOT NULL,
  indirizzo   TEXT,
  citta       TEXT,
  cap         VARCHAR(10),
  note        TEXT,
  virtuale    BOOLEAN     NOT NULL DEFAULT FALSE,
  attivo      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_v2_condominio_updated_at ON v2.condominio;
CREATE TRIGGER trg_v2_condominio_updated_at
  BEFORE UPDATE ON v2.condominio
  FOR EACH ROW EXECUTE FUNCTION v2.fn_set_updated_at();

-- ── v2.immobile ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS v2.immobile (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID        NOT NULL REFERENCES v2.condominio(id) ON DELETE RESTRICT,
  legacy_id     UUID        UNIQUE,
  nome          TEXT        NOT NULL,
  via           TEXT,
  citta         TEXT,
  cap           VARCHAR(10),
  note          TEXT,
  attivo        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v2_immobile_condominio ON v2.immobile(condominio_id);
CREATE INDEX IF NOT EXISTS idx_v2_immobile_legacy     ON v2.immobile(legacy_id);

DROP TRIGGER IF EXISTS trg_v2_immobile_updated_at ON v2.immobile;
CREATE TRIGGER trg_v2_immobile_updated_at
  BEFORE UPDATE ON v2.immobile
  FOR EACH ROW EXECUTE FUNCTION v2.fn_set_updated_at();

INSERT INTO v2._phase_log (phase, step, note)
VALUES ('phase2', 'schema', 'Tabelle v2.condominio e v2.immobile create')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW();

COMMIT;

SELECT 'Phase 2 schema applicato — ' || NOW()::TEXT AS esito;
