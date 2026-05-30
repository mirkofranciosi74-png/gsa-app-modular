-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 14 — Immobile: colonna tipologia (appartamento, villa, box, …)
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE v2.immobile
  ADD COLUMN IF NOT EXISTS tipologia TEXT;

INSERT INTO v2._phase_log(phase, step, note)
VALUES ('phase14', 'schema', 'immobile: tipologia')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW(), note = EXCLUDED.note;

COMMIT;

SELECT 'Phase 14 schema applicato — ' || NOW()::TEXT AS esito;
