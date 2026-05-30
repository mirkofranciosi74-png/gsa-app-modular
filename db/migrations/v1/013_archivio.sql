-- Migration 013: archivio documentale
-- Tipi documento, documenti archiviati, associazioni a entità

CREATE TABLE IF NOT EXISTS archivio_tipi_documento (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT        NOT NULL UNIQUE,
  descrizione TEXT,
  entita      TEXT[]      NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS archivio_documenti (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_documento_id  UUID        REFERENCES archivio_tipi_documento(id) ON DELETE SET NULL,
  nome_file          TEXT        NOT NULL,
  file_hash          TEXT,
  mime_type          TEXT,
  estensione         TEXT,
  note               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS archivio_associazioni (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID  NOT NULL REFERENCES archivio_documenti(id) ON DELETE CASCADE,
  entita_tipo  TEXT  NOT NULL CHECK (entita_tipo IN ('appartamento','inquilino','proprietario')),
  entita_id    UUID  NOT NULL,
  UNIQUE (documento_id, entita_tipo, entita_id)
);

CREATE INDEX IF NOT EXISTS idx_archivio_assoc_entita
  ON archivio_associazioni(entita_tipo, entita_id);

CREATE INDEX IF NOT EXISTS idx_archivio_doc_tipo
  ON archivio_documenti(tipo_documento_id);
