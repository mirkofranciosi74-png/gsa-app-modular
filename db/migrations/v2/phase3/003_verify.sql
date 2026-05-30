-- ============================================================
-- FASE 3 — RUOLO PERSONA: Verifica
-- ============================================================

-- 1. Conteggi
SELECT
  (SELECT COUNT(*) FROM componenti)                         AS legacy_componenti,
  (SELECT COUNT(*) FROM appartamento_proprietari)           AS legacy_assoc_prop,
  (SELECT COUNT(*) FROM v2.ruolo_persona WHERE ruolo='inquilino')   AS v2_inquilini,
  (SELECT COUNT(*) FROM v2.ruolo_persona WHERE ruolo='proprietario') AS v2_proprietari,
  (SELECT COUNT(*) FROM componenti) =
    (SELECT COUNT(*) FROM v2.ruolo_persona WHERE ruolo='inquilino')  AS inquilini_ok,
  (SELECT COUNT(*) FROM appartamento_proprietari) =
    (SELECT COUNT(*) FROM v2.ruolo_persona WHERE ruolo='proprietario') AS proprietari_ok;

-- 2. Componenti senza ruolo_persona
SELECT c.id, c.nome FROM componenti c
WHERE NOT EXISTS (
  SELECT 1 FROM v2.ruolo_persona rp WHERE rp.legacy_id = c.id AND rp.ruolo = 'inquilino'
);

-- 3. Associazioni proprietario senza ruolo_persona
SELECT ap.id FROM appartamento_proprietari ap
WHERE NOT EXISTS (
  SELECT 1 FROM v2.ruolo_persona rp WHERE rp.legacy_id = ap.id AND rp.ruolo = 'proprietario'
);

-- 4. Verifica quote proprietari per immobile e periodo
-- Per ogni immobile, la somma delle quote dei proprietari attivi deve essere 100
WITH quote_per_periodo AS (
  SELECT
    rp.immobile_id,
    i.nome                      AS immobile,
    rp.validita_da,
    rp.validita_a,
    SUM(rp.quota)               AS totale_quota,
    COUNT(*)                    AS n_proprietari
  FROM v2.ruolo_persona rp
  JOIN v2.immobile i ON i.id = rp.immobile_id
  WHERE rp.ruolo = 'proprietario'
  GROUP BY rp.immobile_id, i.nome, rp.validita_da, rp.validita_a
)
SELECT * FROM quote_per_periodo WHERE ABS(totale_quota - 100) > 0.01;

-- 5. Summary
SELECT
  'PHASE 3 — RUOLO PERSONA' AS fase,
  CASE
    WHEN
      (SELECT COUNT(*) FROM componenti) =
        (SELECT COUNT(*) FROM v2.ruolo_persona WHERE ruolo='inquilino')
      AND
      (SELECT COUNT(*) FROM appartamento_proprietari) =
        (SELECT COUNT(*) FROM v2.ruolo_persona WHERE ruolo='proprietario')
    THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS risultato;
