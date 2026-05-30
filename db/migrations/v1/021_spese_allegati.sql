-- Migrazione 021: allegati multipli per spese proprietari

BEGIN;

CREATE TABLE IF NOT EXISTS spese_proprietari_allegati (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  spesa_id   UUID        NOT NULL REFERENCES spese_proprietari(id) ON DELETE CASCADE,
  nome_file  TEXT        NOT NULL DEFAULT 'Allegato',
  mime_type  TEXT        NOT NULL DEFAULT 'application/pdf',
  estensione TEXT        NOT NULL DEFAULT '.pdf',
  file_hash  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_spesa    ON spese_proprietari_allegati(spesa_id);
CREATE INDEX IF NOT EXISTS idx_spa_hash     ON spese_proprietari_allegati(file_hash) WHERE file_hash IS NOT NULL;

COMMIT;

SELECT '021_spese_allegati completata — ' || NOW()::TEXT AS esito;
