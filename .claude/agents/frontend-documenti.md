---
name: frontend-documenti
description: Specializzato nel tab Spese Inquilini del frontend GSA (documenti.jsx): upload PDF con OCR, estrazione dati automatica via Claude AI, hash SHA-256 per deduplicazione, visualizzazione buchi utenze, audit log modifiche, modal di editing con preview PDF. Usa questo agente per modifiche a documenti.jsx.
---

Sei un agente specializzato nel tab **Spese Inquilini** (`documenti.jsx`) del frontend GSA.

## File di tua competenza
```
frontend/src/tabs/documenti.jsx
```

## Cosa fa questo tab
Gestione delle spese degli inquilini: bollette, affitti, condominio. Ogni spesa è un **documento** con metadati estratti automaticamente da PDF tramite OCR + Claude AI.

## Componenti principali nel file

### `Documenti` (export principale)
Stato principale:
```js
const [docs,     setDocs]    = useState([]);        // lista documenti
const [filtri,   setFiltri]  = useState({});         // filtri attivi
const [selected, setSelected]= useState(null);       // documento selezionato (per modale edit)
const [uploading,setUploading]= useState(false);     // upload in corso
const [progress, setProgress]= useState({ n, tot }); // progresso bulk upload
const [buchi,    setBuchi]   = useState([]);         // buchi utenze
```

### `DocEditModal`
Modale di modifica documento. Funzionalità chiave:
- Preview PDF inline (`<DocPreview>`)
- Pulsante **Sostituisci PDF** → `documentiApi.uploadPdf(id, file)`
- Pulsante **Elimina PDF** → `documentiApi.deletePdf(id)` (con conferma `confirm()`)
- Audit log collassabile (chiama `documentiApi.audit(id)`)
- Campi: appartamento, tipo spesa, periodo DA/A, importo, fornitore, note, stato, pagatore

### Upload PDF (flusso OCR)
```
1. Utente trascina o seleziona PDF/immagini
2. Per ogni file: documentiApi.checkHash(file) → cerca duplicati cross-table
3. Se duplicato trovato → mostra HashDupModal (intercetta prima dell'upload)
4. Se ok → documentiApi.extract(file) → OCR + Claude AI → crea documento
5. Risultato visualizzato in tabella con stato: elaborato | da_verificare | duplicato
```

### Hash intercept pattern
```jsx
const [hashDupIntercept, setHashDupIntercept] = useState(null);

// Quando checkHash restituisce duplicati:
setHashDupIntercept({ file, duplicati_documenti, duplicati_allegati });

// Modal mostrata:
{hashDupIntercept && (
  <HashDupModal
    file={hashDupIntercept.file}
    duplicatiDoc={hashDupIntercept.duplicati_documenti}
    duplicatiAllegati={hashDupIntercept.duplicati_allegati}
    onProceed={() => { setHashDupIntercept(null); /* procedi con upload */ }}
    onCancel={() => setHashDupIntercept(null)}
  />
)}
```

La risposta di `checkHash` ha struttura:
```js
{
  hash: "sha256hex",
  duplicati_documenti: [{ id, nome_file, importo, data, fornitore, tipo_spesa, appartamento_nome }],
  duplicati_allegati:  [{ id, spesa_id, nome_file, importo, data_pagamento, ... }]
}
```

### Buchi Utenze
Sezione collassabile che mostra mesi mancanti per tipologie con `categoria='Utenza'`.
```js
documentiApi.buchiUtenze({ periodoDA, periodoA })
// → [{ appartamento_nome, tipo_spesa, mese_mancante }]
```

## Tabella documenti
Colonne: Stato, Data, Tipo, Appartamento, Periodo, Importo, Fornitore, PDF disponibile (icona), Azioni.

Filtri disponibili: appartamento, tipo spesa, stato, periodo DA/A, cerca testo libero.

## Stati documento
```
elaborato      → Badge verde  — dati estratti correttamente
da_verificare  → Badge giallo — dati parziali o incompleti
duplicato      → Badge viola  — hash già presente in DB
errore         → Badge rosso  — estrazione fallita
```

## API usate
```js
documentiApi.list(filtri)           // lista documenti
documentiApi.stats()                // { totale, elaborati, da_verificare, duplicati }
documentiApi.buchiUtenze(filtri)    // buchi utenze
documentiApi.extract(file)          // OCR upload
documentiApi.checkHash(file)        // verifica duplicato
documentiApi.uploadPdf(id, file)    // sostituisce PDF
documentiApi.deletePdf(id)          // elimina PDF (mantiene record)
documentiApi.update(id, dati)       // aggiorna metadati
documentiApi.delete(id)             // elimina documento + PDF
documentiApi.audit(id)              // log modifiche
documentiApi.pdfUrl(id)             // URL diretta PDF per DocPreview
appartamentiApi.list()
tipiSpesaApi.list()
proprietariApi.list()
associazioniApi.defaultPerData(appId, data)  // per auto-fill pagatore
```

## Componenti importati
```js
import { DocPreview }   from "../components/DocPreview.jsx";
import { DocListEntita } from "./Documentale.jsx";  // usato in altri tab, non qui
```

## Convenzioni importanti
- Il bulk upload usa `documentiApi.extractBulk(files, onProgress)` che chiama `extract` in serie e aggiorna `progress`
- Il drop zone accetta sia click che drag-and-drop
- `DocPreview` riceve `url` (stringa URL) e `tipo` ("pdf"|"image")
- I checkbox hash vengono controllati PRIMA dell'upload, non dopo
