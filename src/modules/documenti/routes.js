import { Router }       from "express";
import multer           from "multer";
import { h }            from "../../shared/middleware.js";
import * as docRepo     from "./repo.js";
import * as appRepo     from "../anagrafica/appartamentiRepo.js";
import { tipiSpesaRepo } from "../anagrafica/tipiSpesaRepo.js";
import { extract }      from "./extractor.js";
import { salvaPdf, leggiPdf, eliminaPdf } from "../../shared/storage.js";

const up = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE) || 20971520 },
});

export const documentiRouter = Router();

documentiRouter.get("/stats",         h(async (_, r) => r.json(await docRepo.stats())));
documentiRouter.get("/buchi-utenze",  h(async (q, r) => {
  const { periodoDA, periodoA } = q.query;
  r.json(await docRepo.verificaBuchiUtenze(periodoDA || null, periodoA || null));
}));
documentiRouter.get("/",      h(async (q, r) => r.json(await docRepo.listAll(q.query))));
documentiRouter.get("/:id",   h(async (q, r) => {
  const d = await docRepo.findById(q.params.id);
  return d ? r.json(d) : r.status(404).json({ error: "Non trovato" });
}));
documentiRouter.get("/:id/audit", h(async (q, r) => r.json(await docRepo.getAuditLog(q.params.id))));
documentiRouter.get("/:id/pdf",   h(async (q, r) => {
  const buf = leggiPdf(q.params.id);
  if (!buf) return r.status(404).json({ error: "PDF non disponibile" });
  r.setHeader("Content-Type", "application/pdf");
  r.setHeader("Content-Disposition", "inline");
  r.send(buf);
}));

documentiRouter.post("/extract", up.single("file"), h(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nessun file" });

  const apps = await appRepo.listAll();
  const tipi = await tipiSpesaRepo.listAll();

  const e = await extract(req.file.buffer, req.file.originalname, {
    appartamenti: apps.map(a => ({ id: a.id, nome: a.nome, via: a.via || "", citta: a.citta || "" })),
    tipi:         tipi.map(t => t.descrizione),
  });

  const tipoObj = tipi.find(t => t.descrizione === e.tipo_descrizione);
  const appObj  = apps.find(a => a.id === e.appartamento_id || a.nome === e.appartamento_nome);
  const dupId   = e.file_hash ? await docRepo.existsByHash(e.file_hash) : null;
  const campiOk = e.periodo_da && e.importo != null && appObj && tipoObj;
  const stato   = dupId ? "duplicato" : campiOk ? "elaborato" : "da_verificare";

  const doc = await docRepo.create({
    ...e,
    appartamento_id: appObj?.id  || null,
    tipo_spesa_id:   tipoObj?.id || null,
    stato,
  });
  salvaPdf(doc.id, req.file.buffer);

  res.status(201).json({
    ...doc,
    tipo_descrizione:  e.tipo_descrizione,
    appartamento_nome: appObj?.nome || null,
    duplicato_di:      dupId,
    pdf_base64:        req.file.buffer.toString("base64"),
    pdf_disponibile:   true,
  });
}));

documentiRouter.post("/",    h(async (q, r) => r.status(201).json(await docRepo.create(q.body))));
documentiRouter.put("/:id",  h(async (q, r) => {
  const prev = await docRepo.findById(q.params.id);
  r.json(await docRepo.update(q.params.id, q.body, prev));
}));
documentiRouter.delete("/:id", h(async (q, r) => {
  eliminaPdf(q.params.id);
  await docRepo.remove(q.params.id);
  r.status(204).end();
}));
