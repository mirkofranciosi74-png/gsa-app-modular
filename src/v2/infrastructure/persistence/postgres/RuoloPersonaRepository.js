import { NotFoundError, ConflictError } from "../../../domain/shared/DomainError.js";
import { RuoloPersona } from "../../../domain/patrimonio/RuoloPersona.js";

/**
 * @param {import('pg').Pool} pool
 */
export function makeRuoloPersonaRepository(pool) {
  async function q(sql, params = []) {
    const client = await pool.connect();
    try   { return (await client.query(sql, params)).rows; }
    finally { client.release(); }
  }

  const BASE_SELECT = `
    SELECT rp.*,
           p.nome AS persona_nome, p.cognome AS persona_cognome, p.email AS persona_email,
           i.nome AS immobile_nome,
           c.nome AS condominio_nome
    FROM v2.ruolo_persona rp
    JOIN v2.persona    p ON p.id = rp.persona_id
    JOIN v2.immobile   i ON i.id = rp.immobile_id
    JOIN v2.condominio c ON c.id = i.condominio_id
  `;

  return {
    async listByImmobile(immobileId, { ruolo, dataRif } = {}) {
      const params = [immobileId];
      let where = "WHERE rp.immobile_id = $1";
      if (ruolo)   { params.push(ruolo);   where += ` AND rp.ruolo = $${params.length}`; }
      if (dataRif) {
        params.push(dataRif);
        where += ` AND (rp.validita_da IS NULL OR rp.validita_da <= $${params.length})`;
        params.push(dataRif);
        where += ` AND (rp.validita_a IS NULL OR rp.validita_a >= $${params.length})`;
      }
      const rows = await q(
        `${BASE_SELECT} ${where} ORDER BY rp.validita_da NULLS FIRST, p.cognome NULLS LAST, p.nome`,
        params
      );
      return rows.map(RuoloPersona.fromRow);
    },

    async listByPersona(personaId) {
      const rows = await q(
        `${BASE_SELECT} WHERE rp.persona_id = $1 ORDER BY rp.validita_da NULLS FIRST`,
        [personaId]
      );
      return rows.map(RuoloPersona.fromRow);
    },

    async findById(id) {
      const rows = await q(`${BASE_SELECT} WHERE rp.id = $1`, [id]);
      if (!rows[0]) throw new NotFoundError("RuoloPersona", id);
      return RuoloPersona.fromRow(rows[0]);
    },

    async create(dati) {
      const rp = new RuoloPersona(dati);
      const rows = await q(`
        INSERT INTO v2.ruolo_persona
          (persona_id, immobile_id, ruolo, validita_da, validita_a, quota, quota_affitto, caparra, default_flag)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *
      `, [
        rp.personaId, rp.immobileId, rp.ruolo,
        rp.validitaDa, rp.validitaA,
        rp.quota, rp.quotaAffitto, rp.caparra, rp.defaultFlag,
      ]);
      return this.findById(rows[0].id);
    },

    async update(id, dati) {
      const rows = await q(`
        UPDATE v2.ruolo_persona
        SET validita_da    = COALESCE($1, validita_da),
            validita_a     = COALESCE($2, validita_a),
            quota          = COALESCE($3, quota),
            quota_affitto  = COALESCE($4, quota_affitto),
            caparra        = COALESCE($5, caparra),
            default_flag   = COALESCE($6, default_flag)
        WHERE id = $7
        RETURNING *
      `, [
        dati.validitaDa || null,
        dati.validitaA  || null,
        dati.quota      ?? null,
        dati.quotaAffitto ?? null,
        dati.caparra    ?? null,
        dati.defaultFlag ?? null,
        id,
      ]);
      if (!rows[0]) throw new NotFoundError("RuoloPersona", id);
      return this.findById(id);
    },

    async remove(id) {
      const rows = await q(`DELETE FROM v2.ruolo_persona WHERE id=$1 RETURNING id`, [id]);
      if (!rows[0]) throw new NotFoundError("RuoloPersona", id);
    },

    /**
     * Verifica che la somma delle quote proprietari = 100% per un dato periodo.
     */
    async verificaQuote(immobileId, da, a) {
      const rows = await q(`
        SELECT
          rp.ruolo,
          ROUND(SUM(COALESCE(rp.quota, 0)), 4) AS somma_quota,
          COUNT(*) AS n_ruoli,
          EVERY(rp.quota IS NOT NULL) AS tutte_valorizzate
        FROM v2.ruolo_persona rp
        WHERE rp.immobile_id = $1
          AND ($2::DATE IS NULL OR rp.validita_da IS NULL OR rp.validita_da <= $2)
          AND ($3::DATE IS NULL OR rp.validita_a  IS NULL OR rp.validita_a  >= $3)
        GROUP BY rp.ruolo
      `, [immobileId, da || null, a || null]);

      return rows.map(r => ({
        ruolo:  r.ruolo,
        sommaQuota: Number(r.somma_quota),
        nRuoli: Number(r.n_ruoli),
        tutteValorizzate: Boolean(r.tutte_valorizzate),
        ok: Math.abs(Number(r.somma_quota) - 100) < 0.01,
      }));
    },
  };
}
