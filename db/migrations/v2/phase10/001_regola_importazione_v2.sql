-- ============================================================
-- FASE 10 — Regole importazione v2
-- Tabella separata da quella legacy (regole_importazione)
-- con riferimenti a v2.immobile e v2.persona
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS v2.regola_importazione (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stringa        TEXT        NOT NULL UNIQUE,
  immobile_id    UUID        REFERENCES v2.immobile(id) ON DELETE SET NULL,
  persona_id     UUID        REFERENCES v2.persona(id)  ON DELETE SET NULL,
  tipo_spesa_id  UUID        REFERENCES tipi_spesa(id)  ON DELETE SET NULL,
  tipo_riga      TEXT        CHECK (tipo_riga IN ('spesa','entrata','ignora')),
  note           TEXT,
  uso_count      INT         NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v2_ri_stringa    ON v2.regola_importazione(stringa);
CREATE INDEX IF NOT EXISTS idx_v2_ri_immobile   ON v2.regola_importazione(immobile_id) WHERE immobile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_v2_ri_persona    ON v2.regola_importazione(persona_id)  WHERE persona_id  IS NOT NULL;

DROP TRIGGER IF EXISTS trg_v2_ri_updated_at ON v2.regola_importazione;
CREATE TRIGGER trg_v2_ri_updated_at
  BEFORE UPDATE ON v2.regola_importazione
  FOR EACH ROW EXECUTE FUNCTION v2.fn_set_updated_at();

INSERT INTO v2._phase_log (phase, step, note)
VALUES ('phase10', 'regola_importazione_v2',
  'Tabella v2.regola_importazione per import estratti conto in economia v2')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW(), note = EXCLUDED.note;

COMMIT;

SELECT 'Phase 10 regola_importazione_v2 applicato — ' || NOW()::TEXT AS esito;
