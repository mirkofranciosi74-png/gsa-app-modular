-- Migration 012: suddivisione entrate per proprietari
-- Aggiunge split_uguale alla regola e percentuale personalizzata per proprietario incluso

ALTER TABLE regole_riparto
  ADD COLUMN IF NOT EXISTS split_uguale BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE regole_riparto_inclusi_prop
  ADD COLUMN IF NOT EXISTS percentuale NUMERIC(5,2);

-- Backward-compat: le regole entrate già create usavano parti uguali (comportamento precedente)
UPDATE regole_riparto SET split_uguale = TRUE
WHERE tipo_versamento IS NOT NULL;
