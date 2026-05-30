-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 15 — Restrizioni viewer v2 (immobili, inquilini, proprietari)
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;

-- Immobili v2 visibili a un viewer (lista vuota = tutti)
CREATE TABLE IF NOT EXISTS viewer_immobili_v2 (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  immobile_id UUID NOT NULL REFERENCES v2.immobile(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, immobile_id)
);

-- Inquilini v2 visibili a un viewer (persone con ruolo inquilino)
CREATE TABLE IF NOT EXISTS viewer_inquilini_v2 (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES v2.persona(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, persona_id)
);

-- Proprietari v2 visibili a un viewer (persone con ruolo proprietario)
CREATE TABLE IF NOT EXISTS viewer_proprietari_v2 (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES v2.persona(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, persona_id)
);

CREATE INDEX IF NOT EXISTS idx_viewer_immobili_v2_user    ON viewer_immobili_v2(user_id);
CREATE INDEX IF NOT EXISTS idx_viewer_inquilini_v2_user   ON viewer_inquilini_v2(user_id);
CREATE INDEX IF NOT EXISTS idx_viewer_proprietari_v2_user ON viewer_proprietari_v2(user_id);

INSERT INTO v2._phase_log(phase, step, note)
VALUES ('phase15', 'schema', 'viewer restrictions v2')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW(), note = EXCLUDED.note;

COMMIT;

SELECT 'Phase 15 schema applicato — ' || NOW()::TEXT AS esito;
