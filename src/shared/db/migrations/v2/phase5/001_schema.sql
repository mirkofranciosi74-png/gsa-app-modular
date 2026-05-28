-- ============================================================
-- FASE 5 — PAGAMENTO: Schema
-- Separa i flussi finanziari (cassa) dalla competenza economica.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS v2.pagamento (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fatto_id          UUID        REFERENCES v2.fatto_economico(id) ON DELETE SET NULL,
  persona_id        UUID        REFERENCES v2.persona(id)         ON DELETE SET NULL,
  immobile_id       UUID        REFERENCES v2.immobile(id)        ON DELETE RESTRICT,
  importo           NUMERIC(12,2) NOT NULL CHECK (importo > 0),
  segno             SMALLINT    NOT NULL DEFAULT 1 CHECK (segno IN (1,-1)),
  data_pagamento    DATE,
  tipo_versamento   TEXT,
  mese_riferimento  VARCHAR(7),
  periodicita       TEXT,
  descrizione       TEXT,
  legacy_id         UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v2_pag_fatto      ON v2.pagamento(fatto_id);
CREATE INDEX IF NOT EXISTS idx_v2_pag_persona    ON v2.pagamento(persona_id);
CREATE INDEX IF NOT EXISTS idx_v2_pag_immobile   ON v2.pagamento(immobile_id);
CREATE INDEX IF NOT EXISTS idx_v2_pag_data       ON v2.pagamento(data_pagamento);
CREATE INDEX IF NOT EXISTS idx_v2_pag_legacy     ON v2.pagamento(legacy_id);

INSERT INTO v2._phase_log (phase, step, note)
VALUES ('phase5', 'schema', 'Tabella v2.pagamento creata')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW();

COMMIT;

SELECT 'Phase 5 schema applicato — ' || NOW()::TEXT AS esito;
