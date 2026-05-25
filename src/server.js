import "dotenv/config";

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
import { requireAuth }  from "./modules/auth/middleware.js";
import { authRouter }   from "./modules/auth/routes.js";
import { log } from "./shared/logger.js";

import { appartamentiRouter, proprietariRouter,
         associazioniRouter, tipiSpesaRouter,
         tipiVersamentoRouter }                 from "./modules/anagrafica/routes.js";
import { documentiRouter }                       from "./modules/documenti/routes.js";
import { movimentiRouter }                       from "./modules/movimenti/routes.js";
import { dashboardRouter, grigliaRouter,
         regoleRouter, reportRouter }            from "./modules/contabilita/routes.js";
import { archivioTipiRouter, archivioRouter }    from "./modules/archivio/routes.js";
import { adminRouter }                           from "./modules/admin/routes.js";
import { speseProprietariRouter }                from "./modules/spese_proprietari/routes.js";
import { importazioneRouter }                    from "./modules/importazione/routes.js";

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  log("http", `${req.method} ${req.path}`);
  next();
});

app.get("/api/health", (_, r) => r.json({ ok: true, ts: new Date().toISOString() }));

// Auth routes: /auth per i redirect OAuth (browser), /api/auth per le chiamate fetch (Vite proxy)
app.use("/auth",     authRouter);
app.use("/api/auth", authRouter);

// Tutte le rotte /api (tranne /api/auth) richiedono autenticazione
app.use("/api", requireAuth);

app.use("/api/appartamenti",  appartamentiRouter);
app.use("/api/proprietari",   proprietariRouter);
app.use("/api/associazioni",  associazioniRouter);
app.use("/api/tipi-spesa",       tipiSpesaRouter);
app.use("/api/tipi-versamento", tipiVersamentoRouter);
app.use("/api/documenti",     documentiRouter);
app.use("/api/movimenti",     movimentiRouter);
app.use("/api/dashboard",     dashboardRouter);
app.use("/api/griglia",       grigliaRouter);
app.use("/api/regole",        regoleRouter);
app.use("/api/report",        reportRouter);
app.use("/api/archivio-tipi",       archivioTipiRouter);
app.use("/api/archivio",            archivioRouter);
app.use("/api/spese-proprietari",   speseProprietariRouter);
app.use("/api/admin",               adminRouter);
app.use("/api/importazione",  importazioneRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`✅  Backend → http://localhost:${PORT}`);
  console.log(`    DB: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
});
