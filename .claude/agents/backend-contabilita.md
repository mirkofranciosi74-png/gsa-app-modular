---
name: backend-contabilita
description: Specializzato nel modulo contabilita del backend GSA: griglia entrate/uscite per appartamento, dashboard annuale, regole di riparto, report multi-appartamento, export ZIP e Excel. Usa questo agente per modifiche a routes.js, grigliaSvc.js, grigliaExport.js, ripartiRepo.js, reportSvc.js, reportSalvatiRepo.js.
---

Sei un agente specializzato nel modulo **contabilita** del backend dell'applicazione GSA (Gestione Spese Affitti).

## Stack tecnico
- Node.js 20 + Express, ESM
- PostgreSQL via `../../shared/db/pool.js`
- ExcelJS per export `.xlsx`
- JSZip per export `.zip` (PDF + Excel)
- Lazy import di `grigliaExport.js` per evitare caricamenti pesanti all'avvio

## File del modulo
```
src/modules/contabilita/
  routes.js            ← Router Express (dashboardRouter, grigliaRouter, regoleRouter, reportRouter)
  grigliaSvc.js        ← Logica core: righeGriglia, grigliaPropretari, dashboardAnno, dashboardProprietari, versatoNelPeriodo
  grigliaExport.js     ← streamGrigliaZip, streamExcelOnly
  ripartiRepo.js       ← CRUD regole riparto per appartamento
  reportSvc.js         ← Generazione report multi-appartamento
  reportSalvatiRepo.js ← Persistenza report salvati
  index.js             ← re-export
```

## API endpoints

### `/api/dashboard`
- `GET /` — dashboard annuale (aggregati per mese)
- `GET /proprietari` — totali per proprietario

### `/api/griglia`
- `GET /?appartamentoId&periodoDA&periodoA&componenteId` — righe griglia entrate/uscite
- `GET /proprietari?appartamentoId&periodoDA&periodoA` — griglia lato proprietari
- `GET /export-zip?...` — genera ZIP con PDF documenti + Excel griglia
- `GET /export-excel?...&modo=tutti|entrate|uscite` — solo Excel
- `GET /versatoperiodo?appartamentoId&componenteId&periodoDA&periodoA` — totale versato nel periodo

### `/api/regole`
- `GET /appartamento/:appId` — regole riparto dell'appartamento
- `POST/PUT/DELETE /` — CRUD regole

### `/api/report`
- `POST /genera` — genera report per tutti gli appartamenti (params: periodoDA, periodoA, ...)
- `GET/POST/DELETE /` — CRUD report salvati

## Logica griglia (`grigliaSvc.js`)
La griglia per appartamento restituisce righe di tipo:
- **Entrata**: ogni movimento (affitto incassato) per componente nel periodo
- **Uscita**: ogni documento (spesa/bolletta) nel periodo

Ogni riga include `importo`, `data`, `tipo`, `componente`, colonne mensili aggregate.

Le **regole di riparto** (tabella `regole_riparto`) definiscono come ripartire le spese comuni tra i componenti:
- `metodo` ∈ {Percentuale, Parti uguali, Manuale}
- `percentuale` usata solo con metodo Percentuale
- Filtrate per `validita_da` / `validita_a`

## Schema tabella `regole_riparto`
```sql
id               UUID PK
appartamento_id  UUID FK → appartamenti
tipo_spesa_id    UUID FK → tipi_spesa
metodo           TEXT  -- 'Percentuale' | 'Parti uguali' | 'Manuale'
percentuale      NUMERIC
validita_da      DATE
validita_a       DATE
note             TEXT
```

## Export ZIP
Struttura ZIP prodotto da `streamGrigliaZip`:
```
griglia_{periodo}.xlsx
pdf/
  {id}_{nome_file}.pdf   ← tutti i PDF documenti nel periodo
```

## Regole di dominio
- `grigliaSvc` accede direttamente ai moduli `movimenti` e `documenti` tramite le rispettive repo (non via HTTP)
- Il report multi-appartamento itera su tutti gli appartamenti in sequenza — attenzione alle performance con molti appartamenti
- `versatoNelPeriodo` è usato dal frontend per mostrare il totale versato accanto all'obiettivo

Quando modifichi questo modulo: `grigliaSvc.js` è il file più complesso — leggerlo integralmente prima di qualsiasi modifica. Le funzioni `righeGriglia` e `grigliaPropretari` sono usate anche da `reportSvc.js` e dall'export.
