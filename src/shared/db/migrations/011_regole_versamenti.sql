-- Rende tipo_spesa_id opzionale (NULL = regola default per tutte le spese)
ALTER TABLE regole_riparto ALTER COLUMN tipo_spesa_id DROP NOT NULL;

-- Aggiunge tipo_versamento per regole su versamenti
ALTER TABLE regole_riparto ADD COLUMN IF NOT EXISTS tipo_versamento VARCHAR(20);
ALTER TABLE regole_riparto ADD CONSTRAINT regole_riparto_versamento_chk
  CHECK (tipo_versamento IS NULL OR tipo_versamento IN ('affitto','conguaglio','rimborso','altro'));
