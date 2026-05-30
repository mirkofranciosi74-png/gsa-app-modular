import { Router } from "express";
import { h } from "../../shared/middleware.js";
import { requireRole } from "../../shared/authMiddleware.js";

/**
 * @param {{ economiaService: any }} deps
 */
export function makeTipologiaRoutes({ economiaService }) {
  const router = Router();

  router.get("/", h(async (req, res) => {
    const { tipo, attivo, q } = req.query;
    const attivoVal = attivo === "true" ? true : attivo === "false" ? false : undefined;
    res.json(await economiaService.listaTipologie({ tipo, attivo: attivoVal, q }));
  }));

  router.get("/:id", h(async (req, res) => {
    res.json(await economiaService.trovaTipologia(req.params.id));
  }));

  router.post("/", requireRole("admin"), h(async (req, res) => {
    const t = await economiaService.creaTipologia(req.body);
    res.status(201).json(t);
  }));

  router.put("/:id", requireRole("admin"), h(async (req, res) => {
    const t = await economiaService.aggiornaTipologia(req.params.id, req.body);
    res.json(t);
  }));

  router.get("/:id/uso", h(async (req, res) => {
    const count = await economiaService.contaUsoTipologia(req.params.id);
    res.json({ count });
  }));

  router.delete("/:id", requireRole("admin"), h(async (req, res) => {
    await economiaService.rimuoviTipologia(req.params.id);
    res.status(204).end();
  }));

  return router;
}
