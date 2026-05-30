import { Router } from "express";
import { h } from "../../../shared/middleware.js";
import { requireRole } from "../../shared/authMiddleware.js";

/**
 * @param {{ patrimonioService: any }} deps
 */
export function makeRuoloRoutes({ patrimonioService }) {
  const router = Router();

  router.get("/", h(async (req, res) => {
    const ruoli = await patrimonioService.ruoliTutti();
    res.json(ruoli.map(r => r.toJSON()));
  }));

  router.get("/persone/:personaId/ruoli", h(async (req, res) => {
    const ruoli = await patrimonioService.ruoliPerPersona(req.params.personaId);
    res.json(ruoli.map(r => r.toJSON()));
  }));

  router.post("/", requireRole("admin"), h(async (req, res) => {
    const ruolo = await patrimonioService.creaRuolo(req.body);
    res.status(201).json(ruolo.toJSON());
  }));

  router.put("/:id", requireRole("admin"), h(async (req, res) => {
    const ruolo = await patrimonioService.aggiornaRuolo(req.params.id, req.body);
    res.json(ruolo.toJSON());
  }));

  router.delete("/:id", requireRole("admin"), h(async (req, res) => {
    await patrimonioService.rimuoviRuolo(req.params.id);
    res.status(204).end();
  }));

  return router;
}
