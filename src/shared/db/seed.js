/**
 * src/db/seed.js
 * FIX #2: la versione originale usava la colonna "data_inizio" che non
 * esiste nello schema v3 (rinominata "validita_da" dalla migrazione 002).
 * Usava anche "ON CONFLICT DO NOTHING" senza specificare la colonna,
 * sintassi non valida su PostgreSQL.
 */
import "dotenv/config";
import pool from "./pool.js";

const TIPI = [
  { descrizione: "Acqua",      categoria: "Utenza",     riparto: "Percentuale"  },
  { descrizione: "Luce",       categoria: "Utenza",     riparto: "Percentuale"  },
  { descrizione: "Gas",        categoria: "Utenza",     riparto: "Percentuale"  },
  { descrizione: "TARI",       categoria: "Tassa",      riparto: "Parti uguali" },
  { descrizione: "Condominio", categoria: "Condominio", riparto: "Percentuale"  },
  { descrizione: "Altro",      categoria: "Altro",      riparto: "Manuale"      },
];

async function seed() {
  console.log("▶  Seed in corso…");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ── Tipi spesa ─────────────────────────────────────────────────────────────
    for (const t of TIPI) {
      await client.query(
        `INSERT INTO tipi_spesa (descrizione, categoria, riparto)
         VALUES ($1, $2, $3)
         ON CONFLICT (descrizione) DO NOTHING`,
        [t.descrizione, t.categoria, t.riparto]
      );
    }
    console.log("  ✔  Tipi spesa inseriti");

    // ── Appartamento di esempio ────────────────────────────────────────────────
    const appRes = await client.query(
      `INSERT INTO appartamenti (nome, via, citta, cap)
       VALUES ('App. Via Roma 1', 'Via Roma 1', 'Modena', '41121')
       ON CONFLICT (nome) DO UPDATE SET via = EXCLUDED.via
       RETURNING id`
    );
    const appId = appRes.rows[0].id;

    // ── Componenti di esempio ─────────────────────────────────────────────────
    // FIX: usa "validita_da" (nome corretto nello schema v3),
    //      non "data_inizio" (colonna inesistente → crash al seed).
    // FIX: ON CONFLICT (id) invece di ON CONFLICT DO NOTHING senza colonna.
    const comps = [
      { nome: "Mario", cognome: "Rossi",   email: "mario@example.com", perc: 60, quota: 300 },
      { nome: "Laura", cognome: "Bianchi", email: "laura@example.com", perc: 40, quota: 200 },
    ];

    for (const c of comps) {
      await client.query(
        `INSERT INTO componenti
           (appartamento_id, nome, cognome, email,
            percentuale, quota_mensile, validita_da)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [appId, c.nome, c.cognome, c.email,
         c.perc, c.quota,
         "2024-01-01"]   /* validita_da: inizio locazione di esempio */
      );
    }
    console.log("  ✔  Appartamento + componenti inseriti");

    await client.query("COMMIT");
    console.log("✅  Seed completato.");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌  Seed fallito:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
