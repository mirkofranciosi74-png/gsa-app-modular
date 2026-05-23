-- Migrazione 014: tabella tipi_versamento + conversione ENUM → TEXT

-- Step 1: droppa la vista che dipende dalla colonna ENUM
DROP VIEW IF EXISTS v_movimenti_dettaglio;

-- Step 2: converte movimenti.tipo_versamento da ENUM versamento_tipo a TEXT
ALTER TABLE movimenti
  ALTER COLUMN tipo_versamento TYPE TEXT USING tipo_versamento::TEXT;

ALTER TABLE movimenti
  ALTER COLUMN tipo_versamento SET DEFAULT 'affitto';

-- Step 3: elimina il tipo ENUM (non più usato)
DROP TYPE IF EXISTS versamento_tipo;

-- Step 4: ricrea la vista (identica a prima, ora tipo_versamento è TEXT)
CREATE VIEW v_movimenti_dettaglio AS
SELECT
  m.id, m.appartamento_id, m.componente_id,
  m.tipo, m.segno, m.periodicita,
  m.importo,
  (m.importo * m.segno)                       AS importo_netto,
  m.validita_da, m.validita_a,
  m.descrizione,
  m.tipo_versamento, m.data_versamento, m.mese_riferimento,
  m.incassato_da_proprietario_id,
  m.created_at, m.updated_at,
  a.nome                                      AS appartamento_nome,
  (c.nome || ' ' || COALESCE(c.cognome,''))  AS componente_nome,
  c.validita_da                               AS comp_validita_da,
  c.validita_a                                AS comp_validita_a,
  CASE
    WHEN c.validita_da IS NOT NULL AND m.validita_a  IS NOT NULL
         AND m.validita_a  < c.validita_da THEN TRUE
    WHEN c.validita_a  IS NOT NULL AND m.validita_da IS NOT NULL
         AND m.validita_da > c.validita_a  THEN TRUE
    ELSE FALSE
  END AS fuori_validita
FROM movimenti m
JOIN appartamenti a ON a.id = m.appartamento_id
JOIN componenti   c ON c.id = m.componente_id;

-- Step 5: crea la tabella tipi_versamento
CREATE TABLE IF NOT EXISTS tipi_versamento (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       VARCHAR(50) UNIQUE NOT NULL,
  colore     VARCHAR(20) NOT NULL DEFAULT 'gray',
  attivo     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 6: inserisce i 4 tipi predefiniti
INSERT INTO tipi_versamento (nome, colore) VALUES
  ('affitto',    'blue'),
  ('conguaglio', 'purple'),
  ('rimborso',   'red'),
  ('altro',      'gray')
ON CONFLICT (nome) DO NOTHING;
