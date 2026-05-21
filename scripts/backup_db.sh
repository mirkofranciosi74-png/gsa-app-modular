#!/usr/bin/env bash
# Backup giornaliero del database GSA
# Mantiene gli ultimi 30 giorni di backup compressi.
#
# Installazione cron (eseguire: crontab -e):
#   0 3 * * * /Users/mirko/gsa-app/scripts/backup_db.sh >> /Users/mirko/gsa-app/scripts/backup.log 2>&1

set -euo pipefail

# ── Configurazione ────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

# Legge variabili dal .env
if [[ -f "$ENV_FILE" ]]; then
  export $(grep -v '^#' "$ENV_FILE" | grep -E '^DB_' | xargs)
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-gsa_db}"
DB_USER="${DB_USER:-gsa_user}"
DB_PASSWORD="${DB_PASSWORD:-}"
RETENTION_DAYS=30
BACKUP_DIR="$SCRIPT_DIR/../backups"

# ── Esecuzione ────────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="$BACKUP_DIR/gsa_db_${TIMESTAMP}.sql.gz"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Avvio backup → $BACKUP_FILE"

PGPASSWORD="$DB_PASSWORD" /opt/homebrew/bin/pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-password \
  --format=plain \
  --no-owner \
  --no-acl \
  | gzip > "$BACKUP_FILE"

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup completato — $SIZE"

# Rimozione backup più vecchi di RETENTION_DAYS giorni
DELETED=$(find "$BACKUP_DIR" -name "gsa_db_*.sql.gz" -mtime +${RETENTION_DAYS} -print -delete | wc -l | tr -d ' ')
if [[ "$DELETED" -gt 0 ]]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Rimossi $DELETED backup scaduti (>${RETENTION_DAYS}gg)"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup nella cartella: $BACKUP_DIR"
echo "---"
