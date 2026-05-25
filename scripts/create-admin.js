#!/usr/bin/env node
/**
 * Crea o aggiorna un utente admin con password locale.
 *
 * Uso:
 *   node scripts/create-admin.js <email> <password>
 *
 * Esempi:
 *   node scripts/create-admin.js admin@esempio.com miapassword123
 *
 * Legge la configurazione del database dal file .env nella root del progetto.
 * Se l'utente esiste già, aggiorna la password e imposta ruolo=admin.
 * Se non esiste, lo crea.
 */

import { createRequire } from "module";
import { readFileSync }  from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const bcrypt  = require("bcryptjs");
const pg      = require("pg");

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = resolve(__dir, "..");

// ── Leggi .env manualmente (senza dipendenze extra) ──────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(resolve(root, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx < 1) continue;
      const key = trimmed.slice(0, idx).trim();
      let   val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env non presente, si usano le variabili d'ambiente già impostate
  }
}

loadEnv();

// ── Argomenti CLI ─────────────────────────────────────────────────────────────
const [,, emailArg, passwordArg] = process.argv;

if (!emailArg || !passwordArg) {
  console.error("Uso: node scripts/create-admin.js <email> <password>");
  process.exit(1);
}

if (passwordArg.length < 6) {
  console.error("La password deve essere di almeno 6 caratteri.");
  process.exit(1);
}

const email = emailArg.toLowerCase().trim();

// ── Connessione DB ────────────────────────────────────────────────────────────
const pool = new pg.Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || "gsa_db",
  user:     process.env.DB_USER     || "gsa_user",
  password: process.env.DB_PASSWORD || "",
  ssl:      process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

async function run() {
  const hash = await bcrypt.hash(passwordArg, 12);

  const { rows } = await pool.query(
    `INSERT INTO users (email, nome, cognome, provider, provider_id, ruolo, password_hash, attivo)
     VALUES ($1, '', '', 'manual', $1, 'admin', $2, true)
     ON CONFLICT (email) DO UPDATE SET
       ruolo         = 'admin',
       password_hash = EXCLUDED.password_hash,
       attivo        = true
     RETURNING id, email, ruolo`,
    [email, hash]
  );

  const u = rows[0];
  console.log(`✓ Utente admin pronto: ${u.email} (id: ${u.id})`);
  console.log(`  Puoi accedere su /login con email e password.`);
}

run()
  .catch(err => { console.error("Errore:", err.message); process.exit(1); })
  .finally(() => pool.end());
