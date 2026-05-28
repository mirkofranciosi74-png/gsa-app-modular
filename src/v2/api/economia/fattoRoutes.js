import { Router } from "express";
import { h } from "../../../shared/middleware.js";

/**
 * @param {{ economiaService: any }} deps
 */
export function makeFattoRoutes({ economiaService }) {
  const router = Router();

  router.get("/", h(async (req, res) => {
    const { immobileId, tipo, periodoDa, periodoA, legacyTipo } = req.query;
    const list = await economiaService.lista({ immobileId, tipo, periodoDa, periodoA, legacyTipo });
    res.json(list.map(fe => fe.toJSON()));
  }));

  router.get("/:id", h(async (req, res) => {
    const fe = await economiaService.trovaPerId(req.params.id);
    res.json(fe.toJSON());
  }));

  return router;
}
