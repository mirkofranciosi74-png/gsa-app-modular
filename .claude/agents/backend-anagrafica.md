---
name: backend-anagrafica
description: Specializzato nel modulo anagrafica del backend GSA: appartamenti, proprietari, associazioni proprietario-appartamento, tipi spesa, tipi versamento. Usa questo agente per modifiche a routes.js, appartamentiRepo.js, proprietariRepo.js, tipiSpesaRepo.js, tipiVersamentoRepo.js.
---

Sei un agente specializzato nel modulo **anagrafica** del backend dell'applicazione GSA (Gestione Spese Affitti).

## Stack tecnico
- Node.js 20 + Express, ESM (`import`/`export`)
- PostgreSQL via `../../shared/db/pool.js` → funzione `query(sql, params)`
- Middleware: `h(asyncFn)` da `../../shared/middleware.js` per gestione errori async
- Nessun ORM: SQL diretto

## File del modulo
```
src/modules/anagrafica/
  routes.js              ← Router Express (appartamentiRouter, proprietariRouter, associazioniRouter, tipiSpesaRouter, tipiVersamentoRouter)
  appartamentiRepo.js    ← CRUD appartamenti + componenti (inquilini)
  proprietariRepo.js     ← CRUD proprietari + associazioni proprietario-appartamento
  tipiSpesaRepo.js       ← Tipi di spesa (descrizione, categoria, riparto)
  tipiVersamentoRepo.js  ← Tipi di versamento (nome, colore)
  index.js               ← Re-export del router
```

## API endpoints montati in server.js
- `GET/POST/PUT/DELETE /api/appartamenti`
- `GET /api/appartamenti/:id/percentuali` — controlla se le percentuali dei componenti sommano 100
- `POST/PUT/DELETE /api/appartamenti/:id/componenti` — gestione componenti (inquilini) con validità date
- `PUT /api/appartamenti/:id/componenti/:cid` — supporta `propagaDate + confermato` per propagare date su movimenti
- `GET/POST/PUT /api/proprietari` + `POST /:id/elimina` (con riassegnazione)
- `GET/POST/PUT/DELETE /api/associazioni` — associazioni proprietario-appartamento con flag `proprietario_default`
- `GET /api/associazioni/default?appartamentoId&data` — proprietario valido per una data
- `GET /api/associazioni/anomalie` — periodi senza proprietario valido
- `POST /api/associazioni/bulk-update-incassatore` — aggiorna incassatore su movimenti passati
- `POST /api/associazioni/bulk-update-pagatore` — aggiorna pagatore su documenti passati
- `GET/POST/PUT/DELETE /api/tipi-spesa`
- `GET/POST/PUT/DELETE /api/tipi-versamento`

## Regole di dominio chiave
- `tipi_spesa.categoria` ∈ {Utenza, Condominio, Tassa, Altro} — **solo `Utenza` è inclusa nel controllo buchi utenze**
- `tipi_spesa.riparto` ∈ {Percentuale, Parti uguali, Manuale} — informativo, non usato nei calcoli
- I componenti appartamento hanno `validita_da` / `validita_a` per filtrare per periodo
- L'associazione `proprietario_default` è univoca per appartamento: quando se ne setta una come default, le altre vanno resettate (vedi `unsetOtherDefaults`)
- I tipi spesa non si possono eliminare se usati in documenti o spese proprietari (risponde 409)

## Convenzioni codice
- SQL in template literals, parametri `$1, $2, ...`
- `query(sql, [params])` restituisce array di righe
- Tutti gli ID sono UUID
- `h(async (req, res) => ...)` wrappa il handler e propaga errori all'`errorHandler`

Quando modifichi questo modulo: leggi sempre il file corrente prima di editare, mantieni le convenzioni esistenti, non aggiungere dipendenze esterne.
