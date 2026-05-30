import { Router }  from "express";
import { h }       from "../../../shared/middleware.js";
import { requireRole } from "../../shared/authMiddleware.js";
import { query }   from "../../../shared/db/pool.js";
import pool        from "../../../shared/db/pool.js";
import { verificaCoerenzaV2 } from "./verificaCoerenzaV2.js";

export function makeAdminV2Routes() {
  const router = Router();

  // GET /verifica-coerenza
  router.get("/verifica-coerenza", requireRole("admin"), h(async (_req, res) => {
    res.json(await verificaCoerenzaV2());
  }));

  // POST /backfill-spese-prop — corregge i record migrati da spese_proprietari:
  //   1. Popola rif_da/rif_a da validita_da/validita_a (spese ricorrenti)
  //   2. Popola periodo_da/periodo_a da data_evento dove NULL (una_tantum senza mese_competenza)
  router.post("/backfill-spese-prop", requireRole("admin"), h(async (_req, res) => {
    const client = await pool.connect();
    try {
      // Fix 1: rif_da/rif_a da v1 spese_proprietari.validita_da/validita_a
      const r1 = await client.query(`
        UPDATE v2.fatto_economico fe
        SET rif_da = sp.validita_da,
            rif_a  = sp.validita_a
        FROM spese_proprietari sp
        WHERE fe.legacy_tipo = 'spesa_proprietario'
          AND fe.legacy_id   = sp.id
          AND (fe.rif_da IS DISTINCT FROM sp.validita_da
            OR fe.rif_a  IS DISTINCT FROM sp.validita_a)
      `);

      // Fix 2: periodo_da/periodo_a da data_evento dove periodo_da è NULL
      const r2 = await client.query(`
        UPDATE v2.fatto_economico fe
        SET periodo_da = TO_CHAR(fe.data_evento, 'YYYY-MM'),
            periodo_a  = TO_CHAR(fe.data_evento, 'YYYY-MM')
        WHERE fe.legacy_tipo = 'spesa_proprietario'
          AND fe.periodo_da IS NULL
          AND fe.data_evento IS NOT NULL
      `);

      res.json({
        aggiornati_rif_da_a:   r1.rowCount,
        aggiornati_periodo_da: r2.rowCount,
      });
    } finally { client.release(); }
  }));

  // POST /backfill-hash — calcola gli hash mancanti rileggendo i file dal disco
  router.post("/backfill-hash", requireRole("admin"), h(async (_req, res) => {
    const { createHash } = await import("crypto");
    const { leggiPdf }   = await import("../../../shared/storage.js");

    const fatti = await query(`
      SELECT id FROM v2.fatto_economico
      WHERE nome_file IS NOT NULL AND file_hash IS NULL
    `);

    let updated = 0, missing = 0;
    for (const f of fatti) {
      const buf = leggiPdf(f.id);
      if (!buf) { missing++; continue; }
      const hash = createHash("sha256").update(buf).digest("hex");
      await query(
        `UPDATE v2.fatto_economico SET file_hash=$1 WHERE id=$2`,
        [hash, f.id]
      );
      updated++;
    }

    res.json({ updated, missing });
  }));

  return router;
}
