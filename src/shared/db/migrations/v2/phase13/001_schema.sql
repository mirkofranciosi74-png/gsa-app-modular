-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 13 — Ruolo persona: default_pagante + default_incassante
--            Fatto economico: soggetto_incassante_id
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── ruolo_persona: due flag specifici per ruolo default ───────────────────────
-- default_pagante    = questo soggetto paga le spese per l'immobile prima del riparto
-- default_incassante = questo soggetto incassa le entrate per l'immobile prima del riparto
ALTER TABLE v2.ruolo_persona
  ADD COLUMN IF NOT EXISTS default_pagante    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_incassante BOOLEAN NOT NULL DEFAULT false;

-- ── fatto_economico: chi incassa (per le entrate) ─────────────────────────────
ALTER TABLE v2.fatto_economico
  ADD COLUMN IF NOT EXISTS soggetto_incassante_id UUID
    REFERENCES v2.persona(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_v2_fe_incassante
  ON v2.fatto_economico(soggetto_incassante_id) WHERE soggetto_incassante_id IS NOT NULL;

INSERT INTO v2._phase_log(phase, step, note)
VALUES ('phase13', 'schema',
  'ruolo_persona: default_pagante + default_incassante; fatto_economico: soggetto_incassante_id')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW(), note = EXCLUDED.note;

COMMIT;

SELECT 'Phase 13 schema applicato — ' || NOW()::TEXT AS esito;
