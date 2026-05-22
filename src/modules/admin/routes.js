import { Router }                          from "express";
import { spawn }                           from "child_process";
import { readdirSync, readFileSync,
         writeFileSync, existsSync,
         createReadStream }               from "fs";
import { join }                            from "path";
import multer                              from "multer";
import JSZip                              from "jszip";
import { h }                              from "../../shared/middleware.js";
import { PDF_STORAGE_PATH,
         ARCHIVIO_STORAGE_PATH }          from "../../shared/storage.js";
import * as logger                        from "../../shared/logger.js";

export const adminRouter = Router();

const up = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

// ── Helpers pg_dump / psql ────────────────────────────────────────────────────

function pgDump() {
  return new Promise((resolve, reject) => {
    const env  = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD };
    const args = [
      "-h", process.env.DB_HOST || "localhost",
      "-p", String(process.env.DB_PORT || 5432),
      "-U", process.env.DB_USER,
      "-d", process.env.DB_NAME,
      "--no-owner", "--no-acl", "--clean", "--if-exists",
    ];
    const proc   = spawn("pg_dump", args, { env });
    const chunks = [];
    const errs   = [];
    proc.stdout.on("data", c => chunks.push(c));
    proc.stderr.on("data", d => errs.push(d.toString()));
    proc.on("close", code => {
      if (code !== 0) reject(new Error(`pg_dump fallito (exit ${code}): ${errs.join("")}`));
      else resolve(Buffer.concat(chunks));
    });
  });
}

function psqlRestore(sqlBuffer) {
  return new Promise((resolve, reject) => {
    const env  = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD };
    const args = [
      "-h", process.env.DB_HOST || "localhost",
      "-p", String(process.env.DB_PORT || 5432),
      "-U", process.env.DB_USER,
      "-d", process.env.DB_NAME,
    ];
    const proc = spawn("psql", args, { env });
    const errs = [];
    proc.stderr.on("data", d => errs.push(d.toString()));
    proc.on("close", code => {
      if (code !== 0) reject(new Error(`psql fallito (exit ${code}): ${errs.join("").trim()}`));
      else resolve();
    });
    proc.stdin.write(sqlBuffer);
    proc.stdin.end();
  });
}

// ── GET /api/admin/backup?tipo=tutto|db|documentale ──────────────────────────

adminRouter.get("/backup", h(async (req, res) => {
  const tipo = req.query.tipo || "tutto"; // "tutto" | "db" | "documentale"
  logger.log("admin", `Backup avviato tipo=${tipo}`);

  const zip  = new JSZip();
  let nameBase = `gsa_backup_${tipo}`;

  if (tipo === "db" || tipo === "tutto") {
    const dump = await pgDump();
    zip.file("dump.sql", dump);
    logger.log("admin", `dump.sql aggiunto (${dump.length} bytes)`);
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

  const buf  = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const date = new Date().toISOString().slice(0, 10);
  const filename = `${nameBase}_${date}.zip`;
  logger.log("admin", `Backup completato: ${filename} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buf);
}));

// ── POST /api/admin/restore?tipo=tutto|db|documentale ────────────────────────

adminRouter.post("/restore", up.single("file"), h(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nessun file caricato" });
  const tipo = req.query.tipo || "tutto";
  logger.log("admin", `Ripristino avviato tipo=${tipo} file=${req.file.originalname}`);

  const zip = await JSZip.loadAsync(req.file.buffer);

  let pdfCount = 0, archivioCount = 0;

  if (tipo === "db" || tipo === "tutto") {
    const dumpEntry = zip.file("dump.sql");
    if (!dumpEntry) return res.status(400).json({ error: "dump.sql non trovato — file non è un backup GSA valido" });
    const dumpSql = await dumpEntry.async("nodebuffer");
    await psqlRestore(dumpSql);
    logger.log("admin", "Database ripristinato");
  }

  if (tipo === "documentale" || tipo === "tutto") {
    for (const [path, entry] of Object.entries(zip.files)) {
      if (path.startsWith("pdf/") && !entry.dir) {
        writeFileSync(join(PDF_STORAGE_PATH, path.slice(4)), await entry.async("nodebuffer"));
        pdfCount++;
      }
    }
    for (const [path, entry] of Object.entries(zip.files)) {
      if (path.startsWith("archivio/") && !entry.dir) {
        writeFileSync(join(ARCHIVIO_STORAGE_PATH, path.slice(9)), await entry.async("nodebuffer"));
        archivioCount++;
      }
    }
    logger.log("admin", `File ripristinati: ${pdfCount} PDF, ${archivioCount} archivio`);
  }

  res.json({ ok: true, pdfRipristinati: pdfCount, archivioRipristinati: archivioCount });
}));

// ── GET /api/admin/logs/status ────────────────────────────────────────────────

adminRouter.get("/logs/status", h(async (_, res) => {
  res.json({
    enabled: logger.isEnabled(),
    exists:  logger.logExists(),
    size:    logger.logSize(),
    path:    logger.LOG_FILE,
  });
}));

// ── POST /api/admin/logs/toggle ───────────────────────────────────────────────

adminRouter.post("/logs/toggle", h(async (req, res) => {
  const { enabled } = req.body;
  const stato = logger.setEnabled(enabled);
  console.log(`[admin] logging ${stato ? "attivato" : "disattivato"}`);
  res.json({ enabled: stato });
}));

// ── GET /api/admin/logs/download ──────────────────────────────────────────────

adminRouter.get("/logs/download", h(async (_, res) => {
  if (!logger.logExists()) return res.status(404).json({ error: "Nessun log disponibile" });
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="gsa_${date}.log"`);
  createReadStream(logger.LOG_FILE).pipe(res);
}));

// ── DELETE /api/admin/logs ────────────────────────────────────────────────────

adminRouter.delete("/logs", h(async (_, res) => {
  logger.clearLog();
  console.log("[admin] log cancellato");
  res.status(204).end();
}));
