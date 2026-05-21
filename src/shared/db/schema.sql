-- ============================================================
-- GSA — Gestione Spese Appartamenti
-- Schema PostgreSQL v5 — idempotente
--
-- Funziona sia su un DB VUOTO (crea tutto da zero)
-- sia su un DB ESISTENTE a qualsiasi versione precedente
-- (aggiorna incrementalmente senza perdita di dati).
--
-- Esecuzione:
--   psql -h localhost -U gsa_user -d gsa_db -f schema.sql
-- oppure:
--   npm run db:migrate
-- ============================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- 1. ESTENSIONI
-- ═══════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════
-- 2. ENUM — idempotenti tramite EXCEPTION handler
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE doc_stato AS ENUM ('elaborato','da_verificare','errore','duplicato');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- mov_tipo semplificato: solo 'Versamento'. Il segno +/- è nella colonna segno.
-- Se il DB ha ancora la versione con 4 valori, il blocco upgrade §4c la aggiorna.
DO $$ BEGIN
  CREATE TYPE mov_tipo AS ENUM ('Versamento');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE periodicita AS ENUM (
    'una_tantum','mensile','bimestrale','trimestrale','semestrale','annuale'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE riparto_mode AS ENUM ('Percentuale','Parti uguali','Manuale');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estrazione_metodo AS ENUM ('pdf-parse','tesseract-ocr','manuale');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE regola_modalita AS ENUM ('escludi','includi');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE versamento_tipo AS ENUM ('affitto','conguaglio','rimborso','altro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════
-- 3. TABELLE — stato finale (CREATE IF NOT EXISTS)
--    Per DB esistenti le tabelle vengono saltate; le colonne
--    mancanti vengono aggiunte dai blocchi upgrade in §4.
-- ═══════════════════════════════════════════════════════════════

-- ── APPARTAMENTI ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appartamenti (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT        NOT NULL,
  via        TEXT,
  citta      TEXT,
  cap        VARCHAR(10),
  note       TEXT,
  attivo     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT appartamenti_nome_uq UNIQUE (nome)
);

-- ── TIPI DI SPESA ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tipi_spesa (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  descrizione TEXT         NOT NULL,
  categoria   TEXT         NOT NULL DEFAULT 'Altro',
  riparto     riparto_mode NOT NULL DEFAULT 'Percentuale',
  attivo      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT tipi_spesa_desc_uq UNIQUE (descrizione)
);

-- ── PROPRIETARI ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proprietari (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT        NOT NULL,
  cognome    TEXT,
  indirizzo  TEXT,
  telefono   TEXT,
  email      TEXT,
  attivo     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── COMPONENTI ────────────────────────────────────────────────
-- quota_affitto: quota mensile affitto
-- caparra: importo cauzione versata all'ingresso
CREATE TABLE IF NOT EXISTS componenti (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  appartamento_id UUID         NOT NULL
                               REFERENCES appartamenti(id) ON DELETE CASCADE,
  nome            TEXT         NOT NULL,
  cognome         TEXT,
  email           TEXT,
  telefono        TEXT,
  percentuale     NUMERIC(5,2) NOT NULL DEFAULT 0
                               CHECK (percentuale BETWEEN 0 AND 100),
  quota_affitto   NUMERIC(10,2)          DEFAULT 0,
  caparra         NUMERIC(10,2)          DEFAULT NULL,
  validita_da     DATE,
  validita_a      DATE,
  attivo          BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── ASSOCIAZIONE PROPRIETARIO-APPARTAMENTO ────────────────────
CREATE TABLE IF NOT EXISTS appartamento_proprietari (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  appartamento_id       UUID         NOT NULL REFERENCES appartamenti(id) ON DELETE CASCADE,
  proprietario_id       UUID         NOT NULL REFERENCES proprietari(id)  ON DELETE CASCADE,
  percentuale_proprieta NUMERIC(5,2) NOT NULL DEFAULT 100
                        CHECK (percentuale_proprieta BETWEEN 0 AND 100),
  data_inizio           DATE         NOT NULL,
  data_fine             DATE,
  proprietario_default  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT ap_periodo_chk CHECK (data_fine IS NULL OR data_fine >= data_inizio)
);

-- ── DOCUMENTI ─────────────────────────────────────────────────
-- pagato_da_proprietario_id: proprietario che ha anticipato la spesa
CREATE TABLE IF NOT EXISTS documenti (
  id                        UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  appartamento_id           UUID              REFERENCES appartamenti(id) ON DELETE SET NULL,
  tipo_spesa_id             UUID              REFERENCES tipi_spesa(id)   ON DELETE SET NULL,
  pagato_da_proprietario_id UUID              REFERENCES proprietari(id)  ON DELETE SET NULL,
  nome_file                 TEXT              NOT NULL,
  file_hash                 TEXT,
  fornitore                 TEXT,
  numero_doc                TEXT,
  importo                   NUMERIC(10,2),
  periodo_da                VARCHAR(7),
  periodo_a                 VARCHAR(7),
  stato                     doc_stato         NOT NULL DEFAULT 'da_verificare',
  metodo_estrazione         estrazione_metodo,
  confidenza                SMALLINT          CHECK (confidenza BETWEEN 0 AND 100),
  note_ai                   TEXT,
  validato                  BOOLEAN           NOT NULL DEFAULT FALSE,
  data_caricamento          DATE              NOT NULL DEFAULT CURRENT_DATE,
  created_at                TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- ── AUDIT LOG DOCUMENTI ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS documenti_audit (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID        NOT NULL
                           REFERENCES documenti(id) ON DELETE CASCADE,
  campo        TEXT        NOT NULL,
  valore_da    TEXT,
  valore_a     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── MOVIMENTI ─────────────────────────────────────────────────
-- segno: +1 = entrata (versamento), -1 = uscita (rimborso)
-- incassato_da_proprietario_id: proprietario che ha incassato il versamento
CREATE TABLE IF NOT EXISTS movimenti (
  id                          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  appartamento_id             UUID            NOT NULL
                                              REFERENCES appartamenti(id) ON DELETE CASCADE,
  componente_id               UUID            NOT NULL
                                              REFERENCES componenti(id)   ON DELETE CASCADE,
  incassato_da_proprietario_id UUID           REFERENCES proprietari(id)  ON DELETE SET NULL,
  tipo                        mov_tipo        NOT NULL DEFAULT 'Versamento',
  segno                       SMALLINT        NOT NULL DEFAULT 1
                                              CHECK (segno IN (1,-1)),
  periodicita                 periodicita     NOT NULL DEFAULT 'una_tantum',
  importo                     NUMERIC(10,2)   NOT NULL CHECK (importo > 0),
  validita_da                 DATE,
  validita_a                  DATE,
  descrizione                 TEXT,
  tipo_versamento             versamento_tipo NOT NULL DEFAULT 'affitto',
  data_versamento             DATE,
  mese_riferimento            VARCHAR(7),
  created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ── REPORT SALVATI ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_salvati (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT        NOT NULL,
  parametri  JSONB       NOT NULL DEFAULT '{}',
  testo      TEXT,
  pdf_base64 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── REGOLE DI RIPARTO ─────────────────────────────────────────
-- tipo_spesa_id nullable: NULL = regola default per tutte le spese
-- target: 'inquilini' (riparto spese) | 'proprietari' (riparto entrate)
-- modalita: 'escludi' → paga chi NON è in lista; 'includi' → paga solo chi è in lista
-- tipo_versamento: se valorizzato la regola si applica solo a quel tipo di versamento
-- split_uguale: se TRUE le entrate vengono divise in parti uguali tra i proprietari inclusi
CREATE TABLE IF NOT EXISTS regole_riparto (
  id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  appartamento_id  UUID            NOT NULL
                                   REFERENCES appartamenti(id) ON DELETE CASCADE,
  tipo_spesa_id    UUID            REFERENCES tipi_spesa(id)   ON DELETE CASCADE,
  target           VARCHAR(20)     NOT NULL DEFAULT 'inquilini',
  tipo_versamento  VARCHAR(20),
  descrizione      TEXT,
  quota_totale_pct NUMERIC(5,2)    NOT NULL DEFAULT 100
                                   CHECK (quota_totale_pct BETWEEN 0 AND 100),
  modalita         regola_modalita NOT NULL DEFAULT 'escludi',
  split_uguale     BOOLEAN         NOT NULL DEFAULT FALSE,
  validita_da      VARCHAR(7),
  validita_a       VARCHAR(7),
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT regole_target_chk
    CHECK (target IN ('inquilini','proprietari')),
  CONSTRAINT regole_riparto_versamento_chk
    CHECK (tipo_versamento IS NULL OR tipo_versamento IN ('affitto','conguaglio','rimborso','altro')),
  CONSTRAINT regole_validita_chk
    CHECK (validita_a IS NULL OR validita_da IS NULL OR validita_a >= validita_da)
);

-- ── REGOLE ESCLUSI / INCLUSI — INQUILINI ─────────────────────
CREATE TABLE IF NOT EXISTS regole_riparto_esclusi (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regola_id     UUID NOT NULL REFERENCES regole_riparto(id) ON DELETE CASCADE,
  componente_id UUID NOT NULL REFERENCES componenti(id)     ON DELETE CASCADE,

  CONSTRAINT regole_esclusi_uq UNIQUE (regola_id, componente_id)
);

CREATE TABLE IF NOT EXISTS regole_riparto_inclusi (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regola_id     UUID NOT NULL REFERENCES regole_riparto(id) ON DELETE CASCADE,
  componente_id UUID NOT NULL REFERENCES componenti(id)     ON DELETE CASCADE,

  CONSTRAINT regole_inclusi_uq UNIQUE (regola_id, componente_id)
);

-- ── REGOLE ESCLUSI / INCLUSI — PROPRIETARI ───────────────────
CREATE TABLE IF NOT EXISTS regole_riparto_esclusi_prop (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regola_id       UUID NOT NULL REFERENCES regole_riparto(id) ON DELETE CASCADE,
  proprietario_id UUID NOT NULL REFERENCES proprietari(id)    ON DELETE CASCADE,

  CONSTRAINT rep_esclusi_prop_uq UNIQUE (regola_id, proprietario_id)
);

-- percentuale: se NULL viene calcolata in parti uguali (vedi split_uguale sulla regola)
CREATE TABLE IF NOT EXISTS regole_riparto_inclusi_prop (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  regola_id       UUID         NOT NULL REFERENCES regole_riparto(id) ON DELETE CASCADE,
  proprietario_id UUID         NOT NULL REFERENCES proprietari(id)    ON DELETE CASCADE,
  percentuale     NUMERIC(5,2),

  CONSTRAINT rep_inclusi_prop_uq UNIQUE (regola_id, proprietario_id)
);

-- ── ARCHIVIO DOCUMENTALE ─────────────────────────────────────
-- Archivio generico di documenti non legati alla pipeline OCR/spese:
-- contratti, verbali, planimetrie, documenti personali, ecc.
CREATE TABLE IF NOT EXISTS archivio_tipi_documento (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT        NOT NULL UNIQUE,
  descrizione TEXT,
  entita      TEXT[]      NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS archivio_documenti (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_documento_id UUID        REFERENCES archivio_tipi_documento(id) ON DELETE SET NULL,
  nome_file         TEXT        NOT NULL,
  file_hash         TEXT,
  mime_type         TEXT,
  estensione        TEXT,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS archivio_associazioni (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID  NOT NULL REFERENCES archivio_documenti(id) ON DELETE CASCADE,
  entita_tipo  TEXT  NOT NULL CHECK (entita_tipo IN ('appartamento','inquilino','proprietario')),
  entita_id    UUID  NOT NULL,

  CONSTRAINT archivio_assoc_uq UNIQUE (documento_id, entita_tipo, entita_id)
);

-- ═══════════════════════════════════════════════════════════════
-- 4. UPGRADE — blocchi idempotenti per DB esistenti
--    Ogni blocco controlla la condizione prima di agire.
-- ═══════════════════════════════════════════════════════════════

-- §4a: componenti — validita_da / validita_a (migrazione 002/003)
ALTER TABLE componenti
  ADD COLUMN IF NOT EXISTS validita_da DATE,
  ADD COLUMN IF NOT EXISTS validita_a  DATE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='componenti' AND column_name='data_inizio') THEN
    UPDATE componenti SET validita_da = data_inizio
    WHERE validita_da IS NULL AND data_inizio IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='componenti' AND column_name='data_fine') THEN
    UPDATE componenti SET validita_a = data_fine
    WHERE validita_a IS NULL AND data_fine IS NOT NULL;
  END IF;
END $$;

-- §4b: movimenti — validita_da / validita_a + rimozione data_riferimento (migrazione 002/003)
ALTER TABLE movimenti
  ADD COLUMN IF NOT EXISTS validita_da DATE,
  ADD COLUMN IF NOT EXISTS validita_a  DATE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='movimenti' AND column_name='data_riferimento') THEN
    UPDATE movimenti SET validita_da = data_riferimento
    WHERE validita_da IS NULL AND data_riferimento IS NOT NULL;
    ALTER TABLE movimenti DROP COLUMN data_riferimento;
  END IF;
END $$;

-- §4c: movimenti — aggiunta segno + semplificazione enum mov_tipo (migrazione 007)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='movimenti' AND column_name='segno') THEN
    ALTER TABLE movimenti ADD COLUMN segno SMALLINT NOT NULL DEFAULT 1;
    UPDATE movimenti SET segno = -1 WHERE tipo::text = 'Rimborso';
    UPDATE movimenti SET segno =  1 WHERE tipo::text IN ('Versamento','Conguaglio','Rettifica');
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN   pg_type t ON t.oid = e.enumtypid
    WHERE  t.typname = 'mov_tipo'
    AND    e.enumlabel != 'Versamento'
  ) THEN
    UPDATE movimenti SET tipo = 'Versamento';
    ALTER TABLE movimenti ALTER COLUMN tipo TYPE TEXT;
    DROP TYPE mov_tipo CASCADE;
    CREATE TYPE mov_tipo AS ENUM ('Versamento');
    ALTER TABLE movimenti
      ALTER COLUMN tipo TYPE mov_tipo USING tipo::mov_tipo,
      ALTER COLUMN tipo SET DEFAULT 'Versamento';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE  constraint_name = 'movimenti_segno_chk'
  ) THEN
    ALTER TABLE movimenti ADD CONSTRAINT movimenti_segno_chk CHECK (segno IN (1,-1));
  END IF;
END $$;

-- §4d: componenti — rinomina quota / quota_mensile → quota_affitto (migrazione 008)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='componenti' AND column_name='quota')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='componenti' AND column_name='quota_affitto') THEN
    ALTER TABLE componenti RENAME COLUMN quota TO quota_affitto;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name='componenti' AND column_name='quota_mensile')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='componenti' AND column_name='quota_affitto') THEN
    ALTER TABLE componenti RENAME COLUMN quota_mensile TO quota_affitto;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='componenti' AND column_name='quota_affitto') THEN
    ALTER TABLE componenti ADD COLUMN quota_affitto NUMERIC(10,2) DEFAULT 0;
  END IF;
END $$;

-- §4e: regole_riparto — upgrade da v004 (DATE → VARCHAR) e v005 (+ quota_totale_pct) (migrazione 005/007)
DO $$
BEGIN
  DROP TABLE IF EXISTS regole_riparto_quote CASCADE;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name='regole_riparto'
    AND    column_name='validita_da'
    AND    data_type='date'
  ) THEN
    ALTER TABLE regole_riparto DROP CONSTRAINT IF EXISTS regole_validita_chk;
    ALTER TABLE regole_riparto
      ALTER COLUMN validita_da TYPE VARCHAR(7)
        USING CASE WHEN validita_da IS NULL THEN NULL ELSE TO_CHAR(validita_da,'YYYY-MM') END,
      ALTER COLUMN validita_a  TYPE VARCHAR(7)
        USING CASE WHEN validita_a  IS NULL THEN NULL ELSE TO_CHAR(validita_a, 'YYYY-MM') END;
    ALTER TABLE regole_riparto ADD CONSTRAINT regole_validita_chk
      CHECK (validita_a IS NULL OR validita_da IS NULL OR validita_a >= validita_da);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='regole_riparto' AND column_name='quota_totale_pct') THEN
    ALTER TABLE regole_riparto
      ADD COLUMN quota_totale_pct NUMERIC(5,2) NOT NULL DEFAULT 100
        CHECK (quota_totale_pct BETWEEN 0 AND 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='regole_riparto' AND column_name='modalita') THEN
    ALTER TABLE regole_riparto
      ADD COLUMN modalita regola_modalita NOT NULL DEFAULT 'escludi';
  END IF;
END $$;

-- §4f: movimenti — tipo_versamento, data_versamento, mese_riferimento (migrazione 006/v5)
ALTER TABLE movimenti
  ADD COLUMN IF NOT EXISTS tipo_versamento  versamento_tipo NOT NULL DEFAULT 'affitto',
  ADD COLUMN IF NOT EXISTS data_versamento  DATE,
  ADD COLUMN IF NOT EXISTS mese_riferimento VARCHAR(7);

-- §4g: componenti — caparra (migrazione 009)
ALTER TABLE componenti
  ADD COLUMN IF NOT EXISTS caparra NUMERIC(10,2) DEFAULT NULL;

-- §4h: documenti — pagato_da_proprietario_id (migrazione 009)
ALTER TABLE documenti
  ADD COLUMN IF NOT EXISTS pagato_da_proprietario_id UUID
    REFERENCES proprietari(id) ON DELETE SET NULL;

-- §4i: movimenti — incassato_da_proprietario_id (migrazione 009)
ALTER TABLE movimenti
  ADD COLUMN IF NOT EXISTS incassato_da_proprietario_id UUID
    REFERENCES proprietari(id) ON DELETE SET NULL;

-- §4j: regole_riparto — target (migrazione 010)
ALTER TABLE regole_riparto
  ADD COLUMN IF NOT EXISTS target VARCHAR(20) NOT NULL DEFAULT 'inquilini';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE  constraint_name = 'regole_target_chk'
  ) THEN
    ALTER TABLE regole_riparto ADD CONSTRAINT regole_target_chk
      CHECK (target IN ('inquilini','proprietari'));
  END IF;
END $$;

-- §4k: regole_riparto — tipo_spesa_id nullable, tipo_versamento (migrazione 011)
ALTER TABLE regole_riparto ALTER COLUMN tipo_spesa_id DROP NOT NULL;

ALTER TABLE regole_riparto
  ADD COLUMN IF NOT EXISTS tipo_versamento VARCHAR(20);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE  constraint_name = 'regole_riparto_versamento_chk'
  ) THEN
    ALTER TABLE regole_riparto ADD CONSTRAINT regole_riparto_versamento_chk
      CHECK (tipo_versamento IS NULL OR tipo_versamento IN ('affitto','conguaglio','rimborso','altro'));
  END IF;
END $$;

-- §4l: regole_riparto — split_uguale (migrazione 012)
ALTER TABLE regole_riparto
  ADD COLUMN IF NOT EXISTS split_uguale BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE regole_riparto SET split_uguale = TRUE
WHERE tipo_versamento IS NOT NULL AND split_uguale = FALSE;

-- §4m: regole_riparto_inclusi_prop — percentuale (migrazione 012)
ALTER TABLE regole_riparto_inclusi_prop
  ADD COLUMN IF NOT EXISTS percentuale NUMERIC(5,2);

-- ═══════════════════════════════════════════════════════════════
-- 5. VINCOLI — idempotenti (DROP + ADD)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE componenti DROP CONSTRAINT IF EXISTS componenti_validita_chk;
ALTER TABLE componenti ADD  CONSTRAINT componenti_validita_chk
  CHECK (validita_a IS NULL OR validita_da IS NULL OR validita_a >= validita_da);

ALTER TABLE movimenti  DROP CONSTRAINT IF EXISTS movimenti_validita_chk;
ALTER TABLE movimenti  ADD  CONSTRAINT movimenti_validita_chk
  CHECK (validita_a IS NULL OR validita_da IS NULL OR validita_a >= validita_da);

ALTER TABLE documenti  DROP CONSTRAINT IF EXISTS documenti_periodo_chk;
ALTER TABLE documenti  ADD  CONSTRAINT documenti_periodo_chk
  CHECK (periodo_a IS NULL OR periodo_da IS NULL OR periodo_a >= periodo_da);

-- ═══════════════════════════════════════════════════════════════
-- 6. INDICI (CREATE IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_componenti_appartamento   ON componenti(appartamento_id);
CREATE INDEX IF NOT EXISTS idx_componenti_validita       ON componenti(validita_da, validita_a);

CREATE INDEX IF NOT EXISTS idx_app_proprietari_app       ON appartamento_proprietari(appartamento_id);
CREATE INDEX IF NOT EXISTS idx_app_proprietari_prop      ON appartamento_proprietari(proprietario_id);

CREATE INDEX IF NOT EXISTS idx_documenti_appartamento    ON documenti(appartamento_id);
CREATE INDEX IF NOT EXISTS idx_documenti_tipo_spesa      ON documenti(tipo_spesa_id);
CREATE INDEX IF NOT EXISTS idx_documenti_periodo         ON documenti(periodo_da, periodo_a);
CREATE INDEX IF NOT EXISTS idx_documenti_stato           ON documenti(stato);
CREATE INDEX IF NOT EXISTS idx_documenti_hash            ON documenti(file_hash);
CREATE INDEX IF NOT EXISTS idx_documenti_pagato_da       ON documenti(pagato_da_proprietario_id);

CREATE INDEX IF NOT EXISTS idx_audit_documento           ON documenti_audit(documento_id);

CREATE INDEX IF NOT EXISTS idx_movimenti_appartamento    ON movimenti(appartamento_id);
CREATE INDEX IF NOT EXISTS idx_movimenti_componente      ON movimenti(componente_id);
CREATE INDEX IF NOT EXISTS idx_movimenti_tipo            ON movimenti(tipo);
CREATE INDEX IF NOT EXISTS idx_movimenti_validita        ON movimenti(validita_da, validita_a);
CREATE INDEX IF NOT EXISTS idx_movimenti_tipo_vers       ON movimenti(tipo_versamento);
CREATE INDEX IF NOT EXISTS idx_movimenti_mese_rif        ON movimenti(mese_riferimento);
CREATE INDEX IF NOT EXISTS idx_movimenti_data_vers       ON movimenti(data_versamento);
CREATE INDEX IF NOT EXISTS idx_movimenti_incassato_da    ON movimenti(incassato_da_proprietario_id);

CREATE INDEX IF NOT EXISTS idx_regole_appartamento       ON regole_riparto(appartamento_id);
CREATE INDEX IF NOT EXISTS idx_regole_tipo_spesa         ON regole_riparto(tipo_spesa_id);
CREATE INDEX IF NOT EXISTS idx_regole_validita           ON regole_riparto(validita_da, validita_a);
CREATE INDEX IF NOT EXISTS idx_regole_target             ON regole_riparto(target);

CREATE INDEX IF NOT EXISTS idx_regole_esclusi_regola     ON regole_riparto_esclusi(regola_id);
CREATE INDEX IF NOT EXISTS idx_regole_esclusi_comp       ON regole_riparto_esclusi(componente_id);
CREATE INDEX IF NOT EXISTS idx_regole_inclusi_regola     ON regole_riparto_inclusi(regola_id);
CREATE INDEX IF NOT EXISTS idx_regole_inclusi_comp       ON regole_riparto_inclusi(componente_id);

CREATE INDEX IF NOT EXISTS idx_rep_esclusi_prop_regola   ON regole_riparto_esclusi_prop(regola_id);
CREATE INDEX IF NOT EXISTS idx_rep_esclusi_prop_prop     ON regole_riparto_esclusi_prop(proprietario_id);
CREATE INDEX IF NOT EXISTS idx_rep_inclusi_prop_regola   ON regole_riparto_inclusi_prop(regola_id);
CREATE INDEX IF NOT EXISTS idx_rep_inclusi_prop_prop     ON regole_riparto_inclusi_prop(proprietario_id);

CREATE INDEX IF NOT EXISTS idx_archivio_doc_tipo         ON archivio_documenti(tipo_documento_id);
CREATE INDEX IF NOT EXISTS idx_archivio_assoc_entita     ON archivio_associazioni(entita_tipo, entita_id);
CREATE INDEX IF NOT EXISTS idx_archivio_assoc_doc        ON archivio_associazioni(documento_id);

-- ═══════════════════════════════════════════════════════════════
-- 7. FUNZIONI
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- Calcola anteprima propagazione date componente → movimenti collegati
DROP FUNCTION IF EXISTS propaga_date_componente(UUID, DATE, DATE);

CREATE FUNCTION propaga_date_componente(
  p_componente_id UUID,
  p_validita_da   DATE,
  p_validita_a    DATE
)
RETURNS TABLE (
  mov_id      UUID,
  mov_tipo    mov_tipo,
  mov_importo NUMERIC,
  mov_val_da  DATE,
  mov_val_a   DATE,
  new_val_da  DATE,
  new_val_a   DATE
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.tipo,
    m.importo,
    m.validita_da,
    m.validita_a,
    CASE
      WHEN p_validita_da IS NULL THEN m.validita_da
      WHEN m.validita_da IS NULL THEN p_validita_da
      ELSE GREATEST(m.validita_da, p_validita_da)
    END,
    CASE
      WHEN p_validita_a IS NULL THEN m.validita_a
      WHEN m.validita_a IS NULL THEN p_validita_a
      ELSE LEAST(m.validita_a, p_validita_a)
    END
  FROM movimenti m
  WHERE m.componente_id = p_componente_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 8. TRIGGER — updated_at automatico
-- ═══════════════════════════════════════════════════════════════

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'appartamenti','componenti','documenti','movimenti','regole_riparto',
    'proprietari','appartamento_proprietari'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
       CREATE TRIGGER trg_%I_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 9. VISTE — ricreate sempre per garantire lo stato corrente
-- ═══════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS v_movimenti_dettaglio;
DROP VIEW IF EXISTS v_saldo_componenti;
DROP VIEW IF EXISTS v_spese_appartamento;
DROP VIEW IF EXISTS v_percentuali_appartamento;

-- Totale percentuali attive per appartamento
CREATE VIEW v_percentuali_appartamento AS
SELECT
  appartamento_id,
  SUM(percentuale) AS totale_percentuale,
  COUNT(*)         AS num_componenti
FROM componenti
WHERE attivo = TRUE
GROUP BY appartamento_id;

-- Saldo versamenti per componente (segno applicato)
CREATE VIEW v_saldo_componenti AS
SELECT
  c.id                                        AS componente_id,
  c.appartamento_id,
  a.nome                                      AS appartamento,
  (c.nome || ' ' || COALESCE(c.cognome,''))  AS componente,
  c.percentuale,
  c.quota_affitto,
  c.caparra,
  c.validita_da                               AS comp_validita_da,
  c.validita_a                                AS comp_validita_a,
  COALESCE(SUM(m.importo * m.segno), 0)       AS versato_totale
FROM componenti c
JOIN appartamenti a ON a.id = c.appartamento_id
LEFT JOIN movimenti m
       ON m.componente_id = c.id
      AND (c.validita_da IS NULL OR m.validita_a  IS NULL OR m.validita_a  >= c.validita_da)
      AND (c.validita_a  IS NULL OR m.validita_da IS NULL OR m.validita_da <= COALESCE(c.validita_a, CURRENT_DATE))
WHERE c.attivo = TRUE
GROUP BY c.id, c.appartamento_id, a.nome, c.nome, c.cognome,
         c.percentuale, c.quota_affitto, c.caparra, c.validita_da, c.validita_a;

-- Totale spese per appartamento (solo documenti elaborati)
CREATE VIEW v_spese_appartamento AS
SELECT
  a.id                        AS appartamento_id,
  a.nome                      AS appartamento,
  COUNT(d.id)                 AS num_documenti,
  COALESCE(SUM(d.importo), 0) AS totale_spese
FROM appartamenti a
LEFT JOIN documenti d
       ON d.appartamento_id = a.id AND d.stato = 'elaborato'
WHERE a.attivo = TRUE
GROUP BY a.id, a.nome;

-- Dettaglio movimenti con info appartamento/componente e importo netto
CREATE VIEW v_movimenti_dettaglio AS
SELECT
  m.id, m.appartamento_id, m.componente_id,
  m.tipo, m.segno, m.periodicita,
  m.importo,
  (m.importo * m.segno)                       AS importo_netto,
  m.validita_da, m.validita_a,
  m.descrizione,
  m.tipo_versamento, m.data_versamento, m.mese_riferimento,
  m.incassato_da_proprietario_id,
  m.created_at, m.updated_at,
  a.nome                                      AS appartamento_nome,
  (c.nome || ' ' || COALESCE(c.cognome,''))  AS componente_nome,
  c.validita_da                               AS comp_validita_da,
  c.validita_a                                AS comp_validita_a,
  CASE
    WHEN c.validita_da IS NOT NULL AND m.validita_a  IS NOT NULL
         AND m.validita_a  < c.validita_da THEN TRUE
    WHEN c.validita_a  IS NOT NULL AND m.validita_da IS NOT NULL
         AND m.validita_da > c.validita_a  THEN TRUE
    ELSE FALSE
  END AS fuori_validita
FROM movimenti m
JOIN appartamenti a ON a.id = m.appartamento_id
JOIN componenti   c ON c.id = m.componente_id;

-- ═══════════════════════════════════════════════════════════════
-- 10. DATI INIZIALI
-- ═══════════════════════════════════════════════════════════════
INSERT INTO tipi_spesa (descrizione, categoria, riparto) VALUES
  ('Acqua',      'Utenza',     'Percentuale'),
  ('Luce',       'Utenza',     'Percentuale'),
  ('Gas',        'Utenza',     'Percentuale'),
  ('TARI',       'Tassa',      'Parti uguali'),
  ('Condominio', 'Condominio', 'Percentuale'),
  ('Altro',      'Altro',      'Manuale')
ON CONFLICT (descrizione) DO NOTHING;

COMMIT;

SELECT 'Schema GSA v5 applicato correttamente — ' || NOW()::TEXT AS esito;
