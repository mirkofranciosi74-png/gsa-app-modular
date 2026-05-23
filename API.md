# GSA — Riferimento API

**Base URL:** `http://localhost:3001/api`  
**Formato:** JSON (tranne dove indicato diversamente)  
**Content-Type richieste:** `application/json` (o `multipart/form-data` per upload file)  
**Autenticazione:** nessuna (applicativo ad uso locale/privato)

---

## Indice

1. [Health](#1-health)
2. [Appartamenti](#2-appartamenti)
3. [Componenti (Inquilini)](#3-componenti-inquilini)
4. [Proprietari](#4-proprietari)
5. [Associazioni Proprietario-Appartamento](#5-associazioni-proprietario-appartamento)
6. [Tipi di Spesa](#6-tipi-di-spesa)
7. [Spese (Documenti)](#7-spese-documenti)
8. [Movimenti (Versamenti)](#8-movimenti-versamenti)
9. [Griglia Economica](#9-griglia-economica)
10. [Regole di Riparto](#10-regole-di-riparto)
11. [Dashboard](#11-dashboard)
12. [Report](#12-report)
13. [Archivio Documentale](#13-archivio-documentale)
14. [Amministrazione](#14-amministrazione)
15. [Modelli di dato](#15-modelli-di-dato)
16. [Codici di errore](#16-codici-di-errore)

---

## 1. Health

### `GET /api/health`

Verifica che il backend sia operativo.

**Risposta `200`**
```json
{ "ok": true, "ts": "2026-05-22T10:00:00.000Z" }
```

---

## 2. Appartamenti

### `GET /api/appartamenti`

Restituisce tutti gli appartamenti attivi.

**Risposta `200`** — array di [Appartamento](#appartamento)

---

### `GET /api/appartamenti/:id`

Restituisce un appartamento con i suoi componenti.

**Risposta `200`** — [Appartamento](#appartamento) con campo `componenti: Componente[]`  
**Risposta `404`** — `{ "error": "Non trovato" }`

---

### `POST /api/appartamenti`

Crea un nuovo appartamento.

**Body**
| Campo | Tipo | Obbligatorio |
|-------|------|:---:|
| `nome` | string | ✓ |
| `via` | string | |
| `citta` | string | |
| `cap` | string | |
| `note` | string | |

**Risposta `201`** — [Appartamento](#appartamento) creato

---

### `PUT /api/appartamenti/:id`

Aggiorna un appartamento. Accetta gli stessi campi di POST.

**Risposta `200`** — [Appartamento](#appartamento) aggiornato

---

### `DELETE /api/appartamenti/:id`

Disattiva (soft delete) l'appartamento.

**Risposta `204`** — nessun contenuto

---

### `GET /api/appartamenti/:id/percentuali`

Verifica che la somma delle percentuali dei componenti sia valida.

**Risposta `200`**
```json
{ "totale": 100 }
```

---

## 3. Componenti (Inquilini)

I componenti sono sempre gestiti nel contesto di un appartamento.

### `POST /api/appartamenti/:id/componenti`

Aggiunge un inquilino all'appartamento.

**Body**
| Campo | Tipo | Obbligatorio |
|-------|------|:---:|
| `nome` | string | ✓ |
| `cognome` | string | |
| `email` | string | |
| `telefono` | string | |
| `percentuale` | number | |
| `quota_affitto` | number | |
| `caparra` | number | |
| `validita_da` | `YYYY-MM-DD` | |
| `validita_a` | `YYYY-MM-DD` | |

**Risposta `201`** — [Componente](#componente) creato

---

### `PUT /api/appartamenti/:id/componenti/:cid`

Aggiorna un componente. Supporta la propagazione delle date sui movimenti esistenti.

**Body** — stessi campi di POST, più:
| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `propagaDate` | boolean | Se `true` propaga `validita_da`/`validita_a` ai movimenti collegati |
| `confermato` | boolean | Se `true` insieme a `propagaDate`, esegue la propagazione; se `false` restituisce un'anteprima |

**Risposta `200` (aggiornamento normale)** — [Componente](#componente) aggiornato

**Risposta `200` (anteprima propagazione, quando `propagaDate=true` e `confermato=false`)**
```json
{
  "richiedeConferma": true,
  "anteprima": [
    { "id": "uuid", "descrizione": "Affitto mensile Mario Rossi", ... }
  ]
}
```

---

### `DELETE /api/appartamenti/:id/componenti/:cid`

Elimina un componente.

**Risposta `204`** — nessun contenuto

---

## 4. Proprietari

### `GET /api/proprietari`

Restituisce tutti i proprietari.

**Risposta `200`** — array di [Proprietario](#proprietario)

---

### `GET /api/proprietari/:id`

**Risposta `200`** — [Proprietario](#proprietario)  
**Risposta `404`** — `{ "error": "Non trovato" }`

---

### `POST /api/proprietari`

**Body**
| Campo | Tipo | Obbligatorio |
|-------|------|:---:|
| `nome` | string | ✓ |
| `cognome` | string | |
| `indirizzo` | string | |
| `telefono` | string | |
| `email` | string | |

**Risposta `201`** — [Proprietario](#proprietario) creato

---

### `PUT /api/proprietari/:id`

Aggiorna un proprietario. Accetta gli stessi campi di POST.

**Risposta `200`** — [Proprietario](#proprietario) aggiornato

---

### `DELETE /api/proprietari/:id`

**Risposta `204`** — nessun contenuto

---

## 5. Associazioni Proprietario-Appartamento

### `GET /api/associazioni/appartamento/:appId`

Restituisce tutte le associazioni di un appartamento.

**Risposta `200`** — array di [Associazione](#associazione)

---

### `GET /api/associazioni/default`

Restituisce il proprietario default valido in una certa data.

**Query parameters**
| Param | Tipo | Obbligatorio |
|-------|------|:---:|
| `appartamentoId` | UUID | ✓ |
| `data` | `YYYY-MM-DD` | ✓ |

**Risposta `200`**
```json
{ "proprietario_id": "uuid" }
```
**Risposta `400`** — `{ "error": "appartamentoId e data obbligatori" }`

---

### `POST /api/associazioni`

Crea una nuova associazione proprietario-appartamento.

**Body**
| Campo | Tipo | Obbligatorio |
|-------|------|:---:|
| `appartamento_id` | UUID | ✓ |
| `proprietario_id` | UUID | ✓ |
| `percentuale_proprieta` | number | ✓ |
| `data_inizio` | `YYYY-MM-DD` | ✓ |
| `data_fine` | `YYYY-MM-DD` | |
| `proprietario_default` | boolean | |

**Risposta `201`** — [Associazione](#associazione) creata

---

### `PUT /api/associazioni/:id`

Aggiorna un'associazione. Accetta gli stessi campi di POST.

**Risposta `200`** — [Associazione](#associazione) aggiornata

---

### `DELETE /api/associazioni/:id`

**Risposta `204`** — nessun contenuto

---

## 6. Tipi di Spesa

### `GET /api/tipi-spesa`

Restituisce tutti i tipi di spesa.

**Risposta `200`** — array di [TipoSpesa](#tipospesa)

---

### `POST /api/tipi-spesa`

**Body**
| Campo | Tipo | Obbligatorio |
|-------|------|:---:|
| `descrizione` | string | ✓ |
| `categoria` | string | |

**Risposta `201`** — [TipoSpesa](#tipospesa) creato

---

### `PUT /api/tipi-spesa/:id`

**Risposta `200`** — [TipoSpesa](#tipospesa) aggiornato

---

### `DELETE /api/tipi-spesa/:id`

Restituisce sempre errore: i tipi spesa non si eliminano se in uso.

**Risposta `409`** — `{ "error": "I tipi spesa non possono essere eliminati se in uso. Usa rinomina." }`

---

## 7. Spese (Documenti)

### `GET /api/documenti`

Restituisce l'elenco delle spese filtrate.

**Query parameters**
| Param | Tipo | Descrizione |
|-------|------|-------------|
| `appartamentoId` | UUID | Filtra per appartamento |
| `periodoDA` | `YYYY-MM` | Filtra spese che si sovrappongono da questo mese |
| `periodoA` | `YYYY-MM` | Filtra spese che si sovrappongono fino a questo mese |
| `tipo` | string | Filtra per descrizione del tipo spesa |
| `stato` | string | `elaborato` \| `da_verificare` \| `errore` \| `duplicato` |

**Risposta `200`** — array di [Spesa](#spesa) con campo aggiuntivo `pdf_disponibile: boolean`

---

### `GET /api/documenti/stats`

Restituisce statistiche aggregate sulle spese.

**Risposta `200`**
```json
{
  "totale": 150,
  "elaborati": 120,
  "da_verificare": 25,
  "duplicati": 5,
  "errori": 0
}
```

---

### `GET /api/documenti/buchi-utenze`

Individua mesi mancanti per combinazioni appartamento+tipo spesa (es. bollette non caricate).

**Query parameters**
| Param | Tipo |
|-------|------|
| `periodoDA` | `YYYY-MM` |
| `periodoA` | `YYYY-MM` |

**Risposta `200`** — array di oggetti:
```json
[
  {
    "appartamento_id": "uuid",
    "appartamento_nome": "Via Roma 1",
    "tipo_spesa_id": "uuid",
    "tipo_descrizione": "Acqua",
    "periodoMin": "2025-01",
    "periodoMax": "2025-12",
    "gaps": ["2025-03", "2025-07"]
  }
]
```

---

### `GET /api/documenti/:id`

**Risposta `200`** — [Spesa](#spesa) con `pdf_disponibile: boolean`  
**Risposta `404`** — `{ "error": "Non trovato" }`

---

### `GET /api/documenti/:id/audit`

Restituisce il log delle modifiche a una spesa.

**Risposta `200`** — array di:
```json
[
  {
    "id": "uuid",
    "documento_id": "uuid",
    "campo": "importo",
    "valore_da": "85.00",
    "valore_a": "92.50",
    "created_at": "2026-05-22T10:00:00Z"
  }
]
```

---

### `GET /api/documenti/:id/pdf`

Restituisce il file PDF della spesa.

**Risposta `200`** — binario PDF (`Content-Type: application/pdf`)  
**Risposta `404`** — `{ "error": "PDF non disponibile" }`

---

### `POST /api/documenti/extract`

Carica un PDF e ne estrae automaticamente i dati tramite AI (OCR + LLM). Salva il documento e il PDF, restituisce i campi estratti per la validazione.

**Body** — `multipart/form-data`
| Campo | Tipo |
|-------|------|
| `file` | file PDF |

**Risposta `201`**
```json
{
  "id": "uuid",
  "nome_file": "bolletta_acqua_mar2026.pdf",
  "tipo_descrizione": "Acqua",
  "appartamento_nome": "Via Roma 1",
  "periodo_da": "2026-03",
  "periodo_a": "2026-03",
  "importo": 45.80,
  "fornitore": "HERA",
  "stato": "elaborato",
  "confidenza": 92,
  "duplicato_di": null,
  "pdf_base64": "<base64>",
  "pdf_disponibile": true
}
```

---

### `POST /api/documenti/:id/pdf`

Carica o sostituisce il PDF di una spesa esistente senza riestrarne i dati. Calcola e salva l'hash SHA-256 per il rilevamento duplicati.

**Body** — `multipart/form-data`
| Campo | Tipo |
|-------|------|
| `file` | file PDF |

**Risposta `200`**
```json
{
  "ok": true,
  "pdf_disponibile": true,
  "duplicato_di": null
}
```
> Se `duplicato_di` è non null, il PDF caricato è identico a una spesa già presente con quell'ID.

---

### `POST /api/documenti`

Crea una spesa manualmente (senza PDF).

**Body** — [Spesa](#spesa) (campi obbligatori: `nome_file`)

**Risposta `201`** — [Spesa](#spesa) creata

---

### `PUT /api/documenti/:id`

Aggiorna i metadati di una spesa. Registra le modifiche nell'audit log.

**Body** — [Spesa](#spesa) (tutti i campi modificabili)

**Risposta `200`** — [Spesa](#spesa) aggiornata

---

### `DELETE /api/documenti/:id`

Elimina la spesa e il PDF associato.

**Risposta `204`** — nessun contenuto

---

## 8. Movimenti (Versamenti)

### `GET /api/movimenti`

**Query parameters**
| Param | Tipo |
|-------|------|
| `appartamentoId` | UUID |
| `componenteId` | UUID |

**Risposta `200`** — array di [Movimento](#movimento)

---

### `POST /api/movimenti`

**Body**
| Campo | Tipo | Obbligatorio |
|-------|------|:---:|
| `appartamento_id` | UUID | ✓ |
| `componente_id` | UUID | ✓ |
| `tipo` | string | ✓ (`Versamento` \| `Addebito`) |
| `segno` | integer | (`1` = entrata, `-1` = uscita) |
| `periodicita` | string | ✓ (`mensile` \| `bimestrale` \| `trimestrale` \| `semestrale` \| `annuale` \| `una_tantum`) |
| `importo` | number | ✓ |
| `validita_da` | `YYYY-MM-DD` | ✓ |
| `validita_a` | `YYYY-MM-DD` | |
| `tipo_versamento` | string | (`affitto` \| `conguaglio` \| `rimborso` \| `altro`) |
| `descrizione` | string | |
| `data_versamento` | `YYYY-MM-DD` | |
| `mese_riferimento` | `YYYY-MM` | Mese contabile (solo per `una_tantum`) |
| `incassato_da_proprietario_id` | UUID | |

**Risposta `201`** — [Movimento](#movimento) creato

---

### `PUT /api/movimenti/:id`

Accetta gli stessi campi di POST.

**Risposta `200`** — [Movimento](#movimento) aggiornato

---

### `DELETE /api/movimenti/:id`

**Risposta `204`** — nessun contenuto

---

## 9. Griglia Economica

### `GET /api/griglia`

Calcola la griglia economica per gli inquilini: quote spese per inquilino, versamenti, affitto mensile e conguaglio finale.

**Query parameters**
| Param | Tipo | Obbligatorio |
|-------|------|:---:|
| `appartamentoId` | UUID | ✓ |
| `periodoDA` | `YYYY-MM` | |
| `periodoA` | `YYYY-MM` | |
| `componenteId` | UUID | Filtra l'output a un solo inquilino |

**Risposta `200`**
```json
{
  "comps": [Componente],
  "righeDocumenti": [
    {
      "label": "Acqua Mar 2026",
      "tipo_descrizione": "Acqua",
      "periodo_da": "2026-03",
      "periodo_a": "2026-03",
      "importo_fattura": 90.00,
      "importo": 90.00,
      "mesi_fattura": 1,
      "mesi_filtro": 1,
      "quote": { "<componente_id>": 45.00, ... },
      "documento_id": "uuid",
      "pdf_disponibile": true
    }
  ],
  "righeMovimenti": [
    {
      "label": "Affitto Mario Rossi",
      "tipo_versamento": "affitto",
      "periodo_da": "2026-01",
      "periodo_a": "2026-03",
      "importo": 300.00,
      "quote": { "<componente_id>": 300.00 },
      "quotaTeorica": { "<componente_id>": 300.00 }
    }
  ],
  "totaliDovuto":  { "<componente_id>": 45.00 },
  "totaliVersato": { "<componente_id>": 300.00 },
  "conguagli":     { "<componente_id>": 255.00 }
}
```

> **Nota:** il conguaglio riportato dall'API non sottrae l'affitto (calcolato separatamente dal client a partire da `comp.quota_affitto`). L'export Excel calcola il conguaglio corretto: `Versato − Spese − Affitto`.

---

### `GET /api/griglia/proprietari`

Calcola la griglia economica per i proprietari: quota teorica spese, incassato reale, conguaglio.

**Query parameters**
| Param | Tipo | Obbligatorio |
|-------|------|:---:|
| `appartamentoId` | UUID | ✓ |
| `periodoDA` | `YYYY-MM` | |
| `periodoA` | `YYYY-MM` | |

**Risposta `200`**
```json
{
  "props": [Proprietario con percentuale_proprieta],
  "righeDocumenti": [
    {
      "tipo_descrizione": "Acqua",
      "periodo_da": "2026-03",
      "importo": 90.00,
      "pagato_da_proprietario_id": "uuid",
      "quote": { "<proprietario_id>": 45.00 },
      "pdf_disponibile": true
    }
  ],
  "righeMovimenti": [
    {
      "tipo_versamento": "affitto",
      "mese": "2026-03",
      "importo": 600.00,
      "incassato_da_proprietario_id": "uuid",
      "quoteReale":   { "<proprietario_id>": 600.00 },
      "quoteTeorica": { "<proprietario_id>": 600.00 }
    }
  ],
  "totaliDareTeorico":  { "<proprietario_id>": 45.00 },
  "totaliAvereTeorico": { "<proprietario_id>": 600.00 },
  "totaliPagato":       { "<proprietario_id>": 45.00 },
  "totaliIncassato":    { "<proprietario_id>": 600.00 },
  "periodoDA": "2026-01",
  "periodoA":  "2026-03"
}
```

---

### `GET /api/griglia/versatoperiodo`

Calcola il totale versato da un componente in un intervallo.

**Query parameters**
| Param | Tipo |
|-------|------|
| `appartamentoId` | UUID |
| `componenteId` | UUID |
| `periodoDA` | `YYYY-MM` |
| `periodoA` | `YYYY-MM` |

**Risposta `200`**
```json
{ "versato": 1800.00 }
```

---

### `GET /api/griglia/export-zip`

Genera e scarica un archivio ZIP contenente il foglio Excel della griglia inquilini e i PDF delle spese del periodo.

**Query parameters**
| Param | Tipo | Obbligatorio |
|-------|------|:---:|
| `appartamentoId` | UUID | ✓ |
| `periodoDA` | `YYYY-MM` | |
| `periodoA` | `YYYY-MM` | |

**Risposta `200`** — binario ZIP (`Content-Type: application/zip`)  
Contenuto ZIP:
```
griglia-economica.xlsx
documenti/
  bolletta_acqua_mar2026.pdf
  ...
```

---

### `GET /api/griglia/export-excel`

Genera e scarica un file Excel con uno o più fogli della griglia.

**Query parameters**
| Param | Tipo | Obbligatorio |
|-------|------|:---:|
| `appartamentoId` | UUID | ✓ |
| `periodoDA` | `YYYY-MM` | |
| `periodoA` | `YYYY-MM` | |
| `modo` | string | Default: `tutti` |

Valori di `modo`:
| Valore | Foglio generato |
|--------|-----------------|
| `inquilini` | Griglia Inquilini (dettaglio) |
| `sintetico` | Sintetica Inquilini (versamenti raggruppati per tipo+mese) |
| `proprietari` | Griglia Proprietari |
| `tutti` | Tutti e tre i fogli |

**Risposta `200`** — binario XLSX

---

## 10. Regole di Riparto

Definiscono come suddividere spese o versamenti tra inquilini o proprietari in modo personalizzato.

### `GET /api/regole/appartamento/:appId`

**Risposta `200`** — array di [RegolaRiparto](#regolariparto)

---

### `POST /api/regole`

**Body**
| Campo | Tipo | Obbligatorio |
|-------|------|:---:|
| `appartamento_id` | UUID | ✓ |
| `tipo_spesa_id` | UUID | (o `tipo_versamento`) |
| `tipo_versamento` | string | (o `tipo_spesa_id`) |
| `target` | string | `inquilini` \| `proprietari` |
| `descrizione` | string | |
| `quota_totale_pct` | number | |
| `modalita` | string | `percentuale` \| `quota_fissa` \| `uguale` |
| `split_uguale` | boolean | |
| `validita_da` | `YYYY-MM` | |
| `validita_a` | `YYYY-MM` | |
| `inclusi` | UUID[] | Componenti/proprietari inclusi |
| `esclusi` | UUID[] | Componenti/proprietari esclusi |

**Risposta `201`** — [RegolaRiparto](#regolariparto) creata

---

### `PUT /api/regole/:id`

**Risposta `200`** — [RegolaRiparto](#regolariparto) aggiornata

---

### `DELETE /api/regole/:id`

**Risposta `204`** — nessun contenuto

---

## 11. Dashboard

### `GET /api/dashboard`

Riepilogo economico di tutti gli appartamenti dall'inizio ad oggi, con mesi di affitto scoperti.

**Risposta `200`**
```json
{
  "periodoA": "2026-05",
  "totaleSpese": 15000.00,
  "totaleVersamenti": 22000.00,
  "totaleAffitto": 18000.00,
  "saldoGlobale": -11000.00,
  "perAppartamento": [
    {
      "id": "uuid",
      "nome": "Via Roma 1",
      "periodoDA": "2024-01",
      "totaleSpese": 5000.00,
      "totaleVersamenti": 8000.00,
      "totaleAffitto": 6000.00,
      "saldo": -3000.00,
      "mesiScoperti": [
        {
          "componenteId": "uuid",
          "componenteLabel": "Mario Rossi",
          "mesi": ["2025-11", "2025-12"]
        }
      ]
    }
  ]
}
```

---

### `GET /api/dashboard/proprietari`

Riepilogo economico per proprietari su tutti gli appartamenti.

**Risposta `200`**
```json
{
  "periodoA": "2026-05",
  "saldoGlobale": 5000.00,
  "saldoReale": 3000.00,
  "perAppartamento": [
    {
      "id": "uuid",
      "nome": "Via Roma 1",
      "periodoDA": "2024-01",
      "saldoGlobale": 2000.00,
      "saldoReale": 1500.00,
      "totaleIncassato": 10000.00,
      "totalePagato": 3000.00,
      "perProprietario": [
        {
          "id": "uuid",
          "nome": "Luca Bianchi",
          "dareTeorico": 3000.00,
          "avereTeorico": 10000.00,
          "pagato": 3000.00,
          "incassato": 10000.00,
          "conguaglio": 4000.00
        }
      ]
    }
  ]
}
```

---

## 12. Report

### `POST /api/report/genera`

Genera un report PDF per tutti gli appartamenti nel periodo indicato.

**Body**
```json
{
  "params": {
    "periodoDA": "2026-01",
    "periodoA": "2026-03"
  }
}
```

**Risposta `200`**
```json
{
  "testo": "...",
  "pdf_base64": "<base64 del PDF>"
}
```

---

### `GET /api/report`

Restituisce l'elenco dei report salvati.

**Risposta `200`** — array di [ReportSalvato](#reportsalvato)

---

### `GET /api/report/:id`

**Risposta `200`** — [ReportSalvato](#reportsalvato)  
**Risposta `404`** — `{ "error": "Non trovato" }`

---

### `POST /api/report`

Salva un report generato.

**Body** — [ReportSalvato](#reportsalvato) (senza `id` e `created_at`)

**Risposta `201`** — [ReportSalvato](#reportsalvato) salvato

---

### `DELETE /api/report/:id`

**Risposta `204`** — nessun contenuto

---

## 13. Archivio Documentale

L'archivio raccoglie documenti generici (contratti, planimetrie, verbali, ecc.) associabili a qualsiasi entità del sistema.

### Tipi Documento

#### `GET /api/archivio-tipi`

**Risposta `200`** — array di `{ id, descrizione, colore }`

#### `POST /api/archivio-tipi`

**Body** — `{ "descrizione": "Contratto", "colore": "#3B82F6" }`

**Risposta `201`** — tipo creato

#### `PUT /api/archivio-tipi/:id`

**Risposta `200`** — tipo aggiornato

#### `DELETE /api/archivio-tipi/:id`

**Risposta `204`**

---

### Documenti Archivio

#### `GET /api/archivio`

**Query parameters**
| Param | Tipo | Descrizione |
|-------|------|-------------|
| `tipoId` | UUID | Filtra per tipo documento |
| `entitaTipo` | string | `appartamento` \| `componente` \| `proprietario` \| `spesa` |
| `entitaId` | UUID | Filtra per ID dell'entità collegata |

**Risposta `200`** — array di [DocumentoArchivio](#documentoarchivio)

---

#### `GET /api/archivio/:id`

**Risposta `200`** — [DocumentoArchivio](#documentoarchivio)  
**Risposta `404`**

---

#### `GET /api/archivio/:id/file`

Restituisce il file fisico del documento.

**Risposta `200`** — binario del file con `Content-Type` corretto  
**Risposta `404`** — `{ "error": "File non disponibile" }`

---

#### `POST /api/archivio/upload`

Carica un documento nell'archivio.

**Body** — `multipart/form-data`
| Campo | Tipo |
|-------|------|
| `file` | file (qualsiasi formato) |
| `tipo_documento_id` | UUID (opzionale) |
| `note` | string (opzionale) |
| `associazioni` | JSON array (opzionale) — vedi sotto |

Formato `associazioni`:
```json
[
  { "entita_tipo": "appartamento", "entita_id": "uuid" },
  { "entita_tipo": "componente",   "entita_id": "uuid" }
]
```

**Risposta `201`** — [DocumentoArchivio](#documentoarchivio) creato

---

#### `PUT /api/archivio/:id`

Aggiorna metadati e associazioni di un documento.

**Body**
| Campo | Tipo |
|-------|------|
| `tipo_documento_id` | UUID |
| `note` | string |
| `nome_file` | string |
| `associazioni` | array (sovrascrive tutte le associazioni esistenti) |

**Risposta `200`** — [DocumentoArchivio](#documentoarchivio) aggiornato

---

#### `DELETE /api/archivio/:id`

Elimina il documento e il file fisico.

**Risposta `204`**

---

## 14. Amministrazione

### `GET /api/admin/backup`

Genera e scarica un backup compresso.

**Query parameters**
| Param | Valori | Descrizione |
|-------|--------|-------------|
| `tipo` | `tutto` (default) \| `db` \| `documentale` | `tutto` include dump SQL + file PDF + archivio; `db` solo il dump SQL; `documentale` solo i file |

**Risposta `200`** — archivio ZIP  
Struttura per `tipo=tutto`:
```
dump.sql
pdf/
  <uuid>.pdf
  ...
archivio/
  <uuid>.<ext>
  ...
```

---

### `POST /api/admin/restore`

Ripristina un backup precedentemente scaricato.

**Query parameters** — stesso `tipo` di `/backup`

**Body** — `multipart/form-data`
| Campo | Tipo |
|-------|------|
| `file` | ZIP di backup GSA |

**Risposta `200`**
```json
{
  "ok": true,
  "pdfRipristinati": 42,
  "archivioRipristinati": 15
}
```
**Risposta `400`** — se il file non è un backup GSA valido

---

### `GET /api/admin/logs/status`

**Risposta `200`**
```json
{
  "enabled": true,
  "exists": true,
  "sizeBytes": 204800,
  "path": "/app/logs/app.log"
}
```

---

### `POST /api/admin/logs/toggle`

Attiva o disattiva il logging su file.

**Body**
```json
{ "enabled": true }
```

**Risposta `200`**
```json
{ "enabled": true }
```

---

### `GET /api/admin/logs/download`

Scarica il file di log corrente.

**Risposta `200`** — file di testo (`Content-Type: text/plain`)

Formato delle righe (JSON Lines):
```
{"ts":"2026-05-22T10:00:00.000Z","level":"http","msg":"GET /api/documenti"}
```

---

### `DELETE /api/admin/logs`

Cancella il file di log.

**Risposta `204`**

---

## 15. Modelli di dato

### Appartamento
```json
{
  "id": "uuid",
  "nome": "Via Roma 1",
  "via": "Via Roma",
  "citta": "Bologna",
  "cap": "40121",
  "note": "",
  "attivo": true,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "componenti": [Componente]
}
```

### Componente
```json
{
  "id": "uuid",
  "appartamento_id": "uuid",
  "nome": "Mario",
  "cognome": "Rossi",
  "label": "Mario Rossi",
  "email": "mario@example.com",
  "telefono": "333-0000000",
  "percentuale": 50,
  "quota_affitto": 300.00,
  "caparra": 600.00,
  "validita_da": "2024-01-01",
  "validita_a": null,
  "attivo": true
}
```

### Proprietario
```json
{
  "id": "uuid",
  "nome": "Luca",
  "cognome": "Bianchi",
  "indirizzo": "Via Verdi 5, Milano",
  "telefono": "02-0000000",
  "email": "luca@example.com",
  "attivo": true
}
```

### Associazione
```json
{
  "id": "uuid",
  "appartamento_id": "uuid",
  "proprietario_id": "uuid",
  "proprietario_nome": "Luca",
  "proprietario_cognome": "Bianchi",
  "percentuale_proprieta": 100,
  "data_inizio": "2024-01-01",
  "data_fine": null,
  "proprietario_default": true
}
```

### TipoSpesa
```json
{
  "id": "uuid",
  "descrizione": "Acqua",
  "categoria": "utenze",
  "attivo": true
}
```

### Spesa
```json
{
  "id": "uuid",
  "appartamento_id": "uuid",
  "appartamento_nome": "Via Roma 1",
  "tipo_spesa_id": "uuid",
  "tipo_descrizione": "Acqua",
  "pagato_da_proprietario_id": "uuid",
  "nome_file": "bolletta_acqua_mar2026.pdf",
  "file_hash": "sha256hex",
  "fornitore": "HERA",
  "numero_doc": "2026/00123",
  "importo": 45.80,
  "periodo_da": "2026-03",
  "periodo_a": "2026-03",
  "stato": "elaborato",
  "metodo_estrazione": "ai",
  "confidenza": 92,
  "note_ai": "",
  "validato": true,
  "archivio_doc_id": "uuid | null",
  "data_caricamento": "2026-05-10T08:00:00Z"
}
```

**Valori di `stato`:** `elaborato` | `da_verificare` | `errore` | `duplicato`

### Movimento
```json
{
  "id": "uuid",
  "appartamento_id": "uuid",
  "componente_id": "uuid",
  "componente_label": "Mario Rossi",
  "incassato_da_proprietario_id": "uuid",
  "tipo": "Versamento",
  "segno": 1,
  "periodicita": "mensile",
  "importo": 300.00,
  "validita_da": "2024-01-01",
  "validita_a": null,
  "descrizione": "",
  "tipo_versamento": "affitto",
  "data_versamento": "2026-05-05",
  "mese_riferimento": "2026-05"
}
```

**Valori di `periodicita`:** `mensile` | `bimestrale` | `trimestrale` | `semestrale` | `annuale` | `una_tantum`  
**Valori di `tipo_versamento`:** `affitto` | `conguaglio` | `rimborso` | `altro`

### RegolaRiparto
```json
{
  "id": "uuid",
  "appartamento_id": "uuid",
  "tipo_spesa_id": "uuid | null",
  "tipo_versamento": "affitto | null",
  "target": "inquilini",
  "descrizione": "Affitto al 60/40",
  "quota_totale_pct": 100,
  "modalita": "percentuale",
  "split_uguale": false,
  "validita_da": "2024-01",
  "validita_a": null,
  "inclusi": [],
  "esclusi": []
}
```

### DocumentoArchivio
```json
{
  "id": "uuid",
  "tipo_documento_id": "uuid",
  "tipo_descrizione": "Contratto",
  "nome_file": "contratto_2024.pdf",
  "estensione": ".pdf",
  "mime_type": "application/pdf",
  "file_hash": "md5hex",
  "note": "",
  "created_at": "2024-01-15T09:00:00Z",
  "associazioni": [
    {
      "id": "uuid",
      "entita_tipo": "appartamento",
      "entita_id": "uuid",
      "entita_nome": "Via Roma 1"
    }
  ]
}
```

### ReportSalvato
```json
{
  "id": "uuid",
  "nome": "Report Q1 2026",
  "parametri": { "periodoDA": "2026-01", "periodoA": "2026-03" },
  "testo": "...",
  "pdf_base64": "<base64>",
  "created_at": "2026-04-01T10:00:00Z"
}
```

---

## 16. Codici di errore

| Codice | Significato |
|--------|-------------|
| `200` | OK |
| `201` | Risorsa creata |
| `204` | OK senza contenuto (DELETE, toggle) |
| `400` | Richiesta non valida (parametri mancanti o errati) |
| `404` | Risorsa non trovata |
| `409` | Conflitto (es. eliminazione di un tipo spesa in uso) |
| `500` | Errore interno del server |

**Formato degli errori:**
```json
{ "error": "Messaggio descrittivo dell'errore" }
```

---

*Generato il 2026-05-22 — GSA v2.0*
