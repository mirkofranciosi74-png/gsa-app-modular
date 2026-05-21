-- ============================================================
-- Migrazione 003 — Aggiornamento schema v3
-- Rimuove data_riferimento da movimenti (sostituita da validita_da)
-- Aggiunge vincoli e viste aggiornate
--
-- Esecuzione:
--   psql -h localhost -U gsa_user -d gsa_db -f src/db/migrations/003_rimozione_data_riferimento.sql
-- ============================================================

BEGIN;

-- ── 1. MOVIMENTI: copia data_riferimento → validita_da dove mancante ──────────
-- Prima di eliminare la colonna, preserva i dati
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='movimenti' AND column_name='data_riferimento'
  ) THEN
    -- Copia il valore in validita_da solo se validita_da è ancora NULL
    UPDATE movimenti
    SET validita_da = data_riferimento
    WHERE validita_da IS NULL
      AND data_riferimento IS NOT NULL;

    RAISE NOTICE 'Copiati % record da data_riferimento a validita_da',
      (SELECT COUNT(*) FROM movimenti WHERE validita_da IS NOT NULL);

    -- Ora rimuove la colonna
    ALTER TABLE movimenti DROP COLUMN data_riferimento;
    RAISE NOTICE 'Colonna data_riferimento rimossa da movimenti';
  ELSE
    RAISE NOTICE 'Colonna data_riferimento non presente, salto';
  END IF;
END $$;

-- ── 2. COMPONENTI: assicura colonne validita_da / validita_a ──────────────────
ALTER TABLE componenti
  ADD COLUMN IF NOT EXISTS validita_da DATE,
  ADD COLUMN IF NOT EXISTS validita_a  DATE;

-- Copia da data_inizio / data_fine se esistono ancora
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='componenti' AND column_name='data_inizio') THEN
    UPDATE componenti SET validita_da = data_inizio
    WHERE validita_da IS NULL AND data_inizio IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='componenti' AND column_name='data_fine') THEN
    UPDATE componenti SET validita_a = data_fine
    WHERE validita_a IS NULL AND data_fine IS NOT NULL;
  END IF;
END $$;

-- Vincolo coerenza date componenti
ALTER TABLE componenti DROP CONSTRAINT IF EXISTS componenti_validita_chk;
ALTER TABLE componenti ADD CONSTRAINT componenti_validita_chk
  CHECK (validita_a IS NULL OR validita_da IS NULL OR validita_a >= validita_da);

-- ── 3. MOVIMENTI: assicura colonne validita_da / validita_a ───────────────────
ALTER TABLE movimenti
  ADD COLUMN IF NOT EXISTS validita_da DATE,
  ADD COLUMN IF NOT EXISTS validita_a  DATE;

-- Vincolo coerenza date movimenti
ALTER TABLE movimenti DROP CONSTRAINT IF EXISTS movimenti_validita_chk;
ALTER TABLE movimenti ADD CONSTRAINT movimenti_validita_chk
  CHECK (validita_a IS NULL OR validita_da IS NULL OR validita_a >= validita_da);

-- Rimuovi vecchio vincolo importo se presente con nome diverso
ALTER TABLE movimenti DROP CONSTRAINT IF EXISTS movimenti_importo_pos;
ALTER TABLE movimenti DROP CONSTRAINT IF EXISTS movimenti_importo_chk;
-- Ricrea
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'movimenti_importo_pos'
  ) THEN
    ALTER TABLE movimenti ADD CONSTRAINT movimenti_importo_pos CHECK (importo > 0);
  END IF;
END $$;

-- ── 4. FUNZIONE propaga_date_componente ───────────────────────────────────────
DROP FUNCTION IF EXISTS propaga_date_componente(UUID, DATE, DATE);

CREATE FUNCTION propaga_date_componente(
  p_componente_id UUID,
  p_validita_da   DATE,
  p_validita_a    DATE
)
RETURNS TABLE (
  mov_id      UUID,
  mov_tipo    mov_tipo,
  mov_importo NUMERIC,
  mov_val_da  DATE,
  mov_val_a   DATE,
  new_val_da  DATE,
  new_val_a   DATE
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.tipo,
    m.importo,
    m.validita_da,
    m.validita_a,
    CASE
      WHEN p_validita_da IS NULL THEN m.validita_da
      WHEN m.validita_da IS NULL THEN p_validita_da
      ELSE GREATEST(m.validita_da, p_validita_da)
    END,
    CASE
      WHEN p_validita_a IS NULL THEN m.validita_a
      WHEN m.validita_a IS NULL THEN p_validita_a
      ELSE LEAST(m.validita_a, p_validita_a)
    END
  FROM movimenti m
  WHERE m.componente_id = p_componente_id;
END;
$$;

-- ── 5. TRIGGER updated_at (ricrea per sicurezza) ──────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['appartamenti','componenti','documenti','movimenti']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
       CREATE TRIGGER trg_%I_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- ── 6. VISTE (ricrea tutte) ───────────────────────────────────────────────────

DROP VIEW IF EXISTS v_movimenti_dettaglio;
DROP VIEW IF EXISTS v_saldo_componenti;
DROP VIEW IF EXISTS v_spese_appartamento;
DROP VIEW IF EXISTS v_percentuali_appartamento;

CREATE VIEW v_percentuali_appartamento AS
SELECT
  appartamento_id,
  SUM(percentuale) AS totale_percentuale,
  COUNT(*)         AS num_componenti
FROM componenti
WHERE attivo = TRUE
GROUP BY appartamento_id;

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
      AND (c.validita_da IS NULL OR m.validita_a  IS NULL OR m.validita_a  >= c.validita_da)
      AND (c.validita_a  IS NULL OR m.validita_da IS NULL OR m.validita_da <= COALESCE(c.validita_a, CURRENT_DATE))
WHERE c.attivo = TRUE
GROUP BY c.id, c.appartamento_id, a.nome, c.nome, c.cognome,
         c.percentuale, c.quota_mensile, c.validita_da, c.validita_a;

CREATE VIEW v_spese_appartamento AS
SELECT
  a.id                        AS appartamento_id,
  a.nome                      AS appartamento,
  COUNT(d.id)                 AS num_documenti,
  COALESCE(SUM(d.importo), 0) AS totale_spese
FROM appartamenti a
LEFT JOIN documenti d
       ON d.appartamento_id = a.id AND d.stato = 'elaborato'
WHERE a.attivo = TRUE
GROUP BY a.id, a.nome;

CREATE VIEW v_movimenti_dettaglio AS
SELECT
  m.id, m.appartamento_id, m.componente_id,
  m.tipo, m.periodicita, m.importo,
  m.validita_da, m.validita_a,
  m.descrizione, m.created_at, m.updated_at,
  a.nome                                      AS appartamento_nome,
  (c.nome || ' ' || COALESCE(c.cognome,''))   AS componente_nome,
  c.validita_da                               AS comp_validita_da,
  c.validita_a                                AS comp_validita_a,
  CASE
    WHEN c.validita_da IS NOT NULL AND m.validita_da IS NOT NULL
         AND m.validita_da < c.validita_da    THEN TRUE
    WHEN c.validita_a  IS NOT NULL AND m.validita_a  IS NOT NULL
         AND m.validita_a  > c.validita_a     THEN TRUE
    ELSE FALSE
  END                                         AS fuori_validita
FROM movimenti m
JOIN appartamenti a ON a.id = m.appartamento_id
JOIN componenti   c ON c.id = m.componente_id;

-- ── 7. Indici aggiuntivi ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_componenti_validita
  ON componenti(validita_da, validita_a);
CREATE INDEX IF NOT EXISTS idx_movimenti_validita
  ON movimenti(validita_da, validita_a);

COMMIT;

SELECT 'Migrazione 003 completata — ' || NOW()::TEXT AS esito;
