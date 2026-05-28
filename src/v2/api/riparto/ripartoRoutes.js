import { Router } from "express";
import { h } from "../../../shared/middleware.js";
import { requireRole } from "../../shared/authMiddleware.js";
import { ValidationError } from "../../domain/shared/DomainError.js";

/**
 * @param {{ ripartoService: any }} deps
 */
export function makeRipartoRoutes({ ripartoService }) {
  const router = Router();

  router.post("/calcola", h(async (req, res) => {
    const { immobileId, tipoSpesaId, mese, importo, target } = req.body;
    if (!immobileId || !mese || importo == null)
      throw new ValidationError("immobileId, mese e importo obbligatori");
    res.json(await ripartoService.calcola({
      immobileId, tipoSpesaId, mese, importo: Number(importo), target,
    }));
  }));

  router.post("/regole", requireRole("admin"), h(async (req, res) => {
    res.status(201).json(await ripartoService.creaRegola(req.body));
  }));

  router.post("/regole/:id/dettagli", requireRole("admin"), h(async (req, res) => {
    res.status(201).json(await ripartoService.aggiungiDettaglio(req.params.id, req.body));
  }));

  router.delete("/regole/:id", requireRole("admin"), h(async (req, res) => {
    await ripartoService.rimuoviRegola(req.params.id);
    res.status(204).end();
  }));

  return router;
}
