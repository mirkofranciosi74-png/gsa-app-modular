-- ============================================================
-- Migrazione 007 — Versamenti con segno, tipo semplificato
-- ============================================================
BEGIN;

-- ── 1. Elimina le viste che dipendono dalla colonna tipo ──────────────────────
DROP VIEW IF EXISTS v_movimenti_dettaglio;
DROP VIEW IF EXISTS v_saldo_componenti;

-- ── 2. Aggiunge colonna segno ─────────────────────────────────────────────────
ALTER TABLE movimenti
  ADD COLUMN IF NOT EXISTS segno SMALLINT NOT NULL DEFAULT 1
  CHECK (segno IN (1, -1));

-- ── 3. Imposta segno dai vecchi tipi ──────────────────────────────────────────
UPDATE movimenti SET segno = -1 WHERE tipo = 'Rimborso';
UPDATE movimenti SET segno =  1 WHERE tipo IN ('Versamento','Conguaglio','Rettifica');

-- ── 4. Forza tutti a tipo Versamento ─────────────────────────────────────────
UPDATE movimenti SET tipo = 'Versamento';

-- ── 5. Ricrea enum mov_tipo con solo Versamento ───────────────────────────────
ALTER TABLE movimenti ALTER COLUMN tipo TYPE TEXT;
DROP TYPE IF EXISTS mov_tipo CASCADE;
CREATE TYPE mov_tipo AS ENUM ('Versamento');
ALTER TABLE movimenti ALTER COLUMN tipo TYPE mov_tipo USING tipo::mov_tipo;
ALTER TABLE movimenti ALTER COLUMN tipo SET DEFAULT 'Versamento';

-- ── 6. Ricrea v_saldo_componenti con segno ────────────────────────────────────
CREATE VIEW v_saldo_componenti AS
SELECT
  c.id                                        AS componente_id,
  c.appartamento_id,
  a.nome                                      AS appartamento,
  (c.nome || ' ' || COALESCE(c.cognome, '')) AS componente,
  c.percentuale,
  c.quota_mensile,
  c.validita_da                               AS comp_validita_da,
  c.validita_a                                AS comp_validita_a,
  COALESCE(SUM(m.importo * m.segno), 0)       AS versato_totale
FROM componenti c
JOIN appartamenti a ON a.id = c.appartamento_id
LEFT JOIN movimenti m
       ON m.componente_id = c.id
      AND (c.validita_da IS NULL OR m.validita_a  IS NULL OR m.validita_a  >= c.validita_da)
      AND (c.validita_a  IS NULL OR m.validita_da IS NULL OR m.validita_da <= COALESCE(c.validita_a, CURRENT_DATE))
WHERE c.attivo = TRUE
GROUP BY c.id, c.appartamento_id, a.nome, c.nome, c.cognome,
         c.percentuale, c.quota_mensile, c.validita_da, c.validita_a;

-- ── 7. Ricrea v_movimenti_dettaglio con campo segno e importo_netto ───────────
CREATE VIEW v_movimenti_dettaglio AS
SELECT
  m.id, m.appartamento_id, m.componente_id,
  m.tipo, m.segno, m.periodicita,
  m.importo,
  (m.importo * m.segno)                       AS importo_netto,
  m.validita_da, m.validita_a,
  m.descrizione, m.created_at, m.updated_at,
  a.nome                                      AS appartamento_nome,
  (c.nome || ' ' || COALESCE(c.cognome, '')) AS componente_nome,
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

-- ── 8. Tipo enum per modalità regole ─────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE regola_modalita AS ENUM ('escludi', 'includi');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 9. Aggiunge colonna modalita a regole_riparto ────────────────────────────
ALTER TABLE regole_riparto
  ADD COLUMN IF NOT EXISTS modalita regola_modalita NOT NULL DEFAULT 'escludi';

-- ── 10. Crea tabella inclusi ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regole_riparto_inclusi (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regola_id     UUID NOT NULL REFERENCES regole_riparto(id) ON DELETE CASCADE,
  componente_id UUID NOT NULL REFERENCES componenti(id)     ON DELETE CASCADE,
  CONSTRAINT regole_inclusi_uq UNIQUE (regola_id, componente_id)
);

CREATE INDEX IF NOT EXISTS idx_regole_inclusi_regola
  ON regole_riparto_inclusi(regola_id);

COMMIT;

SELECT 'Migrazione 007 completata — ' || NOW()::TEXT AS esito;
