#!/bin/sh
set -e
echo "▶  Applicazione schema..."
node src/shared/db/migrate.js
echo "▶  Applicazione migrazioni incrementali..."
node src/shared/db/migrations/run.js
echo "▶  Avvio server..."
exec node src/server.js
