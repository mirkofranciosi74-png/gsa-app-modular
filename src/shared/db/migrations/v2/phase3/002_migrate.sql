-- ============================================================
-- FASE 3 — RUOLO PERSONA: Migrazione dati
-- Dipende da: Phase 1 (persona), Phase 2 (immobile)
-- ============================================================

BEGIN;

-- ── Step 1: Migra componenti → ruolo inquilino ───────────────────────────────
INSERT INTO v2.ruolo_persona
  (persona_id, immobile_id, ruolo, validita_da, validita_a,
   quota, quota_affitto, caparra, legacy_id)
SELECT
  pl.persona_id,
  i.id                  AS immobile_id,
  'inquilino'::v2.ruolo_tipo,
  c.validita_da,
  c.validita_a,
  c.percentuale         AS quota,
  c.quota_affitto,
  c.caparra,
  c.id                  AS legacy_id
FROM componenti c
JOIN v2.persona_legacy pl ON pl.legacy_tipo = 'componente' AND pl.legacy_id = c.id
JOIN v2.immobile i        ON i.legacy_id = c.appartamento_id
WHERE NOT EXISTS (
  SELECT 1 FROM v2.ruolo_persona rp
  WHERE rp.legacy_id = c.id AND rp.ruolo = 'inquilino'
);

-- ── Step 2: Migra appartamento_proprietari → ruolo proprietario ──────────────
INSERT INTO v2.ruolo_persona
  (persona_id, immobile_id, ruolo, validita_da, validita_a,
   quota, default_flag, legacy_id)
SELECT
  pl.persona_id,
  i.id,
  'proprietario'::v2.ruolo_tipo,
  ap.data_inizio        AS validita_da,
  ap.data_fine          AS validita_a,
  ap.percentuale_proprieta AS quota,
  ap.proprietario_default,
  ap.id                 AS legacy_id
FROM appartamento_proprietari ap
JOIN v2.persona_legacy pl ON pl.legacy_tipo = 'proprietario' AND pl.legacy_id = ap.proprietario_id
JOIN v2.immobile i        ON i.legacy_id = ap.appartamento_id
WHERE NOT EXISTS (
  SELECT 1 FROM v2.ruolo_persona rp
  WHERE rp.legacy_id = ap.id AND rp.ruolo = 'proprietario'
);

INSERT INTO v2._phase_log (phase, step, note)
VALUES ('phase3', 'migrate', 'Componenti e appartamento_proprietari migrati in v2.ruolo_persona')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW();

COMMIT;

SELECT 'Phase 3 migrazione completata — ' || NOW()::TEXT AS esito;
