#!/usr/bin/env bash
# scripts/migrate-v2.sh
# Esegue tutte le migrazioni v2 in ordine con verifica dopo ogni fase.
# Il sistema legacy rimane invariato durante tutta l'esecuzione.
#
# Uso:
#   bash scripts/migrate-v2.sh              # tutte le fasi
#   bash scripts/migrate-v2.sh phase0 phase1  # fasi selezionate

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

C='\033[0;36m'; G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[1m'; N='\033[0m'
ok()   { echo -e "  ${G}✓${N} $1"; }
err()  { echo -e "  ${R}✗${N} $1"; }
info() { echo -e "  ${C}→${N} $1"; }
warn() { echo -e "  ${Y}⚠${N}  $1"; }
title(){ echo ""; echo -e "${C}${B}── $1 ──${N}"; }

# ── Carica .env ───────────────────────────────────────────────────────────────
set -a
source <(grep -v '^\s*#' "$ROOT/.env" | grep -v '^\s*$') 2>/dev/null || true
set +a

export PGPASSWORD="$DB_PASSWORD"
PSQL="psql -h ${DB_HOST:-localhost} -p ${DB_PORT:-5432} -U ${DB_USER:-gsa_user} -d ${DB_NAME:-gsa_db}"
MIGDIR="$ROOT/src/shared/db/migrations/v2"

# ── Argomenti ─────────────────────────────────────────────────────────────────
SELECTED=("$@")

# ── Connessione DB ────────────────────────────────────────────────────────────
title "Connessione database"
if ! $PSQL -c "SELECT 1" >/dev/null 2>&1; then
  err "Impossibile connettersi a ${DB_HOST}:${DB_PORT}/${DB_NAME}"
  exit 1
fi
ok "Connesso a ${DB_HOST}:${DB_PORT}/${DB_NAME}"

# ── Baseline legacy ───────────────────────────────────────────────────────────
title "Stato legacy"
$PSQL -c "
SELECT
  (SELECT COUNT(*) FROM appartamenti)       AS appartamenti,
  (SELECT COUNT(*) FROM componenti)         AS componenti,
  (SELECT COUNT(*) FROM proprietari)        AS proprietari,
  (SELECT COUNT(*) FROM movimenti)          AS movimenti,
  (SELECT COUNT(*) FROM documenti)          AS documenti,
  (SELECT COUNT(*) FROM spese_proprietari)  AS spese_prop;
"

# ── Funzione run_phase ────────────────────────────────────────────────────────
FAILED=0

run_phase() {
  local phase="$1"
  local dir="$MIGDIR/$phase"

  if [[ ! -d "$dir" ]]; then
    warn "Directory $phase non trovata, saltata"
    return
  fi

  title "$phase"

  for sql in $(ls "$dir"/*.sql 2>/dev/null | sort); do
    local name
    name=$(basename "$sql")
    info "$name"
    if ! $PSQL -f "$sql" 2>&1 | tail -3; then
      err "ERRORE in $phase/$name"
      FAILED=1
      return 1
    fi
    ok "$name completato"
  done
}

# ── Selezione fasi ────────────────────────────────────────────────────────────
ALL_PHASES=(phase0 phase1 phase2 phase3 phase4 phase5 phase6 phase7 phase8)

if [[ ${#SELECTED[@]} -gt 0 ]]; then
  PHASES=("${SELECTED[@]}")
else
  PHASES=("${ALL_PHASES[@]}")
fi

echo ""
echo -e "${C}${B}┌──────────────────────────────────────────┐"
echo -e "│       GSA v2 — Migrazione database       │"
echo -e "│       Fasi: ${PHASES[*]}$(printf '%*s' $((27-${#PHASES[*]})) '')│"
echo -e "└──────────────────────────────────────────┘${N}"

# ── Esecuzione ────────────────────────────────────────────────────────────────
for phase in "${PHASES[@]}"; do
  run_phase "$phase" || break
done

# ── Stato finale ──────────────────────────────────────────────────────────────
title "Stato v2 post-migrazione"
$PSQL -c "
SELECT phase, step, applied_at::TEXT AS quando, note
FROM v2._phase_log
ORDER BY phase, step;
" 2>/dev/null || warn "Schema v2._phase_log non ancora disponibile"

title "Quadratura entità"
$PSQL -c "
SELECT
  'appartamenti→immobili'  AS entita,
  (SELECT COUNT(*) FROM appartamenti)::TEXT    AS legacy,
  COALESCE((SELECT COUNT(*)::TEXT FROM v2.immobile),'n/a')  AS v2,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='v2' AND table_name='immobile')
    THEN ((SELECT COUNT(*) FROM appartamenti) =
          (SELECT COUNT(*) FROM v2.immobile))::TEXT
    ELSE 'n/a' END AS ok
UNION ALL SELECT
  'proprietari→persona_legacy',
  (SELECT COUNT(*) FROM proprietari)::TEXT,
  COALESCE((SELECT COUNT(*)::TEXT FROM v2.persona_legacy WHERE legacy_tipo='proprietario'),'n/a'),
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='v2' AND table_name='persona_legacy')
    THEN ((SELECT COUNT(*) FROM proprietari) =
          (SELECT COUNT(*) FROM v2.persona_legacy WHERE legacy_tipo='proprietario'))::TEXT
    ELSE 'n/a' END
UNION ALL SELECT
  'componenti→persona_legacy',
  (SELECT COUNT(*) FROM componenti)::TEXT,
  COALESCE((SELECT COUNT(*)::TEXT FROM v2.persona_legacy WHERE legacy_tipo='componente'),'n/a'),
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='v2' AND table_name='persona_legacy')
    THEN ((SELECT COUNT(*) FROM componenti) =
          (SELECT COUNT(*) FROM v2.persona_legacy WHERE legacy_tipo='componente'))::TEXT
    ELSE 'n/a' END
UNION ALL SELECT
  'movimenti→fatto_economico',
  (SELECT COUNT(*) FROM movimenti)::TEXT,
  COALESCE((SELECT COUNT(*)::TEXT FROM v2.fatto_economico WHERE legacy_tipo='movimento'),'n/a'),
  'n/a'
UNION ALL SELECT
  'spese_prop→fatto_economico',
  (SELECT COUNT(*) FROM spese_proprietari)::TEXT,
  COALESCE((SELECT COUNT(*)::TEXT FROM v2.fatto_economico WHERE legacy_tipo='spesa_proprietario'),'n/a'),
  'n/a';
" 2>/dev/null || true

echo ""
if [[ $FAILED -eq 0 ]]; then
  echo -e "${G}${B}✅  Migrazione completata con successo.${N}"
else
  echo -e "${R}${B}❌  Migrazione terminata con errori. Controllare l'output sopra.${N}"
  exit 1
fi
