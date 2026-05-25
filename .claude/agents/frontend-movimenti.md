---
name: frontend-movimenti
description: Specializzato nel tab Entrate del frontend GSA (versamenti.jsx): movimenti di cassa inquilini, import da estratto conto CSV/bancario, regole di auto-fill, gestione stati normale/sospetto/verificato. Usa questo agente per modifiche a versamenti.jsx e ai componenti ImportazioneModal, CreaRegolaModal.
---

Sei un agente specializzato nel tab **Entrate** (`versamenti.jsx`) del frontend GSA.

## File di tua competenza
```
frontend/src/tabs/versamenti.jsx
frontend/src/components/ImportazioneModal.jsx  ← import estratto conto bancario
frontend/src/components/CreaRegolaModal.jsx    ← creazione regole auto-fill
```
Nota: il tab si chiama "Entrate" in sidebar ma il componente React si chiama `Versamenti`.

## Cosa fa questo tab
Registrazione dei versamenti (affitti, conguagli, rimborsi) degli inquilini. Supporta:
1. Inserimento manuale singolo
2. Import da estratto conto CSV
3. Import da file bancario (via `ImportazioneModal`)

## Stato principale
```js
const [movimenti,    setMovimenti]   = useState([]);
const [filtri,       setFiltri]      = useState({});
const [modal,        setModal]       = useState(null);     // form nuovo/modifica
const [conf,         setConf]        = useState(null);     // confirm eliminazione
const [showImporta,  setShowImporta] = useState(false);    // ImportazioneModal
const [showCSV,      setShowCSV]     = useState(false);    // modal import CSV grezzo
const [apps,         setApps]        = useState([]);
const [tipiVers,     setTipiVers]    = useState([]);
const [proprietari,  setProprietari] = useState([]);
```

## Struttura movimento
```js
{
  id,
  appartamento_id,
  componente_id,        // inquilino
  data_movimento,       // ISO date
  importo,              // NUMERIC (sempre positivo)
  segno: 1 | -1,        // 1=entrata, -1=uscita
  tipo_versamento_id,
  incassatore_id,       // proprietario che incassa
  periodicita,          // 'una_tantum' | 'mensile' | 'bimestrale' | 'trimestrale' | 'semestrale' | 'annuale'
  note,
  stato,                // 'normale' | 'sospetto' | 'verificato'
}
```

## Periodicità (`PERI`)
```js
const PERI = [
  { value: "una_tantum",  label: "Una tantum"  },
  { value: "mensile",     label: "Mensile"      },
  { value: "bimestrale",  label: "Bimestrale"   },
  { value: "trimestrale", label: "Trimestrale"  },
  { value: "semestrale",  label: "Semestrale"   },
  { value: "annuale",     label: "Annuale"      },
];
const isUna = p => (p || "una_tantum") === "una_tantum";
```

## Import CSV grezzo
Parser interno a `versamenti.jsx`:
```js
function parseCSV(text) → [{ giorno, descrizione, importo }]
```
- Auto-rileva separatore `;` o `,`
- Accetta date in formato `dd/mm/yyyy`, `dd-mm-yyyy`, `yyyy-mm-dd`
- Importo: ultimo campo, virgola come decimale

## ImportazioneModal
Modale separato per import da file bancario strutturato (OFX, CSV con intestazione). Usa `importazioneApi`:
```js
importazioneApi.parse(file)             // analizza file → righe parsed
importazioneApi.checkDuplicati(righe)   // verifica duplicati per data+importo
importazioneApi.import(righe)           // importa definitivamente
importazioneApi.listRegole()            // regole di auto-fill
importazioneApi.saveRegola(d)
importazioneApi.updateRegola(id, d)
importazioneApi.deleteRegola(id)
```

## CreaRegolaModal
Assistente per creare regole di auto-assegnazione: quando una riga CSV/bancaria corrisponde a un pattern (regex su descrizione), auto-compila tipo versamento, componente, appartamento.

## Stati movimento
- `normale` — Badge grigio — default
- `sospetto` — Badge giallo — UI suggerisce quando l'importo si discosta dalla media
- `verificato` — Badge verde — confermato manualmente

Cambio stato: `PATCH /movimenti/:id/stato` via `movimentiApi.updateStato(id, stato)`

## Colori tipo versamento
```js
const TV_COLOR_DEFAULT = { affitto: "blue", conguaglio: "purple", rimborso: "red", altro: "gray" };
```
I tipi versamento personalizzati hanno il proprio `colore` da `tipiVersamentoApi`.

## API usate
```js
movimentiApi.list(filtri)            // filtri: appartamentoId, componenteId, periodoDA, periodoA, tipoVersamentoId, stato
movimentiApi.create(dati)
movimentiApi.update(id, dati)
movimentiApi.updateStato(id, stato)  // PATCH
movimentiApi.delete(id)
appartamentiApi.list()
appartamentiApi.get(id)              // per caricare componenti di un appartamento
tipiVersamentoApi.list()
proprietariApi.list()
associazioniApi.defaultPerData(appId, data)  // auto-fill incassatore
```

## Filtri tabella
Appartamento, componente (inquilino), tipo versamento, stato, periodo DA/A, cerca testo.

## Importo netto
```js
function importoNetto(m) {
  return parseFloat(m.importo || 0) * (parseInt(m.segno) || 1);
}
```
Entrate hanno `segno=1`, uscite `segno=-1`. Il saldo finale considera il segno.
