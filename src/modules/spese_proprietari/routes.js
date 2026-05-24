import { Router } from "express";
import multer      from "multer";
import crypto      from "crypto";
import path        from "path";
import { h }       from "../../shared/middleware.js";
import * as repo   from "./repo.js";
import * as allegatoRepo from "./allegatoRepo.js";
import { salvaPdf, leggiPdf, eliminaPdf, pdfEsiste,
         salvaAllegato, leggiAllegato, eliminaAllegato } from "../../shared/storage.js";

const up = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE) || 20971520 },
});

export const speseProprietariRouter = Router();

// ── Spese proprietari ─────────────────────────────────────────────────────────
speseProprietariRouter.get("/", h(async (req, res) => {
  const { proprietarioId, appartamentoId, tipoSpesa, da, a } = req.query;
  const rows = await repo.listAll({ proprietarioId, appartamentoId, tipoSpesa, da, a });
  // conta allegati per ogni spesa per mostrare icona PDF in tabella
  const ids = rows.map(r => r.id);
  let allegatoCounts = {};
  if (ids.length) {
    const counts = await import("../../shared/db/pool.js").then(({ query }) =>
      query(
        `SELECT spesa_id, COUNT(*)::int AS n
         FROM spese_proprietari_allegati
         WHERE spesa_id = ANY($1::uuid[])
         GROUP BY spesa_id`,
        [ids]
      )
    );
    counts.forEach(c => { allegatoCounts[c.spesa_id] = c.n; });
  }
  res.json(rows.map(r => ({ ...r, n_allegati: allegatoCounts[r.id] || 0 })));
}));

speseProprietariRouter.post("/", h(async (req, res) => {
  const spesa = await repo.create(req.body);
  res.status(201).json({ ...spesa, n_allegati: 0 });
}));

speseProprietariRouter.put("/:id", h(async (req, res) => {
  const spesa = await repo.update(req.params.id, req.body);
  res.json(spesa);
}));

speseProprietariRouter.patch("/:id/stato", h(async (req, res) => {
  await repo.updateStato(req.params.id, req.body.stato);
  res.json({ ok: true, stato: req.body.stato });
}));

speseProprietariRouter.delete("/:id", h(async (req, res) => {
  eliminaPdf(req.params.id); // rimuove eventuale vecchio file legacy
  await repo.remove(req.params.id); // ON DELETE CASCADE rimuove allegati dalla tabella
  res.status(204).end();
}));

// ── Verifica hash senza salvare (controllo duplicati preventivo) ──────────────
speseProprietariRouter.post("/check-hash", up.single("file"), h(async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Nessun file" });
  const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const dups = await allegatoRepo.findDuplicates(hash, null);
  res.json({ hash, duplicati_allegati: dups.allegati, duplicati_documenti: dups.documenti });
}));

// ── Allegati multipli ─────────────────────────────────────────────────────────
speseProprietariRouter.get("/:id/allegati", h(async (req, res) => {
  res.json(await allegatoRepo.listBySpesa(req.params.id));
}));

speseProprietariRouter.post("/:id/allegati", up.array("files", 20), h(async (req, res) => {
  const files = req.files;
  if (!files?.length) return res.status(400).json({ error: "Nessun file" });

  const results = [];
  for (const file of files) {
    const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
    const ext  = (path.extname(file.originalname).toLowerCase() || ".pdf");
    const dups = await allegatoRepo.findDuplicates(hash, req.params.id);

    const allegato = await allegatoRepo.create(req.params.id, {
      nome_file: file.originalname,
      mime_type: file.mimetype || "application/pdf",
      estensione: ext,
      file_hash: hash,
    });
    salvaAllegato(allegato.id, ext, file.buffer);

    results.push({
      ...allegato,
      duplicati_allegati:  dups.allegati,
      duplicati_documenti: dups.documenti,
    });
  }
  res.status(201).json(results);
}));

speseProprietariRouter.get("/:id/allegati/:allegatoId", h(async (req, res) => {
  const all = await allegatoRepo.findById(req.params.allegatoId);
  if (!all || all.spesa_id !== req.params.id) return res.status(404).json({ error: "Non trovato" });
  const buf = leggiAllegato(all.id, all.estensione);
  if (!buf) return res.status(404).json({ error: "File non disponibile" });
  res.setHeader("Content-Type", all.mime_type);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(all.nome_file)}"`);
  res.send(buf);
}));

speseProprietariRouter.delete("/:id/allegati/:allegatoId", h(async (req, res) => {
  const all = await allegatoRepo.findById(req.params.allegatoId);
  if (all) {
    eliminaAllegato(all.id, all.estensione);
    await allegatoRepo.remove(all.id);
  }
  res.status(204).end();
}));
