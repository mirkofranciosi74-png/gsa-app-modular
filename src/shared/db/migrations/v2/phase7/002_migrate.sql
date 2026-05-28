-- ============================================================
-- FASE 7 — REGOLA RIPARTO v2: Migrazione dati
-- Migra regole_riparto legacy come regole di primo livello v2.
-- ============================================================

BEGIN;

-- ── Step 1: regole_riparto → v2.regola_riparto ───────────────────────────────
INSERT INTO v2.regola_riparto
  (immobile_id, tipo_spesa_id, target, modalita, quota_totale_pct, split_uguale,
   tipo_versamento, validita_da, validita_a, descrizione, legacy_id)
SELECT
  i.id,
  rr.tipo_spesa_id,
  rr.target,
  rr.modalita::TEXT,
  rr.quota_totale_pct,
  rr.split_uguale,
  rr.tipo_versamento,
  rr.validita_da,
  rr.validita_a,
  rr.descrizione,
  rr.id
FROM regole_riparto rr
JOIN v2.immobile i ON i.legacy_id = rr.appartamento_id
WHERE NOT EXISTS (
  SELECT 1 FROM v2.regola_riparto vrr WHERE vrr.legacy_id = rr.id
);

-- ── Step 2: regole_riparto_esclusi → v2.regola_riparto_dettaglio ─────────────
INSERT INTO v2.regola_riparto_dettaglio (regola_id, persona_id, includi)
SELECT
  vrr.id,
  pl.persona_id,
  FALSE                   -- esclusi → includi=FALSE
FROM regole_riparto_esclusi ree
JOIN v2.regola_riparto vrr ON vrr.legacy_id = ree.regola_id
JOIN v2.persona_legacy pl ON pl.legacy_tipo='componente' AND pl.legacy_id = ree.componente_id
WHERE NOT EXISTS (
  SELECT 1 FROM v2.regola_riparto_dettaglio rrd
  WHERE rrd.regola_id=vrr.id AND rrd.persona_id=pl.persona_id
);

-- ── Step 3: regole_riparto_inclusi → v2.regola_riparto_dettaglio ─────────────
INSERT INTO v2.regola_riparto_dettaglio (regola_id, persona_id, includi)
SELECT
  vrr.id,
  pl.persona_id,
  TRUE
FROM regole_riparto_inclusi rei
JOIN v2.regola_riparto vrr ON vrr.legacy_id = rei.regola_id
JOIN v2.persona_legacy pl ON pl.legacy_tipo='componente' AND pl.legacy_id = rei.componente_id
WHERE NOT EXISTS (
  SELECT 1 FROM v2.regola_riparto_dettaglio rrd
  WHERE rrd.regola_id=vrr.id AND rrd.persona_id=pl.persona_id
);

-- ── Step 4: proprietari inclusi con percentuale ───────────────────────────────
INSERT INTO v2.regola_riparto_dettaglio (regola_id, persona_id, includi, percentuale)
SELECT
  vrr.id,
  pl.persona_id,
  TRUE,
  rip.percentuale
FROM regole_riparto_inclusi_prop rip
JOIN v2.regola_riparto vrr ON vrr.legacy_id = rip.regola_id
JOIN v2.persona_legacy pl ON pl.legacy_tipo='proprietario' AND pl.legacy_id = rip.proprietario_id
WHERE NOT EXISTS (
  SELECT 1 FROM v2.regola_riparto_dettaglio rrd
  WHERE rrd.regola_id=vrr.id AND rrd.persona_id=pl.persona_id
);

INSERT INTO v2._phase_log (phase, step, note)
VALUES ('phase7', 'migrate', 'regole_riparto e dettagli migrati in v2')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW();

COMMIT;

SELECT 'Phase 7 migrazione completata — ' || NOW()::TEXT AS esito;
