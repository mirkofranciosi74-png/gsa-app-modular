/**
 * Router principale API v2.
 * Montato in src/server.js su /api/v2
 * Parallelo alle API v1 — non le sostituisce.
 */

import { Router } from "express";
import { h } from "../../shared/middleware.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { personaRouter } from "./persona/routes.js";
import { condominioRepo } from "./condominio/repo.js";
import { immobileRepo } from "./immobile/repo.js";
import { ruoloRepo } from "./ruolo/repo.js";
import { fattoEconomicoRepo } from "./fatto_economico/repo.js";
import { calcolaRiparto, confrontaConLegacy } from "./riparto/engine.js";

export const v2Router = Router();

v2Router.use(requireAuth);

// ── Persona ────────────────────────────────────────────────────────────────────
v2Router.use("/persone", personaRouter);

// ── Condominio ─────────────────────────────────────────────────────────────────
v2Router.get("/condomini",     h(async (_, res) => res.json(await condominioRepo.listAll())));
v2Router.get("/condomini/:id", h(async (req, res) => {
  const c = await condominioRepo.findById(req.params.id);
  if (!c) return res.status(404).json({ error: "Condominio non trovato" });
  res.json(c);
}));
v2Router.post("/condomini", requireRole("admin"), h(async (req, res) =>
  res.status(201).json(await condominioRepo.create(req.body))
));
v2Router.put("/condomini/:id", requireRole("admin"), h(async (req, res) =>
  res.json(await condominioRepo.update(req.params.id, req.body))
));
v2Router.post("/condomini/:id/consolida", requireRole("admin"), h(async (req, res) => {
  await condominioRepo.consolida(req.params.id, req.body.ids || []);
  res.json({ ok: true });
}));

// ── Immobile ───────────────────────────────────────────────────────────────────
v2Router.get("/immobili",     h(async (req, res) =>
  res.json(await immobileRepo.listAll({
    condominioId: req.query.condominioId,
    attivo: req.query.attivo !== undefined ? req.query.attivo === "true" : undefined,
  }))
));
v2Router.get("/immobili/:id", h(async (req, res) => {
  const i = await immobileRepo.findById(req.params.id);
  if (!i) return res.status(404).json({ error: "Immobile non trovato" });
  res.json(i);
}));
v2Router.post("/immobili", requireRole("admin"), h(async (req, res) =>
  res.status(201).json(await immobileRepo.create(req.body))
));
v2Router.put("/immobili/:id", requireRole("admin"), h(async (req, res) =>
  res.json(await immobileRepo.update(req.params.id, req.body))
));

// ── Ruoli ──────────────────────────────────────────────────────────────────────
v2Router.get("/immobili/:id/ruoli", h(async (req, res) =>
  res.json(await ruoloRepo.listByImmobile(req.params.id, {
    ruolo: req.query.ruolo,
    dataRif: req.query.dataRif,
  }))
));
v2Router.get("/persone/:id/ruoli", h(async (req, res) =>
  res.json(await ruoloRepo.listByPersona(req.params.id))
));
v2Router.post("/ruoli", requireRole("admin"), h(async (req, res) =>
  res.status(201).json(await ruoloRepo.create(req.body))
));
v2Router.put("/ruoli/:id", requireRole("admin"), h(async (req, res) =>
  res.json(await ruoloRepo.update(req.params.id, req.body))
));
v2Router.delete("/ruoli/:id", requireRole("admin"), h(async (req, res) => {
  await ruoloRepo.remove(req.params.id);
  res.status(204).end();
}));
v2Router.get("/immobili/:id/quote-verifica", requireRole("admin"), h(async (req, res) =>
  res.json(await ruoloRepo.verificaQuote(
    req.params.id, req.query.da || null, req.query.a || null
  ))
));

// ── Fatti Economici ────────────────────────────────────────────────────────────
v2Router.get("/fatti", h(async (req, res) =>
  res.json(await fattoEconomicoRepo.list({
    immobileId: req.query.immobileId,
    tipo: req.query.tipo,
    periodoDa: req.query.periodoDa,
    periodoA: req.query.periodoA,
    legacyTipo: req.query.legacyTipo,
  }))
));
v2Router.get("/fatti/:id", h(async (req, res) => {
  const fe = await fattoEconomicoRepo.findById(req.params.id);
  if (!fe) return res.status(404).json({ error: "Fatto economico non trovato" });
  res.json(fe);
}));
v2Router.get("/immobili/:id/totali", h(async (req, res) =>
  res.json(await fattoEconomicoRepo.totaliPerImmobile(
    req.params.id, req.query.da || null, req.query.a || null
  ))
));
v2Router.get("/immobili/:id/quadratura", requireRole("admin"), h(async (req, res) =>
  res.json(await fattoEconomicoRepo.quadratura(req.params.id))
));

// ── Riparto ────────────────────────────────────────────────────────────────────
v2Router.post("/riparto/calcola", h(async (req, res) => {
  const { immobileId, tipoSpesaId, mese, importo, target } = req.body;
  if (!immobileId || !mese || !importo)
    return res.status(400).json({ error: "immobileId, mese e importo obbligatori" });
  res.json(await calcolaRiparto({ immobileId, tipoSpesaId, mese, importo: Number(importo), target }));
}));

v2Router.get("/immobili/:id/riparto-confronto", requireRole("admin"), h(async (req, res) => {
  const { mese } = req.query;
  if (!mese) return res.status(400).json({ error: "mese obbligatorio (YYYY-MM)" });
  res.json(await confrontaConLegacy(req.params.id, mese));
}));

// ── Stato migrazione ───────────────────────────────────────────────────────────
v2Router.get("/migration-status", requireRole("admin"), h(async (_, res) => {
  const { query: q } = await import("../../shared/db/pool.js");
  const log = await q("SELECT * FROM v2._phase_log ORDER BY phase, step");
  res.json(log);
}));
