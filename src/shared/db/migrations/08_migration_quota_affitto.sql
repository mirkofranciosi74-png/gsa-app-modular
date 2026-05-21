-- ══════════════════════════════════════════════════════════════════
-- MIGRATION: rinomina campo quota/quota_mensile → quota_affitto
-- nella tabella componenti.
--
-- Questo campo rappresenta la quota mensile di affitto dovuta
-- dall'inquilino, da usare nella sezione AFFITTO della griglia.
--
-- Eseguire UNA SOLA VOLTA sul DB prima di deployare il codice.
-- Sicura da eseguire più volte: i blocchi DO ... END gestiscono il
-- caso in cui il campo esista già con il nuovo nome.
-- ══════════════════════════════════════════════════════════════════

-- Passo 1: rinomina quota → quota_affitto (se esiste ancora quota)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'componenti' AND column_name = 'quota'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'componenti' AND column_name = 'quota_affitto'
  ) THEN
    ALTER TABLE componenti RENAME COLUMN quota TO quota_affitto;
    RAISE NOTICE 'Rinominato: quota → quota_affitto';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'componenti' AND column_name = 'quota'
  ) THEN
    RAISE NOTICE 'Colonna quota trovata ma quota_affitto esiste già — skip.';
  ELSE
    RAISE NOTICE 'Colonna quota non trovata, skip.';
  END IF;
END
$$;

-- Passo 2: rinomina quota_mensile → quota_affitto (se esiste ancora quota_mensile)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'componenti' AND column_name = 'quota_mensile'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'componenti' AND column_name = 'quota_affitto'
  ) THEN
    ALTER TABLE componenti RENAME COLUMN quota_mensile TO quota_affitto;
    RAISE NOTICE 'Rinominato: quota_mensile → quota_affitto';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'componenti' AND column_name = 'quota_mensile'
  ) THEN
    RAISE NOTICE 'Colonna quota_mensile trovata ma quota_affitto esiste già — skip.';
  ELSE
    RAISE NOTICE 'Colonna quota_mensile non trovata, skip.';
  END IF;
END
$$;

-- Passo 3: se quota_affitto non esiste ancora, aggiungila (DB già pulito)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'componenti' AND column_name = 'quota_affitto'
  ) THEN
    ALTER TABLE componenti ADD COLUMN quota_affitto NUMERIC(10,2) DEFAULT 0;
    RAISE NOTICE 'Colonna quota_affitto aggiunta (era assente).';
  END IF;
END
$$;

-- Passo 4: verifica finale
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'componenti' AND column_name = 'quota_affitto'
  ) THEN
    RAISE NOTICE '✓ OK: colonna quota_affitto presente in componenti.';
  ELSE
    RAISE EXCEPTION '✗ ERRORE: colonna quota_affitto NON trovata in componenti!';
  END IF;
END
$$;

-- Verifica manuale (decommentare per controllare):
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'componenti'
-- ORDER BY ordinal_position;
