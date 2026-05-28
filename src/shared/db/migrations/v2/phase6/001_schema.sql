-- ============================================================
-- FASE 6 — DOCUMENTALE DISACCOPPIATO: Schema
-- Store documentale universale, scollegato dal dominio economico.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS v2.documento (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_file     TEXT        NOT NULL,
  file_hash     TEXT,
  mime_type     TEXT,
  estensione    TEXT,
  dimensione    BIGINT,
  note          TEXT,
  legacy_tipo   TEXT        CHECK (legacy_tipo IN ('archivio','spesa')),
  legacy_id     UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v2_doc_hash    ON v2.documento(file_hash) WHERE file_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_v2_doc_legacy  ON v2.documento(legacy_tipo, legacy_id);

CREATE TABLE IF NOT EXISTS v2.documento_link (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id  UUID        NOT NULL REFERENCES v2.documento(id) ON DELETE CASCADE,
  entita_tipo   TEXT        NOT NULL
    CHECK (entita_tipo IN ('fatto_economico','immobile','condominio','persona')),
  entita_id     UUID        NOT NULL,
  ruolo         TEXT        NOT NULL DEFAULT 'allegato'
    CHECK (ruolo IN ('allegato','originale','riferimento')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT doc_link_uq UNIQUE (documento_id, entita_tipo, entita_id)
);

CREATE INDEX IF NOT EXISTS idx_v2_doc_link_doc     ON v2.documento_link(documento_id);
CREATE INDEX IF NOT EXISTS idx_v2_doc_link_entita  ON v2.documento_link(entita_tipo, entita_id);

INSERT INTO v2._phase_log (phase, step, note)
VALUES ('phase6', 'schema', 'Tabelle v2.documento e v2.documento_link create')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW();

COMMIT;

SELECT 'Phase 6 schema applicato — ' || NOW()::TEXT AS esito;
