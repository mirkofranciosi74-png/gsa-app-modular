import { Router } from "express";
import { h } from "../../shared/middleware.js";
import { requireRole } from "../../shared/authMiddleware.js";
import { getViewerRestrV2 } from "../../shared/viewerRestr.js";

/**
 * @param {{ patrimonioService: any }} deps
 */
export function makeRuoloRoutes({ patrimonioService }) {
  const router = Router();

  router.get("/", h(async (req, res) => {
    const { immobileId } = req.query;
    const restr = await getViewerRestrV2(req);
    if (restr?.immobili && immobileId && !restr.immobili.has(immobileId))
      return res.status(403).json({ error: "Accesso non consentito" });
    const ruoli = await patrimonioService.ruoliTutti({ immobileId });
    let list = ruoli.map(r => r.toJSON());
    if (restr?.immobili) list = list.filter(r => restr.immobili.has(r.immobileId));
    if (restr?.inquilini) list = list.filter(r => r.ruolo !== "inquilino" || restr.inquilini.has(r.personaId));
    if (restr?.proprietari) list = list.filter(r => r.ruolo !== "proprietario" || restr.proprietari.has(r.personaId));
    res.json(list);
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
