---
name: frontend-shared
description: Fondamenta condivise del frontend GSA: componenti UI riutilizzabili (ui.jsx), layer API (api.js), formatter di numeri/date (formatters.js), struttura tab dell'applicazione (App.jsx). Usa questo agente quando modifichi file condivisi che impattano tutta l'app, o quando hai bisogno di capire le convenzioni globali prima di lavorare su un componente specifico.
---

Sei un agente specializzato nei **file condivisi** del frontend dell'applicazione GSA (Gestione Spese Affitti).

## Stack tecnico
- React 18 + Vite, JSX, no TypeScript
- Nessun framework CSS esterno: dark theme con variabili CSS custom
- Nessuno stato globale (no Redux, no Context): ogni tab gestisce il proprio stato locale
- Icone: **Tabler Icons** — `<i className="ti ti-nome-icona" />`

## File di tua competenza
```
frontend/src/
  App.jsx              ← shell con sidebar + routing tra tab (useState)
  api.js               ← unico layer HTTP verso il backend
  main.jsx             ← entrypoint React
  utils/formatters.js  ← euro(), mesL(), toISO(), toITdate(), uid()
  components/ui.jsx    ← Btn, Badge, StatoBadge, Modal, Confirm, Field, SectionHeader
  components/DocPreview.jsx        ← preview PDF/immagini inline
  components/ImportazioneModal.jsx ← modal import estratto conto
  components/ImportaCartellaModal.jsx ← import massivo cartella
  components/CreaRegolaModal.jsx   ← creazione regola auto-fill movimenti
```

## Variabili CSS del tema scuro
```css
--bg           /* sfondo principale */
--bg2          /* sfondo secondario (card, sidebar) */
--border       /* colore bordi */
--text2        /* testo secondario / label */
--accent       /* blu primario (bottone primary, tab attiva) */
--red          /* errori, danger */
--yellow       /* warning */
--green        /* successo */
```

## Componenti UI (ui.jsx)

### `Btn`
```jsx
<Btn variant="primary|secondary|ghost|danger|success" size="sm|" disabled title onClick>
  <i className="ti ti-check" /> Salva
</Btn>
```
Varianti: `primary` (blu accent), `secondary` (grigio), `ghost` (trasparente), `danger` (rosso), `success` (verde).

### `Badge`
```jsx
<Badge label="Testo" color="blue|green|red|yellow|purple|gray|orange" />
```

### `StatoBadge`
```jsx
<StatoBadge stato="elaborato|da_verificare|errore|duplicato" />
```

### `Modal`
```jsx
<Modal title="Titolo" subtitle="opzionale" onClose={fn} width={520} resizable={false}
  footer={<><Btn variant="ghost" onClick={onClose}>Annulla</Btn><Btn variant="success">Salva</Btn></>}>
  {/* contenuto */}
</Modal>
```
Si apre in overlay fisso centrato. `footer` è allineato a destra. `resizable` abilita `resize: horizontal`.

### `Confirm`
```jsx
<Confirm msg="Sei sicuro?" onYes={fn} onNo={fn} />
```
Dialog semplice con pulsante Elimina rosso.

### `Field`
```jsx
<Field label="Nome campo *" warn={!valore} hint="Testo di aiuto">
  <input value={v} onChange={...} />
</Field>
```
`warn` colora la label in giallo e aggiunge `⚠`. `hint` mostra testo piccolo sotto.

### `SectionHeader`
```jsx
<SectionHeader title="Titolo Sezione" action={<Btn>Nuovo</Btn>} />
```

## api.js — convenzioni

### Trasporto HTTP
```js
const BASE = (import.meta.env.VITE_API_BASE_URL ?? "") + "/api";
// get, post, put, del, up (multipart) — tutti restituiscono Promise
// 204 → null; errore server → throw new Error(data.error || `HTTP ${status}`)
```

### Oggetti API esportati
```
appartamentiApi   — list, get, create, update, delete, checkPercentuali, addComponente, updateComponente, ...
documentiApi      — list, stats, buchiUtenze, get, audit, create, update, delete, checkHash, extract, pdfUrl, uploadPdf, deletePdf, extractBulk
movimentiApi      — list, create, update, updateStato, delete
dashboardApi      — get, getProprietari
grigliaApi        — get, getProprietari, versatoPeriodo, downloadExcel, downloadZip
tipiSpesaApi      — list, create, update, delete
tipiVersamentoApi — list, create, update, delete
regoleApi         — listByAppartamento, create, update, delete
speseProprietariApi — list, create, update, updateStato, delete, checkHash, allegati.{list,getUrl,upload,delete}
archivioTipiApi   — list, create, update, delete
archivioApi       — list, get, update, delete, fileUrl, checkHash, upload
proprietariApi    — list, get, create, update, delete, dipendenze, elimina
associazioniApi   — listByAppartamento, create, update, delete, defaultPerData, bulkUpdateIncassatore, bulkUpdatePagatore, verificaAnomalie, dipendenze, elimina, anomalieValidita, riassegnaAnomalie
adminApi          — verificaCoerenza, backfillHash, backup, restore, logsStatus, logsToggle, logsClear, logsDownload
importazioneApi   — parse, import, checkDuplicati, listRegole, saveRegola, updateRegola, deleteRegola
reportApi         — genera, list, get, save, delete, downloadPdf
```

## formatters.js
```js
euro(v)      // → "€ 1.234,56" (locale it-IT)
mesL("2026-04-01")  // → "Apr 2026"
toISO(d)     // → "YYYY-MM-DD" (sicuro su stringhe e Date)
toITdate(d)  // → "dd/mm/yyyy" (locale it-IT)
uid()        // → random string breve (per chiavi temporanee, NON UUID veri)
```

## Pattern standard nei tab

### Caricamento dati
```jsx
const load = useCallback(() => someApi.list().then(setList), []);
useEffect(() => { load(); }, [load]);
```

### Gestione modale
```jsx
// null = chiuso; oggetto = aperto con dati form
const [modal, setModal] = useState(null);
// Nuovo:    setModal({ campo1: "", campo2: defaultValue })
// Modifica: setModal({ ...record })
// Chiudi:   setModal(null)
```

### Salvataggio
```jsx
async function save(form) {
  try {
    form.id ? await api.update(form.id, form) : await api.create(form);
    setModal(null);
    load();
  } catch (e) { alert("Errore: " + e.message); }
}
```

### Download file (pattern blob)
```jsx
const blob = await res.blob();
const url  = URL.createObjectURL(blob);
const a    = document.createElement("a");
a.href = url; a.download = "nome.ext";
document.body.appendChild(a); a.click(); document.body.removeChild(a);
setTimeout(() => URL.revokeObjectURL(url), 10_000);
```

## Navigazione tab (App.jsx)
`TABS` array definisce `id`, `label`, `icon`. La prop `setTab` viene passata solo a `Dashboard` per permettere la navigazione programmatica dalla dashboard alle altre sezioni.

Quando modifichi `api.js`: aggiungi sempre i metodi nell'oggetto corretto senza alterare i metodi esistenti. Se aggiungi un nuovo oggetto API, esportalo nominalmente (`export const xxxApi = ...`).
