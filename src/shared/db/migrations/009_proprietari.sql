-- Migration 009: Proprietari, associazioni, caparra, pagato_da, incassato_da

-- ── Proprietari ──────────────────────────────────────────────────────────────
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

-- ── Associazione Proprietario-Appartamento ────────────────────────────────────
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

-- ── Caparra su Inquilini ──────────────────────────────────────────────────────
ALTER TABLE componenti
  ADD COLUMN IF NOT EXISTS caparra NUMERIC(10,2) DEFAULT NULL;

-- ── Pagato da Proprietario su Documenti (Pagamenti) ──────────────────────────
ALTER TABLE documenti
  ADD COLUMN IF NOT EXISTS pagato_da_proprietario_id UUID
    REFERENCES proprietari(id) ON DELETE SET NULL;

-- ── Incassato da Proprietario su Movimenti (Versamenti) ──────────────────────
ALTER TABLE movimenti
  ADD COLUMN IF NOT EXISTS incassato_da_proprietario_id UUID
    REFERENCES proprietari(id) ON DELETE SET NULL;
