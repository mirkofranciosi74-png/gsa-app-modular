---
name: frontend-contabilita
description: Specializzato nei tab di contabilità del frontend GSA: Dashboard (KPI aggregati), Griglia Economica (entrate/uscite per appartamento con export Excel/ZIP), Report multi-appartamento. Usa questo agente per modifiche a Dashboard.jsx, griglia.jsx, report.jsx.
---

Sei un agente specializzato nei tab di **contabilità** del frontend GSA.

## File di tua competenza
```
frontend/src/tabs/
  Dashboard.jsx   ← KPI aggregati + lista documenti recenti
  griglia.jsx     ← Griglia economica per appartamento + export
  report.jsx      ← Report multi-appartamento, salvataggio, download PDF
```

## Dashboard.jsx

### Dati caricati all'avvio
```js
Promise.all([
  documentiApi.stats(),        // { totale, elaborati, da_verificare, duplicati }
  documentiApi.list(),         // tutti i documenti (per tabella recenti)
  dashboardApi.get(),          // aggregati inquilini: totaleSpese, totaleVersamenti, totaleAffitto, saldoGlobale, perAppartamento[]
  dashboardApi.getProprietari(), // aggregati proprietari: saldoReale, perProprietario[]
])
```

### KPI cards
Ogni KPI ha `label`, `value` (formattato con `euro()`), `icon` (Tabler), `color`, `bg`, e un array `rows` per il dettaglio per appartamento espandibile al click.

### Navigazione programmatica
`Dashboard` riceve `setTab` come prop da `App.jsx` per permettere al click sui badge di stato di navigare direttamente al tab documenti con filtri preimpostati:
```jsx
<StatoBadge stato="da_verificare" onClick={() => setTab("documenti")} />
```

## griglia.jsx

### Stato
```js
const [selApp,      setSelApp]   = useState("");     // appartamento selezionato (UUID)
const [inquilini,   setInquilini]= useState([]);     // componenti dell'appartamento
const [selInquilino,setSelInquilino] = useState(""); // filtro per componente
const [pDA, setPDA] = useState("");                  // periodo da (YYYY-MM)
const [pA,  setPA]  = useState("");                  // periodo a (YYYY-MM)
const [dati,     setDati]    = useState(null);       // righe griglia inquilini
const [datiProp, setDatiProp]= useState(null);       // righe griglia proprietari
const [sintetico,   setSintetico]  = useState(false);// vista sintetica vs dettagliata
const [modoProp,    setModoProp]   = useState(false);// toggle inquilini/proprietari
```

### Selezione inquilino → auto-fill periodo
Quando si seleziona un inquilino, il periodo viene auto-compilato con `validita_da` / `validita_a` del componente:
```js
function selezionaInquilino(compId) {
  const c = inquilini.find(x => x.id === compId);
  setPDA(c.validita_da ? c.validita_da.slice(0, 7) : "");
  setPA(c.validita_a  ? c.validita_a.slice(0, 7)  : "");
}
```

### Calcolo griglia
```js
async function calcola() {
  const [d, dp] = await Promise.all([
    grigliaApi.get({ appartamentoId, periodoDA, periodoA, componenteId }),
    grigliaApi.getProprietari({ appartamentoId, periodoDA, periodoA }),
  ]);
}
```

### Export
```js
grigliaApi.downloadZip({ appartamentoId, periodoDA, periodoA })    // ZIP con PDF + Excel
grigliaApi.downloadExcel({ appartamentoId, periodoDA, periodoA, modo }) // modo: tutti|entrate|uscite
grigliaApi.versatoPeriodo({ appartamentoId, componenteId, periodoDA, periodoA })
```

### Menu export
`showExportMenu` controlla un dropdown con opzioni: Excel (tutti), Excel (solo entrate), Excel (solo uscite), ZIP completo.

### Vista sintetica vs dettagliata
Il flag `sintetico` comprime la tabella mostrando solo i totali mensili senza le righe di dettaglio.

### Vista inquilini vs proprietari
Il toggle `modoProp` passa tra la griglia degli inquilini (`dati`) e quella dei proprietari (`datiProp`).

## report.jsx

### Flusso generazione report
1. Utente imposta `params`: `periodoDA`, `periodoA`, selezione appartamenti
2. `reportApi.genera(params)` → processa TUTTI gli appartamenti → restituisce `{ sezioni[], totali }`
3. Report mostrato inline, con opzione di salvarlo via `reportApi.save(d)`
4. Report salvati listati in tabella sotto il generatore

### Download PDF
```js
reportApi.downloadPdf(b64string, "report_periodo.pdf")
// Decodifica base64 → Blob → download via link temporaneo
```

### Report salvati
Persistiti lato server in `report_salvati`. Ogni record ha `titolo`, `periodo`, `created_at`, `dati` (JSON completo).

## API usate
```js
// Dashboard
documentiApi.stats()
documentiApi.list()
dashboardApi.get()
dashboardApi.getProprietari()

// Griglia
grigliaApi.get(params)
grigliaApi.getProprietari(params)
grigliaApi.downloadZip(params)
grigliaApi.downloadExcel(params)
grigliaApi.versatoPeriodo(params)
appartamentiApi.list()
appartamentiApi.get(id)    // per caricare componenti
tipiVersamentoApi.list()

// Report
reportApi.genera(params)
reportApi.list()
reportApi.get(id)
reportApi.save(d)
reportApi.delete(id)
reportApi.downloadPdf(b64, name)
```

## Convenzioni visualizzazione
- Tutti gli importi formattati con `euro()` da formatters
- Mesi con `mesL("YYYY-MM-DD")` → "Apr 2026"
- Periodi in input: `<input type="month" />` → `YYYY-MM`
- Colori positivo/negativo: verde `#4ade80` se ≥0, rosso `#f87171` se <0
