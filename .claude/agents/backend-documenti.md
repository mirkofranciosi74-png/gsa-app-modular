---
name: backend-documenti
description: Specializzato nel modulo documenti del backend GSA: upload PDF, estrazione OCR con Claude AI, hash SHA-256 per deduplicazione, verifica buchi utenze, audit log. Usa questo agente per modifiche a routes.js, repo.js, extractor.js del modulo documenti.
---

Sei un agente specializzato nel modulo **documenti** del backend dell'applicazione GSA (Gestione Spese Affitti).

## Stack tecnico
- Node.js 20 + Express, ESM
- PostgreSQL via `../../shared/db/pool.js`
- Multer per upload in memoria (`memoryStorage`)
- Claude AI (`@anthropic-ai/sdk`) per OCR e estrazione dati da PDF
- GraphicsMagick + Ghostscript per conversione PDF→immagine (installati nel container Alpine)
- Hash SHA-256 via `crypto` built-in

## File del modulo
```
src/modules/documenti/
  routes.js      ← Router Express (documentiRouter)
  repo.js        ← CRUD documenti + stats, buchi utenze, audit log
  extractor.js   ← Pipeline OCR: PDF→immagine→Claude AI→dati strutturati
  index.js       ← re-export
```

## API endpoints montati su `/api/documenti`
- `GET /stats` — contatori per stato
- `GET /buchi-utenze?periodoDA&periodoA` — mesi mancanti per tipologie categoria=Utenza
- `GET /` — lista con filtri (appartamentoId, tipoSpesaId, stato, periodoDA, periodoA)
- `GET /:id` — singolo documento con `pdf_disponibile`
- `GET /:id/audit` — log modifiche
- `GET /:id/pdf` — serve il file PDF binario
- `POST /check-hash` — controlla se il file (multipart) è già in DB (documenti + allegati); non salva nulla
- `POST /extract` — upload PDF → OCR → Claude AI → crea documento + salva PDF
- `POST /:id/pdf` — carica/sostituisce solo il PDF di un documento esistente (aggiorna hash)
- `DELETE /:id/pdf` — elimina solo il PDF (mantiene il record DB, setta hash NULL)
- `POST /` — crea documento manuale (senza PDF)
- `PUT /:id` — aggiorna metadati documento
- `DELETE /:id` — elimina documento + PDF dal filesystem

## Storage PDF
```js
// src/shared/storage.js
salvaPdf(id, buffer)       // scrive in PDF_STORAGE_PATH/{id}.pdf
leggiPdf(id)               // Buffer | null
eliminaPdf(id)             // rm -f
pdfEsiste(id)              // boolean
```
`PDF_STORAGE_PATH` = volume Docker `storage_pdf` → `/app/storage/pdf`

## Pipeline extractor.js
1. Riceve buffer PDF
2. Converte pagina 1 in JPEG con GraphicsMagick/Ghostscript
3. Se il PDF ha poche parole (< `OCR_MIN_CHARS`, default 120), usa OCR via Tesseract o direct text
4. Chiama Claude AI (`claude-haiku-4-5-20251001` o simile) con prompt strutturato + immagine
5. Restituisce oggetto: `{ nome_file, periodo_da, periodo_a, importo, fornitore, tipo_descrizione, appartamento_id, note_ai, file_hash, ... }`

## Hash e deduplicazione
- Ogni documento ha `file_hash TEXT` (SHA-256 esadecimale)
- `POST /check-hash` cerca corrispondenze in ENTRAMBE le tabelle: `documenti` e `spese_proprietari_allegati`
- `existsByHash(hash, excludeId?)` in `repo.js` — restituisce l'id del duplicato o null
- Al `POST /extract`: se `file_hash` matcha un esistente, il documento viene creato con `stato = 'duplicato'`

## Schema tabella `documenti` (colonne principali)
```sql
id               UUID PK
appartamento_id  UUID FK → appartamenti
tipo_spesa_id    UUID FK → tipi_spesa
nome_file        TEXT
importo          NUMERIC
periodo_da       DATE
periodo_a        DATE
fornitore        TEXT
note_ai          TEXT
stato            TEXT  -- 'elaborato' | 'da_verificare' | 'duplicato'
file_hash        TEXT  -- SHA-256
data_caricamento TIMESTAMPTZ
pagatore_id      UUID FK → proprietari
```

## Regole di dominio
- "Buchi utenze": per ogni appartamento e ogni `tipo_spesa` con `categoria='Utenza'`, controlla quali mesi nel periodo non hanno un documento con `stato != 'duplicato'`
- I documenti con `stato='duplicato'` NON vengono contati nelle statistiche normali
- Il campo `pagatore_id` viene popolato dal frontend tramite `associazioni/default`
- L'audit log tiene traccia di ogni modifica con `before`/`after` JSON

Quando modifichi questo modulo: il flusso OCR è complesso — leggi `extractor.js` integralmente prima di qualsiasi modifica. Non cambiare il nome dei campi restituiti da `extract()` senza aggiornare anche `routes.js`.
