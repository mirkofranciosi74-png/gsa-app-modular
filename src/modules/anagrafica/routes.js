import { Router } from "express";
import { h } from "../../shared/middleware.js";
import * as appRepo  from "./appartamentiRepo.js";
import * as propRepo from "./proprietariRepo.js";
import { tipiSpesaRepo } from "./tipiSpesaRepo.js";

// ── APPARTAMENTI ──────────────────────────────────────────────────────────────
export const appartamentiRouter = Router();

appartamentiRouter.get("/",    h(async (_, r)  => r.json(await appRepo.listAll())));
appartamentiRouter.get("/:id", h(async (q, r)  => {
  const a = await appRepo.findById(q.params.id);
  return a ? r.json(a) : r.status(404).json({ error: "Non trovato" });
}));
appartamentiRouter.post("/",      h(async (q, r) => r.status(201).json(await appRepo.create(q.body))));
appartamentiRouter.put("/:id",    h(async (q, r) => r.json(await appRepo.update(q.params.id, q.body))));
appartamentiRouter.delete("/:id", h(async (q, r) => {
  await appRepo.deactivate(q.params.id);
  r.status(204).end();
}));
appartamentiRouter.get("/:id/percentuali", h(async (q, r) =>
  r.json({ totale: await appRepo.checkPercentuali(q.params.id) })
));
appartamentiRouter.post("/:id/componenti", h(async (q, r) =>
  r.status(201).json(await appRepo.addComponente(q.params.id, q.body))
));
appartamentiRouter.delete("/:id/componenti/:cid", h(async (q, r) => {
  await appRepo.deleteComponente(q.params.id, q.params.cid);
  r.status(204).end();
}));
appartamentiRouter.put("/:id/componenti/:cid", h(async (q, r) => {
  const { propagaDate, confermato, ...datiComp } = q.body;
  if (propagaDate && !confermato) {
    const anteprima = await appRepo.anteprimaPropagazioneDate(
      q.params.cid, datiComp.validita_da || null, datiComp.validita_a || null
    );
    if (anteprima.length > 0) return r.json({ richiedeConferma: true, anteprima });
    return r.json(await appRepo.updateComponente(q.params.id, q.params.cid, datiComp));
  }
  if (propagaDate && confermato) {
    await appRepo.propagaDateComponente(
      q.params.cid, datiComp.validita_da || null, datiComp.validita_a || null, datiComp
    );
    const fresh = await appRepo.findById(q.params.id);
    const comp  = (fresh?.componenti || []).find(c => c.id === q.params.cid);
    return r.json(comp || { id: q.params.cid });
  }
  return r.json(await appRepo.updateComponente(q.params.id, q.params.cid, datiComp));
}));

// ── PROPRIETARI ───────────────────────────────────────────────────────────────
export const proprietariRouter = Router();

proprietariRouter.get("/",    h(async (_, r)  => r.json(await propRepo.listAll())));
proprietariRouter.get("/:id", h(async (q, r)  => {
  const p = await propRepo.findById(q.params.id);
  return p ? r.json(p) : r.status(404).json({ error: "Non trovato" });
}));
proprietariRouter.post("/",      h(async (q, r) => r.status(201).json(await propRepo.create(q.body))));
proprietariRouter.put("/:id",    h(async (q, r) => r.json(await propRepo.update(q.params.id, q.body))));
proprietariRouter.delete("/:id", h(async (q, r) => {
  await propRepo.remove(q.params.id);
  r.status(204).end();
}));

// ── ASSOCIAZIONI PROPRIETARIO-APPARTAMENTO ────────────────────────────────────
export const associazioniRouter = Router();

associazioniRouter.get("/appartamento/:appId", h(async (q, r) =>
  r.json(await propRepo.listAssociazioni(q.params.appId))
));
associazioniRouter.post("/",      h(async (q, r) => r.status(201).json(await propRepo.createAssociazione(q.body))));
associazioniRouter.put("/:id",    h(async (q, r) => r.json(await propRepo.updateAssociazione(q.params.id, q.body))));
associazioniRouter.delete("/:id", h(async (q, r) => {
  await propRepo.removeAssociazione(q.params.id);
  r.status(204).end();
}));
associazioniRouter.get("/default", h(async (q, r) => {
  const { appartamentoId, data } = q.query;
  if (!appartamentoId || !data)
    return r.status(400).json({ error: "appartamentoId e data obbligatori" });
  r.json(await propRepo.defaultPerData(appartamentoId, data));
}));

// ── TIPI SPESA ────────────────────────────────────────────────────────────────
export const tipiSpesaRouter = Router();

tipiSpesaRouter.get("/",       h(async (_, r) => r.json(await tipiSpesaRepo.listAll())));
tipiSpesaRouter.post("/",      h(async (q, r) => r.status(201).json(await tipiSpesaRepo.create(q.body))));
tipiSpesaRouter.put("/:id",    h(async (q, r) => r.json(await tipiSpesaRepo.update(q.params.id, q.body))));
tipiSpesaRouter.delete("/:id", h(async () => {
  const err = new Error("I tipi spesa non possono essere eliminati se in uso. Usa rinomina.");
  err.status = 409; throw err;
}));
