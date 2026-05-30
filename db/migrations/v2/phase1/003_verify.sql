-- ============================================================
-- FASE 1 — PERSONA: Verifica e quadratura
-- Eseguire dopo 002_migrate.sql.
-- Ogni risultato DEVE mostrare ok=TRUE o scostamento=0.
-- ============================================================

-- ── 1. Conteggi legacy vs v2 ──────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM proprietari)                                   AS legacy_proprietari,
  (SELECT COUNT(*) FROM componenti)                                    AS legacy_componenti,
  (SELECT COUNT(*) FROM v2.persona_legacy WHERE legacy_tipo='proprietario') AS migrati_proprietari,
  (SELECT COUNT(*) FROM v2.persona_legacy WHERE legacy_tipo='componente')   AS migrati_componenti,
  (SELECT COUNT(*) FROM v2.persona)                                    AS persone_totali,
  -- invarianti
  (SELECT COUNT(*) FROM proprietari) =
    (SELECT COUNT(*) FROM v2.persona_legacy WHERE legacy_tipo='proprietario')  AS proprietari_ok,
  (SELECT COUNT(*) FROM componenti) =
    (SELECT COUNT(*) FROM v2.persona_legacy WHERE legacy_tipo='componente')    AS componenti_ok;

-- ── 2. Legacy ID senza corrispondenza in v2 ───────────────────────────────────
SELECT 'proprietario_orfano' AS tipo, p.id AS legacy_id, p.nome, p.email
FROM proprietari p
WHERE NOT EXISTS (
  SELECT 1 FROM v2.persona_legacy pl WHERE pl.legacy_tipo='proprietario' AND pl.legacy_id=p.id
)
UNION ALL
SELECT 'componente_orfano', c.id, c.nome, c.email
FROM componenti c
WHERE NOT EXISTS (
  SELECT 1 FROM v2.persona_legacy pl WHERE pl.legacy_tipo='componente' AND pl.legacy_id=c.id
);

-- ── 3. Persona_legacy con persona mancante (integrità FK) ─────────────────────
SELECT pl.legacy_tipo, pl.legacy_id
FROM v2.persona_legacy pl
WHERE NOT EXISTS (SELECT 1 FROM v2.persona p WHERE p.id = pl.persona_id);

-- ── 4. Report deduplicazione: persone con più legacy_id ───────────────────────
SELECT
  p.id,
  p.nome,
  p.cognome,
  p.email,
  COUNT(pl.legacy_id)                          AS n_legacy,
  STRING_AGG(pl.legacy_tipo, ', ' ORDER BY pl.legacy_tipo) AS tipi
FROM v2.persona p
JOIN v2.persona_legacy pl ON pl.persona_id = p.id
GROUP BY p.id, p.nome, p.cognome, p.email
HAVING COUNT(pl.legacy_id) > 1
ORDER BY n_legacy DESC, p.nome;

-- ── 5. Collisioni email (più persone con stessa email in v2) ──────────────────
SELECT email, COUNT(*) AS n_persone
FROM v2.persona
WHERE email IS NOT NULL
GROUP BY email
HAVING COUNT(*) > 1;

-- ── 6. Summary pass/fail ──────────────────────────────────────────────────────
SELECT
  'PHASE 1 — PERSONA' AS fase,
  CASE
    WHEN
      (SELECT COUNT(*) FROM proprietari) =
        (SELECT COUNT(*) FROM v2.persona_legacy WHERE legacy_tipo='proprietario')
      AND
      (SELECT COUNT(*) FROM componenti) =
        (SELECT COUNT(*) FROM v2.persona_legacy WHERE legacy_tipo='componente')
      AND
      (SELECT COUNT(*) FROM proprietari p WHERE NOT EXISTS (
        SELECT 1 FROM v2.persona_legacy pl WHERE pl.legacy_tipo='proprietario' AND pl.legacy_id=p.id
      )) = 0
      AND
      (SELECT COUNT(*) FROM componenti c WHERE NOT EXISTS (
        SELECT 1 FROM v2.persona_legacy pl WHERE pl.legacy_tipo='componente' AND pl.legacy_id=c.id
      )) = 0
    THEN '✅ PASS'
    ELSE '❌ FAIL — controllare query precedenti'
  END AS risultato;
