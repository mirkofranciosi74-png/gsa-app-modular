import { Router } from "express";
import { h } from "../../../shared/middleware.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { personaRepo } from "./repo.js";

export const personaRouter = Router();

// Tutte le route v2 richiedono autenticazione
personaRouter.use(requireAuth);

personaRouter.get("/", h(async (req, res) => {
  const { q, attivo } = req.query;
  if (q?.trim()) return res.json(await personaRepo.search(q));
  const filter = attivo !== undefined ? { attivo: attivo === "true" } : {};
  res.json(await personaRepo.listAll(filter));
}));

personaRouter.get("/quadratura", requireRole("admin"), h(async (_, res) => {
  res.json(await personaRepo.quadratura());
}));

personaRouter.get("/:id", h(async (req, res) => {
  const p = await personaRepo.findById(req.params.id);
  if (!p) return res.status(404).json({ error: "Persona non trovata" });
  res.json(p);
}));

personaRouter.get("/legacy/:tipo/:legacyId", h(async (req, res) => {
  const p = await personaRepo.findByLegacyId(req.params.tipo, req.params.legacyId);
  if (!p) return res.status(404).json({ error: "Persona non trovata per legacy_id" });
  res.json(p);
}));

personaRouter.post("/", requireRole("admin"), h(async (req, res) => {
  res.status(201).json(await personaRepo.create(req.body));
}));

personaRouter.put("/:id", requireRole("admin"), h(async (req, res) => {
  res.json(await personaRepo.update(req.params.id, req.body));
}));
