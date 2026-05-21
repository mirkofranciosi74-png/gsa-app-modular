#!/bin/sh
set -e
echo "▶  Migrazione database..."
node src/shared/db/migrate.js
echo "▶  Avvio server..."
exec node src/server.js
