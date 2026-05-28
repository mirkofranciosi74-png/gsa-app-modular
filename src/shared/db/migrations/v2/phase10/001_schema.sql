-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 10 — Economia CRUD: estende fatto_economico per CRUD nativo v2
--            + tabella tipologia_economica (wrapper portabile su tipi_spesa)
-- ═══════════════════════════════════════════════════════════════════════════════
SET search_path = v2, public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FATTO_ECONOMICO — campi mancanti rispetto alla spec 6.1
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE v2.fatto_economico
  -- nome/titolo breve del fatto (es. "Bolletta gas dic-25")
  ADD COLUMN IF NOT EXISTS nome              TEXT,
  -- data pagamento/incasso effettiva (più precisa di data_evento)
  ADD COLUMN IF NOT EXISTS data_pagamento    DATE,
  -- periodo di riferimento preciso (DATE, vs periodo_da/a VARCHAR7 usato per compatibilità legacy)
  ADD COLUMN IF NOT EXISTS rif_da            DATE,
  ADD COLUMN IF NOT EXISTS rif_a             DATE,
  -- allegato PDF: hash per deduplication, path fisico, nome originale
  ADD COLUMN IF NOT EXISTS file_hash         TEXT,
  ADD COLUMN IF NOT EXISTS file_path         TEXT,
  ADD COLUMN IF NOT EXISTS nome_file         TEXT,
  ADD COLUMN IF NOT EXISTS mime_type         TEXT DEFAULT 'application/pdf',
  -- note libere
  ADD COLUMN IF NOT EXISTS note              TEXT;

-- Constraint periodicità valida (se presente)
DO $$ BEGIN
  ALTER TABLE v2.fatto_economico
    ADD CONSTRAINT fe_periodicita_chk
      CHECK (periodicita IN ('una_tantum','mensile','bimestrale','trimestrale','semestrale','annuale'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Constraint rif_a >= rif_da
DO $$ BEGIN
  ALTER TABLE v2.fatto_economico
    ADD CONSTRAINT fe_rif_periodo_chk
      CHECK (rif_a IS NULL OR rif_da IS NULL OR rif_a >= rif_da);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indice hash per deduplication file
CREATE INDEX IF NOT EXISTS idx_v2_fe_file_hash
  ON v2.fatto_economico(file_hash) WHERE file_hash IS NOT NULL;

-- Indice per deduplication dati (fornitore + importo)
CREATE INDEX IF NOT EXISTS idx_v2_fe_fornitore
  ON v2.fatto_economico(LOWER(fornitore)) WHERE fornitore IS NOT NULL;

-- Indice per data_pagamento
CREATE INDEX IF NOT EXISTS idx_v2_fe_data_pag
  ON v2.fatto_economico(data_pagamento) WHERE data_pagamento IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TIPOLOGIA_ECONOMICA — vista portabile su tipi_spesa
--    Mappa la tabella legacy garantendo compatibilità futura.
--    tipi_spesa.tipo_movimento è già presente da phase9.
-- ─────────────────────────────────────────────────────────────────────────────
-- Vista v2 su tipi_spesa per query canoniche v2
CREATE OR REPLACE VIEW v2.tipologia_economica AS
  SELECT
    id,
    descrizione,
    COALESCE(tipo_movimento, 'spesa')        AS tipo,   -- 'spesa' | 'entrata'
    categoria,
    riparto                                  AS metodo_riparto,
    COALESCE(codice, id::text)               AS codice,
    attivo,
    validita_da,
    validita_a,
    note                                     AS note_interne
  FROM tipi_spesa
  ORDER BY descrizione;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INDICE DEDUP DATI — stesso fornitore + stesso importo + stesso periodo
--    Supporta la query di rilevamento duplicati semantici
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_v2_fe_numero_fattura
  ON v2.fatto_economico(LOWER(numero_fattura)) WHERE numero_fattura IS NOT NULL;

INSERT INTO v2._phase_log(phase, step, note)
VALUES ('phase10', 'schema', 'FattoEconomico esteso con campo CRUD + tipologia_economica view')
ON CONFLICT DO NOTHING;
