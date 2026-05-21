# GSA — Gestione Spese Appartamenti v5

Applicazione web fullstack per la gestione completa di spese condominiali, affitti, versamenti, conguagli e documentazione relativa a più appartamenti.

**Stack:** Node.js 18+ · Express · PostgreSQL 16 · React 18 · Vite 5 · OCR integrato · Report PDF

**Documentazione:**
- [Schema Entità-Relazioni](docs/er-schema.md)
- [Funzionalità complete](docs/funzionalita.md)

---

## Indice

1. [Avvio con Docker (consigliato)](#1-avvio-con-docker-consigliato)
2. [Struttura del progetto](#2-struttura-del-progetto)
3. [Prerequisiti di sistema](#3-prerequisiti-di-sistema)
4. [Installazione da repository Git](#4-installazione-da-repository-git)
5. [Configurazione PostgreSQL](#5-configurazione-postgresql)
6. [Configurazione variabili d'ambiente](#6-configurazione-variabili-dambiente)
7. [Schema e migrazione del database](#7-schema-e-migrazione-del-database)
7. [Installazione dipendenze](#7-installazione-dipendenze)
8. [Avvio del progetto](#8-avvio-del-progetto)
9. [Architettura](#9-architettura)
10. [Risoluzione problemi](#10-risoluzione-problemi)

---

## 1. Avvio con Docker (consigliato)

Il modo più rapido per avviare l'intera applicazione (backend + frontend + PostgreSQL) senza installare nulla sul sistema host.

### Prerequisiti

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installato e in esecuzione

### Avvio

```bash
git clone https://github.com/mirkofranciosi74-png/gsa-app-modular.git
cd gsa-app-modular
docker compose up --build
```

Al primo avvio Docker:
1. Scarica le immagini base (postgres:16, node:18, nginx)
2. Builda il backend e il frontend
3. Avvia PostgreSQL e attende che sia pronto
4. Esegue automaticamente la migrazione del database
5. Avvia il backend e il frontend

Apri il browser su **http://localhost**

### Comandi utili

```bash
# Avvia in background
docker compose up -d

# Visualizza i log in tempo reale
docker compose logs -f

# Log solo del backend
docker compose logs -f backend

# Ferma tutto
docker compose down

# Ferma e cancella anche i dati del DB e i file storage
docker compose down -v
```

### Personalizzare le credenziali DB

Per cambiare utente/password del database, modifica le variabili `environment` nel file `docker-compose.yml` (sezioni `db` e `backend`) prima del primo avvio. Devono essere coerenti tra i due servizi.

### Persistenza dei dati

I dati sono salvati in tre volumi Docker nominati:
- `pgdata` — dati PostgreSQL
- `storage_pdf` — PDF delle bollette/spese
- `storage_archivio` — file del documentale

I volumi sopravvivono a `docker compose down` e vengono eliminati solo con `docker compose down -v`.

---

## 2. Struttura del progetto

```
gsa-app-modular/
│
├── .env                              ← variabili d'ambiente (NON committare)
├── .env.example                      ← template .env
├── .gitignore
├── package.json                      ← dipendenze backend
├── README.md
│
├── docs/
│   ├── er-schema.md                  ← schema entità-relazioni
│   └── funzionalita.md               ← descrizione completa funzionalità
│
├── src/                              ← BACKEND Node.js (porta 3001)
│   ├── server.js                     ← entry point Express
│   │
│   ├── shared/                       ← codice condiviso tra moduli
│   │   ├── db/
│   │   │   ├── pool.js               ← connessione PostgreSQL (pg.Pool)
│   │   │   ├── schema.sql            ← schema v5 idempotente (unica fonte di verità)
│   │   │   ├── migrate.js            ← applica schema.sql al DB
│   │   │   ├── seed.js               ← dati di esempio opzionali
│   │   │   └── migrations/           ← migrazioni storiche (002–013)
│   │   ├── middleware.js             ← helper h() + errorHandler
│   │   └── storage.js                ← lettura/scrittura file su disco
│   │
│   └── modules/                      ← moduli di dominio
│       │
│       ├── anagrafica/               ← appartamenti, proprietari, inquilini, tipi spesa
│       │   ├── appartamentiRepo.js
│       │   ├── proprietariRepo.js
│       │   ├── tipiSpesaRepo.js
│       │   ├── routes.js
│       │   └── index.js
│       │
│       ├── documenti/                ← spese PDF + pipeline OCR
│       │   ├── repo.js
│       │   ├── extractor.js          ← pdf-parse + Tesseract OCR
│       │   ├── routes.js
│       │   └── index.js
│       │
│       ├── movimenti/                ← versamenti CRUD
│       │   ├── repo.js
│       │   ├── routes.js
│       │   └── index.js
│       │
│       ├── contabilita/              ← griglia, dashboard, regole, report
│       │   ├── grigliaSvc.js         ← logica griglia economica e dashboard
│       │   ├── reportSvc.js          ← generazione report PDF
│       │   ├── reportSalvatiRepo.js
│       │   ├── ripartiRepo.js        ← CRUD regole di riparto
│       │   ├── grigliaExport.js      ← export ZIP griglia
│       │   ├── routes.js
│       │   └── index.js
│       │
│       └── archivio/                 ← documentale generico
│           ├── repo.js
│           ├── routes.js
│           └── index.js
│
├── storage/
│   ├── pdf/                          ← PDF delle bollette/spese
│   └── archivio/                     ← file del documentale generico
│
└── frontend/                         ← FRONTEND React + Vite (porta 5173)
    ├── package.json
    ├── vite.config.js                ← proxy /api → localhost:3001
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx                   ← layout + navigazione a tab
        ├── api.js                    ← client REST verso il backend
        ├── index.css
        ├── components/
        │   └── ui.jsx                ← componenti UI riusabili
        ├── utils/
        │   └── formatters.js
        └── tabs/
            ├── Dashboard.jsx         ← KPI e saldi
            ├── appartamenti.jsx      ← anagrafica appartamenti
            ├── Proprietari.jsx       ← anagrafica proprietari
            ├── componenti.jsx        ← lista inquilini
            ├── tipologie.jsx         ← tipi di spesa
            ├── documenti.jsx         ← spese e bollette PDF
            ├── versamenti.jsx        ← entrate e versamenti
            ├── riparti.jsx           ← regole di riparto
            ├── griglia.jsx           ← griglia economica
            ├── report.jsx            ← report PDF
            ├── Documentale.jsx       ← archivio documentale
            └── altri.jsx
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

---

### PostgreSQL 16

**macOS:**
```bash
brew install postgresql@16
brew services start postgresql@16
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
# Rendi permanente aggiungendo la riga a ~/.zshrc
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
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

---

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

> Se GraphicsMagick non è installato, i PDF testuali vengono processati normalmente con pdf-parse. Solo i PDF scansionati (immagini) richiedono GraphicsMagick + Ghostscript per l'OCR.

---

## 3. Installazione da repository Git

```bash
git clone <url-repository> gsa-app-modular
cd gsa-app-modular
```

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

**Windows** — apri "SQL Shell (psql)" dal menu Start e premi Invio alle prime domande:
```
Server [localhost]: ↵
Database [postgres]: ↵
Port [5432]: ↵
Username [postgres]: ↵
Password: <password scelta durante l'installazione>
```

Una volta dentro la console `psql`, esegui:

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

Crea il file `.env` nella cartella radice del progetto:

```bash
cp .env.example .env
```

Apri `.env` e compila:

```
# Porta backend (default 3001)
PORT=3001

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gsa_db
DB_USER=gsa_user
DB_PASSWORD=changeme
DB_SSL=false

# Dimensione massima upload file (default 20 MB)
MAX_FILE_SIZE=20971520

# Soglia caratteri sotto cui attiva OCR (default 120)
OCR_MIN_CHARS=120

# Lingua Tesseract per OCR
TESSERACT_LANG=ita

# Percorso storage PDF bollette (default: ./storage/pdf/)
# STORAGE_PATH=/percorso/assoluto/storage/pdf

# Percorso storage archivio documentale (default: ./storage/archivio/)
# ARCHIVIO_PATH=/percorso/assoluto/storage/archivio
```

> Il file `.env` non viene mai committato su Git (è in `.gitignore`).

---

## 6. Schema e migrazione del database

Lo script di migrazione applica `src/shared/db/schema.sql`, che è **idempotente**: funziona sia su un database vuoto (prima installazione) sia su un database esistente a qualsiasi versione precedente dello schema.

```bash
npm run db:migrate
```

Output atteso:
```
▶  Migrazione schema in corso…
✅  Schema applicato.
```

**Dati iniziali (opzionale):**
```bash
npm run db:seed
```
Inserisce 6 tipologie di spesa predefinite: Acqua, Luce, Gas, TARI, Condominio, Altro.

> `npm run db:migrate` è sicuro da rieseguire in qualsiasi momento: non distrugge dati esistenti. Aggiunge automaticamente tabelle e colonne mancanti.

### Versione schema attuale (v5)

Le principali tabelle del database sono:

| Tabella | Descrizione |
|---------|-------------|
| `appartamenti` | Anagrafica appartamenti |
| `proprietari` | Anagrafica proprietari |
| `appartamento_proprietari` | Associazione proprietario ↔ appartamento con % e periodo |
| `componenti` | Inquilini con quota affitto, caparra e date validità |
| `tipi_spesa` | Categorie di spesa |
| `documenti` | Bollette/fatture PDF con testo estratto e importo |
| `documenti_audit` | Log modifiche ai documenti |
| `movimenti` | Versamenti con segno, tipo, data e mese riferimento |
| `regole_riparto` | Regole distribuzione spese e entrate |
| `regole_riparto_esclusi/inclusi` | Inquilini esclusi/inclusi da una regola |
| `regole_riparto_esclusi/inclusi_prop` | Proprietari esclusi/inclusi (riparto entrate) |
| `report_salvati` | Report PDF generati e salvati |
| `archivio_tipi_documento` | Classificazione documenti archiviati |
| `archivio_documenti` | Documenti generici (contratti, verbali, planimetrie…) |
| `archivio_associazioni` | Collegamento documento ↔ entità |

Per lo schema completo: [docs/er-schema.md](docs/er-schema.md)

---

## 7. Installazione dipendenze

**Backend** (dalla cartella radice):
```bash
npm install
```

**Frontend:**
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
cd gsa-app-modular
npm run dev
```
Output atteso:
```
✅  Backend → http://localhost:3001
    DB: localhost:5432/gsa_db
```

**Terminale 2 — frontend:**
```bash
cd gsa-app-modular/frontend
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

### Avvio in produzione

```bash
# Build frontend
cd frontend && npm run build && cd ..

# Avvia backend (serve anche i file statici del frontend con un reverse proxy)
npm start
```

Per la produzione si consiglia di usare **nginx** o **Caddy** come reverse proxy:
- servire `/` dai file statici della directory `frontend/dist/`
- girare `/api/*` al backend su `localhost:3001`

---

## 9. Architettura

### 9.1 Monolite modulare

Il backend è organizzato come **monolite modulare**: un unico processo Node.js con moduli di dominio separati che comunicano attraverso interfacce pubbliche (`index.js`). Nessuna dipendenza SQL cross-modulo.

```
server.js
  └─ monta i router di ciascun modulo su /api/<risorsa>

src/modules/
  anagrafica/    → /api/appartamenti, /api/proprietari, /api/associazioni, /api/tipi-spesa
  documenti/     → /api/documenti
  movimenti/     → /api/movimenti
  contabilita/   → /api/griglia, /api/dashboard, /api/regole, /api/report
  archivio/      → /api/archivio, /api/archivio-tipi
```

Ogni modulo ha:
- `routes.js` — definizione endpoint REST
- `repo.js` / `*Repo.js` — query SQL e logica di dominio
- `index.js` — API pubblica verso altri moduli (se necessaria)

### 9.2 Livelli

| Livello | File | Responsabilità |
|---------|------|----------------|
| Entry point | `src/server.js` | Inizializza Express, monta i router |
| Routes | `modules/*/routes.js` | Definisce endpoint REST del modulo |
| Repository | `modules/*/repo.js` | Query SQL, transazioni |
| Service | `modules/contabilita/grigliaSvc.js` | Logica di calcolo griglia, dashboard |
| Pipeline | `modules/documenti/extractor.js` | OCR su PDF |
| Report | `modules/contabilita/reportSvc.js` | Generazione PDF con pdfkit |
| Storage | `shared/storage.js` | Lettura/scrittura file su disco |
| DB | `shared/db/pool.js` | Pool connessioni PostgreSQL |

### 9.3 Frontend

SPA React con navigazione a tab. Vite proxia `/api/*` al backend (porta 3001) in sviluppo.

| Tab | Componente | Funzione |
|-----|-----------|----------|
| Dashboard | `Dashboard.jsx` | KPI annuali, saldi inquilini e proprietari |
| Griglia Economica | `griglia.jsx` | Griglia per periodo: spese, versamenti, conguaglio |
| Report | `report.jsx` | Generazione e salvataggio report PDF |
| Appartamenti | `appartamenti.jsx` | Anagrafica appartamenti con documenti allegati |
| Proprietari | `Proprietari.jsx` | Anagrafica proprietari con documenti allegati |
| Inquilini | `componenti.jsx` | Lista inquilini, propagazione date, documenti |
| Spese | `documenti.jsx` | Upload PDF, OCR, gestione bollette, buchi utenze |
| Entrate | `versamenti.jsx` | Versamenti, import CSV, rimborsi |
| Riparti | `riparti.jsx` | Regole riparto spese e entrate |
| Tipi Spesa | `tipologie.jsx` | Categorie di spesa |
| Documentale | `Documentale.jsx` | Archivio generico (contratti, verbali…) |

### 9.4 Pipeline OCR

Quando viene caricato un PDF di spesa:

1. **pdf-parse** estrae il testo direttamente (PDF testuali)
2. Se il testo è inferiore a `OCR_MIN_CHARS` caratteri (PDF scansionati):
   - **pdf2pic** converte il PDF in immagini tramite GraphicsMagick + Ghostscript
   - **Tesseract.js** esegue OCR per ogni pagina in italiano
3. Il sistema propone automaticamente: importo, fornitore, periodo, tipo spesa
4. Il file PDF viene salvato in `storage/pdf/{uuid}.pdf`

### 9.5 Calcolo conguaglio

```
Conguaglio = Versato − Spese dovute − Affitto
```

- **Versato**: somma dei movimenti nel periodo (segno applicato: rimborsi con -1)
- **Spese dovute**: quota di competenza calcolata applicando le regole di riparto all'importo totale delle bollette del periodo
- **Affitto**: `quota_affitto × numero_mesi_di_competenza`
- Positivo (verde) = credito dell'inquilino
- Negativo (rosso) = importo ancora da versare

---

## 10. Risoluzione problemi

### `Mancano in .env: DB_HOST, ...` all'avvio del backend
Il file `.env` non viene trovato. Deve stare nella cartella radice (dove si trova `package.json`).
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
Il backend non è avviato. Verifica che il terminale del backend mostri `✅ Backend → http://localhost:3001`.

### `GraphicsMagick not found` durante upload PDF
GraphicsMagick non è nel PATH. L'OCR su PDF scansionati non funzionerà; i PDF testuali continuano a funzionare normalmente.
```bash
which gm
# macOS Apple Silicon:
echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

### `Cannot find module` all'avvio
```bash
# Backend
rm -rf node_modules package-lock.json
npm install

# Frontend
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
Rileva automaticamente le colonne e tabelle mancanti e le aggiunge senza toccare i dati esistenti.

### La porta 3001 è già in uso
```bash
lsof -ti :3001 | xargs kill -9
npm run dev
```
Il comando `npm run dev` include già questo cleanup automaticamente.
