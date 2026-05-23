import { Router } from "express";
import { h } from "../../shared/middleware.js";
import * as appRepo  from "./appartamentiRepo.js";
import * as propRepo from "./proprietariRepo.js";
import { tipiSpesaRepo }       from "./tipiSpesaRepo.js";
import { tipiVersamentoRepo } from "./tipiVersamentoRepo.js";

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
proprietariRouter.get("/:id/dipendenze", h(async (q, r) =>
  r.json(await propRepo.getDipendenze(q.params.id))
));
proprietariRouter.post("/:id/elimina", h(async (q, r) => {
  await propRepo.reassignAndRemove(q.params.id, q.body.nuovoProprietarioId || null);
  r.status(204).end();
}));
proprietariRouter.delete("/:id", h(async (q, r) => {
  await propRepo.remove(q.params.id);
  r.status(204).end();
}));

// ── ASSOCIAZIONI PROPRIETARIO-APPARTAMENTO ────────────────────────────────────
export const associazioniRouter = Router();

associazioniRouter.get("/appartamento/:appId", h(async (q, r) =>
  r.json(await propRepo.listAssociazioni(q.params.appId))
));
associazioniRouter.get("/default", h(async (q, r) => {
  const { appartamentoId, data } = q.query;
  if (!appartamentoId || !data)
    return r.status(400).json({ error: "appartamentoId e data obbligatori" });
  r.json(await propRepo.defaultPerData(appartamentoId, data));
}));
associazioniRouter.get("/anomalie", h(async (_, r) =>
  r.json(await propRepo.verificaAnomalieProprietari())
));
associazioniRouter.post("/", h(async (q, r) => {
  const result = await propRepo.createAssociazione(q.body);
  if (q.body.proprietario_default && result?.appartamento_id) {
    await propRepo.unsetOtherDefaults(result.appartamento_id, result.id);
  }
  r.status(201).json(result);
}));
associazioniRouter.post("/bulk-update-incassatore", h(async (q, r) => {
  const { appartamentoId, proprietarioId, dataFrom } = q.body;
  if (!appartamentoId || !proprietarioId || !dataFrom)
    return r.status(400).json({ error: "appartamentoId, proprietarioId e dataFrom obbligatori" });
  const count = await propRepo.bulkUpdateIncassatoreMovimenti(appartamentoId, proprietarioId, dataFrom);
  r.json({ count });
}));
associazioniRouter.post("/bulk-update-pagatore", h(async (q, r) => {
  const { appartamentoId, proprietarioId, dataFrom } = q.body;
  if (!appartamentoId || !proprietarioId || !dataFrom)
    return r.status(400).json({ error: "appartamentoId, proprietarioId e dataFrom obbligatori" });
  const count = await propRepo.bulkUpdatePagatoreDocumenti(appartamentoId, proprietarioId, dataFrom);
  r.json({ count });
}));
associazioniRouter.get("/:id/dipendenze", h(async (q, r) => {
  const assoc = await propRepo.getAssociazione(q.params.id);
  if (!assoc) return r.status(404).json({ error: "Associazione non trovata" });
  const deps = await propRepo.getDipendenzeAssociazione(assoc.proprietario_id, assoc.appartamento_id);
  r.json({ ...deps, assoc });
}));
associazioniRouter.get("/:id/anomalie-validita", h(async (q, r) => {
  const assoc = await propRepo.getAssociazione(q.params.id);
  if (!assoc) return r.status(404).json({ error: "Associazione non trovata" });
  const res = await propRepo.getAnomalieAssociazione(assoc.proprietario_id, assoc.appartamento_id);
  r.json({ ...res, assoc });
}));
associazioniRouter.post("/:id/riassegna-anomalie", h(async (q, r) => {
  const assoc = await propRepo.getAssociazione(q.params.id);
  if (!assoc) return r.status(404).json({ error: "Associazione non trovata" });
  await propRepo.riassegnaAnomalieAssociazione(
    assoc.proprietario_id, assoc.appartamento_id, q.body.nuovoId || null
  );
  r.status(204).end();
}));
associazioniRouter.post("/:id/elimina", h(async (q, r) => {
  const assoc = await propRepo.getAssociazione(q.params.id);
  if (!assoc) return r.status(404).json({ error: "Associazione non trovata" });
  await propRepo.reassignAndRemoveAssociazione(
    q.params.id,
    assoc.proprietario_id,
    assoc.appartamento_id,
    q.body.nuovoId || null
  );
  r.status(204).end();
}));
associazioniRouter.put("/:id", h(async (q, r) => {
  const result = await propRepo.updateAssociazione(q.params.id, q.body);
  if (q.body.proprietario_default) {
    const apId = result?.appartamento_id || q.body.appartamento_id;
    if (apId) await propRepo.unsetOtherDefaults(apId, q.params.id);
  }
  r.json(result);
}));
associazioniRouter.delete("/:id", h(async (q, r) => {
  await propRepo.removeAssociazione(q.params.id);
  r.status(204).end();
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

// ── TIPI VERSAMENTO ───────────────────────────────────────────────────────────
export const tipiVersamentoRouter = Router();

tipiVersamentoRouter.get("/",       h(async (_, r) => r.json(await tipiVersamentoRepo.listAll())));
tipiVersamentoRouter.post("/",      h(async (q, r) => r.status(201).json(await tipiVersamentoRepo.create(q.body))));
tipiVersamentoRouter.put("/:id",    h(async (q, r) => r.json(await tipiVersamentoRepo.update(q.params.id, q.body))));
tipiVersamentoRouter.delete("/:id", h(async (q, r) => {
  await tipiVersamentoRepo.remove(q.params.id);
  r.status(204).end();
}));
