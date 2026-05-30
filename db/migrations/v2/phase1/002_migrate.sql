-- ============================================================
-- FASE 1 — PERSONA: Migrazione dati (idempotente)
-- Algoritmo: DO $$ procedurale per controllo preciso
--   1. Proprietari: match per email, poi per nome+cognome
--   2. Componenti: stessa logica, ma non riusa persona già
--      collegata a un altro componente (no falsi merge)
-- ============================================================

BEGIN;

DO $$
DECLARE
  rec  RECORD;
  pid  UUID;
BEGIN
  -- ── Step 1: Migra proprietari ────────────────────────────────────────────
  FOR rec IN SELECT * FROM proprietari ORDER BY created_at LOOP
    pid := NULL;

    -- match email
    IF rec.email IS NOT NULL AND TRIM(rec.email) != '' THEN
      SELECT p.id INTO pid FROM v2.persona p
      WHERE LOWER(TRIM(p.email)) = LOWER(TRIM(rec.email))
      LIMIT 1;
    END IF;

    -- match nome+cognome
    IF pid IS NULL THEN
      SELECT p.id INTO pid FROM v2.persona p
      WHERE LOWER(TRIM(p.nome))                   = LOWER(TRIM(rec.nome))
        AND LOWER(TRIM(COALESCE(p.cognome, '')))  = LOWER(TRIM(COALESCE(rec.cognome, '')))
      LIMIT 1;
    END IF;

    -- nuova persona
    IF pid IS NULL THEN
      INSERT INTO v2.persona
        (nome, cognome, email, telefono, indirizzo, attivo, created_at)
      VALUES (
        rec.nome,
        rec.cognome,
        NULLIF(TRIM(rec.email), ''),
        NULLIF(TRIM(rec.telefono), ''),
        NULLIF(TRIM(rec.indirizzo), ''),
        rec.attivo,
        rec.created_at
      )
      RETURNING id INTO pid;
    END IF;

    INSERT INTO v2.persona_legacy (persona_id, legacy_tipo, legacy_id)
    VALUES (pid, 'proprietario', rec.id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ── Step 2: Migra componenti ─────────────────────────────────────────────
  FOR rec IN SELECT * FROM componenti ORDER BY created_at LOOP
    pid := NULL;

    -- match email
    IF rec.email IS NOT NULL AND TRIM(rec.email) != '' THEN
      SELECT p.id INTO pid FROM v2.persona p
      WHERE LOWER(TRIM(p.email)) = LOWER(TRIM(rec.email))
      LIMIT 1;
    END IF;

    -- match nome+cognome (solo se quella persona non ha già un altro componente)
    IF pid IS NULL THEN
      SELECT p.id INTO pid FROM v2.persona p
      WHERE LOWER(TRIM(p.nome))                   = LOWER(TRIM(rec.nome))
        AND LOWER(TRIM(COALESCE(p.cognome, '')))  = LOWER(TRIM(COALESCE(rec.cognome, '')))
        AND NOT EXISTS (
          SELECT 1 FROM v2.persona_legacy pl
          WHERE pl.persona_id = p.id AND pl.legacy_tipo = 'componente'
        )
      LIMIT 1;
    END IF;

    -- nuova persona
    IF pid IS NULL THEN
      INSERT INTO v2.persona
        (nome, cognome, email, telefono, attivo, created_at)
      VALUES (
        rec.nome,
        rec.cognome,
        NULLIF(TRIM(rec.email), ''),
        NULLIF(TRIM(rec.telefono), ''),
        rec.attivo,
        rec.created_at
      )
      RETURNING id INTO pid;
    END IF;

    INSERT INTO v2.persona_legacy (persona_id, legacy_tipo, legacy_id)
    VALUES (pid, 'componente', rec.id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

INSERT INTO v2._phase_log (phase, step, note)
VALUES ('phase1', 'migrate', 'proprietari e componenti migrati in v2.persona')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW();

COMMIT;

SELECT 'Phase 1 migrazione completata — ' || NOW()::TEXT AS esito;
