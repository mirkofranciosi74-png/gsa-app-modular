-- 017: rimuovi vincolo CHECK su tipo_riga in regole_importazione
-- tipo_riga ora può contenere: "ignora", oppure qualunque nome
-- di tipo_versamento o tipo_spesa (per pre-impostare la categoria alla riga importata)
ALTER TABLE regole_importazione
  DROP CONSTRAINT IF EXISTS regole_importazione_tipo_riga_check;
