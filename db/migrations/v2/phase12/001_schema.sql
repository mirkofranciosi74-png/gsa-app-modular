-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 12 — Regola riparto: validita_da/a VARCHAR(7) → DATE
--            + indice aggiornato per DATE comparison
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;

-- Drop check constraint that does text comparison (incompatible with DATE)
ALTER TABLE v2.regola_riparto
  DROP CONSTRAINT IF EXISTS v2_regola_validita_chk;

-- Drop old index (was on varchar columns)
DROP INDEX IF EXISTS v2.idx_v2_rr_validita;

-- Convert validita_da: YYYY-MM varchar → first day of month as DATE
ALTER TABLE v2.regola_riparto
  ALTER COLUMN validita_da TYPE DATE
    USING CASE WHEN validita_da IS NULL THEN NULL
               ELSE to_date(validita_da || '-01', 'YYYY-MM-DD') END;

-- Convert validita_a: YYYY-MM varchar → last day of month as DATE
ALTER TABLE v2.regola_riparto
  ALTER COLUMN validita_a TYPE DATE
    USING CASE WHEN validita_a IS NULL THEN NULL
               ELSE (to_date(validita_a || '-01', 'YYYY-MM-DD') + INTERVAL '1 month - 1 day')::DATE END;

-- Recreate constraint for DATE type
ALTER TABLE v2.regola_riparto
  ADD CONSTRAINT v2_regola_validita_chk
    CHECK (validita_a IS NULL OR validita_da IS NULL OR validita_a >= validita_da);

-- Recreate index on DATE columns
CREATE INDEX IF NOT EXISTS idx_v2_rr_validita
  ON v2.regola_riparto(validita_da, validita_a);

INSERT INTO v2._phase_log(phase, step, note)
VALUES ('phase12', 'schema', 'regola_riparto.validita_da/a VARCHAR(7) → DATE')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW(), note = EXCLUDED.note;

COMMIT;

SELECT 'Phase 12 schema applicato — ' || NOW()::TEXT AS esito;
