-- ============================================================
-- FASE 2 — CONDOMINIO + IMMOBILE: Verifica
-- ============================================================

-- 1. Ogni appartamento ha esattamente un immobile
SELECT
  (SELECT COUNT(*) FROM appartamenti)   AS legacy_appartamenti,
  (SELECT COUNT(*) FROM v2.immobile)    AS v2_immobili,
  (SELECT COUNT(*) FROM v2.condominio)  AS v2_condomini,
  (SELECT COUNT(*) FROM appartamenti) =
    (SELECT COUNT(*) FROM v2.immobile)  AS conteggio_ok;

-- 2. Immobili senza condominio
SELECT i.id, i.nome FROM v2.immobile i WHERE i.condominio_id IS NULL;

-- 3. Appartamenti senza immobile corrispondente
SELECT a.id, a.nome
FROM appartamenti a
WHERE NOT EXISTS (SELECT 1 FROM v2.immobile i WHERE i.legacy_id = a.id);

-- 4. Immobili senza legacy_id (creati fuori dalla migrazione)
SELECT i.id, i.nome FROM v2.immobile i WHERE i.legacy_id IS NULL;

-- 5. Summary pass/fail
SELECT
  'PHASE 2 — CONDOMINIO+IMMOBILE' AS fase,
  CASE
    WHEN
      (SELECT COUNT(*) FROM appartamenti) = (SELECT COUNT(*) FROM v2.immobile)
      AND (SELECT COUNT(*) FROM v2.immobile WHERE condominio_id IS NULL) = 0
      AND (SELECT COUNT(*) FROM appartamenti a WHERE NOT EXISTS (
            SELECT 1 FROM v2.immobile i WHERE i.legacy_id = a.id)) = 0
    THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS risultato;
