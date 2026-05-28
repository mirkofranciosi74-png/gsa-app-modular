import { Router }  from "express";
import multer       from "multer";
import { h }        from "../../../shared/middleware.js";
import { requireRole } from "../../shared/authMiddleware.js";

const up = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE) || 20971520 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf"));
  },
});

/**
 * @param {{ economiaService: any }} deps
 */
export function makeFattoRoutes({ economiaService }) {
  const router = Router();

  // ── READ ──────────────────────────────────────────────────────────────────

  router.get("/", h(async (req, res) => {
    const { immobileId, condominioId, tipo, periodoDa, periodoA,
            legacyTipo, stato, tipoSpesaId, q } = req.query;
    const list = await economiaService.lista({
      immobileId, condominioId, tipo, periodoDa, periodoA,
      legacyTipo, stato, tipoSpesaId, q,
    });
    res.json(list.map(fe => fe.toJSON()));
  }));

  // Deve stare PRIMA di /:id per evitare routing conflicts
  router.get("/duplicati-dati", h(async (req, res) => {
    const result = await economiaService.checkDuplicatiDati(req.query);
    res.json(result);
  }));

  router.get("/:id", h(async (req, res) => {
    const fe = await economiaService.trovaPerId(req.params.id);
    res.json(fe.toJSON());
  }));

  router.get("/:id/pdf", h(async (req, res) => {
    const buf = economiaService.leggiPdfFatto(req.params.id);
    if (!buf) return res.status(404).json({ error: "PDF non disponibile" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    res.send(buf);
  }));

  // ── WRITE ─────────────────────────────────────────────────────────────────

  router.post("/", requireRole("admin"), h(async (req, res) => {
    const fatto = await economiaService.crea(req.body);
    res.status(201).json(fatto.toJSON());
  }));

  router.put("/:id", requireRole("admin"), h(async (req, res) => {
    const fatto = await economiaService.aggiorna(req.params.id, req.body);
    res.json(fatto.toJSON());
  }));

  router.delete("/:id", requireRole("admin"), h(async (req, res) => {
    await economiaService.rimuovi(req.params.id);
    res.status(204).end();
  }));

  // ── PDF ────────────────────────────────────────────────────────────────────

  /**
   * POST /check-hash — controlla se il file è già presente (duplicato binario).
   * Non salva nulla, risponde con { hash, duplicati: [...] }.
   */
  router.post("/check-hash", up.single("file"), h(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Nessun file" });
    const excludeId = req.body?.excludeId || null;
    const result = await economiaService.checkHashFile(req.file.buffer, excludeId);
    res.json(result);
  }));

  /**
   * POST /extract — estrae dati dal PDF (OCR/parse) per auto-fill del form.
   * Esegue hash check ma non salva nulla. Risponde con dati estratti + pdf_base64.
   * Body multipart: file, immobili (JSON array), tipologie (JSON array).
   */
  router.post("/extract", up.single("file"), h(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Nessun file" });
    let immobili  = [];
    let tipologie = [];
    try {
      immobili  = JSON.parse(req.body.immobili  || "[]");
      tipologie = JSON.parse(req.body.tipologie || "[]");
    } catch { /* usa array vuoti */ }
    const result = await economiaService.estraiPdf(
      req.file.buffer,
      req.file.originalname,
      { immobili, tipologie }
    );
    res.json({ ...result, pdf_base64: req.file.buffer.toString("base64") });
  }));

  /**
   * POST /:id/pdf — carica o sostituisce il PDF allegato a un fatto esistente.
   */
  router.post("/:id/pdf", requireRole("admin"), up.single("file"), h(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Nessun file" });
    const result = await economiaService.salvaPdfFatto(
      req.params.id,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
    );
    res.json(result);
  }));

  router.delete("/:id/pdf", requireRole("admin"), h(async (req, res) => {
    await economiaService.eliminaPdfFatto(req.params.id);
    res.status(204).end();
  }));

  return router;
}
