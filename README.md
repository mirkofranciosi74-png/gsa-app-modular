# GSA — Gestione Spese Appartamenti v5

Applicazione web fullstack per la gestione completa di spese condominiali, affitti, versamenti, conguagli e documentazione relativa a più appartamenti.

**Stack:** Node.js 20 · Express · PostgreSQL 16 · React 18 · Vite 5 · OCR integrato · Report PDF · Autenticazione Google OAuth + login locale email/password

## Documentazione del progetto

| Documento | Descrizione |
|-----------|-------------|
| [Riferimento API](docs/API.md) | Tutti gli endpoint REST con parametri, body e risposte |
| [Funzionalità complete](docs/funzionalita.md) | Descrizione funzionale di ogni modulo dell'applicazione |
| [Schema Entità-Relazioni](docs/er-schema.md) | Schema del database con relazioni tra le tabelle |
| [Specifiche versamenti e entrate](docs/specifiche_versamenti_entrate.md) | Regole di calcolo per versamenti, quote e conguagli |

---

## Indice

1. [Avvio con Docker — sviluppo locale](#1-avvio-con-docker--sviluppo-locale)
2. [Deploy su web (produzione)](#2-deploy-su-web-produzione)
3. [Sviluppo locale con dominio personalizzato (Caddy)](#3-sviluppo-locale-con-dominio-personalizzato-caddy)
4. [Struttura del progetto](#4-struttura-del-progetto)
5. [Prerequisiti di sistema](#5-prerequisiti-di-sistema)
6. [Installazione e avvio manuale](#6-installazione-e-avvio-manuale)
7. [Variabili d'ambiente](#7-variabili-dambiente)
8. [Autenticazione](#8-autenticazione)
9. [Ruoli e gestione utenti](#9-ruoli-e-gestione-utenti)
10. [Schema e migrazione del database](#10-schema-e-migrazione-del-database)
11. [Architettura](#11-architettura)
12. [Risoluzione problemi](#12-risoluzione-problemi)

---

## 1. Avvio con Docker — sviluppo locale

Il modo più rapido per avviare l'intera applicazione (backend + frontend + PostgreSQL) senza installare nulla sul sistema host.

### Prerequisiti

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installato e in esecuzione

### Configurazione iniziale

```bash
git clone <url-repository> gsa-app-modular
cd gsa-app-modular
cp .env.example .env
```

Apri `.env` e compila almeno:

```bash
DB_PASSWORD=scegli-una-password-sicura
JWT_SECRET=$(openssl rand -hex 64)   # genera un segreto casuale
ADMIN_EMAIL=tua@email.com            # primo account che diventa admin
FRONTEND_URL=http://localhost
BACKEND_URL=http://localhost:3001
```

> Per ora puoi lasciare `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` vuoti: il login Google non sarà disponibile, ma l'applicazione si avvia comunque. Potrai usare il login locale con email e password.

### Avvio

```bash
docker compose up --build
```

Al primo avvio Docker:
1. Scarica le immagini base (postgres, node, nginx)
2. Builda il backend e il frontend
3. Avvia PostgreSQL e attende che sia pronto
4. Esegue automaticamente la migrazione del database
5. Avvia backend e frontend

Apri il browser su **http://localhost**

### Comandi utili

```bash
docker compose up -d              # avvia in background
docker compose logs -f            # log in tempo reale
docker compose logs -f backend    # log solo del backend
docker compose down               # ferma tutto (dati conservati)
docker compose down -v            # ferma e cancella anche i volumi (dati persi)
docker compose restart backend    # riavvia solo il backend
```

### Persistenza dei dati

I dati sono salvati in tre volumi Docker nominati:

| Volume | Contenuto |
|--------|-----------|
| `pgdata` | Dati PostgreSQL |
| `storage_pdf` | PDF delle bollette e spese |
| `storage_archivio` | File del documentale |

I volumi sopravvivono a `docker compose down` e vengono eliminati solo con `docker compose down -v`.

---

## 2. Deploy su web (produzione)

Questa sezione descrive come pubblicare l'applicazione su un server accessibile da internet.

### Prerequisiti

- Server Linux (Ubuntu 22.04+ consigliato) con Docker e Docker Compose installati
- Un dominio DNS puntato all'IP del server (es. `gsa.mio-dominio.it`)
- Credenziali Google OAuth (vedi [Sezione 8](#8-autenticazione)) — opzionale se si usa solo il login locale
- (Consigliato) HTTPS tramite nginx/Caddy in reverse proxy o Let's Encrypt

### 2.1 Preparazione del server

```bash
# Installa Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Clona il repository
git clone <url-repository> gsa-app-modular
cd gsa-app-modular
```

### 2.2 Configurazione .env di produzione

```bash
cp .env.example .env
nano .env   # oppure: vim .env
```

Compila **tutti** i campi:

```bash
# Database
DB_HOST=db
DB_PORT=5432
DB_NAME=gsa_db
DB_USER=gsa_user
DB_PASSWORD=password-molto-sicura-cambiarla

# Backend
PORT=3001
HTTP_PORT=80          # porta esposta da nginx (80 oppure altra porta)

# JWT — generare con: openssl rand -hex 64
JWT_SECRET=incolla-qui-una-stringa-hex-di-128-caratteri

# Google OAuth (opzionale — vedi Sezione 8)
GOOGLE_CLIENT_ID=732897461114-xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx

# URL pubblici — DEVE corrispondere all'indirizzo del server
FRONTEND_URL=https://gsa.mio-dominio.it
BACKEND_URL=https://gsa.mio-dominio.it

# Primo admin
ADMIN_EMAIL=admin@mio-dominio.it

# Impostazioni OCR e upload (valori default già corretti)
MAX_FILE_SIZE=20971520
OCR_MIN_CHARS=120
TESSERACT_LANG=ita
```

> **Importante:** `BACKEND_URL` viene usato per costruire il `redirect_uri` del callback OAuth.
> Il valore registrato in Google Console deve essere `${BACKEND_URL}/auth/google/callback`.

### 2.3 Avvio in produzione

```bash
docker compose up --build -d
```

### 2.4 Creazione primo utente admin (senza Google OAuth)

Se non si vuole configurare Google OAuth, si può creare l'utente admin direttamente:

```bash
# Dopo che il container è avviato
docker compose exec backend node scripts/create-admin.js admin@esempio.com lapassword
```

### 2.5 HTTPS con nginx reverse proxy esterno (consigliato)

Se usi Caddy o nginx sull'host come reverse proxy con SSL (Let's Encrypt), esponi l'app su una porta diversa e poi punta al container frontend:

```bash
# In .env
HTTP_PORT=8080
FRONTEND_URL=https://gsa.mio-dominio.it
BACKEND_URL=https://gsa.mio-dominio.it
```

**Esempio Caddyfile:**
```
gsa.mio-dominio.it {
    reverse_proxy localhost:8080
}
```

**Esempio nginx (`/etc/nginx/sites-available/gsa`):**
```nginx
server {
    listen 443 ssl;
    server_name gsa.mio-dominio.it;

    ssl_certificate     /etc/letsencrypt/live/gsa.mio-dominio.it/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gsa.mio-dominio.it/privkey.pem;

    location / {
        proxy_pass         http://localhost:8080;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_set_header   X-Real-IP         $remote_addr;
    }
}

server {
    listen 80;
    server_name gsa.mio-dominio.it;
    return 301 https://$host$request_uri;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/gsa /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d gsa.mio-dominio.it
```

### 2.6 Aggiornamento dell'applicazione

```bash
git pull
docker compose up --build -d
```

La migrazione del database viene applicata automaticamente all'avvio del backend.

### 2.7 Backup

```bash
# Backup manuale dal pannello Admin dell'app (tab Amministrazione)
# oppure direttamente da PostgreSQL:
docker compose exec db pg_dump -U gsa_user gsa_db > backup_$(date +%Y%m%d).sql

# Ripristino
cat backup_20260101.sql | docker compose exec -T db psql -U gsa_user gsa_db
```

---

## 3. Sviluppo locale con dominio personalizzato (Caddy)

Simula un deployment reale su `https://gsa.test` mantenendo i dev server con hot reload.
Caddy genera automaticamente un certificato HTTPS locale firmato dalla propria CA.
Il file `Caddyfile` è già incluso nel repository.

### 3.1 Prerequisiti

- Caddy installato: `brew install caddy`
- Voce in `/etc/hosts` (una tantum, richiede sudo):
  ```bash
  sudo sh -c 'echo "127.0.0.1  gsa.test" >> /etc/hosts'
  ```
- Verifica: `ping -c1 gsa.test` deve rispondere da `127.0.0.1`

> Lo script `scripts/setup.sh` può aggiungere automaticamente la voce hosts al passo 7.

### 3.2 Configurazione `.env`

```bash
FRONTEND_URL=https://gsa.test      # dove il browser atterra dopo il login
BACKEND_URL=http://localhost:3001  # usato per costruire il redirect_uri OAuth
```

> **Perché `BACKEND_URL` è localhost?**
> Google OAuth non accetta TLD non pubblici (`.test`, `.local`, ecc.) nei redirect URI.
> Usando `localhost:3001` come `BACKEND_URL`, il callback OAuth avviene su `http://localhost:3001/auth/google/callback` (accettato da Google), e il backend poi reindirizza il browser su `https://gsa.test/?token=...`.

### 3.3 Avvio rapido con script

```bash
bash scripts/dev-start.sh
```

Lo script controlla se Caddy, backend o frontend sono già in esecuzione e chiede per ognuno se fermarlo e riavviarlo (`s`) o mantenerlo (`k`). I log vengono salvati in `logs/dev/`.

Per fermare tutto:

```bash
bash scripts/dev-stop.sh
```

### 3.4 Avvio manuale (3 terminali)

```bash
# Terminale 1 — backend Express (porta 3001)
npm run dev

# Terminale 2 — frontend Vite (porta 5173)
cd frontend && npm run dev

# Terminale 3 — proxy Caddy (porta 443 HTTPS, richiede sudo)
sudo caddy run --config Caddyfile
```

Il `Caddyfile` usa `tls internal`: Caddy genera il certificato con la propria CA locale invece di contattare Let's Encrypt (necessario perché `gsa.test` non è raggiungibile da internet).

Al **primo avvio** macOS mostra un prompt per aggiungere la CA al Keychain di sistema — conferma con la password di amministratore. Questo rende il certificato `https://gsa.test` trusted nel browser senza avvisi.

Se il prompt non compare, installa la CA manualmente in un quarto terminale **mentre Caddy è in esecuzione**:
```bash
caddy trust
```

> **Nota:** se ottieni `permission denied` sulla PKI di Caddy, ripristina i permessi prima di avviare:
> ```bash
> sudo chown -R $(whoami) "/Users/$(whoami)/Library/Application Support/Caddy/"
> sudo caddy run --config Caddyfile
> ```

Apri **https://gsa.test** — Caddy instrada:

| Percorso | Destinazione |
|----------|-------------|
| `/api/*` | backend `:3001` |
| `/auth/*` | backend `:3001` (callback OAuth) |
| tutto il resto | Vite `:5173` (hot reload incluso) |

### 3.5 Google OAuth con dominio locale

Google non accetta `.test` nei redirect URI — il callback passa per `localhost`.

In Google Console → **Authorized redirect URIs**:
```
http://localhost:3001/auth/google/callback
```

In Google Console → **Authorized JavaScript origins**:
```
https://gsa.test
http://localhost:3001
```

Il flusso risultante:
```
https://gsa.test → Caddy → backend :3001
  → Google OAuth → callback http://localhost:3001/auth/google/callback
  → backend emette JWT → redirect https://gsa.test/?token=...
```

### 3.6 Il browser mostra ancora "Non sicuro"

Il certificato è stato generato ma la CA non è ancora fidata. Con Caddy in esecuzione:
```bash
caddy trust
```
Poi riavvia il browser (o apri una finestra in incognito).

---

## 4. Struttura del progetto

```
gsa-app-modular/
│
├── .env                              ← variabili d'ambiente (NON committare)
├── .env.example                      ← template .env con tutti i campi documentati
├── .gitignore
├── docker-compose.yml
├── Dockerfile                        ← backend
├── docker-entrypoint.sh
├── Caddyfile                         ← reverse proxy locale per https://gsa.test
├── ita.traineddata                   ← modello OCR Tesseract italiano
├── package.json                      ← dipendenze backend
│
├── scripts/
│   ├── setup.sh                      ← installazione completa da zero (interattivo)
│   ├── dev-start.sh                  ← avvia Caddy + backend + frontend
│   ├── dev-stop.sh                   ← ferma tutti i servizi di sviluppo
│   ├── create-admin.js               ← crea utente admin con password locale
│   └── backup_db.sh                  ← backup PostgreSQL
│
├── docs/
│   ├── er-schema.md                  ← schema entità-relazioni
│   ├── funzionalita.md               ← descrizione completa funzionalità
│   └── specifiche_versamenti_entrate.md
│
├── src/                              ← BACKEND Node.js (porta 3001)
│   ├── server.js                     ← entry point Express
│   │
│   ├── shared/
│   │   ├── db/
│   │   │   ├── pool.js               ← connessione PostgreSQL (pg.Pool)
│   │   │   ├── schema.sql            ← schema idempotente (unica fonte di verità)
│   │   │   ├── migrations/           ← migration incrementali (001_*.sql …)
│   │   │   └── migrate.js            ← applica schema + migration al DB
│   │   ├── middleware.js             ← helper h() + errorHandler
│   │   └── storage.js                ← lettura/scrittura file su disco
│   │
│   └── modules/
│       ├── auth/                     ← autenticazione JWT + Google OAuth + login locale
│       │   ├── routes.js             ← /auth/login, /auth/me, /auth/google, …
│       │   ├── userRepo.js           ← CRUD utenti + password bcrypt + restrizioni viewer
│       │   └── middleware.js         ← requireAuth, requireRole
│       │
│       ├── anagrafica/               ← appartamenti, proprietari, inquilini, tipi spesa
│       ├── documenti/                ← spese PDF + pipeline OCR
│       ├── movimenti/                ← versamenti CRUD
│       ├── spese_proprietari/        ← spese intestate ai proprietari
│       ├── contabilita/              ← griglia, dashboard, regole, report
│       └── archivio/                 ← documentale generico
│
└── frontend/                         ← FRONTEND React + Vite (porta 5173 in dev)
    ├── package.json
    ├── vite.config.js                ← proxy /api → localhost:3001 (solo sviluppo)
    ├── nginx.conf                    ← configurazione nginx per il container frontend
    ├── Dockerfile
    └── src/
        ├── main.jsx
        ├── App.jsx                   ← routing tab + controllo accessi per ruolo
        ├── api.js                    ← client REST (usa URL relativi /api/...)
        ├── context/
        │   └── AuthContext.jsx       ← stato autenticazione globale
        └── tabs/
            ├── Login.jsx             ← login Google / Apple / email+password
            ├── Dashboard.jsx
            ├── griglia.jsx
            ├── report.jsx
            ├── appartamenti.jsx
            ├── Proprietari.jsx
            ├── componenti.jsx
            ├── documenti.jsx
            ├── SpeseProprietari.jsx
            ├── versamenti.jsx
            ├── riparti.jsx
            ├── tipologie.jsx
            ├── Documentale.jsx
            ├── GestioneUtenti.jsx    ← crea/modifica utenti + password locale
            └── GestioneRuoli.jsx     ← restrizioni viewer
```

---

## 5. Prerequisiti di sistema

Necessari solo per l'avvio **manuale** (senza Docker).

### Node.js 20+

```bash
# macOS
brew install node

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verifica
node -v   # v20.x.x o superiore
```

### PostgreSQL 16+

```bash
# macOS
brew install postgresql@16
brew services start postgresql@16

# Ubuntu/Debian
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql && sudo systemctl enable postgresql

# Verifica
psql --version
```

### GraphicsMagick e Ghostscript (OCR su PDF scansionati)

```bash
# macOS
brew install graphicsmagick ghostscript

# Ubuntu/Debian
sudo apt install -y graphicsmagick ghostscript
```

> Senza GraphicsMagick i PDF testuali continuano a funzionare normalmente; solo i PDF scansionati (immagini) richiedono queste dipendenze.

### Caddy (solo per sviluppo con dominio locale)

```bash
brew install caddy      # macOS
```

---

## 6. Installazione e avvio manuale

### Setup automatico (consigliato)

Lo script `setup.sh` guida l'intera installazione in modo interattivo:

```bash
bash scripts/setup.sh
```

Esegue in sequenza:
1. Verifica prerequisiti (Node, PostgreSQL, Caddy, GraphicsMagick)
2. `npm install` per backend e frontend
3. Crea utente e database PostgreSQL (`gsa_user` / `gsa_db`)
4. Genera `.env` da `.env.example` con `JWT_SECRET` casuale
5. Esegue tutte le migration del database
6. Creazione opzionale di un utente admin con password locale
7. Aggiunta opzionale di `gsa.test` a `/etc/hosts`

Al termine:

```bash
bash scripts/dev-start.sh
```

---

### Setup manuale passo per passo

#### Configurazione PostgreSQL

```bash
# macOS
psql postgres
# Ubuntu
sudo -u postgres psql
```

```sql
CREATE USER gsa_user WITH PASSWORD 'changeme';
CREATE DATABASE gsa_db OWNER gsa_user;
GRANT ALL PRIVILEGES ON DATABASE gsa_db TO gsa_user;
\q
```

#### Configurazione .env

```bash
cp .env.example .env
# Edita .env con i tuoi valori
```

#### Installazione dipendenze

```bash
npm install
cd frontend && npm install && cd ..
```

#### Migrazione database

```bash
npm run db:migrate
```

#### Avvio

```bash
bash scripts/dev-start.sh
```

oppure manualmente su due terminali:

```bash
# Terminale 1
npm run dev           # backend → http://localhost:3001

# Terminale 2
cd frontend && npm run dev   # frontend → http://localhost:5173
```

---

## 7. Variabili d'ambiente

Tutte le variabili vanno nel file `.env` nella cartella radice. Il file `.env.example` contiene il template completo con descrizioni.

| Variabile | Obbligatoria | Default | Descrizione |
|-----------|:---:|---------|-------------|
| `DB_HOST` | sì | `localhost` | Host PostgreSQL (`db` in Docker) |
| `DB_PORT` | no | `5432` | Porta PostgreSQL |
| `DB_NAME` | no | `gsa_db` | Nome database |
| `DB_USER` | no | `gsa_user` | Utente database |
| `DB_PASSWORD` | sì | — | Password database |
| `DB_SSL` | no | `false` | SSL per connessione DB (`true` per servizi cloud) |
| `PORT` | no | `3001` | Porta del backend Express |
| `HTTP_PORT` | no | `80` | Porta esposta da nginx (container frontend) |
| `JWT_SECRET` | sì | — | Segreto per firmare i token JWT (min. 32 caratteri) |
| `GOOGLE_CLIENT_ID` | per OAuth | — | Client ID Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | per OAuth | — | Client Secret Google Cloud Console |
| `FRONTEND_URL` | sì | `http://localhost:5173` | URL pubblico del frontend (usato per redirect OAuth) |
| `BACKEND_URL` | sì | `http://localhost:3001` | URL pubblico del backend (costruisce il `redirect_uri`) |
| `ADMIN_EMAIL` | consigliata | — | Email del primo utente che riceve automaticamente il ruolo `admin` |
| `MAX_FILE_SIZE` | no | `20971520` | Dimensione massima upload in byte (20 MB) |
| `OCR_MIN_CHARS` | no | `120` | Soglia caratteri sotto cui attiva OCR |
| `TESSERACT_LANG` | no | `ita` | Lingua Tesseract per OCR |

> **Sicurezza:** Il file `.env` non deve mai essere committato su Git.
> Genera `JWT_SECRET` con: `openssl rand -hex 64`

**Configurazione per ambiente:**

| Ambiente | `BACKEND_URL` | `FRONTEND_URL` |
|---|---|---|
| Dev locale (Vite) | `http://localhost:3001` | `http://localhost:5173` |
| Dev locale (Caddy/gsa.test) | `http://localhost:3001` | `https://gsa.test` |
| Docker locale | `http://localhost:8080` | `http://localhost:8080` |
| Produzione | `https://gsa.mio-dominio.it` | `https://gsa.mio-dominio.it` |

---

## 8. Autenticazione

GSA supporta tre metodi di login:

| Metodo | Configurazione | Note |
|--------|---------------|------|
| **Email + password** | Nessuna — funziona subito | Utenti creati dall'admin o via script |
| **Google OAuth** | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Richiede account Google Cloud |
| **Apple Sign In** | `APPLE_CLIENT_ID` + chiavi Apple Developer | Richiede HTTPS sul redirect URI |

### 8.1 Login locale (email + password)

Non richiede alcuna configurazione esterna. L'admin crea gli utenti dalla tab **Gestione Utenti** impostando una password, oppure usa lo script da terminale:

```bash
node scripts/create-admin.js <email> <password>
```

Lo script crea l'utente con ruolo `admin` se non esiste, oppure aggiorna la password se esiste già.

Gli utenti possono accedere dalla pagina di login cliccando **"Accedi con email e password"**.

**Gestione password dalla tab Amministrazione → Gestione Utenti:**
- Nel form di creazione è possibile impostare subito una password (campo opzionale)
- Il pulsante lucchetto nella riga di ogni utente permette di impostare, cambiare o rimuovere la password

> Un utente può avere sia una password locale che un account Google/Apple collegato: entrambi i metodi funzionano in parallelo.

### 8.2 Google OAuth

#### Creare le credenziali

1. Vai su [Google Cloud Console](https://console.cloud.google.com/) → seleziona o crea un progetto
2. Menu → **APIs & Services** → **Credentials**
3. Clic su **+ Create Credentials** → **OAuth client ID**
4. Application type: **Web application**
5. **Authorized redirect URIs** — aggiungi:
   - Sviluppo locale: `http://localhost:3001/auth/google/callback`
   - Produzione: `https://gsa.mio-dominio.it/auth/google/callback`
6. Clic **Create** → copia **Client ID** e **Client Secret**

#### Configurazione

```bash
GOOGLE_CLIENT_ID=732897461114-xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
ADMIN_EMAIL=tua@email.com
```

> **`BACKEND_URL`** deve corrispondere esattamente al dominio del redirect URI registrato in Google Console (senza slash finale). Il callback è sempre `${BACKEND_URL}/auth/google/callback`.

#### Primo accesso

1. Avvia l'applicazione
2. Clicca "Accedi con Google" nella pagina di login
3. Esegui l'accesso con l'account corrispondente a `ADMIN_EMAIL`
4. L'account riceve automaticamente il ruolo `admin`
5. Tutti gli account successivi ricevono ruolo `editor` — l'admin può modificarli

#### Flusso OAuth

```
Browser → /api/auth/google
       → Google (autorizzazione)
       → /auth/google/callback
       → backend verifica → crea/aggiorna utente
       → redirect a FRONTEND_URL/?token=<jwt>
       → frontend memorizza il token e autentica l'utente
```

### 8.3 Token JWT

Tutti i metodi di login rilasciano un token JWT con scadenza a 7 giorni, firmato con `JWT_SECRET`. Il token viene salvato in `localStorage` e inviato come header `Authorization: Bearer <token>` in ogni richiesta API.

---

## 9. Ruoli e gestione utenti

### 9.1 Ruoli disponibili

| Ruolo | Tab accessibili | Operazioni |
|-------|----------------|------------|
| `admin` | Tutte | Lettura, scrittura, eliminazione + gestione utenti |
| `editor` | Dashboard, Griglia, Report, Documenti, Spese Proprietari, Movimenti, Documentale | Lettura e scrittura (no eliminazione strutturale, no gestione utenti) |
| `viewer` | Griglia, Report | Sola lettura — può essere limitato a specifici appartamenti/inquilini |

### 9.2 Gestione utenti (tab Amministrazione → Gestione Utenti)

Solo gli amministratori possono:
- Vedere la lista di tutti gli utenti registrati
- Creare un nuovo utente con email, nome, cognome, ruolo e password opzionale
- Cambiare il ruolo di un utente (admin / editor / viewer)
- Impostare o rimuovere la password locale tramite il pulsante lucchetto
- Disabilitare un account (l'utente non può più fare login)
- Eliminare un account

### 9.3 Restrizioni Viewer (tab Amministrazione → Gestione Ruoli)

Un utente con ruolo `viewer` ha accesso in sola lettura. L'admin può restringere ulteriormente la visibilità:

- **Appartamenti** — se nessuno selezionato: vede tutti. Se selezionati: vede solo quelli.
- **Inquilini** — se nessuno selezionato: vede tutti. Se selezionati: vede solo quelli.

Le restrizioni si applicano a tutte le sezioni: griglia, report, dashboard, spese, movimenti.

### 9.4 Primo setup senza Google OAuth

```bash
# Crea subito un utente admin con password locale
node scripts/create-admin.js admin@esempio.com lapassword
```

Oppure, se si preferisce promuovere un utente già esistente via database:

```bash
# Con Docker
docker compose exec db psql -U gsa_user -d gsa_db \
  -c "UPDATE users SET ruolo = 'admin' WHERE email = 'tua@email.com';"

# Senza Docker
psql -U gsa_user -d gsa_db \
  -c "UPDATE users SET ruolo = 'admin' WHERE email = 'tua@email.com';"
```

---

## 10. Schema e migrazione del database

Lo script di migrazione applica tutte le migration in `src/shared/db/migrations/` in ordine numerico. Le migration sono idempotenti: possono essere eseguite più volte senza effetti collaterali.

```bash
npm run db:migrate
```

Con Docker la migrazione viene eseguita automaticamente all'avvio del backend.

### Tabelle principali

| Tabella | Descrizione |
|---------|-------------|
| `users` | Utenti con ruolo, provider OAuth e password_hash per login locale |
| `viewer_appartamenti` | Restrizioni appartamenti per ruolo viewer |
| `viewer_inquilini` | Restrizioni inquilini per ruolo viewer |
| `appartamenti` | Anagrafica appartamenti |
| `proprietari` | Anagrafica proprietari |
| `appartamento_proprietari` | Associazione proprietario ↔ appartamento (% e periodo) |
| `componenti` | Inquilini con quota affitto, caparra e date validità |
| `tipi_spesa` | Categorie di spesa |
| `documenti` | Bollette/fatture PDF con testo estratto e importo |
| `movimenti` | Versamenti con segno, tipo, data e mese di riferimento |
| `regole_riparto` | Regole distribuzione spese e entrate |
| `report_salvati` | Report PDF generati e salvati |
| `archivio_tipi_documento` | Classificazione documenti d'archivio |
| `archivio_documenti` | Documenti generici (contratti, verbali, planimetrie…) |

Per lo schema completo: [docs/er-schema.md](docs/er-schema.md)

---

## 11. Architettura

### 11.1 Monolite modulare

Il backend è organizzato come **monolite modulare**: un unico processo Node.js con moduli di dominio separati che comunicano attraverso interfacce pubbliche. Nessuna dipendenza SQL cross-modulo.

```
src/server.js
  ├── app.use("/auth",     authRouter)       ← OAuth callbacks (redirect browser)
  ├── app.use("/api/auth", authRouter)       ← API autenticazione (fetch)
  ├── app.use("/api",      requireAuth)      ← tutto il resto richiede JWT
  ├── app.use("/api/appartamenti", ...)
  ├── app.use("/api/documenti", ...)
  └── ...
```

### 11.2 URL e proxy

| Ambiente | Frontend | `/api/*` | `/auth/*` |
|----------|----------|---------|----------|
| Sviluppo (Vite) | Vite :5173 | Vite proxy → backend :3001 | — |
| Sviluppo (Caddy) | Vite :5173 | Caddy → backend :3001 | Caddy → backend :3001 |
| Docker / produzione | nginx :80 | nginx → backend :3001 | nginx → backend :3001 |

Il frontend usa sempre URL relativi (`/api/...`): funziona su qualsiasi dominio senza variabili d'ambiente nel bundle.

### 11.3 Pipeline OCR

Quando viene caricato un PDF di spesa:

1. **pdf-parse** estrae il testo direttamente (PDF testuali)
2. Se il testo è inferiore a `OCR_MIN_CHARS` caratteri:
   - **pdf2pic** converte il PDF in immagini tramite GraphicsMagick + Ghostscript
   - **Tesseract.js** esegue OCR in italiano (`ita.traineddata`)
3. Il sistema propone: importo, fornitore, periodo, tipo di spesa
4. Il PDF viene salvato in `storage/pdf/{uuid}.pdf`

### 11.4 Calcolo conguaglio

```
Conguaglio = Versato − Spese dovute − Affitto
```

- **Versato** — somma movimenti nel periodo (rimborsi con segno negativo)
- **Spese dovute** — quota di competenza secondo regole di riparto
- **Affitto** — `quota_affitto × mesi di competenza`
- Verde = credito dell'inquilino / Rosso = debito residuo

---

## 12. Risoluzione problemi

### Il backend non parte: `Mancano in .env: JWT_SECRET`
```bash
ls -la | grep "^\.env$"
cat .env | grep JWT_SECRET
```

### `Error: connect ECONNREFUSED 127.0.0.1:5432`
PostgreSQL non è in esecuzione.
```bash
brew services start postgresql@16    # macOS
sudo systemctl start postgresql      # Ubuntu
```

### `password authentication failed for user "gsa_user"`
```bash
psql -U postgres -c "ALTER USER gsa_user WITH PASSWORD 'changeme';"
```

### Il frontend mostra pagina bianca
```bash
curl http://localhost:3001/api/health
```

### Login Google: `token_exchange_failed`
Il `redirect_uri` non coincide con quello registrato in Google Console. Verifica `BACKEND_URL` nel `.env`:

| Ambiente | `BACKEND_URL` corretto |
|---|---|
| Dev locale | `http://localhost:3001` |
| Docker | `http://localhost:8080` (o la porta impostata) |
| Produzione | `https://gsa.mio-dominio.it` |

### Login Google: `redirect_uri_mismatch`
```
URI registrato in Google Console: https://gsa.mio-dominio.it/auth/google/callback
BACKEND_URL nel .env:             https://gsa.mio-dominio.it   ← senza slash finale
```

### Login Google: `Google OAuth non configurato`
`GOOGLE_CLIENT_ID` non è impostato nel `.env`. Verifica e riavvia il backend.

### Login Google: `account_disabled`
Un admin deve riabilitare l'account dalla tab Gestione Utenti.

### Login locale: credenziali non valide
- Verifica che l'utente esista: l'admin lo vede in Gestione Utenti
- Verifica che abbia una password impostata (lucchetto nella riga utente)
- Se sei l'unico admin, ricrea l'utente con: `node scripts/create-admin.js <email> <nuova-password>`

### `GraphicsMagick not found` durante upload PDF
```bash
brew install graphicsmagick ghostscript
echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

### `relation "..." does not exist` — tabelle mancanti
```bash
npm run db:migrate
```

### La porta 80 è già in uso (Docker)
```bash
# In .env
HTTP_PORT=8080
```
Poi `docker compose up -d` e accedi su `http://localhost:8080`.

### Caddy: `permission denied` sulla PKI
```bash
sudo chown -R $(whoami) "/Users/$(whoami)/Library/Application Support/Caddy/"
```

### `Cannot find module` all'avvio manuale
```bash
rm -rf node_modules && npm install
cd frontend && rm -rf node_modules && npm install
```

### Aggiornare a una nuova versione
```bash
git pull
docker compose up --build -d
# La migrazione DB viene eseguita automaticamente
```
