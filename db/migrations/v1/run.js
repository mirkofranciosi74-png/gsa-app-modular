import "dotenv/config";
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";

const __dir = dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || "gsa_db",
  user:     process.env.DB_USER     || "gsa_user",
  password: process.env.DB_PASSWORD || "",
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const files = readdirSync(__dir)
      .filter(f => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        `SELECT name FROM _migrations WHERE name=$1`, [file]
      );
      if (rows.length > 0) { console.log(`  ⏭  ${file} già applicata`); continue; }
      console.log(`  ▶  Applico ${file}…`);
      const sql = readFileSync(join(__dir, file), "utf8");
      await client.query(sql);
      await client.query(`INSERT INTO _migrations(name) VALUES($1)`, [file]);
      console.log(`  ✅  ${file} applicata`);
    }
    console.log("✅  Tutte le migrazioni v1 completate.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error("❌ ", e.message); process.exit(1); });
