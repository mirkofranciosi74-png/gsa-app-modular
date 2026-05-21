-- ============================================================
-- Migrazione 002 — Date di validità su componenti e movimenti
-- Eseguire con:
--   psql -h localhost -U gsa_user -d gsa_db -f src/db/migrations/002_date_validita.sql
-- oppure:
--   node src/db/migrations/run.js
-- ============================================================

BEGIN;

-- ── 1. COMPONENTI ─────────────────────────────────────────────────────────────
-- Aggiunge validita_da e validita_a se non esistono già.
-- NON rinomina colonne esistenti per evitare conflitti.

ALTER TABLE componenti
  ADD COLUMN IF NOT EXISTS validita_da DATE,
  ADD COLUMN IF NOT EXISTS validita_a  DATE;

-- Se esistevano data_inizio / data_fine copia i valori (poi le lasciamo)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='componenti' AND column_name='data_inizio'
  ) THEN
    UPDATE componenti
    SET validita_da = data_inizio
    WHERE validita_da IS NULL AND data_inizio IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='componenti' AND column_name='data_fine'
  ) THEN
    UPDATE componenti
    SET validita_a = data_fine
    WHERE validita_a IS NULL AND data_fine IS NOT NULL;
  END IF;
END $$;

-- Vincolo di coerenza (ricrea se già presente)
ALTER TABLE componenti DROP CONSTRAINT IF EXISTS componenti_validita_chk;
ALTER TABLE componenti ADD CONSTRAINT componenti_validita_chk
  CHECK (validita_a IS NULL OR validita_da IS NULL OR validita_a >= validita_da);

-- ── 2. MOVIMENTI ─────────────────────────────────────────────────────────────
ALTER TABLE movimenti
  ADD COLUMN IF NOT EXISTS validita_da DATE,
  ADD COLUMN IF NOT EXISTS validita_a  DATE;

-- Inizializza validita_da dalla data_riferimento dove assente
UPDATE movimenti
SET validita_da = data_riferimento
WHERE validita_da IS NULL AND data_riferimento IS NOT NULL;

ALTER TABLE movimenti DROP CONSTRAINT IF EXISTS movimenti_validita_chk;
ALTER TABLE movimenti ADD CONSTRAINT movimenti_validita_chk
  CHECK (validita_a IS NULL OR validita_da IS NULL OR validita_a >= validita_da);

-- ── 3. FUNZIONE: calcola anteprima propagazione date ─────────────────────────
DROP FUNCTION IF EXISTS propaga_date_componente(UUID, DATE, DATE);

CREATE FUNCTION propaga_date_componente(
  p_componente_id UUID,
  p_validita_da   DATE,
  p_validita_a    DATE
)
RETURNS TABLE (
  mov_id          UUID,
  mov_tipo        mov_tipo,
  mov_importo     NUMERIC,
  mov_val_da      DATE,
  mov_val_a       DATE,
  new_val_da      DATE,
  new_val_a       DATE
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id                                              AS mov_id,
    m.tipo                                            AS mov_tipo,
    m.importo                                         AS mov_importo,
    m.validita_da                                     AS mov_val_da,
    m.validita_a                                      AS mov_val_a,
    -- nuova data inizio: la più restrittiva tra componente e movimento
    CASE
      WHEN p_validita_da IS NULL     THEN m.validita_da
      WHEN m.validita_da IS NULL     THEN p_validita_da
      ELSE GREATEST(m.validita_da, p_validita_da)
    END                                               AS new_val_da,
    -- nuova data fine: la più restrittiva tra componente e movimento
    CASE
      WHEN p_validita_a IS NULL      THEN m.validita_a
      WHEN m.validita_a IS NULL      THEN p_validita_a
      ELSE LEAST(m.validita_a, p_validita_a)
    END                                               AS new_val_a
  FROM movimenti m
  WHERE m.componente_id = p_componente_id;
END;
$$;

-- ── 4. VISTA v_saldo_componenti ───────────────────────────────────────────────
-- Ricreata con colonne rinominate in modo non ambiguo.
DROP VIEW IF EXISTS v_saldo_componenti;

CREATE VIEW v_saldo_componenti AS
SELECT
  c.id                                        AS componente_id,
  c.appartamento_id,
  a.nome                                      AS appartamento,
  (c.nome || ' ' || COALESCE(c.cognome,''))   AS componente,
  c.percentuale,
  c.quota_mensile,
  c.validita_da                               AS comp_validita_da,
  c.validita_a                                AS comp_validita_a,
  COALESCE(SUM(m.importo), 0)                 AS versato_totale
FROM componenti c
JOIN appartamenti a ON a.id = c.appartamento_id
LEFT JOIN movimenti m
       ON m.componente_id = c.id
      AND m.tipo = 'Versamento'
      -- il movimento deve essere attivo nell'intervallo di validità del componente
      AND (
        c.validita_da IS NULL
        OR m.validita_a  IS NULL
        OR m.validita_a  >= c.validita_da
      )
      AND (
        c.validita_a IS NULL
        OR m.validita_da IS NULL
        OR m.validita_da <= c.validita_a
      )
WHERE c.attivo = TRUE
GROUP BY
  c.id,
  c.appartamento_id,
  a.nome,
  c.nome,
  c.cognome,
  c.percentuale,
  c.quota_mensile,
  c.validita_da,
  c.validita_a;

-- ── 5. VISTA v_spese_appartamento ─────────────────────────────────────────────
-- Ricreata per coerenza (era già corretta, ma ricreiamo per sicurezza)
DROP VIEW IF EXISTS v_spese_appartamento;

CREATE VIEW v_spese_appartamento AS
SELECT
  a.id                        AS appartamento_id,
  a.nome                      AS appartamento,
  COUNT(d.id)                 AS num_documenti,
  COALESCE(SUM(d.importo), 0) AS totale_spese
FROM appartamenti a
LEFT JOIN documenti d
       ON d.appartamento_id = a.id
      AND d.stato = 'elaborato'
WHERE a.attivo = TRUE
GROUP BY a.id, a.nome;

COMMIT;

SELECT 'Migrazione 002 completata correttamente' AS esito;
