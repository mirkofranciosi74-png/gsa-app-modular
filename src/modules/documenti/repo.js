import { query } from "../../shared/db/pool.js";
import pool from "../../shared/db/pool.js";

// ─────────────────────────────────────────────────────────────────────────────
// LETTURA
// ─────────────────────────────────────────────────────────────────────────────

export async function listAll({ appartamentoId, periodoDA, periodoA, tipo, stato } = {}) {
  const conds = ["1=1"], p = [];
  let i = 1;
  if (appartamentoId) { conds.push(`d.appartamento_id=$${i++}`); p.push(appartamentoId); }
  if (periodoDA)      { conds.push(`d.periodo_a>=$${i++}`);      p.push(periodoDA); }
  if (periodoA)       { conds.push(`d.periodo_da<=$${i++}`);     p.push(periodoA); }
  if (stato)          { conds.push(`d.stato=$${i++}`);           p.push(stato); }
  if (tipo)           { conds.push(`ts.descrizione=$${i++}`);    p.push(tipo); }

  return query(
    `SELECT d.*,
            a.nome  AS appartamento_nome,
            ts.descrizione AS tipo_descrizione,
            (SELECT aa.documento_id
             FROM   archivio_associazioni aa
             WHERE  aa.entita_tipo = 'spesa'
               AND  aa.entita_id   = d.id
             LIMIT  1) AS archivio_doc_id
     FROM   documenti d
     LEFT JOIN appartamenti a  ON a.id  = d.appartamento_id
     LEFT JOIN tipi_spesa   ts ON ts.id = d.tipo_spesa_id
     WHERE  ${conds.join(" AND ")}
     ORDER  BY d.periodo_da DESC, d.created_at DESC`,
    p
  );
}

export async function findById(id) {
  const rows = await query(
    `SELECT d.*,
            a.nome  AS appartamento_nome,
            ts.descrizione AS tipo_descrizione
     FROM   documenti d
     LEFT JOIN appartamenti a  ON a.id  = d.appartamento_id
     LEFT JOIN tipi_spesa   ts ON ts.id = d.tipo_spesa_id
     WHERE  d.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function existsByHash(hash) {
  const rows = await query(
    `SELECT id FROM documenti WHERE file_hash = $1 LIMIT 1`, [hash]
  );
  return rows[0]?.id || null;
}

export async function stats() {
  const rows = await query(
    `SELECT
       COUNT(*) FILTER (WHERE stato = 'elaborato')     AS elaborati,
       COUNT(*) FILTER (WHERE stato = 'da_verificare') AS da_verificare,
       COUNT(*) FILTER (WHERE stato = 'errore')        AS errori,
       COUNT(*) FILTER (WHERE stato = 'duplicato')     AS duplicati,
       COALESCE(SUM(importo) FILTER (WHERE stato = 'elaborato'), 0) AS totale_spese
     FROM documenti`
  );
  return rows[0];
}

export async function getAuditLog(docId) {
  return query(
    `SELECT * FROM documenti_audit
     WHERE documento_id = $1
     ORDER BY created_at DESC`,
    [docId]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRITTURA
// ─────────────────────────────────────────────────────────────────────────────

export async function create(doc) {
  const rows = await query(
    `INSERT INTO documenti
       (nome_file, appartamento_id, tipo_spesa_id,
        file_hash, fornitore, numero_doc,
        importo, periodo_da, periodo_a,
        stato, metodo_estrazione, confidenza, note_ai, validato,
        pagato_da_proprietario_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      doc.nome_file?.trim()              || null,
      doc.appartamento_id                || null,
      doc.tipo_spesa_id                  || null,
      doc.file_hash                      || null,
      doc.fornitore                      || null,
      doc.numero_doc                     || null,
      doc.importo                        ?? null,
      doc.periodo_da                     || null,
      doc.periodo_a                      || null,
      doc.stato                          || "da_verificare",
      doc.metodo_estrazione              || null,
      doc.confidenza                     ?? null,
      doc.note_ai                        || null,
      doc.validato                       ?? false,
      doc.pagato_da_proprietario_id      || null,
    ]
  );
  return rows[0];
}

export async function update(id, doc, prev = null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const res = await client.query(
      `UPDATE documenti
       SET nome_file                  = $1,
           appartamento_id            = $2,
           tipo_spesa_id              = $3,
           fornitore                  = $4,
           numero_doc                 = $5,
           importo                    = $6,
           periodo_da                 = $7,
           periodo_a                  = $8,
           stato                      = $9,
           validato                   = $10,
           pagato_da_proprietario_id  = $11
       WHERE id = $12
       RETURNING *`,
      [
        doc.nome_file?.trim()           || null,
        doc.appartamento_id             || null,
        doc.tipo_spesa_id               || null,
        doc.fornitore                   || null,
        doc.numero_doc                  || null,
        doc.importo                     ?? null,
        doc.periodo_da                  || null,
        doc.periodo_a                   || null,
        doc.stato                       || "da_verificare",
        doc.validato                    ?? false,
        doc.pagato_da_proprietario_id   || null,
        id,
      ]
    );

    const updated = res.rows[0];
    if (!updated) throw new Error(`Documento ${id} non trovato`);

    // Audit log — registra ogni campo modificato
    if (prev) {
      const campi = [
        "nome_file", "appartamento_id", "tipo_spesa_id",
        "fornitore", "numero_doc", "importo",
        "periodo_da", "periodo_a", "stato",
      ];
      for (const campo of campi) {
        const da = String(prev[campo] ?? "");
        const a  = String(doc[campo]  ?? "");
        if (da !== a) {
          await client.query(
            `INSERT INTO documenti_audit (documento_id, campo, valore_da, valore_a)
             VALUES ($1,$2,$3,$4)`,
            [id, campo, da, a]
          );
        }
      }
    }

    await client.query("COMMIT");
    return updated;

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function remove(id) {
  await query(`DELETE FROM documenti WHERE id = $1`, [id]);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLI INTEGRITÀ
// ─────────────────────────────────────────────────────────────────────────────

function _nextMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return m === 12
    ? `${y + 1}-01`
    : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * Rileva buchi nel range temporale delle utenze per appartamento.
 * Restituisce array di { appartamento_id, appartamento_nome,
 *   tipo_spesa_id, tipo_descrizione, periodoMin, periodoMax, gaps[] }
 */
export async function verificaBuchiUtenze(periodoDA = null, periodoA = null) {
  const conds = [
    "ts.categoria = 'Utenza'",
    "d.periodo_da IS NOT NULL",
    "d.stato NOT IN ('duplicato','errore')",
  ];
  const p = [];
  let i = 1;
  if (periodoDA) { conds.push(`COALESCE(d.periodo_a, d.periodo_da) >= $${i++}`); p.push(periodoDA); }
  if (periodoA)  { conds.push(`d.periodo_da <= $${i++}`); p.push(periodoA); }

  const rows = await query(
    `SELECT d.appartamento_id,
            a.nome                                      AS appartamento_nome,
            d.tipo_spesa_id,
            ts.descrizione                              AS tipo_descrizione,
            d.periodo_da,
            COALESCE(d.periodo_a, d.periodo_da)        AS periodo_a
     FROM   documenti d
     JOIN   appartamenti a  ON a.id  = d.appartamento_id
     JOIN   tipi_spesa   ts ON ts.id = d.tipo_spesa_id
     WHERE  ${conds.join(" AND ")}
     ORDER  BY d.appartamento_id, d.tipo_spesa_id, d.periodo_da`,
    p
  );

  // Raggruppa per (appartamento, tipo_spesa)
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.appartamento_id}__${row.tipo_spesa_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        appartamento_id:   row.appartamento_id,
        appartamento_nome: row.appartamento_nome,
        tipo_spesa_id:     row.tipo_spesa_id,
        tipo_descrizione:  row.tipo_descrizione,
        docs: [],
      });
    }
    groups.get(key).docs.push({ da: row.periodo_da, a: row.periodo_a });
  }

  const result = [];
  for (const g of groups.values()) {
    const covered = new Set();
    for (const doc of g.docs) {
      let m = doc.da;
      while (m <= doc.a) {
        covered.add(m);
        m = _nextMonth(m);
      }
    }
    if (covered.size === 0) continue;

    const sorted = [...covered].sort();
    const start  = sorted[0];
    const end    = sorted[sorted.length - 1];

    const gaps = [];
    let m = start;
    while (m <= end) {
      if (!covered.has(m)) gaps.push(m);
      m = _nextMonth(m);
    }

    if (gaps.length > 0) {
      result.push({
        appartamento_id:   g.appartamento_id,
        appartamento_nome: g.appartamento_nome,
        tipo_spesa_id:     g.tipo_spesa_id,
        tipo_descrizione:  g.tipo_descrizione,
        periodoMin:        start,
        periodoMax:        end,
        gaps,
      });
    }
  }

  return result;
}
