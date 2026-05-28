import { NotFoundError } from "../../../domain/shared/DomainError.js";

/**
 * @param {import('pg').Pool} pool
 */
export function makeRegolaRipartoRepository(pool) {
  async function q(sql, params = []) {
    const client = await pool.connect();
    try   { return (await client.query(sql, params)).rows; }
    finally { client.release(); }
  }

  return {
    async listByImmobile(immobileId) {
      return q(`
        SELECT rr.*,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id',         rrd.id,
                'personaId',  rrd.persona_id,
                'includi',    rrd.includi,
                'percentuale',rrd.percentuale
              ) ORDER BY rrd.persona_id
            ) FILTER (WHERE rrd.id IS NOT NULL),
            '[]'::JSON
          ) AS dettagli,
          ts.descrizione AS tipo_spesa_desc
        FROM v2.regola_riparto rr
        LEFT JOIN v2.regola_riparto_dettaglio rrd ON rrd.regola_id = rr.id
        LEFT JOIN tipi_spesa ts ON ts.id = rr.tipo_spesa_id
        WHERE rr.immobile_id = $1
        GROUP BY rr.id, ts.descrizione
        ORDER BY rr.tipo_spesa_id NULLS LAST, rr.validita_da NULLS LAST
      `, [immobileId]);
    },

    async findApplicabile(immobileId, tipoSpesaId, mese) {
      const rows = await q(`
        SELECT rr.*,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'personaId',  rrd.persona_id,
                'includi',    rrd.includi,
                'percentuale',rrd.percentuale
              )
            ) FILTER (WHERE rrd.id IS NOT NULL),
            '[]'::JSON
          ) AS dettagli
        FROM v2.regola_riparto rr
        LEFT JOIN v2.regola_riparto_dettaglio rrd ON rrd.regola_id = rr.id
        WHERE rr.immobile_id = $1
          AND ($2::UUID IS NULL OR rr.tipo_spesa_id = $2 OR rr.tipo_spesa_id IS NULL)
          AND (rr.validita_da IS NULL OR rr.validita_da <= $3)
          AND (rr.validita_a  IS NULL OR rr.validita_a  >= $3)
        GROUP BY rr.id
        ORDER BY
          (rr.tipo_spesa_id IS NOT NULL) DESC,
          (rr.validita_da IS NOT NULL OR rr.validita_a IS NOT NULL) DESC
        LIMIT 1
      `, [immobileId, tipoSpesaId || null, mese]);
      return rows[0] || null;
    },

    async create(dati) {
      const rows = await q(`
        INSERT INTO v2.regola_riparto
          (immobile_id, tipo_spesa_id, validita_da, validita_a,
           quota_totale_pct, split_uguale, modalita, note)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *
      `, [
        dati.immobileId, dati.tipoSpesaId || null,
        dati.validitaDa || null, dati.validitaA || null,
        dati.quotaTotalePct || 100,
        dati.splitUguale ?? true,
        dati.modalita || 'escludi',
        dati.note || null,
      ]);
      return rows[0];
    },

    async addDettaglio(regolaId, { personaId, includi = true, percentuale }) {
      const rows = await q(`
        INSERT INTO v2.regola_riparto_dettaglio
          (regola_id, persona_id, includi, percentuale)
        VALUES ($1,$2,$3,$4)
        RETURNING *
      `, [regolaId, personaId, includi, percentuale || null]);
      return rows[0];
    },

    async remove(id) {
      const rows = await q(`DELETE FROM v2.regola_riparto WHERE id=$1 RETURNING id`, [id]);
      if (!rows[0]) throw new NotFoundError("RegolaRiparto", id);
    },
  };
}
