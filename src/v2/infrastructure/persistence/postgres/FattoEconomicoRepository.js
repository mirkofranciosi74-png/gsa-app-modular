import { NotFoundError } from "../../../domain/shared/DomainError.js";
import { FattoEconomico } from "../../../domain/economia/FattoEconomico.js";

/**
 * @param {import('pg').Pool} pool
 */
export function makeFattoEconomicoRepository(pool) {
  async function q(sql, params = []) {
    const client = await pool.connect();
    try   { return (await client.query(sql, params)).rows; }
    finally { client.release(); }
  }

  const BASE_SELECT = `
    SELECT fe.*,
           i.nome      AS immobile_nome,
           i.tipologia AS immobile_tipologia,
           c.nome  AS condominio_nome,
           p.nome  AS persona_nome,  p.cognome AS persona_cognome,
           sp.nome AS soggetto_pagante_nome,   sp.cognome AS soggetto_pagante_cognome,
           si.nome AS soggetto_incassante_nome, si.cognome AS soggetto_incassante_cognome,
           ts.descrizione AS tipo_spesa_desc, ts.categoria AS tipo_spesa_cat
    FROM v2.fatto_economico fe
    LEFT JOIN v2.immobile  i  ON i.id  = fe.immobile_id
    LEFT JOIN v2.condominio c ON c.id  = fe.condominio_id
    LEFT JOIN v2.persona   p  ON p.id  = fe.persona_id
    LEFT JOIN v2.persona   sp ON sp.id = fe.soggetto_pagante_id
    LEFT JOIN v2.persona   si ON si.id = fe.soggetto_incassante_id
    LEFT JOIN tipi_spesa   ts ON ts.id = fe.tipo_spesa_id
  `;

  return {
    // ── READ ──────────────────────────────────────────────────────────────────

    async list({
      immobileId, condominioId, tipo, periodoDa, periodoA,
      legacyTipo, stato, tipoSpesaId, q: query,
    } = {}) {
      const conds  = [];
      const params = [];
      const add    = (expr, val) => { params.push(val); conds.push(`${expr}$${params.length}`); };
      if (immobileId)   add("fe.immobile_id=",   immobileId);
      if (condominioId) add("fe.condominio_id=",  condominioId);
      if (tipo)         add("fe.tipo=",           tipo);
      if (legacyTipo)   add("fe.legacy_tipo=",    legacyTipo);
      if (stato)        add("fe.stato=",          stato);
      if (tipoSpesaId)  add("fe.tipo_spesa_id=",  tipoSpesaId);
      if (periodoDa) {
        params.push(periodoDa);
        conds.push(`(fe.periodo_a IS NULL OR fe.periodo_a >= $${params.length})`);
      }
      if (periodoA) {
        params.push(periodoA);
        conds.push(`(fe.periodo_da IS NULL OR fe.periodo_da <= $${params.length})`);
      }
      if (query) {
        params.push(`%${query.toLowerCase()}%`);
        conds.push(`(LOWER(fe.nome) LIKE $${params.length}
          OR LOWER(fe.descrizione) LIKE $${params.length}
          OR LOWER(fe.fornitore) LIKE $${params.length}
          OR LOWER(fe.numero_fattura) LIKE $${params.length})`);
      }
      const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
      const rows  = await q(
        `${BASE_SELECT} ${where}
         ORDER BY COALESCE(fe.data_pagamento, fe.data_evento) DESC NULLS LAST, fe.created_at DESC`,
        params
      );
      return rows.map(FattoEconomico.fromRow);
    },

    async findById(id) {
      const rows = await q(`${BASE_SELECT} WHERE fe.id = $1`, [id]);
      if (!rows[0]) throw new NotFoundError("FattoEconomico", id);
      return FattoEconomico.fromRow(rows[0]);
    },

    // ── WRITE ─────────────────────────────────────────────────────────────────

    async create(dati) {
      const rows = await q(`
        INSERT INTO v2.fatto_economico (
          immobile_id, condominio_id, persona_id, soggetto_pagante_id, soggetto_incassante_id,
          tipo, tipo_spesa_id,
          importo, segno,
          nome, descrizione, note, fornitore, numero_doc, numero_fattura,
          periodicita, stato,
          periodo_da, periodo_a, rif_da, rif_a,
          data_evento, data_pagamento,
          file_hash, file_path, nome_file, mime_type,
          legacy_tipo, legacy_id
        ) VALUES (
          $1,$2,$3,$4,$5, $6,$7, $8,$9,
          $10,$11,$12,$13,$14,$15,
          $16,$17,
          $18,$19,$20,$21, $22,$23,
          $24,$25,$26,$27,
          $28,$29
        ) RETURNING *
      `, [
        dati.immobile_id     || dati.immobileId     || null,
        dati.condominio_id   || dati.condominioId   || null,
        dati.persona_id      || dati.personaId      || null,
        dati.soggetto_pagante_id    || dati.soggettoPaganteId    || null,
        dati.soggetto_incassante_id || dati.soggettoIncassanteId || null,
        dati.tipo,
        dati.tipo_spesa_id   || dati.tipoSpesaId    || null,
        Number(dati.importo),
        dati.segno           != null ? Number(dati.segno) : 1,
        dati.nome?.trim()    || null,
        dati.descrizione?.trim() || null,
        dati.note?.trim()    || null,
        dati.fornitore?.trim() || null,
        dati.numero_doc?.trim()  || dati.numeroDoc?.trim()  || null,
        dati.numero_fattura?.trim() || dati.numeroFattura?.trim() || null,
        dati.periodicita     || "una_tantum",
        dati.stato           || "normale",
        dati.periodo_da      || dati.periodoDa      || null,
        dati.periodo_a       || dati.periodoA       || null,
        dati.rif_da          || dati.rifDa          || null,
        dati.rif_a           || dati.rifA           || null,
        dati.data_evento     || dati.dataEvento     || null,
        dati.data_pagamento  || dati.dataPagamento  || null,
        dati.file_hash       || dati.fileHash       || null,
        dati.file_path       || dati.filePath       || null,
        dati.nome_file       || dati.nomeFile       || null,
        dati.mime_type       || dati.mimeType       || "application/pdf",
        dati.legacy_tipo     || dati.legacyTipo     || null,
        dati.legacy_id       || dati.legacyId       || null,
      ]);
      return this.findById(rows[0].id);
    },

    async update(id, dati) {
      // leggi prima per avere i valori attuali da usare in COALESCE
      const rows = await q(`
        UPDATE v2.fatto_economico SET
          immobile_id             = COALESCE($1,  immobile_id),
          condominio_id           = COALESCE($2,  condominio_id),
          persona_id              = $3,
          soggetto_pagante_id     = $4,
          soggetto_incassante_id  = $5,
          tipo                    = COALESCE($6,  tipo),
          tipo_spesa_id           = $7,
          importo                 = COALESCE($8,  importo),
          segno                   = COALESCE($9,  segno),
          nome                    = $10,
          descrizione             = $11,
          note                    = $12,
          fornitore               = $13,
          numero_doc              = $14,
          numero_fattura          = $15,
          periodicita             = COALESCE($16, periodicita),
          stato                   = COALESCE($17, stato),
          periodo_da              = $18,
          periodo_a               = $19,
          rif_da                  = $20,
          rif_a                   = $21,
          data_evento             = $22,
          data_pagamento          = $23
        WHERE id = $24
        RETURNING *
      `, [
        dati.immobile_id    || dati.immobileId    || null,
        dati.condominio_id  || dati.condominioId  || null,
        dati.persona_id     || dati.personaId     || null,
        dati.soggetto_pagante_id    || dati.soggettoPaganteId    || null,
        dati.soggetto_incassante_id || dati.soggettoIncassanteId || null,
        dati.tipo            || null,
        dati.tipo_spesa_id  || dati.tipoSpesaId  || null,
        dati.importo != null ? Number(dati.importo) : null,
        dati.segno   != null ? Number(dati.segno)   : null,
        dati.nome?.trim()        ?? null,
        dati.descrizione?.trim() ?? null,
        dati.note?.trim()        ?? null,
        dati.fornitore?.trim()   ?? null,
        (dati.numero_doc    || dati.numeroDoc    || null),
        (dati.numero_fattura || dati.numeroFattura || null),
        dati.periodicita   || null,
        dati.stato         || null,
        dati.periodo_da    || dati.periodoDa     || null,
        dati.periodo_a     || dati.periodoA      || null,
        dati.rif_da        || dati.rifDa         || null,
        dati.rif_a         || dati.rifA          || null,
        dati.data_evento   || dati.dataEvento    || null,
        dati.data_pagamento|| dati.dataPagamento || null,
        id,
      ]);
      if (!rows[0]) throw new NotFoundError("FattoEconomico", id);
      return this.findById(id);
    },

    async remove(id) {
      const rows = await q(`DELETE FROM v2.fatto_economico WHERE id=$1 RETURNING id`, [id]);
      if (!rows[0]) throw new NotFoundError("FattoEconomico", id);
    },

    async updateBulk(ids, dati) {
      if (!ids?.length) return { updated: 0 };
      const sets   = [];
      const params = [];
      const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
      if (dati.stato        !== undefined) add("stato",                  dati.stato        || null);
      if (dati.tipoSpesaId  !== undefined) add("tipo_spesa_id",          dati.tipoSpesaId  || null);
      if (dati.immobileId   !== undefined) add("immobile_id",            dati.immobileId   || null);
      if (dati.condominioId !== undefined) add("condominio_id",          dati.condominioId || null);
      if (dati.periodicita  !== undefined) add("periodicita",            dati.periodicita  || null);
      if (dati.soggettoPaganteId !== undefined) add("soggetto_pagante_id", dati.soggettoPaganteId || null);
      if (sets.length === 0) return { updated: 0 };
      sets.push("updated_at = NOW()");
      params.push(ids);
      const rows = await q(
        `UPDATE v2.fatto_economico SET ${sets.join(", ")}
         WHERE id = ANY($${params.length}::UUID[]) RETURNING id`,
        params
      );
      return { updated: rows.length };
    },

    // ── FILE PDF ──────────────────────────────────────────────────────────────

    async updateFile(id, { fileHash, filePath, nomeFile, mimeType }) {
      await q(`
        UPDATE v2.fatto_economico
        SET file_hash=$1, file_path=$2, nome_file=$3, mime_type=$4
        WHERE id=$5
      `, [fileHash, filePath, nomeFile, mimeType || "application/pdf", id]);
    },

    async clearFile(id) {
      await q(`
        UPDATE v2.fatto_economico
        SET file_hash=NULL, file_path=NULL, nome_file=NULL, mime_type=NULL
        WHERE id=$1
      `, [id]);
    },

    // ── DUPLICATI ─────────────────────────────────────────────────────────────

    /** Cerca fatti con lo stesso hash file (esclude se stesso) */
    async checkHashFile(hash, excludeId = null) {
      const rows = await q(`
        ${BASE_SELECT}
        WHERE fe.file_hash = $1
          ${excludeId ? "AND fe.id != $2" : ""}
        LIMIT 5
      `, excludeId ? [hash, excludeId] : [hash]);
      return rows.map(FattoEconomico.fromRow);
    },

    /** Cerca potenziali duplicati per dati: stesso fornitore/fattura + importo + periodo */
    async checkDuplicatiDati({ fornitore, importo, numeroFattura, numero_fattura, periodoDa, periodo_da, immobileId, immobile_id, condominioId, condominio_id, excludeId } = {}) {
      const nFatt  = (numeroFattura || numero_fattura || "").trim();
      const forn   = (fornitore || "").trim();
      const impNum = importo != null ? Number(importo) : null;
      const pDa    = periodoDa || periodo_da || null;
      const immId  = immobileId || immobile_id || null;
      const condId = condominioId || condominio_id || null;

      if (!forn && !nFatt) return [];

      const rows = await q(`
        ${BASE_SELECT}
        WHERE fe.importo = $1
          AND (
            ($2 IS NOT NULL AND LOWER(fe.fornitore)       = LOWER($2))
            OR
            ($3 IS NOT NULL AND LOWER(fe.numero_fattura)  = LOWER($3))
            OR
            ($3 IS NOT NULL AND LOWER(fe.numero_doc)      = LOWER($3))
          )
          AND ($4 IS NULL OR fe.periodo_da = $4 OR fe.rif_da::text LIKE ($4 || '%'))
          AND ($5 IS NULL OR fe.immobile_id   = $5)
          AND ($6 IS NULL OR fe.condominio_id = $6)
          ${excludeId ? "AND fe.id != $7" : ""}
        ORDER BY fe.created_at DESC
        LIMIT 5
      `, excludeId
        ? [impNum, forn || null, nFatt || null, pDa, immId, condId, excludeId]
        : [impNum, forn || null, nFatt || null, pDa, immId, condId]
      );
      return rows.map(FattoEconomico.fromRow);
    },

    // ── AGGREGATI ─────────────────────────────────────────────────────────────

    async totaliPerImmobile(immobileId, periodoDa, periodoA) {
      return q(`
        SELECT
          fe.tipo,
          fe.tipo_spesa_id,
          ts.descrizione  AS tipo_spesa,
          ts.categoria,
          COUNT(*)::INT   AS n_fatti,
          ROUND(SUM(fe.importo * fe.segno)::NUMERIC, 2) AS totale_netto,
          ROUND(SUM(fe.importo)::NUMERIC, 2)            AS totale_lordo
        FROM v2.fatto_economico fe
        LEFT JOIN tipi_spesa ts ON ts.id = fe.tipo_spesa_id
        WHERE fe.immobile_id = $1
          AND ($2::VARCHAR IS NULL OR fe.periodo_a  IS NULL OR fe.periodo_a  >= $2)
          AND ($3::VARCHAR IS NULL OR fe.periodo_da IS NULL OR fe.periodo_da <= $3)
        GROUP BY fe.tipo, fe.tipo_spesa_id, ts.descrizione, ts.categoria
        ORDER BY fe.tipo, ts.descrizione NULLS LAST
      `, [immobileId, periodoDa || null, periodoA || null]);
    },

    async quadratura(immobileId) {
      const rows = await q(`
        SELECT
          i.nome                                                           AS immobile,
          COALESCE((SELECT SUM(d.importo) FROM documenti d
            WHERE d.appartamento_id=i.legacy_id AND d.importo > 0), 0)  AS leg_spese_doc,
          COALESCE((SELECT SUM(sp.importo) FROM spese_proprietari sp
            WHERE sp.appartamento_id=i.legacy_id), 0)                   AS leg_spese_prop,
          COALESCE((SELECT SUM(m.importo*m.segno) FROM movimenti m
            WHERE m.appartamento_id=i.legacy_id), 0)                    AS leg_versamenti,
          COALESCE((SELECT SUM(fe.importo)
            FROM v2.fatto_economico fe
            WHERE fe.immobile_id=i.id AND fe.tipo='spesa'
              AND fe.legacy_tipo='documento'), 0)                        AS v2_spese_doc,
          COALESCE((SELECT SUM(fe.importo)
            FROM v2.fatto_economico fe
            WHERE fe.immobile_id=i.id AND fe.tipo='spesa'
              AND fe.legacy_tipo='spesa_proprietario'), 0)               AS v2_spese_prop,
          COALESCE((SELECT SUM(fe.importo*fe.segno)
            FROM v2.fatto_economico fe
            WHERE fe.immobile_id=i.id AND fe.tipo='entrata'), 0)        AS v2_versamenti
        FROM v2.immobile i
        WHERE i.id = $1
      `, [immobileId]);
      if (!rows[0]) throw new NotFoundError("Immobile", immobileId);
      const r = rows[0];
      return {
        ...r,
        delta_spese_doc:  Math.abs(Number(r.leg_spese_doc)  - Number(r.v2_spese_doc)),
        delta_spese_prop: Math.abs(Number(r.leg_spese_prop) - Number(r.v2_spese_prop)),
        delta_versamenti: Math.abs(Number(r.leg_versamenti)  - Number(r.v2_versamenti)),
        pass: (
          Math.abs(Number(r.leg_spese_doc)  - Number(r.v2_spese_doc))  < 0.01 &&
          Math.abs(Number(r.leg_spese_prop) - Number(r.v2_spese_prop)) < 0.01 &&
          Math.abs(Number(r.leg_versamenti)  - Number(r.v2_versamenti)) < 0.01
        ),
      };
    },
  };
}
