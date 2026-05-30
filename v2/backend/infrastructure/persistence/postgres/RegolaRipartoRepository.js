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

  // ── Regole appartamento (proprietari / inquilini) ─────────────────────────

  return {
    async listByImmobile(immobileId, { target } = {}) {
      const params = [immobileId];
      let targetWhere = "";
      if (target) { params.push(target); targetWhere = ` AND rr.target = $${params.length}`; }
      return q(`
        SELECT rr.*,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id',          rrd.id,
                'personaId',   rrd.persona_id,
                'personaNome', TRIM(COALESCE(p.cognome,'') || ' ' || COALESCE(p.nome,'')),
                'includi',     rrd.includi,
                'percentuale', rrd.percentuale,
                'quotaDefault',rp.quota
              ) ORDER BY p.cognome, p.nome
            ) FILTER (WHERE rrd.id IS NOT NULL),
            '[]'::JSON
          ) AS dettagli,
          ts.descrizione AS tipo_spesa_desc
        FROM v2.regola_riparto rr
        LEFT JOIN v2.regola_riparto_dettaglio rrd ON rrd.regola_id = rr.id
        LEFT JOIN v2.persona p ON p.id = rrd.persona_id
        LEFT JOIN LATERAL (
          SELECT quota FROM v2.ruolo_persona
          WHERE persona_id = rrd.persona_id AND immobile_id = rr.immobile_id
          ORDER BY validita_da DESC NULLS LAST
          LIMIT 1
        ) rp ON rrd.id IS NOT NULL
        LEFT JOIN tipi_spesa ts ON ts.id = rr.tipo_spesa_id
        WHERE rr.immobile_id = $1${targetWhere}
        GROUP BY rr.id, ts.descrizione
        ORDER BY rr.target, rr.tipo_spesa_id NULLS LAST, rr.validita_da NULLS LAST
      `, params);
    },

    // dataRif: ISO date string YYYY-MM-DD (first day of mese)
    async findApplicabile(immobileId, tipoSpesaId, dataRif, target) {
      const rows = await q(`
        SELECT rr.*,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'personaId',   rrd.persona_id,
                'includi',     rrd.includi,
                'percentuale', rrd.percentuale
              )
            ) FILTER (WHERE rrd.id IS NOT NULL),
            '[]'::JSON
          ) AS dettagli
        FROM v2.regola_riparto rr
        LEFT JOIN v2.regola_riparto_dettaglio rrd ON rrd.regola_id = rr.id
        WHERE rr.immobile_id = $1
          AND rr.target = $2
          AND ($3::UUID IS NULL OR rr.tipo_spesa_id = $3 OR rr.tipo_spesa_id IS NULL)
          AND (rr.validita_da IS NULL OR rr.validita_da <= $4::DATE)
          AND (rr.validita_a  IS NULL OR rr.validita_a  >= $4::DATE)
        GROUP BY rr.id
        ORDER BY
          (rr.tipo_spesa_id IS NOT NULL) DESC,
          (rr.validita_da IS NOT NULL OR rr.validita_a IS NOT NULL) DESC
        LIMIT 1
      `, [immobileId, target || 'inquilini', tipoSpesaId || null, dataRif]);
      return rows[0] || null;
    },

    async create(dati) {
      const rows = await q(`
        INSERT INTO v2.regola_riparto
          (id, immobile_id, tipo_spesa_id, target, validita_da, validita_a,
           quota_totale_pct, split_uguale, modalita, note)
        VALUES (COALESCE($1::UUID, gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
      `, [
        dati.id              || null,
        dati.immobileId,
        dati.tipoSpesaId     || null,
        dati.target          || 'inquilini',
        dati.validitaDa      ? dati.validitaDa : null,
        dati.validitaA       ? dati.validitaA  : null,
        dati.quotaTotalePct  != null ? Number(dati.quotaTotalePct) : 100,
        dati.splitUguale     ?? true,
        dati.modalita        || 'escludi',
        dati.note            || null,
      ]);
      return rows[0];
    },

    async addDettaglio(regolaId, { personaId, includi = true, percentuale }) {
      const rows = await q(`
        INSERT INTO v2.regola_riparto_dettaglio
          (regola_id, persona_id, includi, percentuale)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (regola_id, persona_id) DO UPDATE
          SET includi = EXCLUDED.includi, percentuale = EXCLUDED.percentuale
        RETURNING *
      `, [regolaId, personaId, includi, percentuale ?? null]);
      return rows[0];
    },

    async update(id, dati) {
      const rows = await q(`
        UPDATE v2.regola_riparto
        SET tipo_spesa_id    = COALESCE($1, tipo_spesa_id),
            validita_da      = $2,
            validita_a       = $3,
            quota_totale_pct = COALESCE($4, quota_totale_pct),
            split_uguale     = COALESCE($5, split_uguale),
            modalita         = COALESCE($6, modalita),
            note             = $7
        WHERE id = $8
        RETURNING *
      `, [
        dati.tipoSpesaId    ?? null,
        dati.validitaDa     ? dati.validitaDa : null,
        dati.validitaA      ? dati.validitaA  : null,
        dati.quotaTotalePct != null ? Number(dati.quotaTotalePct) : null,
        dati.splitUguale    ?? null,
        dati.modalita       || null,
        dati.note           || null,
        id,
      ]);
      if (!rows[0]) throw new NotFoundError("RegolaRiparto", id);
      return rows[0];
    },

    async clearDettagli(regolaId) {
      await q(`DELETE FROM v2.regola_riparto_dettaglio WHERE regola_id = $1`, [regolaId]);
    },

    async remove(id) {
      const rows = await q(`DELETE FROM v2.regola_riparto WHERE id=$1 RETURNING id`, [id]);
      if (!rows[0]) throw new NotFoundError("RegolaRiparto", id);
    },

    // ── Regole condominio → appartamenti ─────────────────────────────────────

    async listByCondominio(condominioId) {
      return q(`
        SELECT rrc.*,
          ts.descrizione AS tipo_spesa_desc,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id',          rrcd.id,
                'immobileId',  rrcd.immobile_id,
                'percentuale', rrcd.percentuale,
                'immobileNome', im.nome
              ) ORDER BY im.nome
            ) FILTER (WHERE rrcd.id IS NOT NULL),
            '[]'::JSON
          ) AS dettagli
        FROM v2.regola_riparto_condominio rrc
        LEFT JOIN tipi_spesa ts ON ts.id = rrc.tipo_spesa_id
        LEFT JOIN v2.regola_riparto_condominio_dettaglio rrcd ON rrcd.regola_id = rrc.id
        LEFT JOIN v2.immobile im ON im.id = rrcd.immobile_id
        WHERE rrc.condominio_id = $1
        GROUP BY rrc.id, ts.descrizione
        ORDER BY rrc.tipo_spesa_id NULLS LAST, rrc.validita_da
      `, [condominioId]);
    },

    async createCondominio(dati) {
      const rows = await q(`
        INSERT INTO v2.regola_riparto_condominio
          (id, condominio_id, tipo_spesa_id, metodo, validita_da, validita_a, note)
        VALUES (COALESCE($1::UUID, gen_random_uuid()),$2,$3,$4,$5,$6,$7)
        RETURNING *
      `, [
        dati.id          || null,
        dati.condominioId,
        dati.tipoSpesaId || null,
        dati.metodo      || 'millesimi',
        dati.validitaDa,                   // DATE NOT NULL
        dati.validitaA   || null,
        dati.note        || null,
      ]);
      return rows[0];
    },

    async addDettaglioCondominio(regolaId, { immobileId, percentuale }) {
      const rows = await q(`
        INSERT INTO v2.regola_riparto_condominio_dettaglio
          (regola_id, immobile_id, percentuale)
        VALUES ($1,$2,$3)
        ON CONFLICT (regola_id, immobile_id) DO UPDATE
          SET percentuale = EXCLUDED.percentuale
        RETURNING *
      `, [regolaId, immobileId, Number(percentuale)]);
      return rows[0];
    },

    async updateCondominio(id, dati) {
      const rows = await q(`
        UPDATE v2.regola_riparto_condominio
        SET tipo_spesa_id = COALESCE($1, tipo_spesa_id),
            metodo        = COALESCE($2, metodo),
            validita_da   = COALESCE($3, validita_da),
            validita_a    = $4,
            note          = $5
        WHERE id = $6
        RETURNING *
      `, [
        dati.tipoSpesaId ?? null,
        dati.metodo      || null,
        dati.validitaDa  ? dati.validitaDa : null,
        dati.validitaA   ? dati.validitaA  : null,
        dati.note        || null,
        id,
      ]);
      if (!rows[0]) throw new NotFoundError("RegolaRipartoCondominio", id);
      return rows[0];
    },

    async clearDettagliCondominio(regolaId) {
      await q(`DELETE FROM v2.regola_riparto_condominio_dettaglio WHERE regola_id = $1`, [regolaId]);
    },

    async removeCondominio(id) {
      const rows = await q(
        `DELETE FROM v2.regola_riparto_condominio WHERE id=$1 RETURNING id`, [id]
      );
      if (!rows[0]) throw new NotFoundError("RegolaRipartoCondominio", id);
    },
  };
}
