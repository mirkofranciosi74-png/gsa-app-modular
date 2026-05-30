import { Router } from "express";
import { h } from "../../../shared/middleware.js";
import { requireRole } from "../../shared/authMiddleware.js";

/**
 * @param {{ patrimonioService: any, ripartoService: any, economiaService: any }} deps
 */
export function makeImmobileRoutes({ patrimonioService, ripartoService, economiaService }) {
  const router = Router();

  router.get("/", h(async (req, res) => {
    const { condominioId, attivo, soggetto } = req.query;
    const list = await patrimonioService.listaImmobili({
      condominioId,
      attivo: attivo !== undefined ? attivo === "true" : undefined,
      soggetto: soggetto || undefined,
    });
    res.json(list.map(i => i.toJSON()));
  }));

  router.get("/:id", h(async (req, res) => {
    const im = await patrimonioService.trovaImmobile(req.params.id);
    res.json(im.toJSON());
  }));

  router.post("/", requireRole("admin"), h(async (req, res) => {
    const im = await patrimonioService.creaImmobile(req.body);
    res.status(201).json(im.toJSON());
  }));

  router.put("/:id", requireRole("admin"), h(async (req, res) => {
    const im = await patrimonioService.aggiornaImmobile(req.params.id, req.body);
    res.json(im.toJSON());
  }));

  router.get("/:id/dipendenze", requireRole("admin"), h(async (req, res) =>
    res.json(await patrimonioService.dipendenzaImmobile(req.params.id))
  ));

  router.delete("/:id", requireRole("admin"), h(async (req, res) => {
    await patrimonioService.rimuoviImmobile(req.params.id);
    res.status(204).end();
  }));

  // ── Ruoli dell'immobile ──────────────────────────────────────────────────────
  router.get("/:id/ruoli", h(async (req, res) => {
    const ruoli = await patrimonioService.ruoliPerImmobile(req.params.id, {
      ruolo:   req.query.ruolo,
      dataRif: req.query.dataRif,
    });
    res.json(ruoli.map(r => r.toJSON()));
  }));

  router.get("/:id/quote-verifica", requireRole("admin"), h(async (req, res) =>
    res.json(await patrimonioService.verificaQuote(req.params.id))
  ));

  // ── Economia dell'immobile ───────────────────────────────────────────────────
  router.get("/:id/totali", h(async (req, res) =>
    res.json(await economiaService.totaliPerImmobile(
      req.params.id, req.query.da || null, req.query.a || null
    ))
  ));

  router.get("/:id/quadratura", requireRole("admin"), h(async (req, res) =>
    res.json(await economiaService.quadraturaImmobile(req.params.id))
  ));

  // ── Regole riparto ───────────────────────────────────────────────────────────
  router.get("/:id/regole-riparto", h(async (req, res) =>
    res.json(await ripartoService.listaRegole(req.params.id))
  ));

  return router;
}
