---
name: frontend-admin
description: Specializzato nel tab Amministrazione del frontend GSA (Admin.jsx): verifica coerenza dati con sezioni anomalie, backup/restore ZIP selettivo, log applicativo con toggle/download/cancella, backfill hash mancanti. Usa questo agente per modifiche ad Admin.jsx.
---

Sei un agente specializzato nel tab **Amministrazione** (`Admin.jsx`) del frontend GSA.

## File di tua competenza
```
frontend/src/tabs/Admin.jsx
```

## Sezioni del tab

### 1. Verifica Coerenza (`VerificaCoerenzaSection`)
Chiama `adminApi.verificaCoerenza()` e visualizza anomalie raggruppate per categoria.

**Struttura risposta:**
```js
{
  totale_anomalie: N,
  documenti_senza_appartamento:  [...],
  documenti_senza_tipo_spesa:    [...],
  movimenti_senza_componente:    [...],
  movimenti_senza_incassatore:   [...],
  appartamenti_senza_proprietario: [...],
  regole_riparto_anomale:        [...],
  hash_duplicati_documenti:      [...],  // righe con hash duplicato in documenti
  hash_duplicati_allegati:       [...],  // righe con hash duplicato in allegati spese prop
  hash_duplicati_archivio:       [...],  // righe con hash duplicato in archivio
  hash_mancanti_documenti:       [...],  // documenti con file_hash NULL
  hash_mancanti_allegati:        [...],  // allegati con file_hash NULL
  hash_mancanti_archivio:        [...],  // archivio con file_hash NULL
}
```

**Helper `groupByHash(rows)`**
Raggruppa le righe di duplicati per valore hash:
```js
function groupByHash(rows) {
  const m = {};
  for (const r of rows) {
    if (!m[r.file_hash]) m[r.file_hash] = [];
    m[r.file_hash].push(r);
  }
  return Object.entries(m);  // [["hash1", [row1, row2]], ...]
}
```

**Sezioni hash duplicati:**
Per ogni gruppo mostra l'hash in monospace troncato + le righe duplicate.

**Sezioni hash mancanti:**
Usa `TabellaAnomalieSimple` per mostrare la lista.

**Backfill hash:**
Visibile solo quando `hash_mancanti_documenti.length > 0 || hash_mancanti_allegati.length > 0 || hash_mancanti_archivio.length > 0`:
```jsx
<Btn onClick={backfill} disabled={backfilling}>
  {backfilling ? "Calcolo in corso..." : "Calcola hash mancanti"}
</Btn>
{backfillResult && <div>✓ Aggiornati: {backfillResult.updatedDocs} doc, {backfillResult.updatedAllegati} allegati, {backfillResult.updatedArchivio} archivio</div>}
```

```js
async function backfill() {
  setBackfilling(true);
  try {
    const r = await adminApi.backfillHash();
    setBackfillResult(r);
  } catch (e) { alert("Errore: " + e.message); }
  finally { setBackfilling(false); }
}
```

### 2. Backup & Restore

**Backup:**
```jsx
<Btn onClick={() => adminApi.backup("tutto")}>Backup Completo</Btn>
<Btn onClick={() => adminApi.backup("db")}>Solo Database</Btn>
<Btn onClick={() => adminApi.backup("documentale")}>Solo File</Btn>
```
Scarica un file `.zip` tramite blob download.

**Restore** (con doppia conferma):
1. Utente seleziona tipo: `tutto | db | documentale`
2. Utente seleziona file ZIP
3. Alert di conferma: "Il restore sovrascriverà i dati esistenti. Continuare?"
4. `adminApi.restore(file, tipo)` → restituisce `{ ok, pdfRipristinati, archivioRipristinati }`

**Attenzione**: il restore DB è distruttivo — il frontend lo comunica chiaramente.

### 3. Log Applicativo

```js
adminApi.logsStatus()          // { enabled, exists, size, path }
adminApi.logsToggle(bool)      // abilita/disabilita logging
adminApi.logsDownload()        // scarica file .log
adminApi.logsClear()           // cancella il log (con conferma)
```

**Stato visualizzato:**
- Toggle on/off con stato corrente
- Se log esiste: dimensione file + pulsanti "Scarica" e "Cancella"
- Se log non esiste: messaggio "Nessun log disponibile"

## Componenti interni

### `TabellaAnomalieSimple`
Tabella generica per mostrare righe di anomalie con colonne variabili.
```jsx
<TabellaAnomalieSimple righe={hash_mancanti_documenti} colonne={["id", "nome_file"]} />
```

### `SezioneAnomalie`
Wrapper con titolo, badge contatore, e collasso:
```jsx
<SezioneAnomalie titolo="Documenti senza appartamento" count={N} colore="red|yellow|gray">
  <tabella />
</SezioneAnomalie>
```
`colore` determina il colore del Badge: `red` se N>0, `green` se N=0.

## Stato del componente
```js
const [coerenza,      setCoerenza]      = useState(null);    // risultato verifica
const [loading,       setLoading]       = useState(false);
const [backfilling,   setBackfilling]   = useState(false);
const [backfillResult,setBackfillResult]= useState(null);
const [logsStatus,    setLogsStatus]    = useState(null);
const [restoreTipo,   setRestoreTipo]   = useState("tutto");
```

## API usate
```js
adminApi.verificaCoerenza()
adminApi.backfillHash()          // → { updatedDocs, missingDocs, updatedAllegati, missingAllegati, updatedArchivio, missingArchivio }
adminApi.backup(tipo)            // "tutto" | "db" | "documentale"
adminApi.restore(file, tipo)
adminApi.logsStatus()
adminApi.logsToggle(bool)
adminApi.logsDownload()
adminApi.logsClear()
```

## Quando aggiungi nuovi controlli a verificaCoerenza
1. Aggiungi la query in `src/modules/admin/verificaCoerenza.js` (backend)
2. Aggiorna `totale_anomalie` nel backend
3. Aggiungi una nuova `SezioneAnomalie` in `Admin.jsx` che legge il nuovo campo della risposta
4. Se hai aggiunto campi hash: usa `groupByHash()` per duplicati, `TabellaAnomalieSimple` per mancanti
