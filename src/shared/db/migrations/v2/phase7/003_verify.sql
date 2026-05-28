-- ============================================================
-- FASE 7 — REGOLA RIPARTO v2: Verifica
-- ============================================================

-- 1. Conteggi
SELECT
  (SELECT COUNT(*) FROM regole_riparto)              AS legacy_regole,
  (SELECT COUNT(*) FROM v2.regola_riparto)           AS v2_regole,
  (SELECT COUNT(*) FROM regole_riparto_esclusi
    + SELECT COUNT(*) FROM regole_riparto_inclusi
    + SELECT COUNT(*) FROM regole_riparto_inclusi_prop) AS legacy_dettagli,
  (SELECT COUNT(*) FROM v2.regola_riparto_dettaglio) AS v2_dettagli,
  (SELECT COUNT(*) FROM regole_riparto) =
    (SELECT COUNT(*) FROM v2.regola_riparto) AS regole_ok;

-- 2. Regole legacy senza corrispondenza v2
SELECT rr.id, rr.appartamento_id
FROM regole_riparto rr
WHERE NOT EXISTS (SELECT 1 FROM v2.regola_riparto vrr WHERE vrr.legacy_id = rr.id);

-- 3. Regole v2 senza immobile (FK anomalie)
SELECT vrr.id FROM v2.regola_riparto vrr WHERE vrr.immobile_id IS NULL;

-- 4. Summary
SELECT
  'PHASE 7 — REGOLA RIPARTO' AS fase,
  CASE
    WHEN (SELECT COUNT(*) FROM regole_riparto) =
         (SELECT COUNT(*) FROM v2.regola_riparto)
    THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS risultato;
