/**
 * src/shared/db/migrations/v2/run.js
 * Runner per le migrazioni v2 (Strangler Fig).
 *
 * Uso:
 *   node src/shared/db/migrations/v2/run.js                    # tutte le fasi
 *   node src/shared/db/migrations/v2/run.js phase1             # solo fase 1
 *   node src/shared/db/migrations/v2/run.js phase1 phase2      # più fasi
 *   node src/shared/db/migrations/v2/run.js --verify phase1    # solo script verify
 *   node src/shared/db/migrations/v2/run.js --dry-run          # mostra solo i file
 */

import "dotenv/config";
import { readFileSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";
const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "gsa_db",
  user: process.env.DB_USER || "gsa_user",
  password: process.env.DB_PASSWORD || "",
});

const __dir = dirname(fileURLToPath(import.meta.url));

const args     = process.argv.slice(2);
const dryRun   = args.includes("--dry-run");
const verifyOnly = args.includes("--verify");
const phases   = args.filter(a => a.startsWith("phase") || a.startsWith("0"));

function getPhases() {
  return readdirSync(__dir)
    .filter(f => {
      const full = join(__dir, f);
      return statSync(full).isDirectory() && /^phase\d+/.test(f);
    })
    .sort();
}

function getSteps(phaseDir, verifyOnly) {
  return readdirSync(phaseDir)
    .filter(f => f.endsWith(".sql"))
    .filter(f => !verifyOnly || f.includes("verify") || f.includes("quadrature"))
    .sort();
}

async function run() {
  const client = await pool.connect();
  try {
    const phaseDirs = getPhases()
      .filter(p => phases.length === 0 || phases.includes(p));

    if (dryRun) {
      console.log("=== DRY RUN — file che verrebbero eseguiti ===");
      for (const phaseDir of phaseDirs) {
        const steps = getSteps(join(__dir, phaseDir), verifyOnly);
        steps.forEach(s => console.log(`  ${phaseDir}/${s}`));
      }
      return;
    }

    for (const phaseDir of phaseDirs) {
      const phaseFullDir = join(__dir, phaseDir);
      const steps = getSteps(phaseFullDir, verifyOnly);

      console.log(`\n▶  ${phaseDir}`);
      for (const step of steps) {
        console.log(`   → ${step}…`);
        const sql = readFileSync(join(phaseFullDir, step), "utf8");
        const result = await client.query(sql);
        // Stampa ultima riga (SELECT esito) se presente
        const last = Array.isArray(result) ? result[result.length - 1] : result;
        if (last?.rows?.[0]) console.log("   ", JSON.stringify(last.rows[0]));
      }
    }

    console.log("\n✅  Migrazioni v2 completate.");
  } catch (e) {
    console.error("❌ ", e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
