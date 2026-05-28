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
           i.nome AS immobile_nome,
           p.nome AS persona_nome, p.cognome AS persona_cognome,
           ts.descrizione AS tipo_spesa_desc, ts.categoria AS tipo_spesa_cat
    FROM v2.fatto_economico fe
    LEFT JOIN v2.immobile  i  ON i.id  = fe.immobile_id
    LEFT JOIN v2.persona   p  ON p.id  = fe.persona_id
    LEFT JOIN tipi_spesa   ts ON ts.id = fe.tipo_spesa_id
  `;

  return {
    async list({ immobileId, tipo, periodoDa, periodoA, legacyTipo } = {}) {
      const conds = [];
      const params = [];
      if (immobileId) { params.push(immobileId); conds.push(`fe.immobile_id=$${params.length}`); }
      if (tipo)       { params.push(tipo);       conds.push(`fe.tipo=$${params.length}`); }
      if (legacyTipo) { params.push(legacyTipo); conds.push(`fe.legacy_tipo=$${params.length}`); }
      if (periodoDa)  {
        params.push(periodoDa);
        conds.push(`(fe.periodo_a IS NULL OR fe.periodo_a >= $${params.length})`);
      }
      if (periodoA) {
        params.push(periodoA);
        conds.push(`(fe.periodo_da IS NULL OR fe.periodo_da <= $${params.length})`);
      }
      const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
      const rows = await q(
        `${BASE_SELECT} ${where} ORDER BY fe.data_evento DESC NULLS LAST, fe.created_at DESC`,
        params
      );
      return rows.map(FattoEconomico.fromRow);
    },

    async findById(id) {
      const rows = await q(`${BASE_SELECT} WHERE fe.id = $1`, [id]);
      if (!rows[0]) throw new NotFoundError("FattoEconomico", id);
      return FattoEconomico.fromRow(rows[0]);
    },

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
