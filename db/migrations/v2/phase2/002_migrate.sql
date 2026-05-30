-- ============================================================
-- FASE 2 — CONDOMINIO + IMMOBILE: Migrazione dati
--
-- Strategia:
--   Per ogni appartamento: crea un condominio "virtuale" (nome = appartamento.nome)
--   se non ne esiste già uno con lo stesso nome+citta.
--   In futuro i condomini virtuali potranno essere consolidati manualmente.
-- ============================================================

BEGIN;

-- ── Step 1: Crea condomini (uno per appartamento) ─────────────────────────────
INSERT INTO v2.condominio (id, nome, indirizzo, citta, cap, virtuale, attivo, created_at)
SELECT
  gen_random_uuid(),
  a.nome,
  a.via,
  a.citta,
  a.cap,
  TRUE,
  a.attivo,
  a.created_at
FROM appartamenti a
WHERE NOT EXISTS (
  SELECT 1 FROM v2.immobile i WHERE i.legacy_id = a.id
)
AND NOT EXISTS (
  SELECT 1 FROM v2.condominio c WHERE c.nome = a.nome AND c.virtuale = TRUE
);

-- ── Step 2: Migra appartamenti → v2.immobile ──────────────────────────────────
INSERT INTO v2.immobile (id, condominio_id, legacy_id, nome, via, citta, cap, note, attivo, created_at)
SELECT
  gen_random_uuid(),
  (SELECT c.id FROM v2.condominio c WHERE c.nome = a.nome AND c.virtuale = TRUE LIMIT 1),
  a.id,
  a.nome,
  a.via,
  a.citta,
  a.cap,
  a.note,
  a.attivo,
  a.created_at
FROM appartamenti a
WHERE NOT EXISTS (
  SELECT 1 FROM v2.immobile i WHERE i.legacy_id = a.id
);

INSERT INTO v2._phase_log (phase, step, note)
VALUES ('phase2', 'migrate', 'Appartamenti migrati in v2.immobile con condomini virtuali')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW();

COMMIT;

SELECT 'Phase 2 migrazione completata — ' || NOW()::TEXT AS esito;
