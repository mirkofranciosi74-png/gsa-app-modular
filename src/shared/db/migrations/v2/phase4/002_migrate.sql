-- ============================================================
-- FASE 4 — FATTO ECONOMICO: Migrazione dati
-- ============================================================

BEGIN;

-- ── Step 1: documenti → fatto_economico (tipo=spesa) ────────────────────────
INSERT INTO v2.fatto_economico
  (immobile_id, persona_id, tipo, tipo_spesa_id, importo, segno,
   periodo_da, periodo_a, data_evento, descrizione, fornitore, numero_doc,
   stato, legacy_tipo, legacy_id)
SELECT
  i.id                          AS immobile_id,
  (SELECT pl.persona_id FROM v2.persona_legacy pl
   WHERE pl.legacy_tipo='proprietario' AND pl.legacy_id=d.pagato_da_proprietario_id
   LIMIT 1)                     AS persona_id,
  'spesa'::v2.fatto_tipo,
  d.tipo_spesa_id,
  d.importo,
  1                             AS segno,
  d.periodo_da,
  d.periodo_a,
  d.data_caricamento            AS data_evento,
  d.note_ai                     AS descrizione,
  d.fornitore,
  d.numero_doc,
  CASE d.stato
    WHEN 'elaborato'      THEN 'verificato'
    WHEN 'da_verificare'  THEN 'da_verificare'
    WHEN 'errore'         THEN 'errore'
    ELSE 'normale'
  END                           AS stato,
  'documento',
  d.id
FROM documenti d
LEFT JOIN v2.immobile i ON i.legacy_id = d.appartamento_id
WHERE d.importo IS NOT NULL AND d.importo > 0
  AND NOT EXISTS (
    SELECT 1 FROM v2.fatto_economico fe
    WHERE fe.legacy_tipo = 'documento' AND fe.legacy_id = d.id
  );

-- ── Step 2: movimenti → fatto_economico (tipo=entrata) ──────────────────────
INSERT INTO v2.fatto_economico
  (immobile_id, persona_id, tipo, tipo_spesa_id, importo, segno,
   periodo_da, periodo_a, data_evento, descrizione, periodicita,
   legacy_tipo, legacy_id)
SELECT
  i.id                          AS immobile_id,
  pl.persona_id,
  'entrata'::v2.fatto_tipo,
  NULL                          AS tipo_spesa_id,
  m.importo,
  m.segno,
  m.mese_riferimento            AS periodo_da,
  m.mese_riferimento            AS periodo_a,
  m.data_versamento             AS data_evento,
  m.descrizione,
  m.periodicita::TEXT,
  'movimento',
  m.id
FROM movimenti m
JOIN v2.immobile i ON i.legacy_id = m.appartamento_id
JOIN v2.persona_legacy pl ON pl.legacy_tipo='componente' AND pl.legacy_id = m.componente_id
WHERE NOT EXISTS (
  SELECT 1 FROM v2.fatto_economico fe
  WHERE fe.legacy_tipo = 'movimento' AND fe.legacy_id = m.id
);

-- ── Step 3: spese_proprietari → fatto_economico (tipo=spesa) ────────────────
INSERT INTO v2.fatto_economico
  (immobile_id, persona_id, tipo, tipo_spesa_id, importo, segno,
   periodo_da, periodo_a, data_evento, descrizione, fornitore, numero_doc,
   periodicita, stato, legacy_tipo, legacy_id)
SELECT
  i.id                          AS immobile_id,
  pl.persona_id,
  'spesa'::v2.fatto_tipo,
  sp.tipo_spesa_id,
  sp.importo,
  1,
  sp.mese_competenza            AS periodo_da,
  sp.mese_competenza            AS periodo_a,
  sp.data_pagamento             AS data_evento,
  sp.descrizione,
  sp.fornitore,
  sp.numero_fattura,
  sp.periodicita,
  sp.stato,
  'spesa_proprietario',
  sp.id
FROM spese_proprietari sp
JOIN v2.immobile i ON i.legacy_id = sp.appartamento_id
JOIN v2.persona_legacy pl ON pl.legacy_tipo='proprietario' AND pl.legacy_id = sp.proprietario_id
WHERE NOT EXISTS (
  SELECT 1 FROM v2.fatto_economico fe
  WHERE fe.legacy_tipo = 'spesa_proprietario' AND fe.legacy_id = sp.id
);

INSERT INTO v2._phase_log (phase, step, note)
VALUES ('phase4', 'migrate',
  'documenti + movimenti + spese_proprietari migrati in v2.fatto_economico')
ON CONFLICT (phase, step) DO UPDATE SET applied_at = NOW();

COMMIT;

SELECT 'Phase 4 migrazione completata — ' || NOW()::TEXT AS esito;
