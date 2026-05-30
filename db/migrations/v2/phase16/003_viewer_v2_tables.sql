-- Tabelle restrizioni viewer per v2 (immobili, inquilini, proprietari)
CREATE TABLE IF NOT EXISTS viewer_immobili_v2 (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  immobile_id UUID NOT NULL REFERENCES v2.immobile(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, immobile_id)
);

CREATE TABLE IF NOT EXISTS viewer_inquilini_v2 (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES v2.persona(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, persona_id)
);

CREATE TABLE IF NOT EXISTS viewer_proprietari_v2 (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES v2.persona(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, persona_id)
);
