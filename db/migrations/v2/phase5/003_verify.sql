-- ============================================================
-- FASE 5 — PAGAMENTO: Verifica
-- ============================================================

-- 1. Conteggi
SELECT
  (SELECT COUNT(*) FROM movimenti)  AS legacy_movimenti,
  (SELECT COUNT(*) FROM v2.pagamento) AS v2_pagamenti,
  (SELECT COUNT(*) FROM movimenti) =
    (SELECT COUNT(*) FROM v2.pagamento) AS conteggio_ok;

-- 2. Totali versati per persona: legacy vs v2
SELECT
  (c.nome || ' ' || COALESCE(c.cognome,'')) AS componente,
  SUM(m.importo * m.segno)                   AS legacy_netto,
  COALESCE((
    SELECT SUM(p.importo * p.segno)
    FROM v2.pagamento p
    JOIN v2.persona_legacy pl ON pl.persona_id = p.persona_id
    WHERE pl.legacy_tipo = 'componente' AND pl.legacy_id = c.id
  ), 0)                                       AS v2_netto,
  ABS(SUM(m.importo * m.segno) - COALESCE((
    SELECT SUM(p.importo * p.segno)
    FROM v2.pagamento p
    JOIN v2.persona_legacy pl ON pl.persona_id = p.persona_id
    WHERE pl.legacy_tipo = 'componente' AND pl.legacy_id = c.id
  ), 0)) > 0.01                               AS scostamento
FROM componenti c
JOIN movimenti m ON m.componente_id = c.id
GROUP BY c.id, c.nome, c.cognome
HAVING ABS(SUM(m.importo * m.segno) - COALESCE((
  SELECT SUM(p.importo * p.segno)
  FROM v2.pagamento p
  JOIN v2.persona_legacy pl ON pl.persona_id = p.persona_id
  WHERE pl.legacy_tipo = 'componente' AND pl.legacy_id = c.id
), 0)) > 0.01;

-- 3. Pagamenti senza fatto_id
SELECT COUNT(*) AS pagamenti_orfani FROM v2.pagamento WHERE fatto_id IS NULL;

-- 4. Summary
SELECT
  'PHASE 5 — PAGAMENTO' AS fase,
  CASE
    WHEN (SELECT COUNT(*) FROM movimenti) =
         (SELECT COUNT(*) FROM v2.pagamento)
    THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS risultato;
