-- ============================================================
-- FASE 6 — DOCUMENTALE: Verifica
-- ============================================================

-- 1. Conteggi
SELECT
  (SELECT COUNT(*) FROM archivio_documenti) AS legacy_archivio,
  (SELECT COUNT(*) FROM documenti WHERE nome_file IS NOT NULL) AS legacy_spese,
  (SELECT COUNT(*) FROM v2.documento WHERE legacy_tipo='archivio') AS v2_archivio,
  (SELECT COUNT(*) FROM v2.documento WHERE legacy_tipo='spesa')    AS v2_spese,
  (SELECT COUNT(*) FROM v2.documento_link) AS v2_links;

-- 2. Hash invariance: documenti v2 con hash diverso dal legacy
SELECT vd.id, vd.nome_file, vd.file_hash AS v2_hash, ad.file_hash AS legacy_hash
FROM v2.documento vd
JOIN archivio_documenti ad ON ad.id = vd.legacy_id
WHERE vd.legacy_tipo='archivio'
  AND vd.file_hash IS NOT NULL AND ad.file_hash IS NOT NULL
  AND vd.file_hash != ad.file_hash;

-- 3. Documenti senza nessun link
SELECT vd.id, vd.nome_file
FROM v2.documento vd
WHERE NOT EXISTS (SELECT 1 FROM v2.documento_link dl WHERE dl.documento_id = vd.id);

-- 4. Archivio legacy non migrato
SELECT ad.id, ad.nome_file FROM archivio_documenti ad
WHERE NOT EXISTS (SELECT 1 FROM v2.documento vd WHERE vd.legacy_tipo='archivio' AND vd.legacy_id=ad.id);

-- 5. Summary
SELECT
  'PHASE 6 — DOCUMENTALE' AS fase,
  CASE
    WHEN
      (SELECT COUNT(*) FROM archivio_documenti) =
        (SELECT COUNT(*) FROM v2.documento WHERE legacy_tipo='archivio')
    THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS risultato;
