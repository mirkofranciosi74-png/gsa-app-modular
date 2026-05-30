import { Router } from "express";
import { h } from "../../../shared/middleware.js";
import { requireRole } from "../../shared/authMiddleware.js";
import { ValidationError } from "../../domain/shared/DomainError.js";

/**
 * @param {{ ripartoService: any }} deps
 */
export function makeRipartoRoutes({ ripartoService }) {
  const router = Router();

  // ── Calcolo ────────────────────────────────────────────────────────────────
  router.post("/calcola", h(async (req, res) => {
    const { immobileId, tipoSpesaId, mese, importo, target } = req.body;
    if (!immobileId || !mese || importo == null)
      throw new ValidationError("immobileId, mese e importo obbligatori");
    res.json(await ripartoService.calcola({
      immobileId, tipoSpesaId, mese, importo: Number(importo), target,
    }));
  }));

  // ── Regole appartamento (proprietari / inquilini) ──────────────────────────
  router.get("/regole", h(async (req, res) => {
    const { immobileId, target } = req.query;
    if (!immobileId) throw new ValidationError("immobileId obbligatorio");
    res.json(await ripartoService.listaRegole(immobileId, { target }));
  }));

  // ── Regola coppia (crea prop + inq insieme) ───────────────────────────────
  router.post("/regole/coppia", requireRole("admin"), h(async (req, res) => {
    const { immobileId } = req.body;
    if (!immobileId) throw new ValidationError("immobileId obbligatorio");
    const creati = await ripartoService.creaRegolaCoppia(req.body);
    res.status(201).json(creati);
  }));

  router.post("/regole", requireRole("admin"), h(async (req, res) => {
    if (!req.body.immobileId) throw new ValidationError("immobileId obbligatorio");
    if (!req.body.target)     throw new ValidationError("target obbligatorio (proprietari|inquilini)");
    const regola = await ripartoService.creaRegola(req.body);
    // Se il frontend ha pre-generato l'id, include dettagli nel body (batch)
    if (Array.isArray(req.body.dettagli) && req.body.dettagli.length > 0) {
      for (const d of req.body.dettagli) {
        await ripartoService.aggiungiDettaglio(regola.id, d);
      }
    }
    res.status(201).json(regola);
  }));

  router.post("/regole/:id/dettagli", requireRole("admin"), h(async (req, res) => {
    if (!req.body.personaId) throw new ValidationError("personaId obbligatorio");
    res.status(201).json(
      await ripartoService.aggiungiDettaglio(req.params.id, req.body)
    );
  }));

  router.put("/regole/:id", requireRole("admin"), h(async (req, res) => {
    await ripartoService.aggiornaRegola(req.params.id, req.body);
    res.status(204).end();
  }));

  router.delete("/regole/:id", requireRole("admin"), h(async (req, res) => {
    await ripartoService.rimuoviRegola(req.params.id);
    res.status(204).end();
  }));

  // ── Regole condominio → appartamenti ──────────────────────────────────────
  router.get("/regole-condominio", h(async (req, res) => {
    const { condominioId } = req.query;
    if (!condominioId) throw new ValidationError("condominioId obbligatorio");
    res.json(await ripartoService.listaRegoleCondominio(condominioId));
  }));

  router.post("/regole-condominio", requireRole("admin"), h(async (req, res) => {
    if (!req.body.condominioId) throw new ValidationError("condominioId obbligatorio");
    if (!req.body.validitaDa)   throw new ValidationError("validitaDa obbligatoria");
    const regola = await ripartoService.creaRegolaCondominio(req.body);
    // Se il frontend ha pre-generato l'id, include dettagli nel body (batch)
    if (Array.isArray(req.body.dettagli) && req.body.dettagli.length > 0) {
      for (const d of req.body.dettagli) {
        await ripartoService.aggiungiDettaglioCondominio(regola.id, d);
      }
    }
    res.status(201).json(regola);
  }));

  router.post("/regole-condominio/:id/dettagli", requireRole("admin"), h(async (req, res) => {
    if (!req.body.immobileId)  throw new ValidationError("immobileId obbligatorio");
    if (req.body.percentuale == null) throw new ValidationError("percentuale obbligatoria");
    res.status(201).json(
      await ripartoService.aggiungiDettaglioCondominio(req.params.id, req.body)
    );
  }));

  router.put("/regole-condominio/:id", requireRole("admin"), h(async (req, res) => {
    await ripartoService.aggiornaRegolaCondominio(req.params.id, req.body);
    res.status(204).end();
  }));

  router.delete("/regole-condominio/:id", requireRole("admin"), h(async (req, res) => {
    await ripartoService.rimuoviRegolaCondominio(req.params.id);
    res.status(204).end();
  }));

  return router;
}
