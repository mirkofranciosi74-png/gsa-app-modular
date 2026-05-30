-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 16 / 002 — Separazione archivio documentale: crea v2.archivio_*
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;

-- 1. Tipi documento v2 (senza campo entita[], non necessario in v2)
CREATE TABLE IF NOT EXISTS v2.archivio_tipo_documento (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT        NOT NULL UNIQUE,
  descrizione TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Documenti archiviati v2
CREATE TABLE IF NOT EXISTS v2.archivio_documento (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_documento_id UUID        REFERENCES v2.archivio_tipo_documento(id) ON DELETE SET NULL,
  nome_file         TEXT        NOT NULL,
  file_hash         TEXT,
  mime_type         TEXT,
  estensione        TEXT,
  note              TEXT,
  validita_da       DATE,
  validita_a        DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Associazioni v2 (solo entità v2: immobile, persona)
CREATE TABLE IF NOT EXISTS v2.archivio_associazione (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID  NOT NULL REFERENCES v2.archivio_documento(id) ON DELETE CASCADE,
  entita_tipo  TEXT  NOT NULL CHECK (entita_tipo IN ('immobile','persona')),
  entita_id    UUID  NOT NULL,
  CONSTRAINT v2_archivio_assoc_uq UNIQUE (documento_id, entita_tipo, entita_id)
);

CREATE INDEX IF NOT EXISTS idx_v2_archivio_doc_tipo
  ON v2.archivio_documento(tipo_documento_id);
CREATE INDEX IF NOT EXISTS idx_v2_archivio_assoc_entita
  ON v2.archivio_associazione(entita_tipo, entita_id);
CREATE INDEX IF NOT EXISTS idx_v2_archivio_assoc_doc
  ON v2.archivio_associazione(documento_id);

-- 4. Migra tipi documento (stessi ID — nessun cambio di riferimenti)
INSERT INTO v2.archivio_tipo_documento (id, nome, descrizione, created_at)
SELECT id, nome, descrizione, created_at
FROM archivio_tipi_documento
ON CONFLICT (id) DO NOTHING;

-- 5. Migra documenti associati a entità v2
INSERT INTO v2.archivio_documento
  (id, tipo_documento_id, nome_file, file_hash, mime_type, estensione, note, validita_da, validita_a, created_at)
SELECT DISTINCT
  d.id, d.tipo_documento_id, d.nome_file, d.file_hash,
  d.mime_type, d.estensione, d.note, d.validita_da, d.validita_a, d.created_at
FROM archivio_documenti d
WHERE EXISTS (
  SELECT 1 FROM archivio_associazioni aa
  WHERE aa.documento_id = d.id
    AND aa.entita_tipo IN ('immobile','persona')
)
ON CONFLICT (id) DO NOTHING;

-- 6. Migra associazioni v2
INSERT INTO v2.archivio_associazione (id, documento_id, entita_tipo, entita_id)
SELECT aa.id, aa.documento_id, aa.entita_tipo, aa.entita_id
FROM archivio_associazioni aa
WHERE aa.entita_tipo IN ('immobile','persona')
  AND EXISTS (SELECT 1 FROM v2.archivio_documento d WHERE d.id = aa.documento_id)
ON CONFLICT DO NOTHING;

-- 7. Rimuove entità v2 dalla tabella archivio legacy
DELETE FROM archivio_associazioni WHERE entita_tipo IN ('immobile','persona');

-- Rimuove documenti legacy che non hanno più associazioni
DELETE FROM archivio_documenti
WHERE id NOT IN (
  SELECT DISTINCT documento_id FROM archivio_associazioni
);

-- 8. Restringe il constraint legacy ai soli tipi v1
ALTER TABLE archivio_associazioni
  DROP CONSTRAINT IF EXISTS archivio_associazioni_entita_tipo_check;
ALTER TABLE archivio_associazioni
  ADD CONSTRAINT archivio_associazioni_entita_tipo_check
  CHECK (entita_tipo IN ('appartamento','inquilino','proprietario','spesa'));

INSERT INTO v2._phase_log(phase, step, note)
VALUES ('phase16', 'archivio',
  'v2.archivio_tipo_documento, v2.archivio_documento, v2.archivio_associazione create; dati migrati; legacy archivio ripulito da entità v2')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW(), note = EXCLUDED.note;

COMMIT;

SELECT 'Phase 16 / 002 archivio applicato — ' || NOW()::TEXT AS esito;
