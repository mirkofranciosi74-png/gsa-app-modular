/**
 * Importazione estratto conto v2 — parse + match + check duplicati + regole.
 * Riutilizza il parser v1 (parseFile) ma matcha contro tabelle v2 (immobile, ruolo_persona).
 * L'import vero lo esegue il frontend riga per riga via POST /fatti.
 */

import { Router }  from "express";
import multer      from "multer";
import Fuse        from "fuse.js";
import { h }       from "../../shared/middleware.js";
import { requireRole } from "../../shared/authMiddleware.js";
import { query }   from "../../shared/db/pool.js";
import { parseFile } from "../../modules/importazione/importatore.js";

const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function norm(s) {
  return (s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// ── Match intelligente contro tabelle v2 ──────────────────────────────────────
async function matchRowsV2(righe) {
  const [immobiliRows, regole] = await Promise.all([
    loadImmobiliConPersone(),
    query(`
      SELECT ri.*, i.nome AS immobile_nome,
             COALESCE(p.cognome || ' ' || p.nome, p.ragione_sociale) AS persona_nome,
             ts.descrizione AS tipo_spesa_desc
      FROM v2.regola_importazione ri
      LEFT JOIN v2.immobile  i  ON i.id  = ri.immobile_id
      LEFT JOIN v2.persona   p  ON p.id  = ri.persona_id
      LEFT JOIN tipi_spesa   ts ON ts.id = ri.tipo_spesa_id
      ORDER BY ri.uso_count DESC, LENGTH(ri.stringa) DESC
    `),
  ]);

  // Lista flat persone per search
  const tuttePersone = [];
  for (const imm of immobiliRows) {
    for (const p of (imm.persone || [])) {
      if (!p.id) continue;
      tuttePersone.push({
        _id:       String(p.id),
        _immId:    String(imm.id),
        cognome:   p.cognome || "",
        nome:      p.nome    || "",
        ragione:   p.ragione_sociale || "",
        _cognome:  norm(p.cognome || ""),
        _nome:     norm(p.nome    || ""),
        _ragione:  norm(p.ragione_sociale || ""),
      });
    }
  }

  const fuseImm = new Fuse(immobiliRows, {
    keys: [{ name: "nome", weight: 1 }], threshold: 0.4, includeScore: true,
  });

  function detectMese(desc, data) {
    const MESI = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
    const t = norm(desc || "");
    for (const [i, m] of MESI.entries()) {
      const mm = String(i + 1).padStart(2, "0");
      const re = new RegExp(`\\b${m}(\\.|naio|bbraio|zo|ile|gio|gno|glio|osto|tembre|obre|vembre|cembre)?\\b`);
      if (re.test(t)) {
        const y = data?.slice(0, 4) || new Date().getFullYear().toString();
        return `${y}-${mm}`;
      }
    }
    return data ? data.slice(0, 7) : null;
  }

  const result = righe.map(riga => {
    const desc = norm(riga.descrizione_raw);
    let immobileId = null, personaId = null, tipoSpesaId = null;
    let confidenza = 0, motivo = "", ignora = false;

    // 1 — regole salvate (match esatto su sottostringa)
    for (const r of regole) {
      if (desc.includes(norm(r.stringa))) {
        immobileId  = r.immobile_id  ? String(r.immobile_id)  : null;
        personaId   = r.persona_id   ? String(r.persona_id)   : null;
        tipoSpesaId = r.tipo_spesa_id ? String(r.tipo_spesa_id) : null;
        confidenza  = 100;
        if (r.tipo_riga === "ignora") {
          ignora = true; motivo = `Regola: ignora`;
        } else {
          motivo = `Regola: "${r.stringa}"`;
        }
        break;
      }
    }

    // 2 — ricerca per cognome (sottostringa esatta, min 3 chars)
    if (!immobileId) {
      for (const p of tuttePersone) {
        if (p._cognome.length >= 3 && desc.includes(p._cognome)) {
          immobileId = p._immId; personaId = p._id;
          confidenza = 90; motivo = `Cognome: ${p.cognome}`;
          break;
        }
      }
    }

    // 3 — ricerca per ragione sociale
    if (!immobileId) {
      for (const p of tuttePersone) {
        if (p._ragione.length >= 4 && desc.includes(p._ragione)) {
          immobileId = p._immId; personaId = p._id;
          confidenza = 85; motivo = `Ragione sociale: ${p.ragione}`;
          break;
        }
      }
    }

    // 4 — ricerca per nome (min 3 chars)
    if (!immobileId) {
      for (const p of tuttePersone) {
        if (p._nome.length >= 3 && desc.includes(p._nome)) {
          immobileId = p._immId; personaId = p._id;
          confidenza = 70; motivo = `Nome: ${p.nome}`;
          break;
        }
      }
    }

    // 5 — Fuse su nome immobile
    if (!immobileId) {
      const words = desc.split(/\s+/).filter(w => w.length >= 4);
      let bestScore = 1, bestImm = null;
      for (const w of words) {
        const hits = fuseImm.search(w);
        if (hits.length && hits[0].score < bestScore) {
          bestScore = hits[0].score; bestImm = hits[0].item;
        }
      }
      if (bestImm && bestScore < 0.35) {
        immobileId = String(bestImm.id);
        confidenza = Math.round((1 - bestScore) * 60);
        motivo = `Appartamento: ${bestImm.nome}`;
      }
    }

    return {
      ...riga,
      immobileId,
      personaId,
      tipoSpesaId,
      confidenza,
      motivo,
      periodoDa: detectMese(riga.descrizione_raw, riga.data),
      includi: !ignora && confidenza > 0,
    };
  });

  return { righe: result, immobili: immobiliRows };
}

// ── Query immobili con persone (riutilizzata da parse e da GET /immobili) ──────
async function loadImmobiliConPersone() {
  return query(`
    SELECT i.id, i.nome,
           json_agg(json_build_object(
             'id',                p.id,
             'cognome',           p.cognome,
             'nome',              p.nome,
             'ragione_sociale',   p.ragione_sociale,
             'ruolo',             rp.ruolo,
             'default_pagante',   rp.default_pagante,
             'default_incassante',rp.default_incassante
           ) ORDER BY rp.ruolo, p.cognome) FILTER (WHERE p.id IS NOT NULL) AS persone
    FROM v2.immobile i
    LEFT JOIN v2.ruolo_persona rp ON rp.immobile_id = i.id
      AND rp.ruolo IN ('inquilino','proprietario')
      AND (rp.validita_a IS NULL OR rp.validita_a >= CURRENT_DATE)
    LEFT JOIN v2.persona p ON p.id = rp.persona_id
    WHERE i.attivo = TRUE
    GROUP BY i.id, i.nome
    ORDER BY i.nome
  `);
}

// ── Router ────────────────────────────────────────────────────────────────────
export function makeImportazioneV2Routes() {
  const router = Router();

  // GET /immobili — lista immobili con persone attive (per RegoleTab)
  router.get("/immobili", h(async (_req, res) => {
    res.json(await loadImmobiliConPersone());
  }));

  // POST /parse — parse file + match automatico
  router.post("/parse", up.single("file"), h(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Nessun file caricato" });
    const righe = await parseFile(req.file.buffer, req.file.originalname);
    if (!righe.length) return res.json({ righe: [], immobili: [] });
    res.json(await matchRowsV2(righe));
  }));

  // POST /check-duplicati — verifica duplicati in fatto_economico
  router.post("/check-duplicati", h(async (req, res) => {
    const { righe } = req.body;
    if (!Array.isArray(righe) || !righe.length) return res.json([]);

    const results = await Promise.all(righe.map(async (r, i) => {
      const importo = parseFloat(r.importo || 0);
      if (!importo) return { idx: i, duplicati: [] };

      const conds  = [];
      const params = [importo];
      let   n      = 2;

      if (r.data && r.immobileId) {
        conds.push(`(fe.rif_da = $${n++}::date AND fe.immobile_id = $${n++}::uuid)`);
        params.push(r.data, r.immobileId);
      }
      if (r.periodoDa && r.personaId) {
        conds.push(`(fe.periodo_da = $${n++} AND fe.soggetto_pagante_id = $${n++}::uuid)`);
        params.push(r.periodoDa, r.personaId);
      }

      if (!conds.length) return { idx: i, duplicati: [] };

      const rows = await query(`
        SELECT fe.id, fe.importo, fe.tipo, fe.rif_da, fe.periodo_da,
               fe.nome, i.nome AS immobile_nome,
               COALESCE(p.cognome || ' ' || p.nome, p.ragione_sociale) AS persona_nome
        FROM   v2.fatto_economico fe
        LEFT   JOIN v2.immobile i ON i.id = fe.immobile_id
        LEFT   JOIN v2.persona  p ON p.id = fe.soggetto_pagante_id
        WHERE  fe.importo = $1
          AND  (${conds.join(" OR ")})
        LIMIT  3
      `, params);

      return { idx: i, duplicati: rows };
    }));

    res.json(results);
  }));

  // GET /regole
  router.get("/regole", h(async (_req, res) => {
    const rows = await query(`
      SELECT ri.*, i.nome AS immobile_nome,
             COALESCE(p.cognome || ' ' || p.nome, p.ragione_sociale) AS persona_nome,
             ts.descrizione AS tipo_spesa_desc
      FROM v2.regola_importazione ri
      LEFT JOIN v2.immobile  i  ON i.id  = ri.immobile_id
      LEFT JOIN v2.persona   p  ON p.id  = ri.persona_id
      LEFT JOIN tipi_spesa   ts ON ts.id = ri.tipo_spesa_id
      ORDER BY ri.uso_count DESC, ri.stringa
    `);
    res.json(rows);
  }));

  // POST /regole
  router.post("/regole", requireRole("admin"), h(async (req, res) => {
    const { stringa, immobileId, personaId, tipoSpesaId, tipoRiga, note } = req.body;
    if (!stringa?.trim()) return res.status(400).json({ error: "stringa obbligatoria" });
    const rows = await query(`
      INSERT INTO v2.regola_importazione (stringa, immobile_id, persona_id, tipo_spesa_id, tipo_riga, note)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (stringa) DO UPDATE
        SET immobile_id=$2, persona_id=$3, tipo_spesa_id=$4, tipo_riga=$5, note=$6,
            uso_count = v2.regola_importazione.uso_count + 1
      RETURNING *
    `, [norm(stringa), immobileId || null, personaId || null, tipoSpesaId || null, tipoRiga || null, note || null]);
    res.status(201).json(rows[0]);
  }));

  // PUT /regole/:id
  router.put("/regole/:id", requireRole("admin"), h(async (req, res) => {
    const { stringa, immobileId, personaId, tipoSpesaId, tipoRiga, note } = req.body;
    const rows = await query(`
      UPDATE v2.regola_importazione
      SET stringa=$1, immobile_id=$2, persona_id=$3, tipo_spesa_id=$4, tipo_riga=$5, note=$6
      WHERE id=$7 RETURNING *
    `, [norm(stringa), immobileId || null, personaId || null, tipoSpesaId || null, tipoRiga || null, note || null, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Regola non trovata" });
    res.json(rows[0]);
  }));

  // DELETE /regole/:id
  router.delete("/regole/:id", requireRole("admin"), h(async (req, res) => {
    await query(`DELETE FROM v2.regola_importazione WHERE id=$1`, [req.params.id]);
    res.status(204).end();
  }));

  return router;
}
