import { Router } from "express";
import { h } from "../../../shared/middleware.js";
import { requireRole } from "../../shared/authMiddleware.js";

/**
 * @param {{ patrimonioService: any }} deps
 */
export function makeCondominioRoutes({ patrimonioService }) {
  const router = Router();

  router.get("/", h(async (_req, res) =>
    res.json(await patrimonioService.listaCondomini())
  ));

  router.get("/:id", h(async (req, res) => {
    const c = await patrimonioService.trovaCondominio(req.params.id);
    res.json(c.toJSON());
  }));

  router.post("/", requireRole("admin"), h(async (req, res) => {
    const c = await patrimonioService.creaCondominio(req.body);
    res.status(201).json(c.toJSON());
  }));

  router.put("/:id", requireRole("admin"), h(async (req, res) => {
    const c = await patrimonioService.aggiornaCondominio(req.params.id, req.body);
    res.json(c.toJSON());
  }));

  router.post("/:id/consolida", requireRole("admin"), h(async (req, res) => {
    await patrimonioService.consolidaCondomini(req.params.id, req.body.sourceIds || []);
    res.json({ ok: true });
  }));

  router.delete("/:id", requireRole("admin"), h(async (req, res) => {
    await patrimonioService.rimuoviCondominio(req.params.id);
    res.status(204).end();
  }));

  // ── Persone associate al condominio ─────────────────────────────────────────
  router.get("/:id/persone", h(async (req, res) =>
    res.json(
      (await patrimonioService.personeCondominio(req.params.id, {
        dataRif: req.query.dataRif,
      })).map(pc => pc.toJSON())
    )
  ));

  router.post("/:id/persone", requireRole("admin"), h(async (req, res) => {
    const pc = await patrimonioService.associaPersonaCondominio({
      ...req.body,
      condominioId: req.params.id,
    });
    res.status(201).json(pc.toJSON());
  }));

  router.put("/:id/persone/:assId", requireRole("admin"), h(async (req, res) => {
    const pc = await patrimonioService.aggiornaAssociazioneCondominio(req.params.assId, req.body);
    res.json(pc.toJSON());
  }));

  router.delete("/:id/persone/:assId", requireRole("admin"), h(async (req, res) => {
    await patrimonioService.rimuoviAssociazioneCondominio(req.params.assId);
    res.status(204).end();
  }));

  return router;
}
