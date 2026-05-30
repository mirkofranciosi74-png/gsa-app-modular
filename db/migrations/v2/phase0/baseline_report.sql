-- ============================================================
-- FASE 0 — REPORT BASELINE
-- Query di misurazione dello stato legacy.
-- Eseguire manualmente per documentare i valori attesi
-- prima di ogni fase di migrazione.
-- ============================================================

-- ── Conteggi entità ───────────────────────────────────────────────────────────
SELECT 'appartamenti'             AS entita, COUNT(*) AS totale FROM appartamenti
UNION ALL
SELECT 'appartamenti_attivi',              COUNT(*) FROM appartamenti WHERE attivo = TRUE
UNION ALL
SELECT 'componenti',                       COUNT(*) FROM componenti
UNION ALL
SELECT 'componenti_attivi',                COUNT(*) FROM componenti WHERE attivo = TRUE
UNION ALL
SELECT 'proprietari',                      COUNT(*) FROM proprietari
UNION ALL
SELECT 'proprietari_attivi',               COUNT(*) FROM proprietari WHERE attivo = TRUE
UNION ALL
SELECT 'appartamento_proprietari',         COUNT(*) FROM appartamento_proprietari
UNION ALL
SELECT 'documenti',                        COUNT(*) FROM documenti
UNION ALL
SELECT 'documenti_elaborati',              COUNT(*) FROM documenti WHERE stato = 'elaborato'
UNION ALL
SELECT 'movimenti',                        COUNT(*) FROM movimenti
UNION ALL
SELECT 'movimenti_versamenti',             COUNT(*) FROM movimenti WHERE segno = 1
UNION ALL
SELECT 'movimenti_rimborsi',               COUNT(*) FROM movimenti WHERE segno = -1
UNION ALL
SELECT 'spese_proprietari',                COUNT(*) FROM spese_proprietari
UNION ALL
SELECT 'regole_riparto',                   COUNT(*) FROM regole_riparto
UNION ALL
SELECT 'tipi_spesa',                       COUNT(*) FROM tipi_spesa
UNION ALL
SELECT 'archivio_documenti',               COUNT(*) FROM archivio_documenti
ORDER BY 1;

-- ── Totali economici per appartamento ─────────────────────────────────────────
SELECT
  a.nome                               AS appartamento,
  COUNT(DISTINCT d.id)                 AS n_documenti,
  COALESCE(SUM(d.importo),0)           AS totale_spese_inquilini,
  COUNT(DISTINCT sp.id)                AS n_spese_proprietari,
  COALESCE(SUM(sp.importo),0)          AS totale_spese_proprietari,
  COUNT(DISTINCT m.id)                 AS n_movimenti,
  COALESCE(SUM(m.importo * m.segno),0) AS totale_versamenti_netti
FROM appartamenti a
LEFT JOIN documenti         d  ON d.appartamento_id  = a.id AND d.stato = 'elaborato'
LEFT JOIN spese_proprietari sp ON sp.appartamento_id = a.id
LEFT JOIN movimenti         m  ON m.appartamento_id  = a.id
GROUP BY a.id, a.nome
ORDER BY a.nome;

-- ── Deduplicazione persone (preview Fase 1) ───────────────────────────────────
-- Quante persone uniche esistono se si uniscono componenti e proprietari?
WITH tutti AS (
  SELECT 'componente' AS tipo, id, LOWER(TRIM(nome)) AS nome_n, LOWER(TRIM(COALESCE(cognome,''))) AS cogn_n, LOWER(TRIM(COALESCE(email,''))) AS email_n
  FROM componenti
  UNION ALL
  SELECT 'proprietario', id, LOWER(TRIM(nome)), LOWER(TRIM(COALESCE(cognome,''))), LOWER(TRIM(COALESCE(email,'')))
  FROM proprietari
),
grouped AS (
  SELECT
    CASE WHEN email_n != '' THEN email_n ELSE nome_n || ' ' || cogn_n END AS chiave,
    COUNT(*) AS duplicati,
    STRING_AGG(tipo, ', ' ORDER BY tipo) AS tipi,
    COUNT(DISTINCT tipo) AS n_tipi
  FROM tutti
  GROUP BY 1
)
SELECT
  COUNT(*)                            AS persone_uniche_attese,
  SUM(CASE WHEN duplicati > 1 THEN 1 ELSE 0 END) AS con_duplicati,
  SUM(CASE WHEN n_tipi > 1 THEN 1 ELSE 0 END)     AS cross_role
FROM grouped;

-- ── Integrità referenziale legacy ─────────────────────────────────────────────
SELECT 'componenti_senza_appartamento' AS anomalia,
       COUNT(*) AS n
FROM componenti c
WHERE NOT EXISTS (SELECT 1 FROM appartamenti a WHERE a.id = c.appartamento_id)
UNION ALL
SELECT 'movimenti_senza_componente',
       COUNT(*)
FROM movimenti m
WHERE NOT EXISTS (SELECT 1 FROM componenti c WHERE c.id = m.componente_id)
UNION ALL
SELECT 'documenti_con_tipo_spesa_mancante',
       COUNT(*)
FROM documenti d
WHERE d.tipo_spesa_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tipi_spesa ts WHERE ts.id = d.tipo_spesa_id)
UNION ALL
SELECT 'spese_prop_con_proprietario_mancante',
       COUNT(*)
FROM spese_proprietari sp
WHERE NOT EXISTS (SELECT 1 FROM proprietari p WHERE p.id = sp.proprietario_id);
