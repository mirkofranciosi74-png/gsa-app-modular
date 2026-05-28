-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 10.2 — Migra tipi_versamento → tipi_spesa (tipo_movimento='entrata')
--
-- Riusa gli stessi UUID per garantire portabilità futura.
-- Aggiorna poi fatto_economico per collegare tipo_spesa_id ai fatti
-- migrati da movimenti.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Inserisce i tipi_versamento in tipi_spesa come tipologie di entrata
--    • stessa UUID → portabilità
--    • 'altro' rinominato 'altro versamento' per evitare conflitto con
--      'altro' già presente come tipo spesa
--    • ON CONFLICT (id) DO UPDATE → idempotente (rieseguibile)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO tipi_spesa (id, descrizione, tipo_movimento, categoria, riparto, attivo, codice, note)
SELECT
  tv.id,
  CASE LOWER(tv.nome)
    WHEN 'altro' THEN 'altro versamento'
    ELSE tv.nome
  END                                                 AS descrizione,
  'entrata'                                           AS tipo_movimento,
  'Versamento'                                        AS categoria,
  'Percentuale'                                       AS riparto,   -- default richiesto NOT NULL
  tv.attivo,
  'tv_' || SUBSTRING(tv.id::text, 1, 8)              AS codice,
  'colore-legacy: ' || COALESCE(tv.colore, 'n/a')    AS note
FROM tipi_versamento tv
ON CONFLICT (id) DO UPDATE
  SET tipo_movimento = 'entrata',
      categoria      = 'Versamento',
      codice         = EXCLUDED.codice
  WHERE tipi_spesa.tipo_movimento IS DISTINCT FROM 'entrata';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Aggiorna fatto_economico (migrati da movimenti) con il tipo_spesa_id
--    corretto, usando la mappatura:
--      movimenti.tipo_versamento → tipi_versamento.nome → tipi_spesa.id
--    Gestisce il caso 'entrata b&b' → nome 'b&b'
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE v2.fatto_economico fe
SET tipo_spesa_id = tv.id
FROM movimenti m
JOIN tipi_versamento tv
  ON LOWER(TRIM(tv.nome)) = LOWER(TRIM(
       CASE m.tipo_versamento
         WHEN 'entrata b&b' THEN 'b&b'
         ELSE m.tipo_versamento
       END
     ))
WHERE fe.legacy_id   = m.id
  AND fe.legacy_tipo = 'movimento'
  AND fe.tipo_spesa_id IS NULL
  AND m.tipo_versamento IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Report
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM tipi_spesa WHERE tipo_movimento = 'entrata')
    AS tipologie_entrata_totali,
  (SELECT COUNT(*) FROM v2.fatto_economico
   WHERE tipo = 'entrata' AND tipo_spesa_id IS NOT NULL)
    AS fatti_entrata_con_tipo,
  (SELECT COUNT(*) FROM v2.fatto_economico
   WHERE tipo = 'entrata' AND tipo_spesa_id IS NULL)
    AS fatti_entrata_senza_tipo;
