-- ============================================================
-- FASE 5 — PAGAMENTO: Migrazione dati
-- I movimenti con data_versamento diventano v2.pagamento.
-- Collegamento al fatto_economico corrispondente (Fase 4).
-- ============================================================

BEGIN;

INSERT INTO v2.pagamento
  (fatto_id, persona_id, immobile_id, importo, segno,
   data_pagamento, tipo_versamento, mese_riferimento, periodicita,
   descrizione, legacy_id)
SELECT
  fe.id                         AS fatto_id,
  pl.persona_id,
  i.id                          AS immobile_id,
  m.importo,
  m.segno,
  m.data_versamento,
  m.tipo_versamento,
  m.mese_riferimento,
  m.periodicita::TEXT,
  m.descrizione,
  m.id                          AS legacy_id
FROM movimenti m
JOIN v2.fatto_economico fe ON fe.legacy_tipo = 'movimento' AND fe.legacy_id = m.id
JOIN v2.immobile i          ON i.legacy_id = m.appartamento_id
JOIN v2.persona_legacy pl   ON pl.legacy_tipo='componente' AND pl.legacy_id = m.componente_id
WHERE NOT EXISTS (
  SELECT 1 FROM v2.pagamento p WHERE p.legacy_id = m.id
);

INSERT INTO v2._phase_log (phase, step, note)
VALUES ('phase5', 'migrate', 'Movimenti migrati in v2.pagamento con collegamento a fatto_economico')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW();

COMMIT;

SELECT 'Phase 5 migrazione completata — ' || NOW()::TEXT AS esito;
