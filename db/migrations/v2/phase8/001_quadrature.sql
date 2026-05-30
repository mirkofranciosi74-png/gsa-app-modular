-- ============================================================
-- FASE 8 — QUADRATURE FINALI
-- Report di confronto completo legacy vs v2.
-- Eseguire dopo tutte le fasi precedenti.
-- Scostamento ammesso: 0 (ogni differenza deve essere spiegata).
-- ============================================================

-- ── 1. QUADRATURA ENTITÀ ─────────────────────────────────────────────────────
SELECT 'ENTITA' AS sezione, entity, legacy_count, v2_count,
       legacy_count = v2_count AS ok
FROM (
  VALUES
    ('appartamenti / immobili',
     (SELECT COUNT(*) FROM appartamenti)::BIGINT,
     (SELECT COUNT(*) FROM v2.immobile)::BIGINT),
    ('proprietari / persona_legacy[prop]',
     (SELECT COUNT(*) FROM proprietari)::BIGINT,
     (SELECT COUNT(*) FROM v2.persona_legacy WHERE legacy_tipo='proprietario')::BIGINT),
    ('componenti / persona_legacy[comp]',
     (SELECT COUNT(*) FROM componenti)::BIGINT,
     (SELECT COUNT(*) FROM v2.persona_legacy WHERE legacy_tipo='componente')::BIGINT),
    ('movimenti / fatto_economico[mov]',
     (SELECT COUNT(*) FROM movimenti)::BIGINT,
     (SELECT COUNT(*) FROM v2.fatto_economico WHERE legacy_tipo='movimento')::BIGINT),
    ('spese_proprietari / fatto_economico[sp]',
     (SELECT COUNT(*) FROM spese_proprietari)::BIGINT,
     (SELECT COUNT(*) FROM v2.fatto_economico WHERE legacy_tipo='spesa_proprietario')::BIGINT),
    ('regole_riparto',
     (SELECT COUNT(*) FROM regole_riparto)::BIGINT,
     (SELECT COUNT(*) FROM v2.regola_riparto)::BIGINT),
    ('archivio_documenti / documento[arch]',
     (SELECT COUNT(*) FROM archivio_documenti)::BIGINT,
     (SELECT COUNT(*) FROM v2.documento WHERE legacy_tipo='archivio')::BIGINT)
) t(entity, legacy_count, v2_count);

-- ── 2. QUADRATURA ECONOMICA PER IMMOBILE ────────────────────────────────────
SELECT
  i.nome                                               AS immobile,
  -- Spese inquilini
  COALESCE(SUM(CASE WHEN d.stato='elaborato' THEN d.importo END),0)  AS leg_spese_doc,
  COALESCE(SUM(CASE WHEN fe.legacy_tipo='documento'
               THEN fe.importo END),0)                              AS v2_spese_doc,
  -- Spese proprietari
  COALESCE(SUM(sp.importo),0)                                       AS leg_spese_prop,
  COALESCE(SUM(CASE WHEN fe.legacy_tipo='spesa_proprietario'
               THEN fe.importo END),0)                              AS v2_spese_prop,
  -- Versamenti netti
  COALESCE(SUM(m.importo * m.segno),0)                              AS leg_versamenti,
  COALESCE(SUM(CASE WHEN fe.legacy_tipo='movimento'
               THEN fe.importo * fe.segno END),0)                   AS v2_versamenti,
  -- Scostamenti
  ABS(COALESCE(SUM(CASE WHEN d.stato='elaborato' THEN d.importo END),0) -
      COALESCE(SUM(CASE WHEN fe.legacy_tipo='documento' THEN fe.importo END),0)) AS delta_spese_doc,
  ABS(COALESCE(SUM(sp.importo),0) -
      COALESCE(SUM(CASE WHEN fe.legacy_tipo='spesa_proprietario' THEN fe.importo END),0)) AS delta_spese_prop,
  ABS(COALESCE(SUM(m.importo * m.segno),0) -
      COALESCE(SUM(CASE WHEN fe.legacy_tipo='movimento' THEN fe.importo * fe.segno END),0)) AS delta_versamenti
FROM v2.immobile i
LEFT JOIN documenti          d  ON d.appartamento_id  = i.legacy_id
LEFT JOIN spese_proprietari  sp ON sp.appartamento_id = i.legacy_id
LEFT JOIN movimenti          m  ON m.appartamento_id  = i.legacy_id
LEFT JOIN v2.fatto_economico fe ON fe.immobile_id = i.id
GROUP BY i.id, i.nome
ORDER BY i.nome;

-- ── 3. QUADRATURA PER PERSONA ────────────────────────────────────────────────
SELECT
  (p.nome || ' ' || COALESCE(p.cognome,''))            AS persona,
  -- Legacy: componente versamenti
  COALESCE((
    SELECT SUM(m.importo * m.segno)
    FROM movimenti m
    JOIN v2.persona_legacy pl2 ON pl2.legacy_tipo='componente' AND pl2.legacy_id=m.componente_id
    WHERE pl2.persona_id = p.id
  ), 0)                                                AS leg_versamenti,
  -- v2: pagamenti
  COALESCE((
    SELECT SUM(pg.importo * pg.segno)
    FROM v2.pagamento pg
    WHERE pg.persona_id = p.id
  ), 0)                                                AS v2_pagamenti,
  -- scostamento
  ABS(COALESCE((
    SELECT SUM(m.importo * m.segno)
    FROM movimenti m
    JOIN v2.persona_legacy pl2 ON pl2.legacy_tipo='componente' AND pl2.legacy_id=m.componente_id
    WHERE pl2.persona_id = p.id
  ), 0) - COALESCE((
    SELECT SUM(pg.importo * pg.segno) FROM v2.pagamento pg WHERE pg.persona_id = p.id
  ), 0))                                               AS delta
FROM v2.persona p
WHERE EXISTS (
  SELECT 1 FROM v2.persona_legacy pl WHERE pl.persona_id=p.id AND pl.legacy_tipo='componente'
)
HAVING ABS(COALESCE((
  SELECT SUM(m.importo * m.segno)
  FROM movimenti m
  JOIN v2.persona_legacy pl2 ON pl2.legacy_tipo='componente' AND pl2.legacy_id=m.componente_id
  WHERE pl2.persona_id = p.id
), 0) - COALESCE((
  SELECT SUM(pg.importo * pg.segno) FROM v2.pagamento pg WHERE pg.persona_id = p.id
), 0)) > 0.01
ORDER BY delta DESC;

-- ── 4. RIEPILOGO PASS/FAIL TUTTE LE FASI ────────────────────────────────────
SELECT phase, step, applied_at, note
FROM v2._phase_log
ORDER BY phase, step;

SELECT
  'QUADRATURA FINALE' AS titolo,
  CASE
    WHEN
      -- entità
      (SELECT COUNT(*) FROM appartamenti) = (SELECT COUNT(*) FROM v2.immobile)
      AND (SELECT COUNT(*) FROM proprietari) = (SELECT COUNT(*) FROM v2.persona_legacy WHERE legacy_tipo='proprietario')
      AND (SELECT COUNT(*) FROM componenti) = (SELECT COUNT(*) FROM v2.persona_legacy WHERE legacy_tipo='componente')
      AND (SELECT COUNT(*) FROM movimenti) = (SELECT COUNT(*) FROM v2.fatto_economico WHERE legacy_tipo='movimento')
      AND (SELECT COUNT(*) FROM spese_proprietari) = (SELECT COUNT(*) FROM v2.fatto_economico WHERE legacy_tipo='spesa_proprietario')
      AND (SELECT COUNT(*) FROM regole_riparto) = (SELECT COUNT(*) FROM v2.regola_riparto)
      AND (SELECT COUNT(*) FROM archivio_documenti) = (SELECT COUNT(*) FROM v2.documento WHERE legacy_tipo='archivio')
      -- scostamenti economici = 0
      AND NOT EXISTS (
        SELECT 1
        FROM v2.immobile i
        LEFT JOIN movimenti m ON m.appartamento_id = i.legacy_id
        LEFT JOIN v2.fatto_economico fe ON fe.immobile_id = i.id AND fe.legacy_tipo='movimento'
        GROUP BY i.id
        HAVING ABS(COALESCE(SUM(m.importo * m.segno),0) -
                   COALESCE(SUM(CASE WHEN fe.legacy_tipo='movimento' THEN fe.importo * fe.segno END),0)) > 0.01
      )
    THEN '✅ TUTTE LE QUADRATURE PASSATE'
    ELSE '❌ ANOMALIE RILEVATE — controllare report precedenti'
  END AS risultato;
