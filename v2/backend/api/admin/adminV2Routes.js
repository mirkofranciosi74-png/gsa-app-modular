import { Router }                        from "express";
import { spawn }                          from "child_process";
import { readdirSync, readFileSync,
         writeFileSync, existsSync,
         createReadStream }               from "fs";
import { join }                           from "path";
import multer                             from "multer";
import JSZip                              from "jszip";
import { h }                              from "../../shared/middleware.js";
import { requireRole }                    from "../../shared/authMiddleware.js";
import { query }                          from "../../shared/db/pool.js";
import pool                               from "../../shared/db/pool.js";
import { PDF_STORAGE_PATH,
         ARCHIVIO_STORAGE_PATH }          from "../../shared/storage.js";
import * as logger                        from "../../shared/logger.js";
import { verificaCoerenzaV2 }             from "./verificaCoerenzaV2.js";

const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

function pgDump() {
  return new Promise((resolve, reject) => {
    const env  = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD };
    const args = ["-h", process.env.DB_HOST || "localhost", "-p", String(process.env.DB_PORT || 5432),
                  "-U", process.env.DB_USER, "-d", process.env.DB_NAME,
                  "--no-owner", "--no-acl", "--clean", "--if-exists"];
    const proc = spawn("pg_dump", args, { env });
    const chunks = [], errs = [];
    proc.stdout.on("data", c => chunks.push(c));
    proc.stderr.on("data", d => errs.push(d.toString()));
    proc.on("close", code => code !== 0
      ? reject(new Error(`pg_dump fallito (exit ${code}): ${errs.join("")}`))
      : resolve(Buffer.concat(chunks)));
  });
}

function psqlRestore(sqlBuffer) {
  return new Promise((resolve, reject) => {
    const env  = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD };
    const args = ["-h", process.env.DB_HOST || "localhost", "-p", String(process.env.DB_PORT || 5432),
                  "-U", process.env.DB_USER, "-d", process.env.DB_NAME];
    const proc = spawn("psql", args, { env });
    const errs = [];
    proc.stderr.on("data", d => errs.push(d.toString()));
    proc.on("close", code => code !== 0
      ? reject(new Error(`psql fallito (exit ${code}): ${errs.join("").trim()}`))
      : resolve());
    proc.stdin.write(sqlBuffer);
    proc.stdin.end();
  });
}

export function makeAdminV2Routes() {
  const router = Router();

  // GET /backup
  router.get("/backup", requireRole("admin"), h(async (req, res) => {
    const tipo = req.query.tipo || "tutto";
    logger.log("admin", `Backup avviato tipo=${tipo}`);
    const zip = new JSZip();
    if (tipo === "db" || tipo === "tutto") {
      const dump = await pgDump();
      zip.file("dump.sql", dump);
    }
    if (tipo === "documentale" || tipo === "tutto") {
      if (existsSync(PDF_STORAGE_PATH)) {
        const folder = zip.folder("pdf");
        for (const f of readdirSync(PDF_STORAGE_PATH))
          folder.file(f, readFileSync(join(PDF_STORAGE_PATH, f)));
      }
      if (existsSync(ARCHIVIO_STORAGE_PATH)) {
        const folder = zip.folder("archivio");
        for (const f of readdirSync(ARCHIVIO_STORAGE_PATH))
          folder.file(f, readFileSync(join(ARCHIVIO_STORAGE_PATH, f)));
      }
    }
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const date = new Date().toISOString().slice(0, 10);
    const filename = `gsa_v2_backup_${tipo}_${date}.zip`;
    logger.log("admin", `Backup completato: ${filename} (${(buf.length/1024/1024).toFixed(2)} MB)`);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  }));

  // POST /restore
  router.post("/restore", requireRole("admin"), up.single("file"), h(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Nessun file caricato" });
    const tipo = req.query.tipo || "tutto";
    const zip  = await JSZip.loadAsync(req.file.buffer);
    let pdfCount = 0, archivioCount = 0;
    if (tipo === "db" || tipo === "tutto") {
      const dumpEntry = zip.file("dump.sql");
      if (!dumpEntry) return res.status(400).json({ error: "dump.sql non trovato — file non è un backup GSA valido" });
      await psqlRestore(await dumpEntry.async("nodebuffer"));
    }
    if (tipo === "documentale" || tipo === "tutto") {
      for (const [path, entry] of Object.entries(zip.files)) {
        if (path.startsWith("pdf/") && !entry.dir) {
          writeFileSync(join(PDF_STORAGE_PATH, path.slice(4)), await entry.async("nodebuffer"));
          pdfCount++;
        }
        if (path.startsWith("archivio/") && !entry.dir) {
          writeFileSync(join(ARCHIVIO_STORAGE_PATH, path.slice(9)), await entry.async("nodebuffer"));
          archivioCount++;
        }
      }
    }
    res.json({ ok: true, pdfRipristinati: pdfCount, archivioRipristinati: archivioCount });
  }));

  // GET /logs/status
  router.get("/logs/status", requireRole("admin"), h(async (_, res) => {
    res.json({ enabled: logger.isEnabled(), exists: logger.logExists(), size: logger.logSize(), path: logger.LOG_FILE });
  }));

  // POST /logs/toggle
  router.post("/logs/toggle", requireRole("admin"), h(async (req, res) => {
    res.json({ enabled: logger.setEnabled(req.body.enabled) });
  }));

  // GET /logs/download
  router.get("/logs/download", requireRole("admin"), h(async (_, res) => {
    if (!logger.logExists()) return res.status(404).json({ error: "Nessun log disponibile" });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="gsa_v2_${date}.log"`);
    createReadStream(logger.LOG_FILE).pipe(res);
  }));

  // DELETE /logs
  router.delete("/logs", requireRole("admin"), h(async (_, res) => {
    logger.clearLog();
    res.status(204).end();
  }));

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
    const { leggiPdf }   = await import("../../shared/storage.js");

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
