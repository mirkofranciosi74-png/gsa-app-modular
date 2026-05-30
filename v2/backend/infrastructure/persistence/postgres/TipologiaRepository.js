import { NotFoundError, ValidationError } from "../../../domain/shared/DomainError.js";

export function makeTipologiaRepository(pool) {
  async function q(sql, params = []) {
    const client = await pool.connect();
    try   { return (await client.query(sql, params)).rows; }
    finally { client.release(); }
  }

  const BASE = `
    SELECT id, descrizione, tipo, categoria, metodo_riparto,
           COALESCE(codice, id::text) AS codice,
           attivo, validita_da, validita_a, note AS note_interne
    FROM v2.tipo_spesa
  `;

  return {
    async list({ tipo, attivo, q: query } = {}) {
      const conds = [];
      const params = [];
      if (tipo   !== undefined) { params.push(tipo);   conds.push(`tipo=$${params.length}`); }
      if (attivo !== undefined) { params.push(attivo); conds.push(`attivo=$${params.length}`); }
      if (query) {
        params.push(`%${query.toLowerCase()}%`);
        conds.push(`(LOWER(descrizione) LIKE $${params.length} OR LOWER(categoria) LIKE $${params.length})`);
      }
      const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
      return q(`${BASE} ${where} ORDER BY descrizione`, params);
    },

    async findById(id) {
      const rows = await q(`${BASE} WHERE id = $1`, [id]);
      if (!rows[0]) throw new NotFoundError("Tipologia", id);
      return rows[0];
    },

    async create({ descrizione, tipo = "spesa", categoria, metodo_riparto, codice, validita_da, validita_a, note }) {
      if (!descrizione?.trim()) throw new ValidationError("descrizione obbligatoria");
      const rows = await q(`
        INSERT INTO v2.tipo_spesa
          (descrizione, tipo, categoria, metodo_riparto, codice, validita_da, validita_a, note, attivo)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
        RETURNING id
      `, [
        descrizione.trim(),
        tipo === "entrata" ? "entrata" : "spesa",
        categoria?.trim()    || null,
        metodo_riparto       || null,
        codice?.trim()       || null,
        validita_da          || null,
        validita_a           || null,
        note?.trim()         || null,
      ]);
      return this.findById(rows[0].id);
    },

    async update(id, { descrizione, tipo, categoria, metodo_riparto, codice, validita_da, validita_a, note, attivo }) {
      const rows = await q(`
        UPDATE v2.tipo_spesa SET
          descrizione    = COALESCE($1, descrizione),
          tipo           = COALESCE($2, tipo),
          categoria      = COALESCE($3, categoria),
          metodo_riparto = $4,
          codice         = $5,
          validita_da    = $6,
          validita_a     = $7,
          note           = $8,
          attivo         = COALESCE($9, attivo)
        WHERE id = $10
        RETURNING id
      `, [
        descrizione?.trim()  || null,
        tipo                  || null,
        categoria?.trim()    || null,
        metodo_riparto       ?? null,
        codice?.trim()       || null,
        validita_da          ?? null,
        validita_a           ?? null,
        note?.trim()         ?? null,
        attivo               ?? null,
        id,
      ]);
      if (!rows[0]) throw new NotFoundError("Tipologia", id);
      return this.findById(id);
    },

    async countUso(id) {
      const rows = await q(
        `SELECT COUNT(*)::INT AS n FROM v2.fatto_economico WHERE tipo_spesa_id=$1`,
        [id]
      );
      return rows[0]?.n || 0;
    },

    async remove(id) {
      const n = await this.countUso(id);
      if (n > 0) throw new ValidationError(`Tipologia usata in ${n} fatti economici — impossibile eliminare`);
      await q(`DELETE FROM v2.tipo_spesa WHERE id=$1`, [id]);
    },
  };
}
