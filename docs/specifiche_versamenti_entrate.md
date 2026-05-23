# Menu "Entrate" (Versamenti) — Specifiche

---

## Struttura dati — Tabella `movimenti`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID PK | auto |
| `appartamento_id` | UUID FK → `appartamenti` | obbligatorio |
| `componente_id` | UUID FK → `componenti` | obbligatorio (inquilino) |
| `tipo` | ENUM `mov_tipo` | fisso `'Versamento'` |
| `segno` | SMALLINT `(1/-1)` | 1 = entrata, -1 = rimborso |
| `periodicita` | TEXT | una_tantum / mensile / bimestrale / trimestrale / semestrale / annuale |
| `importo` | NUMERIC | sempre positivo |
| `validita_da` | DATE | data contabile / inizio periodo |
| `validita_a` | DATE | fine periodo (null se una_tantum o aperto) |
| `descrizione` | TEXT | note libere |
| `tipo_versamento` | TEXT | chiave libera (default `'affitto'`), legata a `tipi_versamento.nome` |
| `data_versamento` | DATE | giorno fisico del bonifico (solo una_tantum) |
| `mese_riferimento` | TEXT `YYYY-MM` | mese contabile (solo una_tantum) |
| `incassato_da_proprietario_id` | UUID FK → `proprietari` | nullable |
| `stato` | VARCHAR `(normale/sospetto/verificato)` | default `normale` |
| `created_at / updated_at` | TIMESTAMPTZ | auto |

**Vista `v_movimenti_dettaglio`** aggiunge:
- `importo_netto` = importo × segno
- `appartamento_nome`, `componente_nome`
- `comp_validita_da`, `comp_validita_a` (del componente)
- `fuori_validita` (bool): il movimento cade fuori dal periodo di validità dell'inquilino
- `duplicato_rilevato` (bool): stesso inquilino + importo+segno + stessa data_versamento **o** stesso mese_riferimento

---

## Tabella `tipi_versamento`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID PK | |
| `nome` | VARCHAR(50) UNIQUE | chiave di lookup in `movimenti.tipo_versamento` |
| `colore` | VARCHAR(20) | blue / purple / red / gray / … |
| `attivo` | BOOLEAN | se false non compare nei nuovi inserimenti |

Valori predefiniti: `affitto (blue)`, `conguaglio (purple)`, `rimborso (red)`, `altro (gray)`.
Un tipo non può essere eliminato se usato in almeno un movimento (HTTP 409).

---

## API Backend

| Metodo | Endpoint | Descrizione |
|---|---|---|
| GET | `/movimenti` | Lista tutti; filtri QS: `appartamentoId`, `componenteId` |
| POST | `/movimenti` | Crea nuovo movimento |
| PUT | `/movimenti/:id` | Aggiorna movimento esistente |
| PATCH | `/movimenti/:id/stato` | Aggiorna solo `stato` (`normale/sospetto/verificato`) |
| DELETE | `/movimenti/:id` | Elimina |
| GET | `/tipi-versamento` | Lista tipi |
| POST | `/tipi-versamento` | Crea tipo |
| PUT | `/tipi-versamento/:id` | Aggiorna tipo (nome, colore, attivo) |
| DELETE | `/tipi-versamento/:id` | Elimina tipo (blocca se in uso) |

**Validazioni nel repo:**
- `componente_id` obbligatorio
- `validita_da` non può essere antecedente a `componente.validita_da`
- `validita_a` (se periodico) non può superare `componente.validita_a`
- Per una_tantum: `validita_a` viene sempre salvato come NULL

---

## UI — Vista "Entrate"

### Barra filtri
- **Cerca** (testo libero): cerca su appartamento_nome, componente_nome, descrizione
- **Appartamento** (select)
- **Inquilino** (select, si restringe se appartamento selezionato)
- **Periodicità** (select)
- **Tipo vers.** (select, solo tipi attivi)
- **Stato** (select): Tutti / Sospetti-duplicati / Verificati / Normali
- **Solo anomali** (checkbox): filtra `fuori_validita = true`
- **Reset filtri**

### Statistiche live (sotto i filtri)
- N versamenti filtrati
- Totale entrate (verde)
- Totale rimborsi (rosso, solo se presenti)
- Netto (verde/rosso)

### Tabella (colonne ordinabili)
Appartamento · Inquilino · Periodicità · Tipo · Data/Periodo · Mese rif. · Note · Importo · **Stato** · Azioni

**Colore riga:**
- Arancione chiaro: `stato = sospetto` o `duplicato_rilevato`
- Rosso tenue: `fuori_validita`
- Verde tenue: `stato = verificato`

**Totale in calce**: riga `<tfoot>` con netto complessivo sui filtrati.

### Badge "Stato" (componente `StatoBadge`)
- Bottone inline con colore dinamico: nessuno (normale senza dup) / arancione (auto-dup) / arancione scuro (sospetto) / verde (verificato)
- Click apre un popover con:
  - 3 bottoni cambio stato: Normale / Sospetto / Verificato (PATCH immediato)
  - Elenco righe correlate (stesso inquilino + stesso importo+segno + stessa data o stesso mese) con data, importo, appartamento, descrizione e stato dell'altra riga

### Pulsanti azioni per riga

| Icona | Azione | Condizione |
|---|---|---|
| `ti-list-check` | Apre `CreaRegolaModal` | solo se `m.descrizione` presente |
| `ti-edit` | Apre modal modifica | sempre |
| `ti-trash` | Elimina (con Confirm) | sempre |

---

## Modal Nuovo/Modifica Entrata

**Campi:**
- Periodicità (select): una_tantum / mensile / bimestrale / trimestrale / semestrale / annuale
- Tipo versamento (select, solo tipi attivi)
- Appartamento (select obbligatorio)
- Inquilino (select, con toggle "Solo attivi alla data")
- Importo € (positivo = entrata, negativo = rimborso); mostra label dinamica "Pagamento ↑" o "Rimborso ↓"
- **Date** (sezione separata):
  - Se una_tantum: data contabile + data versamento (giorno bonifico) + mese di riferimento
  - Se periodico: "Valido dal" + "Valido fino al"
- Note / Descrizione
- Incassato da (select proprietari, auto-precompilato via `associazioniApi.defaultPerData`)

**Validazioni bloccanti (errori inline):**
- Data inizio antecedente alla validità dell'inquilino
- Data fine successiva alla validità dell'inquilino
- Data fine < data inizio
- Importo = 0

**Rilevamento duplicato (alert non bloccante):**
- Per tipo `affitto`: controlla se esiste già un movimento dello stesso inquilino con lo stesso `mese_riferimento`
- Altrimenti: controlla stessa `data_versamento`
- Se trovato mostra confronto fianco a fianco (già presente vs nuovo) e il tasto "Salva" diventa "Inserisci comunque" (rosso); serve un secondo click per forzare

---

## Importazione CSV (modale `CsvImportModal`)

**Formato atteso:** `giorno, descrizione, importo` (separatore `,` o `;`)
**Date supportate:** `GG/MM/AAAA` oppure `AAAA-MM-GG`

**Rilevamento automatico:**
- Inquilino: cerca cognome (≥3 chars) nella descrizione, poi nome come fallback
- Mese di riferimento: cerca nome mese italiano nella descrizione (gestisce troncamenti tipo `MAG GIO` → `MAGGIO`), con anno 4 cifre o 2 cifre dopo il nome del mese
- Proprietario: auto-precompilato via `associazioniApi.defaultPerData` se inquilino rilevato

**Flusso:**
1. Selezione file CSV
2. Per ogni riga: form precompilato + barra avanzamento + anteprima riga CSV + pannello duplicato se rilevato → Salva e prossimo / Salta / Annulla tutto
3. Riepilogo finale: salvati / saltati / totale

---

## Importazione Estratto Conto (modale `ImportazioneModal`)

Attivata dal pulsante **Importa estratto**. Gestisce file XLS/XLSX bancari con parsing colonne Dare/Avere, applicazione regole di associazione automatica, revisione riga per riga e salvataggio batch.

File di riferimento: `frontend/src/components/ImportazioneModal.jsx`
Parser bancario: `src/modules/importazione/importatore.js`

---

## Regole di associazione (`CreaRegolaModal`)

Dal pulsante `ti-list-check` su ogni riga con descrizione:
- Precompila la stringa con `movimento.descrizione`
- Rileva se esiste già una regola per quella stringa (mostra banner "verrà aggiornata")
- Permette di associare appartamento, inquilino e categoria (tipo versamento o tipo spesa o "ignora")
- Salva/aggiorna via `POST /importazione/regole` (crea o sovrascrive per stringa)

File di riferimento: `frontend/src/components/CreaRegolaModal.jsx`

---

## File di riferimento nel progetto

| Componente | Percorso |
|---|---|
| Vista principale | `frontend/src/tabs/versamenti.jsx` |
| Modal importazione estratto | `frontend/src/components/ImportazioneModal.jsx` |
| Modal regola associazione | `frontend/src/components/CreaRegolaModal.jsx` |
| API client | `frontend/src/api.js` → `movimentiApi`, `tipiVersamentoApi` |
| Repo backend movimenti | `src/modules/movimenti/repo.js` |
| Routes backend movimenti | `src/modules/movimenti/routes.js` |
| Repo tipi versamento | `src/modules/anagrafica/tipiVersamentoRepo.js` |
| Schema DB (movimenti) | `src/shared/db/migrations/007_versamenti_con_segno.sql` |
| Schema tipi versamento | `src/shared/db/migrations/014_tipi_versamento.sql` |
| Schema stato/duplicati | `src/shared/db/migrations/016_stato_movimenti.sql` |
