-- Migration 010: riparto rules for proprietari

ALTER TABLE regole_riparto
  ADD COLUMN IF NOT EXISTS target VARCHAR(20) NOT NULL DEFAULT 'inquilini';

ALTER TABLE regole_riparto
  DROP CONSTRAINT IF EXISTS regole_target_chk;
ALTER TABLE regole_riparto
  ADD CONSTRAINT regole_target_chk CHECK (target IN ('inquilini','proprietari'));

CREATE TABLE IF NOT EXISTS regole_riparto_esclusi_prop (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regola_id       UUID NOT NULL REFERENCES regole_riparto(id) ON DELETE CASCADE,
  proprietario_id UUID NOT NULL REFERENCES proprietari(id)    ON DELETE CASCADE,
  CONSTRAINT rep_esclusi_prop_uq UNIQUE (regola_id, proprietario_id)
);

CREATE TABLE IF NOT EXISTS regole_riparto_inclusi_prop (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regola_id       UUID NOT NULL REFERENCES regole_riparto(id) ON DELETE CASCADE,
  proprietario_id UUID NOT NULL REFERENCES proprietari(id)    ON DELETE CASCADE,
  CONSTRAINT rep_inclusi_prop_uq UNIQUE (regola_id, proprietario_id)
);
