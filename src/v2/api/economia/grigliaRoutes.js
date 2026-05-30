import { Router } from "express";
import { h } from "../../../shared/middleware.js";
import { righeGrigliaV2, grigliaProprietariV2 } from "../../application/economia/grigliaSvcV2.js";
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
    const result = await righeGrigliaV2(immobileId, periodoDa || null, periodoA || null, personaId || null);
    res.json(result);
  }));

  router.get("/proprietari", h(async (req, res) => {
    const { immobileId, periodoDa, periodoA } = req.query;
    if (!immobileId) return res.status(400).json({ error: "immobileId obbligatorio" });
    const result = await grigliaProprietariV2(immobileId, periodoDa || null, periodoA || null);
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
  router.get("/dashboard", h(async (_req, res) => {
    const result = await dashboardInquiliniV2();
    res.json(result);
  }));

  router.get("/dashboard/proprietari", h(async (_req, res) => {
    const result = await dashboardProprietariV2();
    res.json(result);
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
