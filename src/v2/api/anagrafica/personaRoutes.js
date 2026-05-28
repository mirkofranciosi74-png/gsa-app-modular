import { Router } from "express";
import { h } from "../../../shared/middleware.js";
import { requireRole } from "../../shared/authMiddleware.js";

/**
 * @param {{ personaService: ReturnType<import('../../../application/anagrafica/PersonaService.js').makePersonaService> }} deps
 */
export function makePersonaRoutes({ personaService }) {
  const router = Router();

  router.get("/", h(async (req, res) => {
    const { q, attivo } = req.query;
    const attivoVal = attivo !== undefined ? attivo === "true" : undefined;
    const list = await personaService.lista({ q, attivo: attivoVal });
    res.json(list.map(p => p.toJSON()));
  }));

  router.get("/quadratura", requireRole("admin"), h(async (_req, res) => {
    res.json(await personaService.quadratura());
  }));

  router.get("/legacy/:tipo/:legacyId", h(async (req, res) => {
    const persona = await personaService.trovaPerLegacy(req.params.tipo, req.params.legacyId);
    if (!persona) return res.status(404).json({ error: "Persona non trovata per questo legacy id" });
    res.json(persona.toJSON());
  }));

  router.get("/:id", h(async (req, res) => {
    const persona = await personaService.trovaPerId(req.params.id);
    res.json(persona.toJSON());
  }));

  router.post("/", requireRole("admin"), h(async (req, res) => {
    const persona = await personaService.crea(req.body);
    res.status(201).json(persona.toJSON());
  }));

  router.put("/:id", requireRole("admin"), h(async (req, res) => {
    const persona = await personaService.aggiorna(req.params.id, req.body);
    res.json(persona.toJSON());
  }));

  router.post("/:id/legacy-ref", requireRole("admin"), h(async (req, res) => {
    const { tipo, legacyId } = req.body;
    const persona = await personaService.aggiungiLegacyRef(req.params.id, tipo, legacyId);
    res.json(persona.toJSON());
  }));

  return router;
}
