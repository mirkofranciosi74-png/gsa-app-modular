-- ============================================================
-- Migrazione 006 — v_saldo_componenti include tutti i tipi
--                  di movimento con il segno corretto
--
-- Prima: SUM(importo) WHERE tipo='Versamento'
-- Dopo:  SUM con segno: Versamento/Conguaglio/Rettifica=+1, Rimborso=-1
--
-- Esecuzione:
--   psql -h localhost -U gsa_user -d gsa_db \
--     -f src/db/migrations/006_saldo_tutti_movimenti.sql
-- ============================================================

BEGIN;

DROP VIEW IF EXISTS v_saldo_componenti;

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
  -- Somma con segno: Rimborso sottrae, tutti gli altri aggiungono
  COALESCE(
    SUM(
      m.importo * CASE m.tipo
        WHEN 'Rimborso' THEN -1
        ELSE 1                -- Versamento, Conguaglio, Rettifica
      END
    ),
    0
  ) AS versato_totale
FROM componenti c
JOIN appartamenti a ON a.id = c.appartamento_id
LEFT JOIN movimenti m
       ON m.componente_id = c.id
      -- Compatibilità periodo: il movimento deve sovrapporsi alla validità del componente
      AND (c.validita_da IS NULL OR m.validita_a  IS NULL OR m.validita_a  >= c.validita_da)
      AND (c.validita_a  IS NULL OR m.validita_da IS NULL OR m.validita_da <= COALESCE(c.validita_a, CURRENT_DATE))
WHERE c.attivo = TRUE
GROUP BY
  c.id, c.appartamento_id, a.nome,
  c.nome, c.cognome, c.percentuale, c.quota_mensile,
  c.validita_da, c.validita_a;

COMMIT;

SELECT 'Migrazione 006 completata — ' || NOW()::TEXT AS esito;
