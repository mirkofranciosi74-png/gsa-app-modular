#!/usr/bin/env bash
# scripts/setup.sh — Installazione e configurazione completa di GSA (sviluppo locale)
#
# Cosa fa:
#   1. Verifica i prerequisiti di sistema (Node, PostgreSQL, Caddy, GraphicsMagick)
#   2. Installa le dipendenze npm (backend + frontend)
#   3. Crea il database PostgreSQL e l'utente gsa_user
#   4. Genera il file .env a partire da .env.example
#   5. Esegue tutte le migration del database
#   6. Opzionalmente crea un utente admin con password locale
#   7. Aggiunge gsa.test a /etc/hosts (opzionale)
#
# Uso:
#   bash scripts/setup.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

C='\033[0;36m'; G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[1m'; N='\033[0m'

HR="────────────────────────────────────────────"

title()  { echo ""; echo -e "${C}${B}$1${N}"; echo -e "${C}${HR}${N}"; }
ok()     { echo -e "  ${G}✓${N} $1"; }
warn()   { echo -e "  ${Y}⚠${N}  $1"; }
err()    { echo -e "  ${R}✗${N} $1"; }
info()   { echo -e "  ${C}→${N} $1"; }
ask()    { printf "  %s " "$1"; read -r REPLY < /dev/tty; echo "$REPLY"; }

echo ""
echo -e "${C}${B}┌──────────────────────────────────────────┐"
echo -e "│         GSA — Setup ambiente locale      │"
echo -e "└──────────────────────────────────────────┘${N}"

# ── 1. Prerequisiti ───────────────────────────────────────────────────────────
title "1. Verifica prerequisiti"

MISSING=()

# Node.js
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" 2>/dev/null && node -v || echo "troppo vecchio")
  if node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" 2>/dev/null; then
    ok "Node.js $(node -v)"
  else
    err "Node.js trovato ma versione < 18 ($(node -v)). Aggiornare."
    MISSING+=("node")
  fi
else
  err "Node.js non trovato"
  MISSING+=("node")
fi

# PostgreSQL (client psql)
if command -v psql >/dev/null 2>&1; then
  ok "PostgreSQL client $(psql --version | awk '{print $3}')"
else
  err "psql non trovato (PostgreSQL non installato)"
  MISSING+=("postgresql")
fi

# Caddy (opzionale)
if command -v caddy >/dev/null 2>&1; then
  ok "Caddy $(caddy version 2>/dev/null | head -1)"
else
  warn "Caddy non trovato — non potrai usare https://gsa.test (opzionale)"
  warn "  Installa con: brew install caddy"
fi

# GraphicsMagick (opzionale)
if command -v gm >/dev/null 2>&1 || command -v convert >/dev/null 2>&1; then
  ok "GraphicsMagick / ImageMagick trovato (OCR su PDF scansionati)"
else
  warn "GraphicsMagick non trovato — i PDF scansionati non saranno elaborati (opzionale)"
  warn "  Installa con: brew install graphicsmagick ghostscript"
fi

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo ""
  err "Prerequisiti obbligatori mancanti: ${MISSING[*]}"
  echo ""
  echo "  macOS:"
  echo "    brew install node postgresql@18"
  echo "    brew services start postgresql@18"
  echo ""
  echo "  Ubuntu/Debian:"
  echo "    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
  echo "    sudo apt install -y postgresql && sudo systemctl start postgresql"
  echo ""
  exit 1
fi

# ── 2. Dipendenze npm ─────────────────────────────────────────────────────────
title "2. Installazione dipendenze npm"

info "Backend..."
npm install --silent
ok "Backend npm install completato"

info "Frontend..."
cd "$ROOT/frontend"
npm install --silent
cd "$ROOT"
ok "Frontend npm install completato"

# ── 3. Database ───────────────────────────────────────────────────────────────
title "3. Configurazione database PostgreSQL"

# Determina comando psql con superuser
PSQL_SUPER=""
if psql -U postgres -c "" 2>/dev/null; then
  PSQL_SUPER="psql -U postgres"
elif sudo -u postgres psql -c "" 2>/dev/null; then
  PSQL_SUPER="sudo -u postgres psql"
elif psql -c "" 2>/dev/null; then
  PSQL_SUPER="psql"
else
  warn "Impossibile connettersi a PostgreSQL come superuser."
  warn "Assicurati che il servizio sia avviato, poi rilancia questo script."
  echo ""
  echo "  macOS: brew services start postgresql@16"
  echo "  Linux: sudo systemctl start postgresql"
  exit 1
fi

DB_NAME="gsa_db"
DB_USER="gsa_user"
DB_PASS="changeme"

# Crea utente se non esiste
if $PSQL_SUPER -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  ok "Utente '$DB_USER' già esistente"
else
  $PSQL_SUPER -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" >/dev/null
  ok "Utente '$DB_USER' creato (password: $DB_PASS)"
fi

# Crea database se non esiste
if $PSQL_SUPER -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  ok "Database '$DB_NAME' già esistente"
else
  $PSQL_SUPER -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" >/dev/null
  $PSQL_SUPER -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" >/dev/null
  ok "Database '$DB_NAME' creato"
fi

# ── 4. File .env ──────────────────────────────────────────────────────────────
title "4. Configurazione .env"

if [[ -f "$ROOT/.env" ]]; then
  ok ".env già esistente — non sovrascritto"
  info "Controlla che le variabili siano corrette (GOOGLE_CLIENT_ID, JWT_SECRET, ecc.)"
else
  cp "$ROOT/.env.example" "$ROOT/.env"

  # Genera JWT_SECRET casuale
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  # macOS sed e GNU sed hanno sintassi diversa per -i
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$ROOT/.env"
  else
    sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$ROOT/.env"
  fi

  ok ".env creato da .env.example con JWT_SECRET generato automaticamente"
  warn "Apri .env e imposta GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET se vuoi Google OAuth"
fi

# ── 5. Migration database ─────────────────────────────────────────────────────
title "5. Esecuzione migration database"

# Carica variabili da .env per la connessione
set -a
# shellcheck disable=SC1091
source <(grep -v '^\s*#' "$ROOT/.env" | grep -v '^\s*$' | sed 's/ *= */=/') 2>/dev/null || true
set +a

info "Esecuzione migration..."
node src/shared/db/migrations/run.js
ok "Migration completate"

# ── 6. Utente admin ───────────────────────────────────────────────────────────
title "6. Creazione utente admin (opzionale)"

echo "  Vuoi creare subito un utente admin con password locale?"
CHOICE=$(ask "  [s] Sì / [n] No (userai Google OAuth o creerai l'utente dopo) [s/n]:")

if [[ "$CHOICE" =~ ^[sS]$ ]]; then
  ADMIN_EMAIL_INPUT=$(ask "  Email admin:")
  ADMIN_PASS_INPUT=$(ask "  Password (min. 6 caratteri):")

  if [[ ${#ADMIN_PASS_INPUT} -lt 6 ]]; then
    warn "Password troppo corta — utente admin non creato. Usa: node scripts/create-admin.js <email> <password>"
  else
    node scripts/create-admin.js "$ADMIN_EMAIL_INPUT" "$ADMIN_PASS_INPUT"
  fi
else
  info "Saltato — puoi crearlo in seguito con:"
  info "  node scripts/create-admin.js <email> <password>"
fi

# ── 7. /etc/hosts per gsa.test ────────────────────────────────────────────────
title "7. Configurazione /etc/hosts per gsa.test (opzionale)"

if grep -q "gsa.test" /etc/hosts 2>/dev/null; then
  ok "gsa.test già presente in /etc/hosts"
else
  echo "  Vuoi aggiungere 'gsa.test' a /etc/hosts per usare Caddy con HTTPS locale?"
  HOSTS_CHOICE=$(ask "  [s] Sì (richiede sudo) / [n] No [s/n]:")

  if [[ "$HOSTS_CHOICE" =~ ^[sS]$ ]]; then
    echo "127.0.0.1  gsa.test" | sudo tee -a /etc/hosts >/dev/null
    ok "gsa.test aggiunto a /etc/hosts"
  else
    info "Saltato — puoi aggiungerlo in seguito con:"
    info "  echo '127.0.0.1 gsa.test' | sudo tee -a /etc/hosts"
  fi
fi

# ── Riepilogo ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${C}${B}┌──────────────────────────────────────────┐"
echo -e "│              Setup completato!           │"
echo -e "└──────────────────────────────────────────┘${N}"
echo ""
echo -e "  Avvia l'ambiente con:"
echo -e "    ${C}bash scripts/dev-start.sh${N}"
echo ""
echo -e "  Oppure singolarmente:"
echo -e "    ${C}npm run dev${N}                   # backend (porta 3001)"
echo -e "    ${C}cd frontend && npm run dev${N}    # frontend (porta 5173)"
echo ""
