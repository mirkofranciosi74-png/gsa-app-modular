#!/usr/bin/env bash
# scripts/dev-start.sh — Avvia Caddy + backend + frontend per lo sviluppo locale

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/logs/dev"
mkdir -p "$LOGS"

C='\033[0;36m'; G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[1m'; N='\033[0m'

echo ""
echo -e "${C}${B}┌──────────────────────────────────────────┐"
echo -e "│     GSA — avvio ambiente di sviluppo     │"
echo -e "└──────────────────────────────────────────┘${N}"
echo ""

# ── Helpers ───────────────────────────────────────────────────────────────────

pids_on_port() {
  lsof -ti :"$1" 2>/dev/null | tr '\n' ' ' | sed 's/ *$//' || true
}

ask() {
  # ask <nome> <pid>  →  0 = stoppa e riavvia, 1 = salta
  local name="$1" pid="$2"
  echo -e "  ${Y}⚠  $name è già in esecuzione (PID: $pid)${N}"
  echo    "     [s] Stoppa e riavvia"
  echo    "     [k] Mantieni e salta"
  while true; do
    printf  "     Scelta [s/k]: "
    read -r choice < /dev/tty
    case "$choice" in
      s|S) return 0 ;;
      k|K) return 1 ;;
      *)   echo "     Digita s oppure k." ;;
    esac
  done
}

kill_port() {
  local pids
  pids=$(lsof -ti :"$1" 2>/dev/null || true)
  [[ -n "$pids" ]] && echo "$pids" | xargs kill -9 2>/dev/null || true
  sleep 0.3
}

wait_port_open() {
  local port="$1" secs="${2:-5}" i=0
  while ! lsof -ti :"$port" >/dev/null 2>&1; do
    sleep 0.5; i=$((i+1))
    [[ $i -ge $((secs*2)) ]] && return 1
  done
  return 0
}

# ── 1. Caddy ──────────────────────────────────────────────────────────────────
echo -e "${B}[1/3] Caddy${N}"

CADDY_PID=$(pgrep -x caddy 2>/dev/null || true)
START_CADDY=true

if [[ -n "$CADDY_PID" ]]; then
  if ask "Caddy" "$CADDY_PID"; then
    echo -e "  ${R}→ Stop Caddy...${N}"
    kill "$CADDY_PID" 2>/dev/null \
      || sudo kill "$CADDY_PID" 2>/dev/null \
      || true
    sleep 0.8
  else
    echo -e "  ${Y}→ Caddy mantenuto${N}"
    START_CADDY=false
  fi
fi

if [[ "$START_CADDY" == true ]]; then
  echo -e "  ${G}→ Avvio Caddy...${N}"
  cd "$ROOT"
  caddy run --config Caddyfile > "$LOGS/caddy.log" 2>&1 &
  CADDY_NEW=$!
  echo "$CADDY_NEW" > "$LOGS/caddy.pid"
  sleep 0.8
  if kill -0 "$CADDY_NEW" 2>/dev/null; then
    echo -e "  ${G}✓ Caddy avviato (PID $CADDY_NEW)${N}"
  else
    echo -e "  ${R}✗ Caddy non avviato — controlla logs/dev/caddy.log${N}"
    echo    "    (se mancano permessi sulle porte 80/443 esegui: sudo $0)"
  fi
fi

# ── 2. Backend ────────────────────────────────────────────────────────────────
echo ""
echo -e "${B}[2/3] Backend  (porta 3001)${N}"

BACKEND_PIDS=$(pids_on_port 3001)
START_BACKEND=true

if [[ -n "$BACKEND_PIDS" ]]; then
  if ask "Backend" "$BACKEND_PIDS"; then
    echo -e "  ${R}→ Stop backend...${N}"
    kill_port 3001
  else
    echo -e "  ${Y}→ Backend mantenuto${N}"
    START_BACKEND=false
  fi
fi

if [[ "$START_BACKEND" == true ]]; then
  echo -e "  ${G}→ Avvio backend (nodemon)...${N}"
  cd "$ROOT"
  npx nodemon src/server.js > "$LOGS/backend.log" 2>&1 &
  BACKEND_NEW=$!
  echo "$BACKEND_NEW" > "$LOGS/backend.pid"
  if wait_port_open 3001 8; then
    echo -e "  ${G}✓ Backend avviato (PID $BACKEND_NEW)${N}"
  else
    echo -e "  ${Y}✓ Backend avviato (PID $BACKEND_NEW) — ancora in partenza${N}"
  fi
fi

# ── 3. Frontend ───────────────────────────────────────────────────────────────
echo ""
echo -e "${B}[3/3] Frontend Vite  (porta 5173)${N}"

FRONTEND_PIDS=$(pids_on_port 5173)
START_FRONTEND=true

if [[ -n "$FRONTEND_PIDS" ]]; then
  if ask "Frontend" "$FRONTEND_PIDS"; then
    echo -e "  ${R}→ Stop frontend...${N}"
    kill_port 5173
  else
    echo -e "  ${Y}→ Frontend mantenuto${N}"
    START_FRONTEND=false
  fi
fi

if [[ "$START_FRONTEND" == true ]]; then
  echo -e "  ${G}→ Avvio frontend (Vite)...${N}"
  cd "$ROOT/frontend"
  npm run dev > "$LOGS/frontend.log" 2>&1 &
  FRONTEND_NEW=$!
  echo "$FRONTEND_NEW" > "$LOGS/frontend.pid"
  if wait_port_open 5173 10; then
    echo -e "  ${G}✓ Frontend avviato (PID $FRONTEND_NEW)${N}"
  else
    echo -e "  ${Y}✓ Frontend avviato (PID $FRONTEND_NEW) — ancora in partenza${N}"
  fi
fi

# ── Riepilogo ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${C}${B}┌──────────────────────────────────────────┐"
echo -e "│               Ambiente pronto           │"
echo -e "└──────────────────────────────────────────┘${N}"
echo ""
echo -e "  https://gsa.test          ${C}(Caddy — HTTPS locale)${N}"
echo -e "  http://localhost:5173      ${C}(Vite diretto)${N}"
echo -e "  http://localhost:3001      ${C}(Backend API)${N}"
echo ""
echo -e "  Log in tempo reale:  ${C}tail -f logs/dev/backend.log${N}"
echo -e "  Stop:                ${C}bash scripts/dev-stop.sh${N}"
echo ""
