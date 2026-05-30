-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 11 — Regole di riparto complete (3 livelli)
--
-- Aggiunge:
--   1. colonna note su regola_riparto (usata dal codice ma mancante)
--   2. v2.regola_riparto_condominio_dettaglio — quote % per appartamento
--      quando metodo='percentuale' nella regola condominio→appartamenti
-- ═══════════════════════════════════════════════════════════════════════════════
SET search_path = v2, public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Aggiungi note a regola_riparto (mancante dalla migrazione precedente)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE v2.regola_riparto
  ADD COLUMN IF NOT EXISTS note TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tabella dettaglio per regola_riparto_condominio
--    Usata quando metodo='percentuale': definisce la % di ogni appartamento
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS v2.regola_riparto_condominio_dettaglio (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  regola_id     UUID         NOT NULL REFERENCES v2.regola_riparto_condominio(id) ON DELETE CASCADE,
  immobile_id   UUID         NOT NULL REFERENCES v2.immobile(id) ON DELETE CASCADE,
  percentuale   NUMERIC(7,4) NOT NULL DEFAULT 0
                             CHECK (percentuale >= 0 AND percentuale <= 100),
  note          TEXT,

  UNIQUE (regola_id, immobile_id)
);

CREATE INDEX IF NOT EXISTS idx_v2_rrcd_regola   ON v2.regola_riparto_condominio_dettaglio(regola_id);
CREATE INDEX IF NOT EXISTS idx_v2_rrcd_immobile ON v2.regola_riparto_condominio_dettaglio(immobile_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Log
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO v2._phase_log(phase, step, note)
VALUES ('phase11', 'schema', 'regola_riparto.note + regola_riparto_condominio_dettaglio')
ON CONFLICT DO NOTHING;
