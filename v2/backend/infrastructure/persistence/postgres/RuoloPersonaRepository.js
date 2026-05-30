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

    async listAll() {
      const rows = await q(
        `${BASE_SELECT} ORDER BY i.nome, rp.ruolo, p.cognome NULLS LAST, p.nome`
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
      // accetta sia snake_case (DB) sia camelCase (API frontend)
      const norm = {
        ...dati,
        persona_id:         dati.persona_id        || dati.personaId,
        immobile_id:        dati.immobile_id        || dati.immobileId,
        validita_da:        dati.validita_da        || dati.validitaDa        || null,
        validita_a:         dati.validita_a         || dati.validitaA         || null,
        quota_affitto:      dati.quota_affitto      ?? dati.quotaAffitto,
        default_flag:       dati.default_flag       ?? dati.defaultFlag       ?? false,
        default_pagante:    dati.default_pagante    ?? dati.defaultPagante    ?? false,
        default_incassante: dati.default_incassante ?? dati.defaultIncassante ?? false,
      };
      const rp = new RuoloPersona(norm);
      const rows = await q(`
        INSERT INTO v2.ruolo_persona
          (persona_id, immobile_id, ruolo, validita_da, validita_a,
           quota, quota_affitto, caparra,
           default_flag, default_pagante, default_incassante)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *
      `, [
        rp.personaId, rp.immobileId, rp.ruolo,
        rp.validitaDa, rp.validitaA,
        rp.quota, rp.quotaAffitto, rp.caparra,
        rp.defaultFlag, rp.defaultPagante, rp.defaultIncassante,
      ]);
      return this.findById(rows[0].id);
    },

    async update(id, dati) {
      const rows = await q(`
        UPDATE v2.ruolo_persona
        SET validita_da       = COALESCE($1,  validita_da),
            validita_a        = COALESCE($2,  validita_a),
            quota             = COALESCE($3,  quota),
            quota_affitto     = COALESCE($4,  quota_affitto),
            caparra           = COALESCE($5,  caparra),
            default_flag      = COALESCE($6,  default_flag),
            default_pagante   = COALESCE($7,  default_pagante),
            default_incassante= COALESCE($8,  default_incassante)
        WHERE id = $9
        RETURNING *
      `, [
        dati.validitaDa        || null,   // "" → null (DATE non accetta stringa vuota)
        dati.validitaA         || null,
        dati.quota             ?? null,
        dati.quotaAffitto      ?? null,
        dati.caparra           ?? null,
        dati.defaultFlag       ?? null,
        dati.defaultPagante    ?? null,
        dati.defaultIncassante ?? null,
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
    async verificaQuote(immobileId) {
      const rows = await q(`
        SELECT
          rp.ruolo,
          COUNT(*) AS n_ruoli_totale,
          COUNT(*) FILTER (WHERE
            (rp.validita_da IS NULL OR rp.validita_da <= CURRENT_DATE) AND
            (rp.validita_a  IS NULL OR rp.validita_a  >= CURRENT_DATE)
          ) AS n_ruoli_attivi,
          COALESCE(ROUND(SUM(rp.quota) FILTER (WHERE
            (rp.validita_da IS NULL OR rp.validita_da <= CURRENT_DATE) AND
            (rp.validita_a  IS NULL OR rp.validita_a  >= CURRENT_DATE)
          ), 4), 0) AS somma_quota_attivi,
          BOOL_AND(rp.quota IS NOT NULL) FILTER (WHERE
            (rp.validita_da IS NULL OR rp.validita_da <= CURRENT_DATE) AND
            (rp.validita_a  IS NULL OR rp.validita_a  >= CURRENT_DATE)
          ) AS tutte_valorizzate_attivi
        FROM v2.ruolo_persona rp
        WHERE rp.immobile_id = $1
        GROUP BY rp.ruolo
      `, [immobileId]);

      return rows.map(r => ({
        ruolo:             r.ruolo,
        sommaQuota:        Number(r.somma_quota_attivi),
        nRuoliAttivi:      Number(r.n_ruoli_attivi),
        nRuoliTotale:      Number(r.n_ruoli_totale),
        tutteValorizzate:  r.tutte_valorizzate_attivi !== null ? Boolean(r.tutte_valorizzate_attivi) : true,
        ok: Math.abs(Number(r.somma_quota_attivi) - 100) < 0.01,
      }));
    },
  };
}
