import { Router } from "express";
import multer     from "multer";
import { h }      from "../../shared/middleware.js";
import {
  parseFile, matchRows,
  listRegole, upsertRegola, updateRegola, deleteRegola,
} from "./importatore.js";
import { query } from "../../shared/db/pool.js";

export const importazioneRouter = Router();

const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── POST /api/importazione/parse ──────────────────────────────────────────────
// Accetta un file (PDF/Excel/CSV), restituisce le righe matchate + lista appartamenti

importazioneRouter.post("/parse", up.single("file"), h(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nessun file caricato" });
  const righe = await parseFile(req.file.buffer, req.file.originalname);
  if (!righe.length) return res.json({ righe: [], appartamenti: [] });
  const result = await matchRows(righe);
  res.json(result);
}));

// ── POST /api/importazione/import ─────────────────────────────────────────────
// Salva le righe selezionate come movimenti

importazioneRouter.post("/import", h(async (req, res) => {
  const { righe } = req.body;
  if (!Array.isArray(righe) || !righe.length)
    return res.status(400).json({ error: "Nessuna riga da importare" });

  let salvati = 0;
  const errori = [];

  for (const r of righe) {
    try {
      const importo = parseFloat(r.importo || 0);
      if (!importo) continue;
      const segno   = parseInt(r.segno) || 1;
      await query(
        `INSERT INTO movimenti
           (appartamento_id, componente_id, tipo, segno, periodicita,
            importo, validita_da, data_versamento, mese_riferimento,
            descrizione, tipo_versamento, incassato_da_proprietario_id)
         VALUES ($1,$2,'Versamento',$3,'una_tantum',$4,$5,$6,$7,$8,$9,$10)`,
        [
          r.appartamento_id                || null,
          r.componente_id                  || null,
          segno,
          importo,
          r.data                           || null,
          r.data                           || null,
          r.mese_riferimento               || null,
          r.descrizione_raw                || null,
          r.tipo_versamento                || "affitto",
          r.incassato_da_proprietario_id   || null,
        ]
      );
      salvati++;
    } catch (e) {
      errori.push({ riga: r.descrizione_raw, errore: e.message });
    }
  }

  res.json({ salvati, errori });
}));

// ── POST /api/importazione/check-duplicati ────────────────────────────────────
// Per ogni riga selezionata verifica se esiste già un movimento simile

importazioneRouter.post("/check-duplicati", h(async (req, res) => {
  const { righe } = req.body;
  if (!Array.isArray(righe) || !righe.length) return res.json([]);

  const results = await Promise.all(righe.map(async (r, i) => {
    const importo = parseFloat(r.importo || 0);
    if (!importo) return { idx: i, duplicati: [] };

    const segno  = parseInt(r.segno) || 1;
    const conds  = [];
    const params = [importo, segno];
    let   n      = 3;

    if (r.data && r.appartamento_id) {
      conds.push(`(m.data_versamento = $${n++} AND m.appartamento_id = $${n++}::uuid)`);
      params.push(r.data, r.appartamento_id);
    }
    if (r.mese_riferimento && r.componente_id) {
      conds.push(`(m.mese_riferimento = $${n++} AND m.componente_id = $${n++}::uuid)`);
      params.push(r.mese_riferimento, r.componente_id);
    }

    if (!conds.length) return { idx: i, duplicati: [] };

    const rows = await query(`
      SELECT m.id, m.importo, m.segno, m.data_versamento, m.mese_riferimento,
             m.descrizione, a.nome AS app_nome,
             COALESCE(c.cognome || ' ' || c.nome, '') AS comp_nome
      FROM   movimenti m
      LEFT   JOIN appartamenti a ON a.id = m.appartamento_id
      LEFT   JOIN componenti   c ON c.id = m.componente_id
      WHERE  m.importo = $1 AND m.segno = $2
        AND  (${conds.join(" OR ")})
      LIMIT  3
    `, params);

    return { idx: i, duplicati: rows };
  }));

  res.json(results);
}));

// ── GET /api/importazione/regole ─────────────────────────────────────────────

importazioneRouter.get("/regole", h(async (_, res) => {
  res.json(await listRegole());
}));

// ── POST /api/importazione/regole ────────────────────────────────────────────

importazioneRouter.post("/regole", h(async (req, res) => {
  res.json(await upsertRegola(req.body));
}));

// ── PUT /api/importazione/regole/:id ─────────────────────────────────────────

importazioneRouter.put("/regole/:id", h(async (req, res) => {
  res.json(await updateRegola(req.params.id, req.body));
}));

// ── DELETE /api/importazione/regole/:id ──────────────────────────────────────

importazioneRouter.delete("/regole/:id", h(async (req, res) => {
  await deleteRegola(req.params.id);
  res.status(204).end();
}));
