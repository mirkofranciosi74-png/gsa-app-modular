# GSA — Funzionalità dell'Applicativo

## Panoramica

GSA (Gestione Spese Appartamenti) è un'applicazione web per la gestione completa delle spese condominiali, degli affitti, dei versamenti degli inquilini e della reportistica contabile. È pensata per chi gestisce più appartamenti in affitto e deve tenere traccia di spese, versamenti, conguagli e documenti.

---

## 1. Dashboard

**Percorso:** tab "Dashboard"

La dashboard fornisce una visione immediata della situazione economica globale e per appartamento.

### 1.1 Sezione Inquilini (KPI annuale)
- Totale spese sostenute nel periodo selezionato
- Totale versamenti ricevuti dagli inquilini
- Saldo netto globale (versamenti − spese)
- Riepilogo per appartamento: spese, versamenti, saldo

### 1.2 Sezione Proprietari
- Saldo globale proprietari (entrate − uscite)
- Saldo reale (al netto di eventuali rimborsi)
- Dettaglio per appartamento: entrate incassate, spese pagate, saldo netto per ogni proprietario

### 1.3 Filtri
- Selezione anno (o intervallo personalizzato)
- Visualizzazione separata inquilini / proprietari

---

## 2. Griglia Economica

**Percorso:** tab "Griglia Economica"

La griglia è il cuore del sistema contabile. Permette di visualizzare, per ogni inquilino e per un dato periodo, la situazione completa delle spese, dei versamenti e il conguaglio risultante.

### 2.1 Struttura della griglia
Per ogni inquilino vengono mostrate le seguenti colonne:
- **Spese dovute** — quota delle spese di competenza calcolata in base alle regole di riparto
- **Versato** — totale versamenti registrati nel periodo
- **Affitto** — importo affitto mensile × numero mesi di competenza
- **Conguaglio** — `Versato − Spese dovute − Affitto`
  - Verde = credito dell'inquilino
  - Rosso = debito residuo

### 2.2 Filtri disponibili
- Appartamento
- Periodo DA / A (formato YYYY-MM)
- Inquilino singolo

### 2.3 Griglia Proprietari
Vista alternativa che mostra, per ogni proprietario, le entrate incassate suddivise per appartamento secondo le regole di riparto delle entrate.

### 2.4 Export ZIP
Il pulsante "Esporta ZIP" genera un archivio contenente:
- File Excel con la griglia per ogni appartamento
- Riepilogo in PDF

---

## 3. Report

**Percorso:** tab "Report"

### 3.1 Generazione report
- Selezione parametri: appartamento, periodo, tipo di report
- Generazione testo narrativo con dati contabili dettagliati
- Anteprima testo nel browser

### 3.2 Generazione PDF
- Conversione del report in PDF scaricabile
- Download diretto dal browser

### 3.3 Salvataggio report
- Salvataggio del report (testo + PDF base64) con nome personalizzato
- Lista report salvati con possibilità di riapertura e download

---

## 4. Appartamenti

**Percorso:** tab "Appartamenti"

### 4.1 Anagrafica
- Creazione, modifica ed eliminazione appartamenti
- Campi: nome, indirizzo (via, città, CAP), note, stato attivo/inattivo

### 4.2 Verifica percentuali
- Controllo che la somma delle percentuali degli inquilini attivi sia 100%
- Avviso visivo in caso di squilibrio

### 4.3 Documenti collegati
- Sezione espandibile per ogni appartamento che mostra i documenti del documentale associati
- Caricamento rapido di nuovi documenti dall'interno della scheda appartamento

---

## 5. Proprietari

**Percorso:** tab "Proprietari"

### 5.1 Anagrafica proprietari
- Creazione, modifica ed eliminazione proprietari
- Campi: nome, cognome, indirizzo, telefono, email, stato attivo

### 5.2 Associazione appartamento-proprietario
- Collegamento di uno o più proprietari a ciascun appartamento
- Definizione della percentuale di proprietà per ogni associazione
- Date di inizio e fine della proprietà (per cambio proprietario nel tempo)
- Indicazione del proprietario "default" (per la griglia entrate)

### 5.3 Documenti collegati
- Come per gli appartamenti, sezione espandibile con documenti del documentale associati al proprietario

---

## 6. Inquilini (Componenti)

**Percorso:** tab "Inquilini"

### 6.1 Lista inquilini
- Visualizzazione di tutti gli inquilini di tutti gli appartamenti
- Filtro per appartamento
- Badge colorati per stato attivo/scaduto/futuro

### 6.2 Scheda inquilino
- Dati anagrafici: nome, cognome, email, telefono
- Percentuale di riparto delle spese comuni
- Quota affitto mensile
- Caparra versata
- Date di validità (ingresso / uscita)

### 6.3 Propagazione date
- Modifica delle date di validità di un inquilino con anteprima dell'impatto sui movimenti collegati
- Conferma o annullamento della propagazione

### 6.4 Documenti collegati
- Sezione espandibile con i documenti del documentale associati all'inquilino (contratto, documenti personali, ecc.)

---

## 7. Spese (Documenti)

**Percorso:** tab "Spese"

### 7.1 Caricamento PDF
- Upload singolo o massivo di file PDF
- Estrazione automatica del testo tramite pipeline OCR:
  - **pdf-parse** per PDF testuali
  - **Tesseract.js** per PDF scansionati (immagini)
- Il sistema propone automaticamente: importo, fornitore, periodo, tipo di spesa

### 7.2 Elenco documenti
- Filtri: appartamento, tipo spesa, stato, periodo
- Indicatori di stato: elaborato, da verificare, errore, duplicato
- Anteprima PDF inline
- Modifica manuale di tutti i campi estratti

### 7.3 Rilevamento buchi utenze
- Analisi automatica che individua mesi mancanti nelle bollette per ogni appartamento e tipo di spesa
- Confronto tra primo e ultimo mese presente, identificazione dei gap
- Pannello di avviso visivo sopra la lista documenti

### 7.4 Audit trail
- Log completo delle modifiche manuali ai documenti
- Visualizzazione dei campi modificati con valore precedente e successivo

---

## 8. Entrate (Versamenti / Movimenti)

**Percorso:** tab "Entrate"

### 8.1 Registrazione versamenti
Ogni versamento registra:
- Inquilino e appartamento
- Importo
- Tipo: `affitto` · `conguaglio` · `rimborso` · `altro`
- Periodicità: una tantum, mensile, bimestrale, trimestrale, semestrale, annuale
- Date di validità (per versamenti ricorrenti)
- Data versamento (giorno fisico di ricezione)
- Mese di riferimento (mese contabile)
- Proprietario che ha incassato (per tracciare su quale conto è entrato il pagamento)

### 8.2 Versamenti ricorrenti
- Inserimento di un versamento con periodicità diversa da "una tantum" lo replica automaticamente su ogni mese nel periodo di validità indicato
- Utile per impostare l'affitto fisso senza inserire una riga al mese

### 8.3 Importazione da CSV
- Wizard di importazione riga per riga
- Formato supportato: `giorno, descrizione, importo`
- Date: `GG/MM/AAAA` o `AAAA-MM-GG`; separatori virgola o punto e virgola
- Proposta automatica di: mese di riferimento, tipo = affitto, inquilino (rilevato dal nome nella descrizione)
- Avviso di duplicato se esiste già un versamento stesso inquilino + stessa data

### 8.4 Gestione rimborsi
- Segno `-1` per registrare rimborsi o rettifiche a favore dell'inquilino
- Il rimborso riduce il versato netto nell'intervallo di competenza

---

## 9. Riparti (Regole di riparto)

**Percorso:** tab "Riparti"

Le regole di riparto determinano come vengono distribuite le spese e le entrate tra inquilini e proprietari.

### 9.1 Regole per inquilini (riparto spese)
- Applicabili a tutti i tipi di spesa o a un tipo specifico
- Modalità **Escludi**: tutti gli inquilini pagano tranne quelli in lista
- Modalità **Includi**: pagano solo gli inquilini in lista
- Quota totale percentuale: la spesa è considerata al X% (es. 50% se split su due unità)
- Periodo di validità (da mese / a mese) per regole temporanee

### 9.2 Regole per proprietari (riparto entrate)
- Distribuzione degli incassi tra i proprietari
- Modalità includi/escludi come per gli inquilini
- Percentuale personalizzata per ogni proprietario incluso
- Opzione "parti uguali" tra i proprietari inclusi
- Applicabili a un tipo di versamento specifico (es. solo per l'affitto)

### 9.3 Regola default
- Una regola senza tipo spesa e senza lista si applica come default a tutte le spese non coperte da regole specifiche

---

## 10. Tipi Spesa

**Percorso:** tab "Tipi Spesa"

- Creazione e gestione delle categorie di spesa
- Campi: descrizione, categoria (Utenza / Tassa / Condominio / Altro), modalità di riparto predefinita
- I tipi spesa "Utenza" attivano il controllo buchi nelle bollette
- Non eliminabili se già associati a documenti o regole

---

## 11. Documentale (Archivio)

**Percorso:** tab "Documentale"

Il documentale è un archivio generico per documenti non legati alla pipeline spese: contratti, verbali, planimetrie, documenti d'identità, ecc.

### 11.1 Tipi di documento
- Definizione di categorie per i documenti d'archivio
- Per ogni tipo si specificano le entità a cui può essere associato: appartamento, inquilino, proprietario (selezione multipla)

### 11.2 Caricamento e gestione documenti
- Upload di file di qualsiasi formato (PDF, immagini, Word, ecc.)
- Associazione a uno o più tipi di documento
- Note libere
- Associazione a una o più entità (appartamento, inquilino o proprietario specifici)
- Visualizzazione/apertura del file direttamente dal browser

### 11.3 Documenti dalle entità
- Dalla scheda di ogni appartamento, inquilino e proprietario è visibile la lista dei documenti del documentale associati
- Sezione espandibile con elenco, tipo documento, data e pulsante di apertura
- Caricamento rapido di un nuovo documento preassociato all'entità corrente

---

## 12. Autenticazione e Gestione Utenti

**Percorso:** tab "Amministrazione" → "Gestione Utenti"

### 12.1 Login con Google

L'accesso avviene esclusivamente tramite Google OAuth 2.0. Non esistono password locali.

1. Clicca **Accedi con Google** nella schermata di login
2. Autorizza l'applicazione nel popup Google
3. Verrai reindirizzato automaticamente all'applicazione autenticato

### 12.2 Ruoli

| Ruolo | Descrizione |
|-------|-------------|
| `admin` | Accesso completo inclusa la gestione di utenti e ruoli |
| `editor` | Lettura e scrittura di tutti i dati; non vede la gestione utenti |
| `viewer` | Sola lettura, eventualmente limitata ad appartamenti/inquilini specifici |

### 12.3 Gestione utenti (solo admin)

- Lista di tutti gli utenti registrati con avatar, email, ruolo e stato
- Creazione manuale di un account (email + nome + ruolo, senza bisogno del login Google)
- Modifica del ruolo di qualsiasi utente
- Disabilitazione/riabilitazione di un account
- Eliminazione di un account

### 12.4 Primo accesso e promozione admin

Il primo account che accede con l'indirizzo email impostato nella variabile `ADMIN_EMAIL` riceve automaticamente il ruolo `admin`.

---

## 13. Ruoli e Restrizioni Viewer

**Percorso:** tab "Amministrazione" → "Gestione Ruoli"

Disponibile solo per gli utenti con ruolo `admin`.

### 13.1 Visibilità predefinita

Un utente `viewer` senza restrizioni vede tutti gli appartamenti e tutti gli inquilini.

### 13.2 Limitazione per appartamento

Selezionando uno o più appartamenti, il viewer vede solo i dati relativi a quelli:
- Dashboard filtrata
- Griglia economica solo degli appartamenti selezionati
- Report limitato agli appartamenti consentiti
- Spese e versamenti filtrati

### 13.3 Limitazione per inquilino

Selezionando specifici inquilini, il viewer vede solo le righe di griglia, report e movimenti relative a quegli inquilini.

> Se si selezionano appartamenti, la lista degli inquilini nel pannello di configurazione si filtra automaticamente per mostrare solo quelli degli appartamenti selezionati.

### 13.4 Applicazione delle restrizioni

Le restrizioni sono applicate sia lato backend (le query SQL restituiscono solo i dati consentiti) sia lato frontend come difesa aggiuntiva. Questo vale per:
- Griglia economica
- Generazione report
- Dashboard
- Lista movimenti e spese

---

## 14. Struttura API REST

Tutti gli endpoint seguono lo schema `/api/<risorsa>` con metodi standard HTTP.

| Endpoint | Metodi | Descrizione |
|----------|--------|-------------|
| `/api/appartamenti` | GET POST PUT DELETE | CRUD appartamenti |
| `/api/appartamenti/:id/componenti` | GET POST PUT DELETE | CRUD inquilini |
| `/api/appartamenti/:id/percentuali` | GET | Controllo somma percentuali |
| `/api/proprietari` | GET POST PUT DELETE | CRUD proprietari |
| `/api/associazioni` | GET POST PUT DELETE | Associazioni proprietario-appartamento |
| `/api/tipi-spesa` | GET POST PUT DELETE | CRUD tipi di spesa |
| `/api/documenti` | GET POST PUT DELETE | CRUD documenti/spese |
| `/api/documenti/extract` | POST | Upload PDF con estrazione OCR |
| `/api/documenti/buchi-utenze` | GET | Rilevamento gap nelle bollette |
| `/api/documenti/:id/pdf` | GET | Download PDF documento |
| `/api/documenti/:id/audit` | GET | Audit trail modifiche |
| `/api/movimenti` | GET POST PUT DELETE | CRUD versamenti |
| `/api/griglia` | GET | Griglia economica inquilini |
| `/api/griglia/proprietari` | GET | Griglia economica proprietari |
| `/api/griglia/versatoperiodo` | GET | Totale versato in un periodo |
| `/api/griglia/export-zip` | GET | Export ZIP griglia |
| `/api/dashboard` | GET | KPI dashboard inquilini |
| `/api/dashboard/proprietari` | GET | KPI dashboard proprietari |
| `/api/regole` | GET POST PUT DELETE | CRUD regole di riparto |
| `/api/report/genera` | POST | Generazione report |
| `/api/report` | GET POST DELETE | CRUD report salvati |
| `/api/archivio-tipi` | GET POST PUT DELETE | CRUD tipi documento archivio |
| `/api/archivio` | GET POST PUT DELETE | CRUD documenti archivio |
| `/api/archivio/upload` | POST | Upload file archivio |
| `/api/archivio/:id/file` | GET | Download file archivio |
| `/api/health` | GET | Health check backend |
