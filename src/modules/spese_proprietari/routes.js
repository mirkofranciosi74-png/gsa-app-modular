import { Router } from "express";
import multer      from "multer";
import crypto      from "crypto";
import path        from "path";
import { h }       from "../../shared/middleware.js";
import * as repo   from "./repo.js";
import * as allegatoRepo from "./allegatoRepo.js";
import { salvaPdf, leggiPdf, eliminaPdf, pdfEsiste,
         salvaAllegato, leggiAllegato, eliminaAllegato } from "../../shared/storage.js";
import { query }            from "../../shared/db/pool.js";
import { regolaAttivaProp, calcolaQuoteProp } from "../contabilita/ripartiRepo.js";
import { extract }          from "../../shared/extractor.js";
import * as appRepo         from "../anagrafica/appartamentiRepo.js";
import { tipiSpesaRepo }    from "../anagrafica/tipiSpesaRepo.js";

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

speseProprietariRouter.get("/:id/audit", h(async (req, res) => {
  res.json(await repo.getAuditLog(req.params.id));
}));

speseProprietariRouter.get("/:id/riparto", h(async (req, res) => {
  const rows = await query(
    `SELECT s.*, ts.descrizione AS tipo_spesa_nome
     FROM spese_proprietari s
     LEFT JOIN tipi_spesa ts ON ts.id = s.tipo_spesa_id
     WHERE s.id = $1`,
    [req.params.id]
  );
  const spesa = rows[0];
  if (!spesa) return res.status(404).json({ error: "Non trovato" });

  const mese = spesa.mese_competenza
    ? String(spesa.mese_competenza).slice(0, 7)
    : spesa.data_pagamento
    ? String(spesa.data_pagamento).slice(0, 7)
    : spesa.validita_da
    ? String(spesa.validita_da).slice(0, 7)
    : null;

  if (!mese || !spesa.appartamento_id || spesa.importo == null) {
    return res.json({ proprietari: [], totale: 0, regola_descrizione: null, motivo: "Dati spesa incompleti" });
  }

  const props = await query(
    `SELECT ap.proprietario_id, p.nome, p.cognome, ap.percentuale_proprieta
     FROM appartamento_proprietari ap
     JOIN proprietari p ON p.id = ap.proprietario_id
     WHERE ap.appartamento_id = $1
       AND ap.data_inizio <= $2::date
       AND (ap.data_fine IS NULL OR ap.data_fine >= $2::date)
     ORDER BY p.cognome, p.nome`,
    [spesa.appartamento_id, mese + "-01"]
  );

  if (!props.length) {
    return res.json({ proprietari: [], totale: 0, regola_descrizione: null, motivo: "Nessun proprietario attivo" });
  }

  const regola  = await regolaAttivaProp(spesa.appartamento_id, spesa.tipo_spesa_id || null, mese);
  const importo = parseFloat(spesa.importo);
  const quote   = calcolaQuoteProp(importo, props, regola);

  const proprietari = props.map(p => ({
    id:           p.proprietario_id,
    nome:         p.nome + (p.cognome ? " " + p.cognome : ""),
    quota_teorica: Math.round((quote[p.proprietario_id] || 0) * 100) / 100,
    percentuale:  importo > 0 ? Math.round((quote[p.proprietario_id] || 0) / importo * 10000) / 100 : 0,
  }));

  res.json({
    proprietari,
    totale:             importo,
    regola_descrizione: regola ? (regola.tipo_spesa_nome || regola.descrizione || "Regola attiva") : null,
  });
}));

// ── Estrazione dati da PDF (pre-compila il form) ──────────────────────────────
speseProprietariRouter.post("/extract", up.single("file"), h(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nessun file" });

  const [apps, tipi] = await Promise.all([
    appRepo.listAll(),
    tipiSpesaRepo.listAll(),
  ]);

  const e = await extract(req.file.buffer, req.file.originalname, {
    appartamenti: apps.map(a => ({ id: a.id, nome: a.nome, via: a.via || "", citta: a.citta || "" })),
    tipi:         tipi.map(t => t.descrizione),
  });

  const tipoObj = tipi.find(t => t.descrizione === e.tipo_descrizione);
  const mese    = e.periodo_da ? String(e.periodo_da).slice(0, 7) : null;

  res.json({
    importo:            e.importo,
    fornitore:          e.fornitore,
    numero_fattura:     e.numero_doc,
    mese_competenza:    mese,
    tipo_spesa_id:      tipoObj?.id    || null,
    tipo_descrizione:   e.tipo_descrizione,
    appartamento_id:    (e.match_score != null && e.match_score >= 0.6) ? e.appartamento_id : null,
    appartamento_nome:  e.appartamento_nome,
    match_score:        e.match_score,
    confidenza:         e.confidenza,
    metodo_estrazione:  e.metodo_estrazione,
    nome_file:          e.nome_file,
  });
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
