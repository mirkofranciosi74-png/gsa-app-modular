-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 16 / 001 — Separazione tipi_spesa: crea v2.tipo_spesa autonoma
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;

-- 1. Tabella autonoma v2 con nomi colonna puliti
CREATE TABLE IF NOT EXISTS v2.tipo_spesa (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  descrizione    TEXT         NOT NULL,
  tipo           TEXT         NOT NULL DEFAULT 'spesa' CHECK (tipo IN ('spesa','entrata')),
  categoria      TEXT         NOT NULL DEFAULT 'Altro',
  metodo_riparto riparto_mode NOT NULL DEFAULT 'Percentuale',
  codice         VARCHAR(50),
  validita_da    DATE,
  validita_a     DATE,
  note           TEXT,
  attivo         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_v2_tipo_spesa_desc
  ON v2.tipo_spesa(LOWER(descrizione));
CREATE UNIQUE INDEX IF NOT EXISTS idx_v2_tipo_spesa_codice
  ON v2.tipo_spesa(LOWER(codice)) WHERE codice IS NOT NULL;

-- 2. Copia dati dalla tabella legacy con mapping colonne
INSERT INTO v2.tipo_spesa
  (id, descrizione, tipo, categoria, metodo_riparto, codice, validita_da, validita_a, note, attivo, created_at)
SELECT
  id,
  descrizione,
  COALESCE(tipo_movimento, 'spesa'),
  COALESCE(categoria, 'Altro'),
  riparto,
  codice,
  validita_da,
  validita_a,
  note,
  attivo,
  created_at
FROM tipi_spesa
ON CONFLICT (id) DO NOTHING;

-- 3. FK da v2.fatto_economico → v2.tipo_spesa (la colonna tipo_spesa_id esiste già)
ALTER TABLE v2.fatto_economico
  DROP CONSTRAINT IF EXISTS fk_fe_tipo_spesa;
ALTER TABLE v2.fatto_economico
  ADD CONSTRAINT fk_fe_tipo_spesa
  FOREIGN KEY (tipo_spesa_id) REFERENCES v2.tipo_spesa(id) ON DELETE SET NULL;

-- 4. FK da v2.regola_riparto_condominio → v2.tipo_spesa (era su tipi_spesa public)
ALTER TABLE v2.regola_riparto_condominio
  DROP CONSTRAINT IF EXISTS regola_riparto_condominio_tipo_spesa_id_fkey,
  DROP CONSTRAINT IF EXISTS fk_rrc_tipo_spesa;
ALTER TABLE v2.regola_riparto_condominio
  ADD CONSTRAINT fk_rrc_tipo_spesa
  FOREIGN KEY (tipo_spesa_id) REFERENCES v2.tipo_spesa(id) ON DELETE SET NULL;

-- 5. Drop della vista-wrapper (non più necessaria)
DROP VIEW IF EXISTS v2.tipologia_economica;

INSERT INTO v2._phase_log(phase, step, note)
VALUES ('phase16', 'tipo_spesa',
  'v2.tipo_spesa autonoma creata; FK v2.fatto_economico e v2.regola_riparto_condominio aggiornate; view tipologia_economica rimossa')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW(), note = EXCLUDED.note;

COMMIT;

SELECT 'Phase 16 / 001 tipo_spesa applicato — ' || NOW()::TEXT AS esito;
