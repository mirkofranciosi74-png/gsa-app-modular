/**
 * src/db/migrate.js
 * Applica schema.sql al database configurato in .env
 * Uso: npm run db:migrate
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join }  from "path";
import pool from "./pool.js";

const __dir  = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dir, "schema.sql");

async function migrate() {
  console.log("▶  Lettura schema.sql…");
  const sql = readFileSync(sqlPath, "utf8");

  const client = await pool.connect();
  try {
    console.log("▶  Applicazione schema al database…");
    await client.query(sql);
    console.log("✅  Schema GSA v3 applicato correttamente.");
  } catch (err) {
    console.error("❌  Errore durante la migrazione:");
    console.error("    ", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
