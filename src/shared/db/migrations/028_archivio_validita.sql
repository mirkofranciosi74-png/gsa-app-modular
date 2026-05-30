-- 028 — aggiunge date di validità ai documenti archiviati
ALTER TABLE archivio_documenti
  ADD COLUMN IF NOT EXISTS validita_da DATE,
  ADD COLUMN IF NOT EXISTS validita_a  DATE;
