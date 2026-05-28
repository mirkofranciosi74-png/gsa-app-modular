-- ============================================================
-- FASE 4 — FATTO ECONOMICO: Verifica e quadratura
-- ============================================================

-- 1. Conteggi per tipo legacy
SELECT
  legacy_tipo,
  COUNT(*) AS n_migrati
FROM v2.fatto_economico
GROUP BY legacy_tipo
UNION ALL
SELECT 'LEGACY documenti (con importo)',   COUNT(*) FROM documenti WHERE importo IS NOT NULL
UNION ALL
SELECT 'LEGACY movimenti',                 COUNT(*) FROM movimenti
UNION ALL
SELECT 'LEGACY spese_proprietari',         COUNT(*) FROM spese_proprietari
ORDER BY 1;

-- 2. Confronto totali per immobile
SELECT
  i.nome                                                AS immobile,
  -- Legacy
  COALESCE(SUM(CASE WHEN d.stato='elaborato' THEN d.importo END), 0) AS legacy_spese_doc,
  COALESCE(SUM(sp.importo), 0)                          AS legacy_spese_prop,
  COALESCE(SUM(m.importo * m.segno), 0)                 AS legacy_versamenti_netti,
  -- v2
  COALESCE(SUM(CASE WHEN fe.tipo='spesa' AND fe.legacy_tipo='documento'
                    THEN fe.importo END), 0)             AS v2_spese_doc,
  COALESCE(SUM(CASE WHEN fe.tipo='spesa' AND fe.legacy_tipo='spesa_proprietario'
                    THEN fe.importo END), 0)             AS v2_spese_prop,
  COALESCE(SUM(CASE WHEN fe.tipo='entrata'
                    THEN fe.importo * fe.segno END), 0)  AS v2_entrate_nette
FROM v2.immobile i
LEFT JOIN documenti         d  ON d.appartamento_id  = i.legacy_id
LEFT JOIN spese_proprietari sp ON sp.appartamento_id = i.legacy_id
LEFT JOIN movimenti         m  ON m.appartamento_id  = i.legacy_id
LEFT JOIN v2.fatto_economico fe ON fe.immobile_id = i.id
GROUP BY i.id, i.nome
ORDER BY i.nome;

-- 3. Fatti economici con immobile NULL (anomalie)
SELECT COUNT(*) AS fe_senza_immobile FROM v2.fatto_economico WHERE immobile_id IS NULL;

-- 4. Documenti non migrati
SELECT d.id, d.importo FROM documenti d
WHERE d.importo IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM v2.fatto_economico fe WHERE fe.legacy_tipo='documento' AND fe.legacy_id=d.id
  );

-- 5. Summary
SELECT
  'PHASE 4 — FATTO ECONOMICO' AS fase,
  CASE
    WHEN
      (SELECT COUNT(*) FROM documenti WHERE importo IS NOT NULL) =
        (SELECT COUNT(*) FROM v2.fatto_economico WHERE legacy_tipo='documento')
      AND
      (SELECT COUNT(*) FROM movimenti) =
        (SELECT COUNT(*) FROM v2.fatto_economico WHERE legacy_tipo='movimento')
      AND
      (SELECT COUNT(*) FROM spese_proprietari) =
        (SELECT COUNT(*) FROM v2.fatto_economico WHERE legacy_tipo='spesa_proprietario')
    THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS risultato;
