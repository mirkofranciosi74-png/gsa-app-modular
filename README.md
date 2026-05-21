# GSA — Gestione Spese Appartamenti v5

Applicazione fullstack per la gestione delle spese condominiali.  
Backend Node.js + PostgreSQL · Frontend React + Vite · OCR integrato · Report PDF.

---

## Indice

1. [Struttura del progetto](#1-struttura-del-progetto)
2. [Prerequisiti di sistema](#2-prerequisiti-di-sistema)
3. [Installazione da repository Git](#3-installazione-da-repository-git)
4. [Configurazione PostgreSQL](#4-configurazione-postgresql)
5. [Configurazione variabili d'ambiente](#5-configurazione-variabili-dambiente)
6. [Creazione e aggiornamento del database](#6-creazione-e-aggiornamento-del-database)
7. [Installazione dipendenze](#7-installazione-dipendenze)
8. [Avvio del progetto](#8-avvio-del-progetto)
9. [Architettura del programma](#9-architettura-del-programma)
10. [Risoluzione problemi](#10-risoluzione-problemi)

---

## 1. Struttura del progetto

```
gsa-app/                              ← cartella radice
│
├── .env                              ← variabili d'ambiente (NON committare)
├── .env.example                      ← template .env
├── .gitignore
├── package.json                      ← dipendenze BACKEND
├── README.md
│
├── src/                              ← BACKEND Node.js (porta 3001)
│   ├── server.js                     ← entry point Express
│   ├── storage.js                    ← gestione file PDF su disco
│   ├── db/
│   │   ├── pool.js                   ← connessione PostgreSQL (pg.Pool)
│   │   ├── schema.sql                ← schema v4 idempotente
│   │   ├── migrate.js                ← applica schema.sql al DB
│   │   └── seed.js                   ← dati di esempio opzionali
│   ├── repositories/
│   │   ├── appartamentiRepo.js       ← CRUD appartamenti + componenti
│   │   ├── documentiRepo.js          ← CRUD documenti + pipeline OCR
│   │   ├── movimentiRepo.js          ← CRUD movimenti + griglia economica
│   │   └── regoleRepo.js             ← CRUD regole di riparto
│   ├── pipeline/
│   │   ├── extractor.js              ← estrazione testo da PDF (pdf-parse + OCR)
│   │   └── reporter.js               ← generazione report PDF (pdfkit)
│   └── routes/
│       └── routes.js                 ← tutte le route REST /api/*
│
└── frontend/                         ← FRONTEND React + Vite (porta 5173)
    ├── package.json                  ← dipendenze FRONTEND
    ├── vite.config.js                ← proxy /api → localhost:3001
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx                   ← layout + navigazione a tab
        ├── api.js                    ← tutti i client REST verso il backend
        ├── index.css                 ← design system (variabili CSS, componenti)
        ├── components/
        │   └── ui.jsx                ← componenti UI riusabili (Btn, Modal, Badge…)
        ├── utils/
        │   └── formatters.js         ← utilità (euro, date italiane, ecc.)
        └── tabs/
            ├── Dashboard.jsx         ← riepilogo generale
            ├── Appartamenti.jsx      ← gestione appartamenti
            ├── componenti.jsx        ← gestione inquilini/componenti
            ├── tipologie.jsx         ← tipologie di spesa
            ├── Documenti.jsx         ← upload e gestione documenti PDF
            ├── Versamenti.jsx        ← registrazione versamenti
            ├── riparti.jsx           ← regole di riparto delle spese
            ├── griglia.jsx           ← griglia economica per periodo
            ├── report.jsx            ← generazione e salvataggio report
            └── altri.jsx             ← re-export di compatibilità
```

---

## 2. Prerequisiti di sistema

### Node.js 18 o superiore

**macOS:**
```bash
brew install node
```

**Ubuntu/Debian:**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

**Windows:** scarica l'installer LTS da https://nodejs.org

Verifica:
```bash
node -v    # deve mostrare v18.x.x o superiore
npm -v
```

### PostgreSQL 16

**macOS:**
```bash
brew install postgresql@16
brew services start postgresql@16
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
# Aggiungi la riga export anche a ~/.zshrc per renderla permanente
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Windows:** scarica l'installer da https://www.postgresql.org/download/windows/

Verifica:
```bash
psql --version
```

### GraphicsMagick e Ghostscript (richiesti per OCR su PDF scansionati)

**macOS:**
```bash
brew install graphicsmagick ghostscript
```

**Ubuntu/Debian:**
```bash
sudo apt install -y graphicsmagick ghostscript
```

**Windows:**
- GraphicsMagick: http://www.graphicsmagick.org/download.html
- Ghostscript: https://www.ghostscript.com/releases/gsdnld.html

Verifica:
```bash
gm -version
gs --version
```

---

## 3. Installazione da repository Git

```bash
# Clona il repository
git clone <url-repository> gsa-app
cd gsa-app
```

Se stai lavorando direttamente in una cartella già esistente, assicurati di essere nella root del progetto (dove si trova `package.json`).

---

## 4. Configurazione PostgreSQL

Accedi alla console PostgreSQL:

**macOS:**
```bash
psql postgres
```

**Ubuntu/Debian:**
```bash
sudo -u postgres psql
```

**Windows** (apri "SQL Shell (psql)" dal menu Start e premi Invio alle prime domande):
```
Server [localhost]: ↵
Database [postgres]: ↵
Port [5432]: ↵
Username [postgres]: ↵
Password: <password scelta durante installazione>
```

Esegui questi comandi nella console `psql`:

```sql
CREATE USER gsa_user WITH PASSWORD 'changeme';
CREATE DATABASE gsa_db OWNER gsa_user;
GRANT ALL PRIVILEGES ON DATABASE gsa_db TO gsa_user;
\q
```

Verifica la connessione:
```bash
psql -h localhost -U gsa_user -d gsa_db -c "SELECT version();"
# Password: changeme
```

---

## 5. Configurazione variabili d'ambiente

Crea il file `.env` nella cartella `gsa-app/`:

```bash
cp .env.example .env
```

Apri `.env` e compila con i tuoi valori:

```
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gsa_db
DB_USER=gsa_user
DB_PASSWORD=changeme
DB_SSL=false

# Dimensione massima upload PDF (default 20 MB)
MAX_FILE_SIZE=20971520

# Soglia caratteri sotto cui attiva OCR (default 120)
OCR_MIN_CHARS=120

# Lingua Tesseract per OCR
TESSERACT_LANG=ita

# Percorso storage PDF (opzionale, default: ./storage/pdf/)
# STORAGE_PATH=/percorso/assoluto/storage/pdf
```

> **Importante:** il file `.env` non viene mai committato su Git. Non contiene mai credenziali di produzione nel repository.

---

## 6. Creazione e aggiornamento del database

Lo script di migrazione applica `src/db/schema.sql`, che è **idempotente**:
funziona sia su un database vuoto (prima installazione) sia su un database esistente
allineato a qualsiasi versione precedente dello schema.

```bash
npm run db:migrate
```

Output atteso:
```
▶  Migrazione schema in corso…
✅  Schema applicato.
```

**Inserimento dati di esempio (opzionale):**
```bash
npm run db:seed
```
Inserisce 6 tipologie di spesa predefinite (Acqua, Luce, Gas, TARI, Condominio, Altro)
e un appartamento di esempio con componenti.

> `npm run db:migrate` è sicuro da rieseguire in qualsiasi momento: non distrugge dati esistenti.

---

## 7. Installazione dipendenze

Installa le dipendenze del backend:
```bash
# Nella cartella gsa-app/
npm install
```

Installa le dipendenze del frontend:
```bash
cd frontend
npm install
cd ..
```

---

## 8. Avvio del progetto

Apri **due terminali separati**.

**Terminale 1 — backend:**
```bash
cd gsa-app
npm run dev
```
Output atteso:
```
✅  Backend → http://localhost:3001
    DB: localhost:5432/gsa_db
```

**Terminale 2 — frontend:**
```bash
cd gsa-app/frontend
npm run dev
```
Output atteso:
```
  VITE v5.x.x  ready in ~300 ms
  ➜  Local:   http://localhost:5173/
```

Apri il browser su **http://localhost:5173**

**Verifica backend:**
```bash
curl http://localhost:3001/api/health
# Risposta: {"ok":true,"ts":"..."}
```

---

## 9. Architettura del programma

### 9.1 Backend (Node.js + Express)

Il backend è strutturato a livelli:

| Livello | File | Responsabilità |
|---------|------|----------------|
| Entry point | `src/server.js` | Inizializza Express, CORS, multer, routes |
| Routes | `src/routes/routes.js` | Definisce tutti gli endpoint REST `/api/*` |
| Repositories | `src/repositories/*.js` | Query SQL, logica di dominio |
| Pipeline | `src/pipeline/extractor.js` | Estrazione testo da PDF |
| Pipeline | `src/pipeline/reporter.js` | Generazione report PDF con pdfkit |
| Storage | `src/storage.js` | Salvataggio/lettura file PDF su disco |
| DB | `src/db/pool.js` | Pool di connessioni PostgreSQL |
| DB | `src/db/schema.sql` | Schema v5 idempotente |

**Repository principali:**

- **`appartamentiRepo.js`** — CRUD appartamenti, componenti (inquilini), quote affitto, date validità
- **`documentiRepo.js`** — upload documenti PDF, estrazione testo, associazione spese per componente tramite regole di riparto
- **`movimentiRepo.js`** — versamenti, griglia economica aggregata per periodo, calcolo conguagli
- **`regoleRepo.js`** — regole di riparto (per tipologia, modalità includi/escludi, validità temporale, quote percentuali)

**Endpoint principali:**

```
GET/POST/PUT/DELETE  /api/appartamenti
GET/POST/PUT/DELETE  /api/componenti
GET/POST/PUT/DELETE  /api/tipi-spesa
GET/POST/PUT/DELETE  /api/documenti
GET/POST/PUT/DELETE  /api/movimenti
GET/POST/PUT/DELETE  /api/regole
GET                  /api/griglia?periodoDA=YYYY-MM&periodoA=YYYY-MM
POST                 /api/report/genera
GET/POST/DELETE      /api/report
GET                  /api/health
```

### 9.2 Pipeline OCR

Quando viene caricato un PDF:

1. **pdf-parse** estrae il testo direttamente (PDF testuali)
2. Se il testo estratto è inferiore a `OCR_MIN_CHARS` caratteri (PDF scansionati):
   - **pdf2pic** converte il PDF in immagini usando GraphicsMagick + Ghostscript
   - **Tesseract.js** esegue OCR su ciascuna pagina in lingua italiana
3. Il testo risultante viene salvato in DB; il file PDF grezzo in `./storage/pdf/{uuid}.pdf`

### 9.3 Frontend (React + Vite)

Il frontend è una SPA con navigazione a tab. Vite proxia automaticamente
tutte le chiamate `/api` al backend su porta 3001, quindi non servono URL hardcoded.

**Struttura dei tab:**

| Tab | Componente | Funzione |
|-----|-----------|----------|
| Dashboard | `Dashboard.jsx` | KPI, riepilogo saldi, accesso rapido |
| Appartamenti | `Appartamenti.jsx` | Anagrafica appartamenti e inquilini |
| Inquilini | `componenti.jsx` | Lista completa inquilini, storico, disattivazione |
| Tipologie | `tipologie.jsx` | Gestione tipologie di spesa |
| Documenti | `Documenti.jsx` | Upload PDF, visualizzazione testo estratto/OCR |
| Versamenti | `Versamenti.jsx` | Registrazione versamenti, importazione da CSV |
| Riparti | `riparti.jsx` | Regole di ripartizione spese per appartamento |
| Griglia Econ. | `griglia.jsx` | Griglia periodo: spese, versamenti, affitto, conguaglio |
| Report | `report.jsx` | Generazione, salvataggio e download report PDF |

**Calcolo conguaglio (Griglia Economica):**

```
Conguaglio = Versato − Spese dovute − Affitto
```

- Positivo (verde) = credito dell'inquilino
- Negativo (rosso) = importo ancora da versare

Le spese dovute sono calcolate dal backend in base alle regole di riparto.
L'affitto è calcolato sul frontend da `quota_affitto × numero_mesi_di_validità`.

### 9.4 Tab Versamenti — dettaglio funzionalità

Ogni versamento registra i seguenti attributi aggiuntivi rispetto al semplice importo:

| Campo | Valori | Descrizione |
|-------|--------|-------------|
| `tipo_versamento` | `affitto` · `conguaglio` · `rimborso` · `altro` | Natura del pagamento |
| `data_versamento` | data (GG/MM/AAAA) | Giorno fisico di ricezione (bonifico/contanti), solo per voci una-tantum |
| `mese_riferimento` | AAAA-MM | Mese contabile a cui si riferisce il pagamento; proposto automaticamente dalla data versamento |

**Importazione da CSV:**

Il pulsante **Importa CSV** apre un wizard riga per riga. Il file deve avere il formato:

```
giorno, descrizione, importo
15/01/2025, Rossi affitto gennaio, 750
2025-01-20, Mario Bianchi conguaglio, 120.50
```

- Separatori supportati: virgola o punto e virgola
- Date: `GG/MM/AAAA` oppure `AAAA-MM-GG`
- Per ogni riga il sistema propone: mese di riferimento dalla data, tipo = affitto, inquilino rilevato automaticamente se il nome o cognome compare nella descrizione
- L'utente può modificare tutti i campi prima di salvare o saltare la riga
- Viene mostrato un **avviso** se per lo stesso inquilino esiste già un versamento nella stessa data

### 9.5 Schema del database (v5)

Le tabelle principali:

| Tabella | Descrizione |
|---------|-------------|
| `appartamenti` | Anagrafica appartamenti |
| `componenti` | Inquilini/componenti, con `quota_affitto` e date di validità |
| `tipi_spesa` | Tipologie di spesa (Acqua, Luce, Gas…) |
| `documenti` | Documenti PDF con testo estratto e importo |
| `doc_righe` | Righe di spesa estratte da ciascun documento |
| `movimenti` | Versamenti con segno, tipo, data e mese di riferimento |
| `regole_riparto` | Regole di ripartizione spese per appartamento e tipologia |
| `regole_riparto_esclusi` | Componenti esclusi da una regola (modalità `escludi`) |
| `regole_riparto_inclusi` | Componenti inclusi in una regola (modalità `includi`) |
| `report_salvati` | Report salvati (nome, parametri, testo, PDF base64) |

**Colonne rilevanti della tabella `movimenti`:**

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `segno` | `SMALLINT` (1 / -1) | Direzione: +1 entrata, -1 rimborso/uscita |
| `tipo_versamento` | enum | `affitto` · `conguaglio` · `rimborso` · `altro` |
| `data_versamento` | `DATE` | Giorno fisico di ricezione (una-tantum) |
| `mese_riferimento` | `VARCHAR(7)` | Mese contabile AAAA-MM (una-tantum) |
| `periodicita` | enum | `una_tantum` · `mensile` · … · `annuale` |
| `validita_da` / `validita_a` | `DATE` | Periodo contabile del versamento |

**View principali:**
- `v_saldo_componenti` — saldo netto per componente (versato − dovuto)
- `v_movimenti_dettaglio` — movimenti con importo netto, tipo versamento, data e mese riferimento

---

## 10. Risoluzione problemi

### `DB: undefined:undefined/undefined` all'avvio del backend
Il file `.env` non viene trovato. Deve stare nella cartella `gsa-app/` (stessa cartella di `package.json`).
```bash
ls -la | grep env   # deve comparire .env
```

### `Error: connect ECONNREFUSED 127.0.0.1:5432`
PostgreSQL non è in esecuzione.
```bash
brew services start postgresql@16    # macOS
sudo systemctl start postgresql      # Ubuntu
```

### `password authentication failed for user "gsa_user"`
La password nel `.env` non corrisponde a quella del DB.
```bash
psql -U postgres -c "ALTER USER gsa_user WITH PASSWORD 'changeme';"
```

### Il frontend mostra pagina bianca o errori di rete
Il backend non è avviato. Verifica che il Terminale 1 mostri `✅ Backend → http://localhost:3001`.

### `GraphicsMagick not found` durante upload PDF
GraphicsMagick non è nel PATH.
```bash
which gm
# macOS Apple Silicon:
echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

### `Cannot find module` all'avvio
```bash
cd gsa-app
rm -rf node_modules package-lock.json
npm install
# Per il frontend:
cd frontend && rm -rf node_modules package-lock.json && npm install
```

### `relation "..." does not exist` — tabelle mancanti
Esegui la migrazione:
```bash
npm run db:migrate
```

### Aggiornare un database esistente alla versione corrente
Lo schema è idempotente: riesegui semplicemente la migrazione.
```bash
npm run db:migrate
```
Il comando rileva automaticamente le colonne e tabelle mancanti e le aggiunge senza toccare i dati esistenti.
