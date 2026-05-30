import { Router } from "express";
import { h } from "../../shared/middleware.js";
import { righeGrigliaV2, grigliaProprietariV2 } from "../../application/economia/grigliaSvcV2.js";
import { getViewerRestrV2 } from "../../shared/viewerRestr.js";
import {
  dashboardInquiliniV2,
  dashboardProprietariV2,
  dashboardStatsFattiV2,
  dashboardFattiRecentiV2,
} from "../../application/economia/dashboardSvcV2.js";

export function makeGrigliaRoutes() {
  const router = Router();

  router.get("/inquilini", h(async (req, res) => {
    const { immobileId, periodoDa, periodoA, personaId } = req.query;
    if (!immobileId) return res.status(400).json({ error: "immobileId obbligatorio" });
    const restr = await getViewerRestrV2(req);
    if (restr?.immobili && !restr.immobili.has(immobileId))
      return res.status(403).json({ error: "Accesso non consentito" });
    const result = await righeGrigliaV2(immobileId, periodoDa || null, periodoA || null, personaId || null);
    if (restr?.inquilini) {
      result.persone = result.persone.filter(p => restr.inquilini.has(p.id));
      const ids = restr.inquilini;
      result.righeSpese   = result.righeSpese.filter(r => !r.paganteId  || ids.has(r.paganteId));
      result.righeEntrate = result.righeEntrate.filter(r => !r.paganteId || ids.has(r.paganteId));
      for (const k of Object.keys(result.totaliDovuto))  if (!ids.has(k)) delete result.totaliDovuto[k];
      for (const k of Object.keys(result.totaliVersato)) if (!ids.has(k)) delete result.totaliVersato[k];
    }
    res.json(result);
  }));

  router.get("/proprietari", h(async (req, res) => {
    const { immobileId, periodoDa, periodoA } = req.query;
    if (!immobileId) return res.status(400).json({ error: "immobileId obbligatorio" });
    const restr = await getViewerRestrV2(req);
    if (restr?.immobili && !restr.immobili.has(immobileId))
      return res.status(403).json({ error: "Accesso non consentito" });
    const result = await grigliaProprietariV2(immobileId, periodoDa || null, periodoA || null);
    if (restr?.proprietari) {
      result.props = result.props.filter(p => restr.proprietari.has(p.id));
      const ids = restr.proprietari;
      for (const k of Object.keys(result.totaliDareTeorico))  if (!ids.has(k)) delete result.totaliDareTeorico[k];
      for (const k of Object.keys(result.totaliAvereTeorico)) if (!ids.has(k)) delete result.totaliAvereTeorico[k];
      for (const k of Object.keys(result.totaliPagato))       if (!ids.has(k)) delete result.totaliPagato[k];
      for (const k of Object.keys(result.totaliIncassato))    if (!ids.has(k)) delete result.totaliIncassato[k];
    }
    res.json(result);
  }));

  router.get("/export-excel", h(async (req, res) => {
    const { immobileId, periodoDa, periodoA, modo = "tutti" } = req.query;
    if (!immobileId) return res.status(400).json({ error: "immobileId obbligatorio" });
    const [dati, datiProp] = await Promise.all([
      righeGrigliaV2(immobileId, periodoDa || null, periodoA || null),
      grigliaProprietariV2(immobileId, periodoDa || null, periodoA || null),
    ]);
    const { streamExcelOnlyV2 } = await import("./grigliaExportV2.js");
    await streamExcelOnlyV2(dati, datiProp, periodoDa || null, periodoA || null, modo, res);
  }));

  router.get("/export-zip", h(async (req, res) => {
    const { immobileId, periodoDa, periodoA, modo = "dettaglio" } = req.query;
    if (!immobileId) return res.status(400).json({ error: "immobileId obbligatorio" });
    const [dati, datiProp] = await Promise.all([
      righeGrigliaV2(immobileId, periodoDa || null, periodoA || null),
      grigliaProprietariV2(immobileId, periodoDa || null, periodoA || null),
    ]);
    const { streamGrigliaZipV2 } = await import("./grigliaExportV2.js");
    await streamGrigliaZipV2(dati, datiProp, immobileId, periodoDa || null, periodoA || null, modo, res);
  }));

  // ── Dashboard ────────────────────────────────────────────────────────────────
  router.get("/dashboard", h(async (req, res) => {
    const restr = await getViewerRestrV2(req);
    const allowedIds = restr?.immobili ? [...restr.immobili] : null;
    res.json(await dashboardInquiliniV2(allowedIds));
  }));

  router.get("/dashboard/proprietari", h(async (req, res) => {
    const restr = await getViewerRestrV2(req);
    const allowedIds = restr?.immobili ? [...restr.immobili] : null;
    res.json(await dashboardProprietariV2(allowedIds));
  }));

  router.get("/dashboard/stats", h(async (_req, res) => {
    const result = await dashboardStatsFattiV2();
    res.json(result);
  }));

  router.get("/dashboard/recenti", h(async (_req, res) => {
    const result = await dashboardFattiRecentiV2();
    res.json(result);
  }));

  return router;
}
