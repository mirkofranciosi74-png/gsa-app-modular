-- Estende il vincolo entita_tipo di archivio_associazioni per supportare le entità v2
ALTER TABLE archivio_associazioni
  DROP CONSTRAINT archivio_associazioni_entita_tipo_check;

ALTER TABLE archivio_associazioni
  ADD CONSTRAINT archivio_associazioni_entita_tipo_check
    CHECK (entita_tipo IN ('appartamento','inquilino','proprietario','spesa','immobile','persona'));
