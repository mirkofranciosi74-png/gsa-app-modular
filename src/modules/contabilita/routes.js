import { Router } from "express";
import { h }      from "../../shared/middleware.js";
import * as griglia  from "./grigliaSvc.js";
import * as regRepo  from "./ripartiRepo.js";
import { report }    from "./reportSvc.js";
import { reportSalvatiRepo } from "./reportSalvatiRepo.js";
import * as docRepo  from "../documenti/repo.js";

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
export const dashboardRouter = Router();

dashboardRouter.get("/",            h(async (_, r) => r.json(await griglia.dashboardAnno())));
dashboardRouter.get("/proprietari", h(async (_, r) => r.json(await griglia.dashboardProprietari())));

// ── GRIGLIA ───────────────────────────────────────────────────────────────────
export const grigliaRouter = Router();

grigliaRouter.get("/", h(async (q, r) => {
  const { appartamentoId, periodoDA, periodoA, componenteId } = q.query;
  if (!appartamentoId) return r.status(400).json({ error: "appartamentoId obbligatorio" });
  r.json(await griglia.righeGriglia(appartamentoId, periodoDA || null, periodoA || null, componenteId || null));
}));

grigliaRouter.get("/proprietari", h(async (q, r) => {
  const { appartamentoId, periodoDA, periodoA } = q.query;
  if (!appartamentoId) return r.status(400).json({ error: "appartamentoId obbligatorio" });
  r.json(await griglia.grigliaPropretari(appartamentoId, periodoDA || null, periodoA || null));
}));

grigliaRouter.get("/export-zip", h(async (q, r) => {
  const { appartamentoId, periodoDA, periodoA } = q.query;
  if (!appartamentoId) return r.status(400).json({ error: "appartamentoId obbligatorio" });
  const dati        = await griglia.righeGriglia(appartamentoId, periodoDA || null, periodoA || null);
  const documentiDB = await docRepo.listAll({
    appartamentoId,
    periodoDA: periodoDA || undefined,
    periodoA:  periodoA  || undefined,
  });
  const { streamGrigliaZip } = await import("./grigliaExport.js");
  await streamGrigliaZip(dati, documentiDB, periodoDA, periodoA, r);
}));

grigliaRouter.get("/export-excel", h(async (q, r) => {
  const { appartamentoId, periodoDA, periodoA, modo = "tutti" } = q.query;
  if (!appartamentoId) return r.status(400).json({ error: "appartamentoId obbligatorio" });
  const [dati, datiProp] = await Promise.all([
    griglia.righeGriglia(appartamentoId, periodoDA || null, periodoA || null),
    griglia.grigliaPropretari(appartamentoId, periodoDA || null, periodoA || null),
  ]);
  const { streamExcelOnly } = await import("./grigliaExport.js");
  await streamExcelOnly(dati, datiProp, periodoDA, periodoA, modo, r);
}));

grigliaRouter.get("/versatoperiodo", h(async (q, r) => {
  const { appartamentoId, componenteId, periodoDA, periodoA } = q.query;
  const versato = await griglia.versatoNelPeriodo(appartamentoId, componenteId, periodoDA, periodoA);
  r.json({ versato });
}));

// ── REGOLE RIPARTO ────────────────────────────────────────────────────────────
export const regoleRouter = Router();

regoleRouter.get("/appartamento/:appId", h(async (q, r) =>
  r.json(await regRepo.listByAppartamento(q.params.appId))
));
regoleRouter.post("/",      h(async (q, r) => r.status(201).json(await regRepo.create(q.body))));
regoleRouter.put("/:id",    h(async (q, r) => r.json(await regRepo.update(q.params.id, q.body))));
regoleRouter.delete("/:id", h(async (q, r) => {
  await regRepo.remove(q.params.id);
  r.status(204).end();
}));

// ── REPORT ────────────────────────────────────────────────────────────────────
export const reportRouter = Router();

reportRouter.post("/genera", h(async (req, res) => {
  const { params } = req.body;
  // Importa listAll da anagrafica senza dipendenza circolare
  const { listAll } = await import("../anagrafica/appartamentiRepo.js");
  const appartamenti = await listAll();
  const datiPerApp = [];
  for (const app of appartamenti) {
    const [g, gp] = await Promise.all([
      griglia.righeGriglia(app.id, params.periodoDA || null, params.periodoA || null),
      griglia.grigliaPropretari(app.id, params.periodoDA || null, params.periodoA || null),
    ]);
    datiPerApp.push({ app, griglia: g, grigliaProp: gp });
  }
  res.json(await report({ params, datiPerApp }));
}));
reportRouter.get("/",       h(async (_, r)  => r.json(await reportSalvatiRepo.listAll())));
reportRouter.get("/:id",    h(async (q, r)  => {
  const rep = await reportSalvatiRepo.findById(q.params.id);
  return rep ? r.json(rep) : r.status(404).json({ error: "Non trovato" });
}));
reportRouter.post("/",      h(async (q, r)  => r.status(201).json(await reportSalvatiRepo.create(q.body))));
reportRouter.delete("/:id", h(async (q, r)  => {
  await reportSalvatiRepo.remove(q.params.id);
  r.status(204).end();
}));
