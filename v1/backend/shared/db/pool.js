import pg from "pg";

// Fix globale timezone: pg restituisce le DATE come stringhe "YYYY-MM-DD"
// senza conversione a oggetto Date (evita lo shift di timezone)
pg.types.setTypeParser(1082, val => val); // 1082 = OID tipo DATE

const { Pool } = pg;

const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || "gsa_db",
  user:     process.env.DB_USER     || "gsa_user",
  password: process.env.DB_PASSWORD || "",
  ssl:      process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000,
});

pool.on("error", err => console.error("[pool] errore:", err.message));

export async function query(sql, params = []) {
  const client = await pool.connect();
  try   { return (await client.query(sql, params)).rows; }
  finally { client.release(); }
}

export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await fn(client);
    await client.query("COMMIT");
    return r;
  } catch(e) {
    await client.query("ROLLBACK");
    throw e;
  } finally { client.release(); }
}

export default pool;
