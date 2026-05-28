import { NotFoundError } from "../../../domain/shared/DomainError.js";
import { Immobile } from "../../../domain/patrimonio/Immobile.js";

/**
 * @param {import('pg').Pool} pool
 */
export function makeImmobileRepository(pool) {
  async function q(sql, params = []) {
    const client = await pool.connect();
    try   { return (await client.query(sql, params)).rows; }
    finally { client.release(); }
  }

  return {
    async findAll({ condominioId, attivo } = {}) {
      const conds = [];
      const params = [];
      if (condominioId !== undefined) { params.push(condominioId); conds.push(`i.condominio_id=$${params.length}`); }
      if (attivo !== undefined)       { params.push(attivo);       conds.push(`i.attivo=$${params.length}`); }
      const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
      const rows = await q(`
        SELECT i.*, c.nome AS condominio_nome
        FROM v2.immobile i
        JOIN v2.condominio c ON c.id = i.condominio_id
        ${where}
        ORDER BY c.nome, i.nome
      `, params);
      return rows.map(Immobile.fromRow);
    },

    async findById(id) {
      const rows = await q(`
        SELECT i.*, c.nome AS condominio_nome
        FROM v2.immobile i
        JOIN v2.condominio c ON c.id = i.condominio_id
        WHERE i.id = $1
      `, [id]);
      if (!rows[0]) throw new NotFoundError("Immobile", id);
      return Immobile.fromRow(rows[0]);
    },

    async findByLegacyId(legacyId) {
      const rows = await q(`
        SELECT i.*, c.nome AS condominio_nome
        FROM v2.immobile i
        JOIN v2.condominio c ON c.id = i.condominio_id
        WHERE i.legacy_id = $1
      `, [legacyId]);
      return rows[0] ? Immobile.fromRow(rows[0]) : null;
    },

    async create(dati) {
      const im = new Immobile(dati);
      const rows = await q(`
        INSERT INTO v2.immobile (condominio_id, nome, via, citta, cap, note)
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING *
      `, [im.condominioId, im.nome, im.via, im.citta, im.cap, im.note]);
      return this.findById(rows[0].id);
    },

    async update(id, dati) {
      const rows = await q(`
        UPDATE v2.immobile
        SET nome          = COALESCE($1, nome),
            via           = $2,
            citta         = $3,
            cap           = $4,
            note          = $5,
            attivo        = COALESCE($6, attivo),
            condominio_id = COALESCE($7, condominio_id)
        WHERE id = $8
        RETURNING *
      `, [
        dati.nome?.trim()  || null,
        dati.via?.trim()   || null,
        dati.citta?.trim() || null,
        dati.cap?.trim()   || null,
        dati.note?.trim()  || null,
        dati.attivo ?? null,
        dati.condominioId  || null,
        id,
      ]);
      if (!rows[0]) throw new NotFoundError("Immobile", id);
      return this.findById(id);
    },

    async countDipendenze(id) {
      const [r] = await q(`
        SELECT
          (SELECT COUNT(*) FROM v2.ruolo_persona    WHERE immobile_id = $1) AS n_ruoli,
          (SELECT COUNT(*) FROM v2.fatto_economico  WHERE immobile_id = $1) AS n_fatti,
          (SELECT COUNT(*) FROM v2.regola_riparto   WHERE immobile_id = $1) AS n_regole
      `, [id]);
      return {
        nRuoli:  Number(r.n_ruoli),
        nFatti:  Number(r.n_fatti),
        nRegole: Number(r.n_regole),
        totale:  Number(r.n_ruoli) + Number(r.n_fatti) + Number(r.n_regole),
      };
    },

    async remove(id) {
      const rows = await q(`DELETE FROM v2.immobile WHERE id = $1 RETURNING id`, [id]);
      if (!rows[0]) throw new NotFoundError("Immobile", id);
    },
  };
}
