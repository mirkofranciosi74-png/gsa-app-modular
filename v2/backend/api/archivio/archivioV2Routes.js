import { Router }    from "express";
import multer         from "multer";
import { createHash } from "crypto";
import { h }          from "../../shared/middleware.js";
import { requireRole } from "../../shared/authMiddleware.js";
import * as repo      from "../../infrastructure/persistence/postgres/ArchivioV2Repository.js";
import { salvaArchivio, leggiArchivio, eliminaArchivio } from "../../shared/storage.js";
import { query } from "../../shared/db/pool.js";

const up = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: Number(process.env.MAX_FILE_SIZE) || 20971520 },
});

// ── Tipi documento ────────────────────────────────────────────────────────────
export const archivioV2TipiRouter = Router();

archivioV2TipiRouter.get("/",    h(async (_, r)  => r.json(await repo.listTipi())));
archivioV2TipiRouter.post("/",   requireRole("admin"), h(async (q, r) => r.status(201).json(await repo.createTipo(q.body))));
archivioV2TipiRouter.put("/:id", requireRole("admin"), h(async (q, r) => r.json(await repo.updateTipo(q.params.id, q.body))));
archivioV2TipiRouter.delete("/:id", requireRole("admin"), h(async (q, r) => {
  await repo.deleteTipo(q.params.id);
  r.status(204).end();
}));

// ── Documenti ─────────────────────────────────────────────────────────────────
export const archivioV2Router = Router();

archivioV2Router.get("/", h(async (q, r) => {
  const { tipoId, entitaTipo, entitaId } = q.query;
  r.json(await repo.listDocumenti({ tipoId, entitaTipo, entitaId }));
}));

archivioV2Router.get("/:id", h(async (q, r) => {
  const d = await repo.getDocumento(q.params.id);
  return d ? r.json(d) : r.status(404).json({ error: "Non trovato" });
}));

archivioV2Router.get("/:id/file", h(async (q, r) => {
  const d = await repo.getDocumento(q.params.id);
  if (!d) return r.status(404).json({ error: "Non trovato" });
  const buf = leggiArchivio(d.id, d.estensione || "");
  if (!buf) return r.status(404).json({ error: "File non disponibile" });
  r.setHeader("Content-Type", d.mime_type || "application/octet-stream");
  r.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(d.nome_file)}"`);
  r.send(buf);
}));

archivioV2Router.post("/check-hash", up.single("file"), h(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nessun file" });
  const hash = createHash("md5").update(req.file.buffer).digest("hex");

  const rows = await query(
    `SELECT d.id, d.nome_file, d.created_at, t.nome AS tipo_nome
     FROM v2.archivio_documento d
     LEFT JOIN v2.archivio_tipo_documento t ON t.id = d.tipo_documento_id
     WHERE d.file_hash = $1 LIMIT 5`,
    [hash]
  );
  if (!rows.length) return res.json({ hash, duplicati: [] });

  const ids    = rows.map(r => r.id);
  const assocs = await query(
    `SELECT aa.documento_id, aa.entita_tipo, aa.entita_id,
            COALESCE(im.nome, COALESCE(pe.cognome||' '||pe.nome, pe.ragione_sociale)) AS entita_nome
     FROM v2.archivio_associazione aa
     LEFT JOIN v2.immobile im ON aa.entita_tipo='immobile' AND im.id=aa.entita_id
     LEFT JOIN v2.persona  pe ON aa.entita_tipo='persona'  AND pe.id=aa.entita_id
     WHERE aa.documento_id = ANY($1)`,
    [ids]
  );
  const assocMap = {};
  for (const a of assocs) {
    if (!assocMap[a.documento_id]) assocMap[a.documento_id] = [];
    assocMap[a.documento_id].push(a);
  }
  res.json({ hash, duplicati: rows.map(r => ({ ...r, associazioni: assocMap[r.id] || [] })) });
}));

archivioV2Router.post("/upload", up.single("file"), h(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nessun file" });
  const { tipo_documento_id, note, validita_da, validita_a } = req.body;
  const assocs  = req.body.associazioni ? JSON.parse(req.body.associazioni) : [];
  const ext     = "." + (req.file.originalname.split(".").pop() || "bin");
  const hash    = createHash("md5").update(req.file.buffer).digest("hex");
  const doc     = await repo.createDocumento({
    tipo_documento_id: tipo_documento_id || null,
    nome_file: req.file.originalname,
    file_hash: hash, mime_type: req.file.mimetype, estensione: ext,
    note: note || null, validita_da: validita_da || null, validita_a: validita_a || null,
  });
  salvaArchivio(doc.id, ext, req.file.buffer);
  if (assocs.length) await repo.setAssociazioni(doc.id, assocs);
  res.status(201).json(await repo.getDocumento(doc.id));
}));

archivioV2Router.put("/:id", h(async (q, r) => {
  const { tipo_documento_id, note, associazioni, nome_file, validita_da, validita_a } = q.body;
  const d = await repo.updateDocumento(q.params.id, { tipo_documento_id, note, nome_file, validita_da, validita_a });
  if (!d) return r.status(404).json({ error: "Non trovato" });
  if (associazioni !== undefined) await repo.setAssociazioni(q.params.id, associazioni);
  r.json(await repo.getDocumento(q.params.id));
}));

archivioV2Router.delete("/:id", h(async (q, r) => {
  const ext = await repo.deleteDocumento(q.params.id);
  eliminaArchivio(q.params.id, ext);
  r.status(204).end();
}));
