-- ============================================================
-- FASE 6 — DOCUMENTALE DISACCOPPIATO: Migrazione dati
-- ============================================================

BEGIN;

-- ── Step 1: archivio_documenti → v2.documento ────────────────────────────────
INSERT INTO v2.documento (id, nome_file, file_hash, mime_type, estensione,
                          note, legacy_tipo, legacy_id, created_at)
SELECT
  gen_random_uuid(),
  ad.nome_file,
  ad.file_hash,
  ad.mime_type,
  ad.estensione,
  ad.note,
  'archivio',
  ad.id,
  ad.created_at
FROM archivio_documenti ad
WHERE NOT EXISTS (
  SELECT 1 FROM v2.documento vd WHERE vd.legacy_tipo='archivio' AND vd.legacy_id=ad.id
);

-- ── Step 2: archivio_associazioni → v2.documento_link ────────────────────────
INSERT INTO v2.documento_link (documento_id, entita_tipo, entita_id, ruolo)
SELECT
  vd.id                       AS documento_id,
  CASE aa.entita_tipo
    WHEN 'appartamento' THEN 'immobile'
    WHEN 'inquilino'    THEN 'persona'
    WHEN 'proprietario' THEN 'persona'
    ELSE aa.entita_tipo
  END                         AS entita_tipo,
  CASE aa.entita_tipo
    WHEN 'appartamento' THEN (SELECT i.id FROM v2.immobile i WHERE i.legacy_id = aa.entita_id LIMIT 1)
    WHEN 'inquilino'    THEN (
      SELECT pl.persona_id FROM v2.persona_legacy pl
      WHERE pl.legacy_tipo='componente' AND pl.legacy_id=aa.entita_id LIMIT 1)
    WHEN 'proprietario' THEN (
      SELECT pl.persona_id FROM v2.persona_legacy pl
      WHERE pl.legacy_tipo='proprietario' AND pl.legacy_id=aa.entita_id LIMIT 1)
    ELSE aa.entita_id
  END                         AS entita_id,
  'allegato'                  AS ruolo
FROM archivio_associazioni aa
JOIN v2.documento vd ON vd.legacy_tipo='archivio' AND vd.legacy_id=aa.documento_id
WHERE NOT EXISTS (
  SELECT 1 FROM v2.documento_link dl
  WHERE dl.documento_id = vd.id
    AND dl.entita_id = aa.entita_id
)
AND CASE aa.entita_tipo
  WHEN 'appartamento' THEN (SELECT COUNT(*) FROM v2.immobile i WHERE i.legacy_id = aa.entita_id) > 0
  WHEN 'inquilino'    THEN (SELECT COUNT(*) FROM v2.persona_legacy pl
    WHERE pl.legacy_tipo='componente' AND pl.legacy_id=aa.entita_id) > 0
  WHEN 'proprietario' THEN (SELECT COUNT(*) FROM v2.persona_legacy pl
    WHERE pl.legacy_tipo='proprietario' AND pl.legacy_id=aa.entita_id) > 0
  ELSE TRUE
END;

-- ── Step 3: documenti (spese) → v2.documento + link a fatto_economico ────────
INSERT INTO v2.documento (nome_file, file_hash, legacy_tipo, legacy_id, created_at)
SELECT
  d.nome_file,
  d.file_hash,
  'spesa',
  d.id,
  d.created_at
FROM documenti d
WHERE d.nome_file IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM v2.documento vd WHERE vd.legacy_tipo='spesa' AND vd.legacy_id=d.id
  );

INSERT INTO v2.documento_link (documento_id, entita_tipo, entita_id, ruolo)
SELECT
  vd.id,
  'fatto_economico',
  fe.id,
  'originale'
FROM documenti d
JOIN v2.documento vd ON vd.legacy_tipo='spesa' AND vd.legacy_id=d.id
JOIN v2.fatto_economico fe ON fe.legacy_tipo='documento' AND fe.legacy_id=d.id
WHERE NOT EXISTS (
  SELECT 1 FROM v2.documento_link dl
  WHERE dl.documento_id = vd.id AND dl.entita_tipo='fatto_economico' AND dl.entita_id=fe.id
);

INSERT INTO v2._phase_log (phase, step, note)
VALUES ('phase6', 'migrate',
  'archivio_documenti + documenti migrati in v2.documento con v2.documento_link')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW();

COMMIT;

SELECT 'Phase 6 migrazione completata — ' || NOW()::TEXT AS esito;
