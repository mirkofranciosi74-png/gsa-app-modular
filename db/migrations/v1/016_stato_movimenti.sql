-- 016: stato manuale + rilevazione automatica duplicati nei movimenti

ALTER TABLE movimenti
  ADD COLUMN IF NOT EXISTS stato VARCHAR(20) NOT NULL DEFAULT 'normale'
    CHECK (stato IN ('normale', 'sospetto', 'verificato'));

CREATE INDEX IF NOT EXISTS idx_movimenti_stato ON movimenti(stato);
-- indici per la subquery di rilevazione duplicati
CREATE INDEX IF NOT EXISTS idx_movimenti_dup_data
  ON movimenti(componente_id, importo, segno, data_versamento)
  WHERE data_versamento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movimenti_dup_mese
  ON movimenti(componente_id, importo, segno, mese_riferimento)
  WHERE mese_riferimento IS NOT NULL;

-- Ricrea la vista includendo stato e duplicato_rilevato
DROP VIEW IF EXISTS v_movimenti_dettaglio;
CREATE VIEW v_movimenti_dettaglio AS
SELECT
  m.id, m.appartamento_id, m.componente_id,
  m.tipo, m.segno, m.periodicita,
  m.importo,
  (m.importo * m.segno)                        AS importo_netto,
  m.validita_da, m.validita_a,
  m.descrizione,
  m.tipo_versamento, m.data_versamento, m.mese_riferimento,
  m.incassato_da_proprietario_id,
  m.stato,
  m.created_at, m.updated_at,
  a.nome                                       AS appartamento_nome,
  (c.nome || ' ' || COALESCE(c.cognome, ''))  AS componente_nome,
  c.validita_da                                AS comp_validita_da,
  c.validita_a                                 AS comp_validita_a,
  -- anomalia di periodo
  CASE
    WHEN c.validita_da IS NOT NULL AND m.validita_a  IS NOT NULL
         AND m.validita_a  < c.validita_da THEN TRUE
    WHEN c.validita_a  IS NOT NULL AND m.validita_da IS NOT NULL
         AND m.validita_da > c.validita_a  THEN TRUE
    ELSE FALSE
  END AS fuori_validita,
  -- duplicato rilevato automaticamente: stesso inquilino, stesso importo+segno,
  -- stessa data_versamento OPPURE stesso mese_riferimento
  EXISTS (
    SELECT 1 FROM movimenti m2
    WHERE  m2.id            != m.id
      AND  m2.componente_id  = m.componente_id
      AND  m2.importo        = m.importo
      AND  m2.segno          = m.segno
      AND  (
        (m2.data_versamento  IS NOT NULL AND m.data_versamento  IS NOT NULL
         AND m2.data_versamento  = m.data_versamento)
        OR
        (m2.mese_riferimento IS NOT NULL AND m.mese_riferimento IS NOT NULL
         AND m2.mese_riferimento = m.mese_riferimento)
      )
  ) AS duplicato_rilevato
FROM movimenti m
JOIN appartamenti a ON a.id = m.appartamento_id
JOIN componenti   c ON c.id = m.componente_id;
