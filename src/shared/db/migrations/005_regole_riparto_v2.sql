-- ============================================================
-- Migrazione 005 — Regole di riparto v2 (modello B)
--
-- Sostituisce il modello "percentuale fissa per componente"
-- con un modello più flessibile:
--
--   Per ogni tipo di spesa e periodo di validità si può definire:
--   - quota_totale_pct: % della spesa totale soggetta alla regola
--     (default 100 = tutta la spesa; il residuo 0 se quota=100)
--   - esclusi: lista di componenti che NON pagano in quel periodo
--   - la quota soggetta viene divisa EQUAMENTE tra i componenti
--     attivi nel mese che NON sono in lista esclusi
--
-- Esempio TARI annuale con 6 inquilini, uno escluso gen-giu:
--   regola: tipo=TARI, validita_da=2024-01, validita_a=2024-06
--            quota_totale_pct=100, esclusi=[componente_X]
--   → gen-giu: spesa/mese divisa tra 5
--   → lug-dic: nessuna regola attiva → riparto standard (6 quote)
--
-- Esecuzione:
--   psql -h localhost -U gsa_user -d gsa_db \
--     -f src/db/migrations/005_regole_riparto_v2.sql
-- ============================================================

BEGIN;

-- ── 1. Rimuove le vecchie tabelle (modello A — percentuale fissa) ─────────────
DROP TABLE IF EXISTS regole_riparto_quote  CASCADE;
DROP TABLE IF EXISTS regole_riparto        CASCADE;

-- ── 2. Nuova tabella regole (modello B) ───────────────────────────────────────
CREATE TABLE regole_riparto (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  appartamento_id  UUID         NOT NULL
                                REFERENCES appartamenti(id) ON DELETE CASCADE,
  tipo_spesa_id    UUID         NOT NULL
                                REFERENCES tipi_spesa(id)   ON DELETE CASCADE,

  -- Descrizione libera (es. "Mario esonerato gen-giu 2024")
  descrizione      TEXT,

  -- % della spesa totale mensile soggetta a questa regola.
  -- 100 = tutta la spesa viene ripartita secondo la regola.
  -- Valori < 100 permettono split parziali (es. 50% equo + 50% standard).
  -- Per ora il frontend usa sempre 100; il campo è pronto per usi futuri.
  quota_totale_pct NUMERIC(5,2) NOT NULL DEFAULT 100
                                CHECK (quota_totale_pct BETWEEN 0 AND 100),

  -- Periodo di validità della regola (mese YYYY-MM)
  -- validita_da NULL = valida dall'inizio dei tempi
  -- validita_a  NULL = ancora valida
  validita_da      VARCHAR(7),  -- YYYY-MM
  validita_a       VARCHAR(7),  -- YYYY-MM

  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT regole_validita_chk
    CHECK (validita_a IS NULL OR validita_da IS NULL OR validita_a >= validita_da)
);

CREATE INDEX idx_regole_appartamento ON regole_riparto(appartamento_id);
CREATE INDEX idx_regole_tipo_spesa   ON regole_riparto(tipo_spesa_id);
CREATE INDEX idx_regole_validita     ON regole_riparto(validita_da, validita_a);

-- ── 3. Componenti esclusi dalla regola ────────────────────────────────────────
-- Un componente in questa tabella NON paga la quota soggetta alla regola
-- nel periodo di validità della regola stessa.
CREATE TABLE regole_riparto_esclusi (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regola_id     UUID NOT NULL REFERENCES regole_riparto(id) ON DELETE CASCADE,
  componente_id UUID NOT NULL REFERENCES componenti(id)     ON DELETE CASCADE,

  CONSTRAINT regole_esclusi_uq UNIQUE (regola_id, componente_id)
);

CREATE INDEX idx_regole_esclusi_regola     ON regole_riparto_esclusi(regola_id);
CREATE INDEX idx_regole_esclusi_componente ON regole_riparto_esclusi(componente_id);

-- ── 4. Trigger updated_at ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_regole_riparto_updated_at ON regole_riparto;
CREATE TRIGGER trg_regole_riparto_updated_at
  BEFORE UPDATE ON regole_riparto
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMIT;

SELECT 'Migrazione 005 completata — ' || NOW()::TEXT AS esito;
