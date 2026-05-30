-- Migrazione 023: audit log per spese_proprietari (speculare a documenti_audit)

BEGIN;

CREATE TABLE IF NOT EXISTS spese_proprietari_audit (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  spesa_id   UUID        NOT NULL REFERENCES spese_proprietari(id) ON DELETE CASCADE,
  campo      TEXT        NOT NULL,
  valore_da  TEXT,
  valore_a   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sp_audit_spesa ON spese_proprietari_audit(spesa_id);
CREATE INDEX IF NOT EXISTS idx_sp_audit_time  ON spese_proprietari_audit(created_at DESC);

COMMIT;

SELECT '023_spese_proprietari_audit completata — ' || NOW()::TEXT AS esito;
