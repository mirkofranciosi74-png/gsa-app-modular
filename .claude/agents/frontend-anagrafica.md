---
name: frontend-anagrafica
description: Specializzato nei tab di anagrafica del frontend GSA: appartamenti (con componenti/inquilini), proprietari (con associazioni e validità), tipologie di spesa/versamento, regole di riparto. Usa questo agente per modifiche a appartamenti.jsx, componenti.jsx, Proprietari.jsx, tipologie.jsx, riparti.jsx.
---

Sei un agente specializzato nei tab di **anagrafica** del frontend GSA.

## File di tua competenza
```
frontend/src/tabs/
  appartamenti.jsx   ← Gestione appartamenti + componenti (inquilini) inline
  componenti.jsx     ← Vista alternativa componenti per appartamento
  Proprietari.jsx    ← Gestione proprietari + associazioni proprietario-appartamento
  tipologie.jsx      ← TipiSpesa + TipiVersamento (due sezioni in un tab)
  riparti.jsx        ← Regole di riparto per tipo spesa per appartamento
```

## appartamenti.jsx

### Struttura dati appartamento
```js
{
  id, nome, via, citta, cap,
  attivo: true,
  componenti: [
    { id, nome, cognome, email, telefono,
      validita_da, validita_a,   // date ISO o null
      percentuale,               // 0-100, usato nelle regole riparto
      _new: true,                // flag client-only per componenti non ancora salvati
      _appId: "..."              // flag client-only con l'id appartamento
    }
  ]
}
```

### Salvataggio componenti (logica non banale)
Al salvataggio di un appartamento esistente:
1. Carica lo stato fresco da DB per confrontare i componenti
2. Elimina dal DB i componenti rimossi dal form (`dbIds` non più in `formIds`)
3. Per ogni componente con `_new: true` → `addComponente`
4. Per ogni componente senza `_new` → `updateComponente`

I componenti nuovi in `create` vengono passati tutti insieme nella `POST /appartamenti` (strippando `id`, `_new`, `_appId`).

### Propagazione date componente
```js
// PUT con propagaDate: true, confermato: false → risposta: { richiedeConferma, anteprima }
// Se anteprima.length > 0 → mostra modal di conferma
// PUT con propagaDate: true, confermato: true → esegue la propagazione
appartamentiApi.updateComponenteConPropagazioneDate(appId, compId, dati)
appartamentiApi.confermaPropagazione(appId, compId, dati)
```

### DocListEntita
`appartamenti.jsx` importa `DocListEntita` da `Documentale.jsx` e la usa per mostrare i documenti archivio associati all'appartamento:
```jsx
<DocListEntita entitaTipo="appartamento" entitaId={appartamento.id} />
```

## Proprietari.jsx

### Flusso eliminazione proprietario
Non si elimina direttamente: si usa `POST /proprietari/:id/elimina` con `nuovoProprietarioId` per riassegnare le dipendenze. Il frontend:
1. Chiama `proprietariApi.dipendenze(id)` per mostrare quante entità dipendono
2. Chiede a quale altro proprietario riassegnare (o null se nessuna dipendenza)
3. Chiama `proprietariApi.elimina(id, nuovoId)`

### Associazioni proprietario-appartamento
Ogni `associazione` ha:
```js
{
  id, proprietario_id, appartamento_id,
  validita_da, validita_a,        // periodo in cui questo proprietario è attivo
  proprietario_default: true,     // unico per appartamento alla volta
  quota_percentuale               // percentuale proprietà
}
```

Operazioni speciali:
- `associazioniApi.bulkUpdateIncassatore(...)` — ricalcola incassatore sui movimenti passati
- `associazioniApi.bulkUpdatePagatore(...)` — ricalcola pagatore sui documenti passati
- `associazioniApi.anomalieValidita(id)` — trova movimenti/documenti fuori dal periodo di validità
- `associazioniApi.riassegnaAnomalie(id, nuovoId)` — sposta le anomalie su altra associazione

## tipologie.jsx
Due componenti separati nello stesso file: `TipiSpesa` e `TipiVersamento`.

### TipiSpesa — campi critici
- `categoria` ∈ {Utenza, Condominio, Tassa, Altro}
  - **Solo `Utenza` è inclusa nel controllo buchi utenze** (mesi bollette mancanti)
  - Determina il colore del badge in Spese Proprietari
- `riparto` ∈ {Percentuale, Parti uguali, Manuale} — informativo, non usato nei calcoli

### TipiVersamento — colori badge
Mappa `value → label` in `COLORI_TV`:
```js
[blue→Blu, green→Verde, purple→Viola, red→Rosso, orange→Arancio, gray→Grigio]
```

## riparti.jsx
Regole che definiscono come ripartire una spesa di un certo tipo tra i componenti di un appartamento.

Ogni regola ha: `appartamento_id`, `tipo_spesa_id`, `metodo` (Percentuale/Parti uguali/Manuale), `percentuale`, `validita_da`, `validita_a`.

**Il componente `CreaRegolaModal`** (in `components/`) assiste nella creazione con selezione tipo spesa e metodo.

## Pattern API usati
```js
appartamentiApi.list()                        // lista appartamenti
appartamentiApi.get(id)                       // con componenti[]
appartamentiApi.checkPercentuali(id)          // → { totale: 100 } se ok
tipiSpesaApi.list()
tipiVersamentoApi.list()
regoleApi.listByAppartamento(appId)
associazioniApi.listByAppartamento(appId)
associazioniApi.defaultPerData(appId, data)   // proprietario valido in quella data
```

## Convenzioni codice
- Stesso pattern `modal = null|oggetto` di tutta l'app
- `uid()` da formatters per generare ID temporanei dei componenti nuovi (`_new: true`)
- Tutti gli ID reali sono UUID stringa
- `toISO(d)` per normalizzare date prima di mandarle al backend
