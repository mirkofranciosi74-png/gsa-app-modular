import "dotenv/config";
import { mkdirSync, existsSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";

const __rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
for (const sub of ["storage/pdf", "storage/archivio"]) {
  const p = join(__rootDir, sub);
  if (!existsSync(p)) { mkdirSync(p, { recursive: true }); console.log(`[startup] cartella creata: ${p}`); }
}

process.on("uncaughtException", (err) => {
  console.error("❌ uncaughtException:", err?.message ?? err, err?.stack ?? "");
});
process.on("unhandledRejection", (reason) => {
  console.error("❌ unhandledRejection:", reason?.message ?? reason);
});

const REQUIRED = ["DB_HOST","DB_PORT","DB_NAME","DB_USER","DB_PASSWORD","JWT_SECRET"];
const missing  = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`❌  Mancano in .env: ${missing.join(", ")}`);
  process.exit(1);
}

import express from "express";
import cors    from "cors";
import { errorHandler } from "./shared/middleware.js";
import { requireAuth }  from "./shared/authMiddleware.js";
import { authRouter }   from "./auth/routes.js";
import { log }          from "./shared/logger.js";
import { v2DddRouter }  from "./api/v2Router.js";

const app  = express();
const PORT = process.env.V2_PORT || process.env.PORT || 3002;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  log("http", `${req.method} ${req.path}`);
  next();
});

app.get("/api/health", (_, r) => r.json({ ok: true, version: 2, ts: new Date().toISOString() }));

app.use("/auth",     authRouter);
app.use("/api/auth", authRouter);

app.use("/api", requireAuth);
app.use("/api",   v2DddRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`✅  Backend v2 → http://localhost:${PORT}`);
  console.log(`    DB: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
});
