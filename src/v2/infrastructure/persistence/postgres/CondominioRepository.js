import { NotFoundError } from "../../../domain/shared/DomainError.js";
import { Condominio } from "../../../domain/patrimonio/Condominio.js";

/**
 * @param {import('pg').Pool} pool
 */
export function makeCondominioRepository(pool) {
  async function q(sql, params = []) {
    const client = await pool.connect();
    try   { return (await client.query(sql, params)).rows; }
    finally { client.release(); }
  }

  return {
    async findAll() {
      const rows = await q(`
        SELECT c.*,
          COUNT(i.id)::INT AS n_immobili
        FROM v2.condominio c
        LEFT JOIN v2.immobile i ON i.condominio_id = c.id
        GROUP BY c.id
        ORDER BY c.virtuale, c.nome
      `);
      return rows.map(r => ({ ...new Condominio(r).toJSON(), nImmobili: r.n_immobili }));
    },

    async findById(id) {
      const rows = await q(`SELECT * FROM v2.condominio WHERE id = $1`, [id]);
      if (!rows[0]) throw new NotFoundError("Condominio", id);
      return Condominio.fromRow(rows[0]);
    },

    async create(dati) {
      const c = new Condominio(dati);
      const rows = await q(`
        INSERT INTO v2.condominio
          (nome, codice, indirizzo, citta, cap, millesimi_totali,
           note, virtuale, validita_da, validita_a)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
      `, [
        c.nome, c.codice, c.indirizzo, c.citta, c.cap,
        c.millesimitotali, c.note, c.virtuale,
        c.validitaDa, c.validitaA,
      ]);
      return Condominio.fromRow(rows[0]);
    },

    async update(id, dati) {
      const rows = await q(`
        UPDATE v2.condominio
        SET nome             = COALESCE($1, nome),
            codice           = $2,
            indirizzo        = $3,
            citta            = $4,
            cap              = $5,
            millesimi_totali = COALESCE($6, millesimi_totali),
            note             = $7,
            validita_da      = $8,
            validita_a       = $9
        WHERE id = $10
        RETURNING *
      `, [
        dati.nome?.trim()     || null,
        dati.codice?.trim()   || null,
        dati.indirizzo?.trim()|| null,
        dati.citta?.trim()    || null,
        dati.cap?.trim()      || null,
        dati.millesimitotali  || dati.millesimi_totali || null,
        dati.note?.trim()     || null,
        dati.validitaDa || dati.validita_da || null,
        dati.validitaA  || dati.validita_a  || null,
        id,
      ]);
      if (!rows[0]) throw new NotFoundError("Condominio", id);
      return Condominio.fromRow(rows[0]);
    },

    async countImmobili(id) {
      const [r] = await q(`SELECT COUNT(*)::INT AS n FROM v2.immobile WHERE condominio_id = $1`, [id]);
      return Number(r.n);
    },

    async remove(id) {
      const rows = await q(`DELETE FROM v2.condominio WHERE id = $1 RETURNING id`, [id]);
      if (!rows[0]) throw new NotFoundError("Condominio", id);
    },

    async consolida(id, sourceIds) {
      if (!sourceIds?.length) return;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE v2.immobile SET condominio_id = $1 WHERE condominio_id = ANY($2::UUID[])`,
          [id, sourceIds]
        );
        await client.query(
          `UPDATE v2.condominio SET virtuale = false WHERE id = $1`,
          [id]
        );
        await client.query(
          `DELETE FROM v2.condominio WHERE id = ANY($1::UUID[]) AND virtuale = true`,
          [sourceIds]
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };
}
