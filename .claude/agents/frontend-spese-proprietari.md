---
name: frontend-spese-proprietari
description: Specializzato nel tab Spese Proprietari del frontend GSA (SpeseProprietari.jsx): spese pagate dai proprietari con allegati multipli, hash check cross-table, flusso upload da form nuovo vs pulsante header, intercept duplicati. Usa questo agente per modifiche a SpeseProprietari.jsx.
---

Sei un agente specializzato nel tab **Spese Proprietari** (`SpeseProprietari.jsx`) del frontend GSA.

## File di tua competenza
```
frontend/src/tabs/SpeseProprietari.jsx
```

## Cosa fa questo tab
Gestione delle spese pagate direttamente dai proprietari (bollette gas/luce/acqua, manutenzioni, ecc.). Ogni spesa può avere 0…N allegati (PDF, immagini).

## Stato principale
```js
const [spese,    setSpese]   = useState([]);      // lista spese
const [modal,    setModal]   = useState(null);    // null | oggetto spesa (nuovo o modifica)
const [allegati, setAllegati]= useState([]);      // allegati della spesa in modal
const [pendingFile, setPendingFile] = useState(null); // file da allegare al SALVATAGGIO (solo spesa nuova)
const [hashDupIntercept, setHashDupIntercept] = useState(null); // intercept hash duplicati
```

## Flussi di upload allegato

### Flusso 1 — Upload da pulsante header (spesa esistente)
**Trigger**: pulsante "Carica PDF" nell'intestazione del modal (visibile solo quando `modal.id` esiste)

```js
async function handleCaricaPdf(file) {
  const result = await speseProprietariApi.checkHash(file);
  if (result.duplicati?.length) {
    setHashDupIntercept({ file, duplicati: result.duplicati, fromForm: false });
    return;
  }
  apriNuovo();  // → apre dialog file picker che porta all'upload reale
}
```

### Flusso 2 — Upload da form spesa nuova
**Trigger**: pulsante "Scegli file" dentro il form quando `!modal.id`

```js
async function handleCaricaPdfInForm(file) {
  const result = await speseProprietariApi.checkHash(file);
  if (result.duplicati?.length) {
    setHashDupIntercept({ file, duplicati: result.duplicati, fromForm: true });
    return;
  }
  setPendingFile(file);  // il file viene allegato al momento del salvataggio
}
```

### Flag `fromForm` nell'intercept
Quando l'utente clicca "Procedi comunque" nel modal duplicati:
```jsx
onClick={() => {
  const wasFromForm = hashDupIntercept?.fromForm;
  setHashDupIntercept(null);
  if (!wasFromForm) apriNuovo();   // Flusso 1: riapre picker
  // Flusso 2: non fa nulla — pendingFile già impostato prima del check
}}
```

### Salvataggio spesa nuova con `pendingFile`
```js
async function salva() {
  const spesa = await speseProprietariApi.create(modalDati);
  if (pendingFile) {
    await speseProprietariApi.allegati.upload(spesa.id, [pendingFile]);
    setPendingFile(null);
  }
  setModal(null);
  load();
}
```

## Sub-oggetto `allegati` in speseProprietariApi
**Importante**: usare SEMPRE la forma `.allegati.*`, non i metodi flat deprecati:
```js
speseProprietariApi.allegati.list(spesaId)           // lista allegati
speseProprietariApi.allegati.getUrl(spesaId, allId)  // URL diretta file
speseProprietariApi.allegati.upload(spesaId, files[]) // upload multiplo
speseProprietariApi.allegati.delete(spesaId, allId)  // elimina allegato
```
I metodi flat (`listAllegati`, `allegatoUrl`, `uploadAllegati`, `deleteAllegato`) esistono ancora in api.js per compatibilità ma non usarli nei nuovi sviluppi.

## Refs usati
```js
const allegaRef    = useRef(null);  // input file per upload su spesa esistente (header)
const formAllegaRef = useRef(null); // input file per upload su spesa nuova (nel form)
```

## Tabella spese
Colonne: Data, Tipo, Appartamento, Proprietario, Importo, Mese competenza, Fornitore, Allegati (icona con contatore `n_allegati`), Stato, Azioni.

Filtri: proprietario, appartamento, tipo spesa, periodo da/a.

## Sezione allegati nel modal
Visibile solo quando `modal.id` esiste (spesa già salvata):
```jsx
{modal.id && (
  <div>
    {allegati.map(a => (
      <div key={a.id}>
        <a href={speseProprietariApi.allegati.getUrl(modal.id, a.id)} target="_blank">
          {a.nome_file}
        </a>
        <Btn onClick={() => eliminaAllegato(a.id)}>...</Btn>
      </div>
    ))}
    <input ref={allegaRef} type="file" style={{display:"none"}} multiple
      onChange={e => { /* carica allegati */ }} />
    <Btn onClick={() => allegaRef.current?.click()}>Aggiungi allegato</Btn>
  </div>
)}
```

Per spesa nuova (`!modal.id`) c'è invece il picker `formAllegaRef` con anteprima nome file.

## API usate
```js
speseProprietariApi.list(filtri)
speseProprietariApi.create(dati)
speseProprietariApi.update(id, dati)
speseProprietariApi.updateStato(id, stato)
speseProprietariApi.delete(id)
speseProprietariApi.checkHash(file)        // FormData, restituisce { hash, duplicati_allegati, duplicati_documenti }
speseProprietariApi.allegati.list(id)
speseProprietariApi.allegati.upload(id, files[])
speseProprietariApi.allegati.delete(id, allegatoId)
speseProprietariApi.allegati.getUrl(id, allegatoId)
appartamentiApi.list()
proprietariApi.list()
tipiSpesaApi.list()
```

## Risposta checkHash (spese proprietari)
```js
{
  hash: "sha256hex",
  duplicati_allegati:  [{ id, nome_file, spesa_id, importo, data_pagamento, fornitore, mese_competenza, tipo_spesa, appartamento_nome, proprietario_nome, proprietario_cognome }],
  duplicati_documenti: [{ id, nome_file, importo, data, fornitore, tipo_spesa, appartamento_nome }]
}
```

## Errori comuni da evitare
- Non chiamare `speseProprietariApi.listAllegati()` — usare `.allegati.list()`
- Non caricare allegati PRIMA del salvataggio della spesa (l'id non esiste ancora)
- La black screen era causata da `speseProprietariApi.allegati` undefined — verificare sempre che il sub-oggetto esista
