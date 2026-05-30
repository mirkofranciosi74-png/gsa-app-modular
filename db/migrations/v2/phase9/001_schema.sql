-- ============================================================
-- FASE 9 — ESTENSIONE SCHEMA v2 (spec completa)
--
-- Obiettivi:
--   • Arricchire Persona, Condominio, Immobile con attributi
--     richiesti dalla specifica (tipo_persona, CF/PIVA, codici,
--     millesimi, superfici, validità da–a)
--   • Aggiungere ruoli estesi per ruolo_persona (garante, contatto)
--   • Nuova tabella persona_condominio
--   • Estendere fatto_economico (rif. condominio, soggetto pagante)
--   • Nuova tabella regola_riparto_condominio
--   • Estendere tipi_spesa legacy con tipo (spesa/entrata) e codice
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. PERSONA — attributi estesi
-- ─────────────────────────────────────────────────────────────
ALTER TABLE v2.persona
  ADD COLUMN IF NOT EXISTS tipo_persona      TEXT    NOT NULL DEFAULT 'fisica'
                                             CHECK (tipo_persona IN ('fisica','giuridica')),
  ADD COLUMN IF NOT EXISTS ragione_sociale   TEXT,
  ADD COLUMN IF NOT EXISTS codice_fiscale    VARCHAR(16),
  ADD COLUMN IF NOT EXISTS p_iva             VARCHAR(11),
  ADD COLUMN IF NOT EXISTS codice            VARCHAR(50),
  ADD COLUMN IF NOT EXISTS validita_da       DATE,
  ADD COLUMN IF NOT EXISTS validita_a        DATE,
  ADD CONSTRAINT persona_validita_chk
    CHECK (validita_a IS NULL OR validita_da IS NULL OR validita_a >= validita_da);

-- Indice su CF/PIVA per controllo duplicati
CREATE UNIQUE INDEX IF NOT EXISTS idx_v2_persona_cf
  ON v2.persona(LOWER(codice_fiscale)) WHERE codice_fiscale IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_v2_persona_piva
  ON v2.persona(LOWER(p_iva)) WHERE p_iva IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_v2_persona_codice
  ON v2.persona(LOWER(codice)) WHERE codice IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. CONDOMINIO — attributi estesi
-- ─────────────────────────────────────────────────────────────
ALTER TABLE v2.condominio
  ADD COLUMN IF NOT EXISTS codice            VARCHAR(50),
  ADD COLUMN IF NOT EXISTS millesimi_totali  NUMERIC(10,3) NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS validita_da       DATE,
  ADD COLUMN IF NOT EXISTS validita_a        DATE,
  ADD CONSTRAINT condominio_validita_chk
    CHECK (validita_a IS NULL OR validita_da IS NULL OR validita_a >= validita_da),
  ADD CONSTRAINT condominio_millesimi_chk
    CHECK (millesimi_totali > 0);

CREATE UNIQUE INDEX IF NOT EXISTS idx_v2_condominio_codice
  ON v2.condominio(LOWER(codice)) WHERE codice IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. IMMOBILE (Appartamento) — attributi estesi
-- ─────────────────────────────────────────────────────────────
ALTER TABLE v2.immobile
  ADD COLUMN IF NOT EXISTS codice                  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS superficie              NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS percentuale_condominio  NUMERIC(7,4),
  ADD COLUMN IF NOT EXISTS millesimi_condominio    NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS validita_da             DATE,
  ADD COLUMN IF NOT EXISTS validita_a              DATE,
  ADD CONSTRAINT immobile_validita_chk
    CHECK (validita_a IS NULL OR validita_da IS NULL OR validita_a >= validita_da),
  ADD CONSTRAINT immobile_superficie_chk
    CHECK (superficie IS NULL OR superficie > 0),
  ADD CONSTRAINT immobile_pct_condominio_chk
    CHECK (percentuale_condominio IS NULL OR percentuale_condominio BETWEEN 0 AND 100),
  ADD CONSTRAINT immobile_millesimi_chk
    CHECK (millesimi_condominio IS NULL OR millesimi_condominio >= 0);

-- ─────────────────────────────────────────────────────────────
-- 4. RUOLO_PERSONA — estende ENUM con garante e contatto
-- ─────────────────────────────────────────────────────────────
ALTER TYPE v2.ruolo_tipo ADD VALUE IF NOT EXISTS 'garante';
ALTER TYPE v2.ruolo_tipo ADD VALUE IF NOT EXISTS 'contatto';

-- ─────────────────────────────────────────────────────────────
-- 5. PERSONA_CONDOMINIO — nuova tabella
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS v2.persona_condominio (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id     UUID        NOT NULL REFERENCES v2.persona(id)     ON DELETE RESTRICT,
  condominio_id  UUID        NOT NULL REFERENCES v2.condominio(id)  ON DELETE RESTRICT,
  ruolo          TEXT        NOT NULL DEFAULT 'condomino'
                             CHECK (ruolo IN ('condomino','amministratore','delegato','altro')),
  validita_da    DATE        NOT NULL,
  validita_a     DATE,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT persona_condominio_validita_chk
    CHECK (validita_a IS NULL OR validita_a >= validita_da)
);

CREATE INDEX IF NOT EXISTS idx_v2_pc_persona     ON v2.persona_condominio(persona_id);
CREATE INDEX IF NOT EXISTS idx_v2_pc_condominio  ON v2.persona_condominio(condominio_id);
CREATE INDEX IF NOT EXISTS idx_v2_pc_validita    ON v2.persona_condominio(validita_da, validita_a);

DROP TRIGGER IF EXISTS trg_v2_pc_updated_at ON v2.persona_condominio;
CREATE TRIGGER trg_v2_pc_updated_at
  BEFORE UPDATE ON v2.persona_condominio
  FOR EACH ROW EXECUTE FUNCTION v2.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 6. FATTO_ECONOMICO — estensioni
-- ─────────────────────────────────────────────────────────────
ALTER TABLE v2.fatto_economico
  -- Riferimento alternativo: condominio (invece di singolo immobile)
  ADD COLUMN IF NOT EXISTS condominio_id        UUID
                           REFERENCES v2.condominio(id) ON DELETE RESTRICT,
  -- Chi ha effettivamente pagato/incassato (diverso dal titolare del ruolo)
  ADD COLUMN IF NOT EXISTS soggetto_pagante_id  UUID
                           REFERENCES v2.persona(id) ON DELETE SET NULL,
  -- Riferimento a documento allegato (tabella legacy documenti_allegati)
  ADD COLUMN IF NOT EXISTS documento_allegato_id UUID,
  -- Numero fattura (alias semantico di numero_doc)
  ADD COLUMN IF NOT EXISTS numero_fattura       TEXT;

-- Almeno un riferimento (immobile o condominio) — NOT VALID per non bloccare righe legacy
DO $$ BEGIN
  ALTER TABLE v2.fatto_economico
    ADD CONSTRAINT fe_riferimento_chk
      CHECK (immobile_id IS NOT NULL OR condominio_id IS NOT NULL) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_v2_fe_condominio
  ON v2.fatto_economico(condominio_id) WHERE condominio_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_v2_fe_soggetto
  ON v2.fatto_economico(soggetto_pagante_id) WHERE soggetto_pagante_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 7. REGOLA_RIPARTO_CONDOMINIO — nuova tabella
--    Distribuisce spese condominiali tra gli immobili del condominio
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS v2.regola_riparto_condominio (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id    UUID        NOT NULL REFERENCES v2.condominio(id) ON DELETE CASCADE,
  tipo_spesa_id    UUID        REFERENCES tipi_spesa(id)             ON DELETE SET NULL,
  metodo           TEXT        NOT NULL DEFAULT 'millesimi'
                               CHECK (metodo IN ('millesimi','percentuale')),
  validita_da      DATE        NOT NULL,
  validita_a       DATE,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT rrc_validita_chk
    CHECK (validita_a IS NULL OR validita_a >= validita_da)
);

CREATE INDEX IF NOT EXISTS idx_v2_rrc_condominio ON v2.regola_riparto_condominio(condominio_id);
CREATE INDEX IF NOT EXISTS idx_v2_rrc_tipo_spesa ON v2.regola_riparto_condominio(tipo_spesa_id);
CREATE INDEX IF NOT EXISTS idx_v2_rrc_validita   ON v2.regola_riparto_condominio(validita_da, validita_a);

DROP TRIGGER IF EXISTS trg_v2_rrc_updated_at ON v2.regola_riparto_condominio;
CREATE TRIGGER trg_v2_rrc_updated_at
  BEFORE UPDATE ON v2.regola_riparto_condominio
  FOR EACH ROW EXECUTE FUNCTION v2.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 8. TIPI_SPESA (legacy, condivisa) — estensioni non distruttive
-- ─────────────────────────────────────────────────────────────
ALTER TABLE tipi_spesa
  ADD COLUMN IF NOT EXISTS tipo_movimento  TEXT DEFAULT 'spesa'
                           CHECK (tipo_movimento IN ('spesa','entrata')),
  ADD COLUMN IF NOT EXISTS codice          VARCHAR(50),
  ADD COLUMN IF NOT EXISTS validita_da     DATE,
  ADD COLUMN IF NOT EXISTS validita_a      DATE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tipi_spesa_codice
  ON tipi_spesa(LOWER(codice)) WHERE codice IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- Log migrazione
-- ─────────────────────────────────────────────────────────────
INSERT INTO v2._phase_log (phase, step, note)
VALUES ('phase9', 'schema',
  'Estensione schema: persona (tipo/CF/PIVA), condominio (millesimi), immobile (superficie/millesimi), ruolo_tipo (garante/contatto), persona_condominio, fatto_economico (condo_id/pagante), regola_riparto_condominio, tipi_spesa (tipo_movimento)')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW(), note = EXCLUDED.note;

COMMIT;

SELECT 'Phase 9 schema applicato — ' || NOW()::TEXT AS esito;
