-- ============================================================
-- FASE 1 — PERSONA: Migrazione dati
--
-- Algoritmo di deduplicazione:
--   1. Prima migra tutti i proprietari (spesso hanno email valida)
--   2. Per ogni componente:
--      a. Se email non nulla → cerca persona con stessa email
--      b. Altrimenti → cerca persona con stesso nome+cognome (normalizzato)
--      c. Se trovata → riusa quella persona, aggiunge solo il legacy link
--      d. Se non trovata → crea nuova persona
--
-- Idempotente: rilancia senza effetti se già eseguita.
-- ============================================================

BEGIN;

-- ── Step 1: Migra proprietari → v2.persona ───────────────────────────────────
INSERT INTO v2.persona (id, nome, cognome, email, telefono, indirizzo, attivo, created_at)
SELECT
  gen_random_uuid(),
  p.nome,
  p.cognome,
  NULLIF(TRIM(p.email), ''),
  NULLIF(TRIM(p.telefono), ''),
  NULLIF(TRIM(p.indirizzo), ''),
  p.attivo,
  p.created_at
FROM proprietari p
WHERE NOT EXISTS (
  SELECT 1 FROM v2.persona_legacy pl
  WHERE pl.legacy_tipo = 'proprietario' AND pl.legacy_id = p.id
);

INSERT INTO v2.persona_legacy (persona_id, legacy_tipo, legacy_id)
SELECT
  per.id,
  'proprietario',
  p.id
FROM proprietari p
JOIN v2.persona per ON (
  -- match per email
  (TRIM(p.email) != '' AND p.email IS NOT NULL
   AND LOWER(TRIM(per.email)) = LOWER(TRIM(p.email)))
  OR
  -- match per nome+cognome quando email mancante
  (COALESCE(TRIM(p.email),'') = '' AND
   LOWER(TRIM(per.nome)) = LOWER(TRIM(p.nome)) AND
   LOWER(TRIM(COALESCE(per.cognome,''))) = LOWER(TRIM(COALESCE(p.cognome,''))))
)
WHERE NOT EXISTS (
  SELECT 1 FROM v2.persona_legacy pl
  WHERE pl.legacy_tipo = 'proprietario' AND pl.legacy_id = p.id
)
-- In caso di ambiguità prende il più recente
ORDER BY per.created_at
LIMIT 1;  -- sicurezza: in caso di duplicati email prende una sola persona

-- fallback: se il link non esiste ancora, collega all'ultima persona inserita con quei dati
INSERT INTO v2.persona_legacy (persona_id, legacy_tipo, legacy_id)
SELECT DISTINCT ON (p.id)
  per.id,
  'proprietario',
  p.id
FROM proprietari p
JOIN v2.persona per ON
  LOWER(TRIM(per.nome)) = LOWER(TRIM(p.nome)) AND
  LOWER(TRIM(COALESCE(per.cognome,''))) = LOWER(TRIM(COALESCE(p.cognome,'')))
WHERE NOT EXISTS (
  SELECT 1 FROM v2.persona_legacy pl
  WHERE pl.legacy_tipo = 'proprietario' AND pl.legacy_id = p.id
)
ORDER BY p.id, per.created_at;

-- ── Step 2: Migra componenti → v2.persona (con dedup) ─────────────────────────
DO $$
DECLARE
  rec      RECORD;
  pid      UUID;
BEGIN
  FOR rec IN
    SELECT c.*
    FROM componenti c
    WHERE NOT EXISTS (
      SELECT 1 FROM v2.persona_legacy pl
      WHERE pl.legacy_tipo = 'componente' AND pl.legacy_id = c.id
    )
  LOOP
    pid := NULL;

    -- Cerca match per email
    IF rec.email IS NOT NULL AND TRIM(rec.email) != '' THEN
      SELECT p.id INTO pid
      FROM v2.persona p
      WHERE LOWER(TRIM(p.email)) = LOWER(TRIM(rec.email))
      LIMIT 1;
    END IF;

    -- Cerca match per nome+cognome se email non ha trovato nulla
    IF pid IS NULL THEN
      SELECT p.id INTO pid
      FROM v2.persona p
      WHERE LOWER(TRIM(p.nome))                        = LOWER(TRIM(rec.nome))
        AND LOWER(TRIM(COALESCE(p.cognome, '')))        = LOWER(TRIM(COALESCE(rec.cognome, '')))
        AND NOT EXISTS (
          -- non ambiguare: non collegare se quella persona ha già un componente diverso
          SELECT 1 FROM v2.persona_legacy pl2
          WHERE pl2.persona_id = p.id AND pl2.legacy_tipo = 'componente'
        )
      LIMIT 1;
    END IF;

    -- Nessun match → crea nuova persona
    IF pid IS NULL THEN
      INSERT INTO v2.persona (nome, cognome, email, telefono, attivo, created_at)
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

    -- Registra il legacy link
    INSERT INTO v2.persona_legacy (persona_id, legacy_tipo, legacy_id)
    VALUES (pid, 'componente', rec.id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ── Step 3: Arricchisce persona con dati mancanti ─────────────────────────────
-- Se una persona ha email da proprietario ma non da componente (o viceversa)
UPDATE v2.persona p
SET
  telefono  = COALESCE(p.telefono, src.telefono),
  indirizzo = COALESCE(p.indirizzo, src.indirizzo)
FROM (
  SELECT
    pl.persona_id,
    NULLIF(TRIM(c.telefono), '')  AS telefono,
    NULL::TEXT                    AS indirizzo
  FROM componenti c
  JOIN v2.persona_legacy pl ON pl.legacy_id = c.id AND pl.legacy_tipo = 'componente'
  UNION ALL
  SELECT
    pl.persona_id,
    NULLIF(TRIM(pr.telefono), '') AS telefono,
    NULLIF(TRIM(pr.indirizzo), '') AS indirizzo
  FROM proprietari pr
  JOIN v2.persona_legacy pl ON pl.legacy_id = pr.id AND pl.legacy_tipo = 'proprietario'
) src
WHERE src.persona_id = p.id
  AND (src.telefono IS NOT NULL OR src.indirizzo IS NOT NULL);

INSERT INTO v2._phase_log (phase, step, note)
VALUES ('phase1', 'migrate', 'Dati componenti e proprietari migrati in v2.persona')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW();

COMMIT;

SELECT 'Phase 1 migrazione completata — ' || NOW()::TEXT AS esito;
