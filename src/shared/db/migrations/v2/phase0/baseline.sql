-- ============================================================
-- FASE 0 — BASELINE v1
-- Congela il modello legacy come viste read-only nel schema v2.
-- Nessuna modifica alle tabelle legacy (public.*).
-- ============================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS v2;

-- ── Viste baseline (snapshot read-only delle tabelle legacy) ──────────────────

CREATE OR REPLACE VIEW v2.legacy_appartamenti AS
  SELECT * FROM public.appartamenti;

CREATE OR REPLACE VIEW v2.legacy_componenti AS
  SELECT * FROM public.componenti;

CREATE OR REPLACE VIEW v2.legacy_proprietari AS
  SELECT * FROM public.proprietari;

CREATE OR REPLACE VIEW v2.legacy_appartamento_proprietari AS
  SELECT * FROM public.appartamento_proprietari;

CREATE OR REPLACE VIEW v2.legacy_documenti AS
  SELECT * FROM public.documenti;

CREATE OR REPLACE VIEW v2.legacy_movimenti AS
  SELECT * FROM public.movimenti;

CREATE OR REPLACE VIEW v2.legacy_spese_proprietari AS
  SELECT * FROM public.spese_proprietari;

CREATE OR REPLACE VIEW v2.legacy_regole_riparto AS
  SELECT * FROM public.regole_riparto;

CREATE OR REPLACE VIEW v2.legacy_tipi_spesa AS
  SELECT * FROM public.tipi_spesa;

CREATE OR REPLACE VIEW v2.legacy_archivio_documenti AS
  SELECT * FROM public.archivio_documenti;

-- ── Tabella di tracking fasi v2 ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS v2._phase_log (
  phase       TEXT        NOT NULL,
  step        TEXT        NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note        TEXT,
  PRIMARY KEY (phase, step)
);

INSERT INTO v2._phase_log (phase, step, note)
VALUES ('phase0', 'baseline', 'Viste legacy create, schema v2 inizializzato')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW();

COMMIT;

SELECT 'Phase 0 baseline applicata — ' || NOW()::TEXT AS esito;
