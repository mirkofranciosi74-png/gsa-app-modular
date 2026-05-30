import { Router }       from "express";
import multer           from "multer";
import crypto           from "crypto";
import { h }            from "../../shared/middleware.js";
import * as docRepo     from "./repo.js";
import * as appRepo     from "../anagrafica/appartamentiRepo.js";
import { tipiSpesaRepo } from "../anagrafica/tipiSpesaRepo.js";
import { extract }      from "../../shared/extractor.js";
import { salvaPdf, leggiPdf, eliminaPdf, pdfEsiste } from "../../shared/storage.js";
import { query }        from "../../shared/db/pool.js";
import { regolaAttiva, calcolaQuote } from "../contabilita/ripartiRepo.js";

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
documentiRouter.get("/", h(async (q, r) => {
  const docs = await docRepo.listAll(q.query);
  r.json(docs.map(d => ({ ...d, pdf_disponibile: pdfEsiste(d.id) })));
}));
documentiRouter.get("/:id",   h(async (q, r) => {
  const d = await docRepo.findById(q.params.id);
  if (!d) return r.status(404).json({ error: "Non trovato" });
  return r.json({ ...d, pdf_disponibile: pdfEsiste(q.params.id) });
}));
documentiRouter.get("/:id/audit", h(async (q, r) => r.json(await docRepo.getAuditLog(q.params.id))));
documentiRouter.get("/:id/riparto", h(async (req, res) => {
  const doc = await docRepo.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: "Non trovato" });
  if (!doc.appartamento_id || !doc.periodo_da || doc.importo == null) {
    return res.json({ inquilini: [], totale: 0, regola_descrizione: null, motivo: "Dati documento incompleti" });
  }
  const mese    = String(doc.periodo_da).slice(0, 7);
  const meseFine = doc.periodo_a ? String(doc.periodo_a).slice(0, 7) : mese;
  const comps = await query(
    `SELECT c.id, c.nome, c.cognome, c.percentuale,
            (c.nome || ' ' || COALESCE(c.cognome,'')) AS label
     FROM componenti c
     WHERE c.appartamento_id = $1
       AND c.attivo = TRUE
       AND (c.validita_da IS NULL OR c.validita_da <= $3::date)
       AND (c.validita_a  IS NULL OR c.validita_a  >= $2::date)
     ORDER BY c.nome`,
    [doc.appartamento_id, mese + "-01", meseFine + "-28"]
  );
  if (!comps.length) {
    return res.json({ inquilini: [], totale: 0, regola_descrizione: null, motivo: "Nessun inquilino attivo nel periodo" });
  }
  const regola  = await regolaAttiva(doc.appartamento_id, doc.tipo_spesa_id || null, mese);
  const importo = parseFloat(doc.importo);
  const quote   = calcolaQuote(mese, importo, comps, regola);
  const inquilini = comps.map(c => ({
    id:          c.id,
    nome:        c.label,
    quota:       Math.round((quote[c.id] || 0) * 100) / 100,
    percentuale: importo > 0 ? Math.round((quote[c.id] || 0) / importo * 10000) / 100 : 0,
  }));
  res.json({
    inquilini,
    totale:              importo,
    regola_descrizione:  regola ? (regola.tipo_spesa_nome || regola.descrizione || "Regola attiva") : null,
  });
}));
documentiRouter.get("/:id/pdf",   h(async (q, r) => {
  const buf = leggiPdf(q.params.id);
  if (!buf) return r.status(404).json({ error: "PDF non disponibile" });
  r.setHeader("Content-Type", "application/pdf");
  r.setHeader("Content-Disposition", "inline");
  r.send(buf);
}));

documentiRouter.post("/check-hash", up.single("file"), h(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nessun file" });
  const hash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
  const { query } = await import("../../shared/db/pool.js");

  const dupDocumenti = await query(
    `SELECT d.id, d.nome_file, d.importo, d.data_caricamento::text AS data,
            d.fornitore, d.note_ai AS note,
            ts.descrizione AS tipo_spesa,
            a.nome AS appartamento_nome
     FROM documenti d
     JOIN appartamenti a ON a.id = d.appartamento_id
     LEFT JOIN tipi_spesa ts ON ts.id = d.tipo_spesa_id
     WHERE d.file_hash = $1
     LIMIT 3`,
    [hash]
  );

  const dupAllegati = await query(
    `SELECT sa.id, sa.nome_file, sa.spesa_id,
            sp.importo, sp.data_pagamento,
            sp.fornitore, sp.mese_competenza,
            ts.descrizione AS tipo_spesa,
            a.nome AS appartamento_nome,
            pr.nome AS proprietario_nome, pr.cognome AS proprietario_cognome
     FROM spese_proprietari_allegati sa
     JOIN spese_proprietari sp ON sp.id = sa.spesa_id
     JOIN appartamenti      a  ON a.id  = sp.appartamento_id
     LEFT JOIN tipi_spesa   ts ON ts.id = sp.tipo_spesa_id
     LEFT JOIN proprietari  pr ON pr.id = sp.proprietario_id
     WHERE sa.file_hash = $1
     LIMIT 3`,
    [hash]
  );

  res.json({ hash, duplicati_documenti: dupDocumenti, duplicati_allegati: dupAllegati });
}));

// ── POST /check-hash-global — cerca hash su tutte e tre le tabelle ─────────────
documentiRouter.post("/check-hash-global", up.single("file"), h(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nessun file" });
  const buf    = req.file.buffer;
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  const md5    = crypto.createHash("md5").update(buf).digest("hex");

  const [dupDocumenti, dupAllegati, archivioRows] = await Promise.all([
    query(
      `SELECT d.id, d.nome_file, d.importo, d.data_caricamento::text AS data,
              d.fornitore, d.note_ai AS note,
              ts.descrizione AS tipo_spesa,
              a.nome AS appartamento_nome
       FROM documenti d
       JOIN appartamenti a ON a.id = d.appartamento_id
       LEFT JOIN tipi_spesa ts ON ts.id = d.tipo_spesa_id
       WHERE d.file_hash = $1 LIMIT 3`,
      [sha256]
    ),
    query(
      `SELECT sa.id, sa.nome_file, sa.spesa_id,
              sp.descrizione AS spesa_descrizione,
              sp.importo, sp.data_pagamento, sp.validita_da,
              sp.fornitore, sp.mese_competenza,
              ts.descrizione AS tipo_spesa,
              a.nome AS appartamento_nome,
              pr.nome AS proprietario_nome, pr.cognome AS proprietario_cognome
       FROM spese_proprietari_allegati sa
       JOIN spese_proprietari sp ON sp.id = sa.spesa_id
       JOIN appartamenti      a  ON a.id  = sp.appartamento_id
       LEFT JOIN tipi_spesa   ts ON ts.id = sp.tipo_spesa_id
       LEFT JOIN proprietari  pr ON pr.id = sp.proprietario_id
       WHERE sa.file_hash = $1 LIMIT 3`,
      [sha256]
    ),
    query(
      `SELECT d.id, d.nome_file, d.created_at, t.nome AS tipo_nome
       FROM archivio_documenti d
       LEFT JOIN archivio_tipi_documento t ON t.id = d.tipo_documento_id
       WHERE d.file_hash = $1 LIMIT 5`,
      [md5]
    ),
  ]);

  let dupArchivio = archivioRows;
  if (archivioRows.length) {
    const ids = archivioRows.map(r => r.id);
    const assocs = await query(
      `SELECT aa.documento_id, aa.entita_tipo, aa.entita_id,
              COALESCE(a.nome, c.nome||' '||COALESCE(c.cognome,''),
                       pr.nome||' '||COALESCE(pr.cognome,'')) AS entita_nome
       FROM archivio_associazioni aa
       LEFT JOIN appartamenti a  ON aa.entita_tipo='appartamento' AND a.id=aa.entita_id
       LEFT JOIN componenti   c  ON aa.entita_tipo='inquilino'    AND c.id=aa.entita_id
       LEFT JOIN proprietari  pr ON aa.entita_tipo='proprietario' AND pr.id=aa.entita_id
       WHERE aa.documento_id = ANY($1)`,
      [ids]
    );
    const assocMap = {};
    for (const a of assocs) {
      if (!assocMap[a.documento_id]) assocMap[a.documento_id] = [];
      assocMap[a.documento_id].push(a);
    }
    dupArchivio = archivioRows.map(r => ({ ...r, associazioni: assocMap[r.id] || [] }));
  }

  res.json({
    hash:                sha256,
    duplicati_documenti: dupDocumenti,
    duplicati_allegati:  dupAllegati,
    duplicati_archivio:  dupArchivio,
  });
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

// Carica o sostituisce il PDF di una spesa esistente (senza estrarre dati)
documentiRouter.post("/:id/pdf", up.single("file"), h(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nessun file" });
  const doc = await docRepo.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: "Non trovato" });

  const hash  = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
  const dupId = await docRepo.existsByHash(hash, req.params.id);

  salvaPdf(req.params.id, req.file.buffer);
  await docRepo.updateFileHash(req.params.id, hash);

  res.json({ ok: true, pdf_disponibile: true, duplicato_di: dupId || null });
}));

documentiRouter.delete("/:id/pdf", h(async (req, res) => {
  eliminaPdf(req.params.id);
  await docRepo.updateFileHash(req.params.id, null);
  res.json({ ok: true, pdf_disponibile: false });
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
