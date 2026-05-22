import { Router }   from "express";
import multer        from "multer";
import { createHash } from "crypto";
import { h }         from "../../shared/middleware.js";
import * as repo     from "./repo.js";
import { salvaArchivio, leggiArchivio, eliminaArchivio } from "../../shared/storage.js";

const up = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE) || 20971520 },
});

// ── TIPI DOCUMENTO ────────────────────────────────────────────────────────────
export const archivioTipiRouter = Router();

archivioTipiRouter.get("/",       h(async (_, r)  => r.json(await repo.listTipi())));
archivioTipiRouter.post("/",      h(async (q, r)  => r.status(201).json(await repo.createTipo(q.body))));
archivioTipiRouter.put("/:id",    h(async (q, r)  => r.json(await repo.updateTipo(q.params.id, q.body))));
archivioTipiRouter.delete("/:id", h(async (q, r)  => {
  await repo.deleteTipo(q.params.id);
  r.status(204).end();
}));

// ── DOCUMENTI ARCHIVIO ────────────────────────────────────────────────────────
export const archivioRouter = Router();

archivioRouter.get("/", h(async (q, r) => {
  const { tipoId, entitaTipo, entitaId } = q.query;
  r.json(await repo.listDocumenti({ tipoId, entitaTipo, entitaId }));
}));
archivioRouter.get("/:id", h(async (q, r) => {
  const d = await repo.getDocumento(q.params.id);
  return d ? r.json(d) : r.status(404).json({ error: "Non trovato" });
}));
archivioRouter.get("/:id/file", h(async (q, r) => {
  const d = await repo.getDocumento(q.params.id);
  if (!d) return r.status(404).json({ error: "Non trovato" });
  const buf = leggiArchivio(d.id, d.estensione || "");
  if (!buf) return r.status(404).json({ error: "File non disponibile" });
  r.setHeader("Content-Type", d.mime_type || "application/octet-stream");
  r.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(d.nome_file)}"`);
  r.send(buf);
}));
archivioRouter.post("/upload", up.single("file"), h(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nessun file" });
  const { tipo_documento_id, note } = req.body;
  const assocs = req.body.associazioni ? JSON.parse(req.body.associazioni) : [];
  const ext    = "." + (req.file.originalname.split(".").pop() || "bin");
  const hash   = createHash("md5").update(req.file.buffer).digest("hex");
  const doc    = await repo.createDocumento({
    tipo_documento_id: tipo_documento_id || null,
    nome_file:  req.file.originalname,
    file_hash:  hash, mime_type: req.file.mimetype, estensione: ext, note: note || null,
  });
  salvaArchivio(doc.id, ext, req.file.buffer);
  if (assocs.length) await repo.setAssociazioni(doc.id, assocs);
  res.status(201).json(await repo.getDocumento(doc.id));
}));
archivioRouter.put("/:id", h(async (q, r) => {
  const { tipo_documento_id, note, associazioni, nome_file } = q.body;
  const d = await repo.updateDocumento(q.params.id, { tipo_documento_id, note, nome_file });
  if (!d) return r.status(404).json({ error: "Non trovato" });
  if (associazioni !== undefined) await repo.setAssociazioni(q.params.id, associazioni);
  r.json(await repo.getDocumento(q.params.id));
}));
archivioRouter.delete("/:id", h(async (q, r) => {
  const ext = await repo.deleteDocumento(q.params.id);
  eliminaArchivio(q.params.id, ext);
  r.status(204).end();
}));
