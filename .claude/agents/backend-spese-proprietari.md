---
name: backend-spese-proprietari
description: Specializzato nel modulo spese_proprietari del backend GSA: spese pagate dai proprietari (bollette, manutenzioni), allegati multipli per spesa con hash SHA-256, check duplicati cross-table. Usa questo agente per modifiche a routes.js, repo.js, allegatoRepo.js, tipiSpesaPropRepo.js.
---

Sei un agente specializzato nel modulo **spese_proprietari** del backend dell'applicazione GSA (Gestione Spese Affitti).

## Stack tecnico
- Node.js 20 + Express, ESM
- PostgreSQL via `../../shared/db/pool.js`
- Multer (`up.array("files", 20)`) per upload multiplo in memoria
- Hash SHA-256 via `crypto` built-in
- `path.extname` per preservare estensione file

## File del modulo
```
src/modules/spese_proprietari/
  routes.js          ← Router Express (speseProprietariRouter)
  repo.js            ← CRUD spese_proprietari
  allegatoRepo.js    ← CRUD allegati + ricerca duplicati cross-table
  tipiSpesaPropRepo.js ← (usato raramente, tipi specifici proprietari)
```

## API endpoints montati su `/api/spese-proprietari`
- `GET /` — lista spese con filtri: `proprietarioId`, `appartamentoId`, `tipoSpesa`, `da`, `a`; include `n_allegati` per ogni spesa
- `POST /` — crea spesa
- `PUT /:id` — aggiorna spesa
- `PATCH /:id/stato` — cambia stato
- `DELETE /:id` — elimina spesa + allegati (CASCADE in DB) + eventuale file legacy PDF
- `POST /check-hash` — verifica hash (multipart) senza salvare; cerca in `spese_proprietari_allegati` E `documenti`
- `GET /:id/allegati` — lista allegati di una spesa
- `POST /:id/allegati` — upload multiplo (campo `files`); calcola hash, cerca duplicati, salva file + record
- `GET /:id/allegati/:allegatoId` — serve il file binario
- `DELETE /:id/allegati/:allegatoId` — elimina allegato (file + record)

## Storage allegati
```js
// src/shared/storage.js
salvaAllegato(id, estensione, buffer)    // scrive in ARCHIVIO_STORAGE_PATH/{id}{ext}
leggiAllegato(id, estensione)            // Buffer | null
eliminaAllegato(id, estensione)          // rm -f
```
`ARCHIVIO_STORAGE_PATH` = volume Docker `storage_archivio` → `/app/storage/archivio`

Nota: gli allegati spese proprietari **condividono il filesystem** con l'archivio documenti generico, ma usano tabelle DB separate.

## Schema tabelle principali
```sql
-- spese_proprietari
id               UUID PK
appartamento_id  UUID FK → appartamenti
proprietario_id  UUID FK → proprietari
tipo_spesa_id    UUID FK → tipi_spesa
importo          NUMERIC
data_pagamento   DATE
mese_competenza  TEXT  -- 'YYYY-MM'
fornitore        TEXT
note             TEXT
stato            TEXT

-- spese_proprietari_allegati
id          UUID PK
spesa_id    UUID FK → spese_proprietari ON DELETE CASCADE
nome_file   TEXT
mime_type   TEXT
estensione  TEXT   -- es. '.pdf', '.jpg'
file_hash   TEXT   -- SHA-256
created_at  TIMESTAMPTZ
```

## Deduplicazione hash (cross-table)
`allegatoRepo.findDuplicates(hash, spesaId)` cerca corrispondenze in:
1. `spese_proprietari_allegati` — `duplicati.allegati`
2. `documenti` — `duplicati.documenti`

Restituisce `{ allegati: [...], documenti: [...] }`. Il parametro `spesaId` esclude gli allegati della stessa spesa dalla ricerca (utile in caso di sostituzioni).

## Nota su file legacy
Prima della migrazione agli allegati multipli, le spese potevano avere un PDF diretto (con `salvaPdf(spesaId, ...)`). Il `DELETE /:id` chiama `eliminaPdf(req.params.id)` per pulire questo file legacy se esiste. I nuovi allegati usano `salvaAllegato` con UUID proprio.

## Regole di dominio
- Una spesa può avere 0…N allegati
- Il tipo spesa (`tipo_spesa_id`) è condiviso con il modulo documenti — stessa tabella `tipi_spesa`
- `mese_competenza` è usato per raggruppare le spese nella griglia contabilità proprietari

Quando modifichi questo modulo: la chiave `fromForm` nel frontend distingue upload da form nuovo vs da pulsante intestazione — lato backend è trasparente, ma è utile saperlo per debug.
