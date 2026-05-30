-- ============================================================
-- FASE 7 — REGOLA RIPARTO v2: Schema
-- Regole dichiarative, gerarchiche e temporali.
--
-- Gerarchia di applicazione (priorità decrescente):
--   1. immobile + tipo_spesa + periodo
--   2. immobile + tipo_spesa (senza periodo)
--   3. immobile + default (tipo_spesa NULL)
--   4. Global default (nessuna regola → parti uguali)
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS v2.regola_riparto (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  immobile_id      UUID        NOT NULL REFERENCES v2.immobile(id) ON DELETE CASCADE,
  tipo_spesa_id    UUID        REFERENCES tipi_spesa(id) ON DELETE SET NULL,
  target           TEXT        NOT NULL DEFAULT 'inquilini'
                               CHECK (target IN ('inquilini','proprietari')),
  modalita         TEXT        NOT NULL DEFAULT 'escludi'
                               CHECK (modalita IN ('escludi','includi')),
  quota_totale_pct NUMERIC(5,2) NOT NULL DEFAULT 100
                               CHECK (quota_totale_pct BETWEEN 0 AND 100),
  split_uguale     BOOLEAN     NOT NULL DEFAULT FALSE,
  tipo_versamento  TEXT,
  validita_da      VARCHAR(7),
  validita_a       VARCHAR(7),
  descrizione      TEXT,
  legacy_id        UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT v2_regola_validita_chk
    CHECK (validita_a IS NULL OR validita_da IS NULL OR validita_a >= validita_da)
);

CREATE INDEX IF NOT EXISTS idx_v2_rr_immobile    ON v2.regola_riparto(immobile_id);
CREATE INDEX IF NOT EXISTS idx_v2_rr_tipo_spesa  ON v2.regola_riparto(tipo_spesa_id);
CREATE INDEX IF NOT EXISTS idx_v2_rr_validita    ON v2.regola_riparto(validita_da, validita_a);

-- Dettaglio per persona (sostituisce esclusi/inclusi per componente)
CREATE TABLE IF NOT EXISTS v2.regola_riparto_dettaglio (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  regola_id     UUID         NOT NULL REFERENCES v2.regola_riparto(id) ON DELETE CASCADE,
  persona_id    UUID         REFERENCES v2.persona(id) ON DELETE CASCADE,
  includi       BOOLEAN      NOT NULL DEFAULT TRUE,
  percentuale   NUMERIC(5,2),

  CONSTRAINT v2_rrd_uq UNIQUE (regola_id, persona_id)
);

CREATE INDEX IF NOT EXISTS idx_v2_rrd_regola  ON v2.regola_riparto_dettaglio(regola_id);
CREATE INDEX IF NOT EXISTS idx_v2_rrd_persona ON v2.regola_riparto_dettaglio(persona_id);

DROP TRIGGER IF EXISTS trg_v2_rr_updated_at ON v2.regola_riparto;
CREATE TRIGGER trg_v2_rr_updated_at
  BEFORE UPDATE ON v2.regola_riparto
  FOR EACH ROW EXECUTE FUNCTION v2.fn_set_updated_at();

INSERT INTO v2._phase_log (phase, step, note)
VALUES ('phase7', 'schema', 'Tabelle v2.regola_riparto e v2.regola_riparto_dettaglio create')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW();

COMMIT;

SELECT 'Phase 7 schema applicato — ' || NOW()::TEXT AS esito;
