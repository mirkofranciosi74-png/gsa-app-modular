#!/usr/bin/env bash
# scripts/dev-stop.sh — Ferma tutti i servizi di sviluppo locale

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/logs/dev"

R='\033[0;31m'; G='\033[0;32m'; B='\033[1m'; N='\033[0m'

echo ""
echo -e "${B}GSA — stop servizi di sviluppo${N}"
echo ""

stop_by_pidfile() {
  local name="$1" pidfile="$LOGS/$2.pid"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      echo -e "  ${R}→ Stop $name (PID $pid)${N}"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  fi
}

kill_port() {
  local pids
  pids=$(lsof -ti :"$1" 2>/dev/null || true)
  [[ -n "$pids" ]] && echo "$pids" | xargs kill -9 2>/dev/null || true
}

# Caddy
stop_by_pidfile "Caddy" "caddy"
CADDY_PID=$(pgrep -x caddy 2>/dev/null || true)
if [[ -n "$CADDY_PID" ]]; then
  echo -e "  ${R}→ Stop Caddy residuo (PID $CADDY_PID)${N}"
  kill "$CADDY_PID" 2>/dev/null || sudo kill "$CADDY_PID" 2>/dev/null || true
fi
echo -e "  ${G}✓ Caddy${N}"

# Backend
stop_by_pidfile "Backend" "backend"
kill_port 3001
echo -e "  ${G}✓ Backend${N}"

# Frontend
stop_by_pidfile "Frontend" "frontend"
kill_port 5173
echo -e "  ${G}✓ Frontend${N}"

echo ""
echo -e "${G}Tutti i servizi fermati.${N}"
echo ""
