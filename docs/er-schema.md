# GSA — Schema Entità-Relazioni

## Diagramma ER

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ANAGRAFICA PRINCIPALE                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐       ┌────────────────────────────────┐
│  appartamenti    │       │  appartamento_proprietari      │
├──────────────────┤       ├────────────────────────────────┤
│ id (PK)          │◄──────│ appartamento_id (FK)           │
│ nome             │       │ proprietario_id (FK) ──────────┼──┐
│ via              │       │ percentuale_proprieta          │  │
│ citta            │       │ data_inizio                    │  │
│ cap              │       │ data_fine                      │  │
│ note             │       │ proprietario_default           │  │
│ attivo           │       └────────────────────────────────┘  │
└────────┬─────────┘                                            │
         │                                                      │
         │ 1:N                                          ┌───────▼──────┐
         │                                              │  proprietari │
         ▼                                              ├──────────────┤
┌──────────────────┐                                   │ id (PK)      │
│   componenti     │                                   │ nome         │
│   (inquilini)    │                                   │ cognome      │
├──────────────────┤                                   │ indirizzo    │
│ id (PK)          │                                   │ telefono     │
│ appartamento_id  │◄──────────────────────────────────│ email        │
│   (FK)           │                                   │ attivo       │
│ nome             │                                   └──────────────┘
│ cognome          │
│ percentuale      │
│ quota_affitto    │
│ caparra          │
│ validita_da      │
│ validita_a       │
│ attivo           │
└────────┬─────────┘
         │
         │ 1:N
         │
         ▼
┌──────────────────┐
│   movimenti      │
│  (versamenti)    │
├──────────────────┤
│ id (PK)          │
│ appartamento_id  │
│   (FK)           │
│ componente_id    │
│   (FK)           │
│ incassato_da_    │
│  proprietario_id │
│   (FK, nullable) │
│ segno (+1/-1)    │
│ periodicita      │
│ importo          │
│ validita_da      │
│ validita_a       │
│ tipo_versamento  │
│ data_versamento  │
│ mese_riferimento │
└──────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                           SPESE E DOCUMENTI                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐       ┌──────────────────┐
│  tipi_spesa      │       │    documenti     │
├──────────────────┤       ├──────────────────┤
│ id (PK)          │◄──────│ tipo_spesa_id    │
│ descrizione      │       │   (FK)           │
│ categoria        │       │ appartamento_id  │
│ riparto          │       │   (FK)           │
│ attivo           │       │ pagato_da_prop.  │
└──────────────────┘       │   _id (FK, null) │
                           │ nome_file        │
                           │ file_hash        │
                           │ fornitore        │
                           │ numero_doc       │
                           │ importo          │
                           │ periodo_da       │
                           │ periodo_a        │
                           │ stato            │
                           │ metodo_estrazione│
                           │ confidenza       │
                           │ validato         │
                           └────────┬─────────┘
                                    │ 1:N
                                    ▼
                           ┌──────────────────┐
                           │  documenti_audit │
                           ├──────────────────┤
                           │ id (PK)          │
                           │ documento_id (FK)│
                           │ campo            │
                           │ valore_da        │
                           │ valore_a         │
                           └──────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                          REGOLE DI RIPARTO                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│                  regole_riparto                        │
├────────────────────────────────────────────────────────┤
│ id (PK)                                                │
│ appartamento_id (FK) ──────────► appartamenti          │
│ tipo_spesa_id (FK, nullable) ──► tipi_spesa            │
│ target: 'inquilini' | 'proprietari'                    │
│ tipo_versamento (nullable)                             │
│ quota_totale_pct                                       │
│ modalita: 'escludi' | 'includi'                        │
│ split_uguale                                           │
│ validita_da / validita_a                               │
└────────────────┬───────────────────────────────────────┘
                 │
    ┌────────────┼────────────────────────────┐
    │            │                            │
    ▼            ▼                            ▼
┌──────────┐ ┌──────────┐         ┌──────────────────────┐
│ regole_  │ │ regole_  │         │ regole_              │
│ riparto_ │ │ riparto_ │         │ riparto_             │
│ esclusi  │ │ inclusi  │         │ esclusi_prop /       │
├──────────┤ ├──────────┤         │ inclusi_prop         │
│ regola_id│ │ regola_id│         ├──────────────────────┤
│ compo-   │ │ compo-   │         │ regola_id (FK)       │
│ nente_id │ │ nente_id │         │ proprietario_id (FK) │
│  (FK)    │ │  (FK)    │         │ percentuale (nullable│
└──────────┘ └──────────┘         │  solo per inclusi)   │
     │              │             └──────────────────────┘
     ▼              ▼
 componenti     componenti


┌─────────────────────────────────────────────────────────────────────────────┐
│                         ARCHIVIO DOCUMENTALE                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────┐       ┌──────────────────────┐
│ archivio_tipi_documento│       │  archivio_documenti  │
├────────────────────────┤       ├──────────────────────┤
│ id (PK)                │◄──────│ tipo_documento_id    │
│ nome                   │       │   (FK, nullable)     │
│ descrizione            │       │ nome_file            │
│ entita[]               │       │ file_hash            │
│  (appartamento/        │       │ mime_type            │
│   inquilino/           │       │ estensione           │
│   proprietario)        │       │ note                 │
└────────────────────────┘       └──────────┬───────────┘
                                            │ 1:N
                                            ▼
                                 ┌──────────────────────┐
                                 │ archivio_associazioni│
                                 ├──────────────────────┤
                                 │ documento_id (FK)    │
                                 │ entita_tipo          │
                                 │  (appartamento/      │
                                 │   inquilino/         │
                                 │   proprietario)      │
                                 │ entita_id (UUID)     │
                                 └──────────────────────┘
                                  punta a:
                                  → appartamenti.id
                                  → componenti.id
                                  → proprietari.id


┌─────────────────────────────────────────────────────────────────────────────┐
│                           REPORT SALVATI                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│  report_salvati  │
├──────────────────┤
│ id (PK)          │
│ nome             │
│ parametri (JSONB)│
│ testo            │
│ pdf_base64       │
└──────────────────┘
```

---

## Tabelle — descrizione sintetica

| Tabella | Righe tipiche | Descrizione |
|---------|--------------|-------------|
| `appartamenti` | 1–20 | Anagrafica appartamenti gestiti |
| `proprietari` | 1–10 | Proprietari degli appartamenti |
| `appartamento_proprietari` | 1–5 per app. | Associazione con percentuale di proprietà e periodo |
| `componenti` | 2–10 per app. | Inquilini/co-intestatari con quota affitto e caparra |
| `tipi_spesa` | ~10–30 | Categorie di spesa (Acqua, Luce, Gas, TARI…) |
| `documenti` | 10–200 per anno | Bollette e fatture PDF con dati estratti via OCR |
| `documenti_audit` | 0–N per doc | Log modifiche ai campi di un documento |
| `movimenti` | 5–50 per mese | Versamenti inquilini (affitto, conguaglio, rimborso…) |
| `regole_riparto` | 1–10 per app. | Regole di distribuzione spese/entrate |
| `regole_riparto_esclusi` | 0–N per regola | Inquilini esclusi da una regola (modalità escludi) |
| `regole_riparto_inclusi` | 0–N per regola | Inquilini inclusi in una regola (modalità includi) |
| `regole_riparto_esclusi_prop` | 0–N per regola | Proprietari esclusi (riparto entrate) |
| `regole_riparto_inclusi_prop` | 0–N per regola | Proprietari inclusi con % personalizzabile |
| `report_salvati` | 0–50 | Report PDF generati e salvati |
| `archivio_tipi_documento` | 5–20 | Classificazione documenti archivio (contratti, verbali…) |
| `archivio_documenti` | 0–200 | Documenti generici archiviati (non solo PDF spese) |
| `archivio_associazioni` | 0–N per doc | Collegamento documento ↔ entità (appartamento/inquilino/proprietario) |

---

## Enumerazioni

| Tipo | Valori |
|------|--------|
| `doc_stato` | `elaborato` · `da_verificare` · `errore` · `duplicato` |
| `mov_tipo` | `Versamento` |
| `periodicita` | `una_tantum` · `mensile` · `bimestrale` · `trimestrale` · `semestrale` · `annuale` |
| `riparto_mode` | `Percentuale` · `Parti uguali` · `Manuale` |
| `estrazione_metodo` | `pdf-parse` · `tesseract-ocr` · `manuale` |
| `regola_modalita` | `escludi` · `includi` |
| `versamento_tipo` | `affitto` · `conguaglio` · `rimborso` · `altro` |

---

## Viste

| Vista | Descrizione |
|-------|-------------|
| `v_percentuali_appartamento` | Somma percentuali inquilini attivi per appartamento |
| `v_saldo_componenti` | Saldo netto versato per ogni inquilino attivo |
| `v_spese_appartamento` | Totale spese elaborate per appartamento |
| `v_movimenti_dettaglio` | Movimenti con importo netto, nome appartamento/inquilino, flag `fuori_validita` |
