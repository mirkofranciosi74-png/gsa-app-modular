import { NotFoundError } from "../../../domain/shared/DomainError.js";
import { Persona } from "../../../domain/anagrafica/Persona.js";

const BASE_SELECT = `
  SELECT p.*,
    COALESCE(
      JSON_AGG(
        JSON_BUILD_OBJECT('tipo', pl.legacy_tipo, 'id', pl.legacy_id)
        ORDER BY pl.legacy_tipo
      ) FILTER (WHERE pl.legacy_id IS NOT NULL),
      '[]'::JSON
    ) AS legacy_refs
  FROM v2.persona p
  LEFT JOIN v2.persona_legacy pl ON pl.persona_id = p.id
`;

/**
 * @param {import('pg').Pool} pool
 */
export function makePersonaRepository(pool) {
  async function q(sql, params = []) {
    const client = await pool.connect();
    try   { return (await client.query(sql, params)).rows; }
    finally { client.release(); }
  }

  return {
    async findAll({ attivo, tipoPersona } = {}) {
      const conds = [];
      const params = [];
      if (attivo !== undefined)    { params.push(attivo);      conds.push(`p.attivo = $${params.length}`); }
      if (tipoPersona !== undefined){ params.push(tipoPersona); conds.push(`p.tipo_persona = $${params.length}`); }
      const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
      const rows = await q(
        `${BASE_SELECT} ${where} GROUP BY p.id ORDER BY p.cognome NULLS LAST, p.nome`,
        params
      );
      return rows.map(Persona.fromRow);
    },

    async findById(id) {
      const rows = await q(`${BASE_SELECT} WHERE p.id = $1 GROUP BY p.id`, [id]);
      if (!rows[0]) throw new NotFoundError("Persona", id);
      return Persona.fromRow(rows[0]);
    },

    async findByLegacyId(legacyTipo, legacyId) {
      const rows = await q(`
        SELECT p.*,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT('tipo', pl2.legacy_tipo, 'id', pl2.legacy_id)
              ORDER BY pl2.legacy_tipo
            ) FILTER (WHERE pl2.legacy_id IS NOT NULL),
            '[]'::JSON
          ) AS legacy_refs
        FROM v2.persona p
        JOIN v2.persona_legacy pl  ON pl.persona_id = p.id
        LEFT JOIN v2.persona_legacy pl2 ON pl2.persona_id = p.id
        WHERE pl.legacy_tipo = $1 AND pl.legacy_id = $2
        GROUP BY p.id
      `, [legacyTipo, legacyId]);
      return rows[0] ? Persona.fromRow(rows[0]) : null;
    },

    async search(term) {
      const like = `%${term.toLowerCase()}%`;
      const rows = await q(`
        ${BASE_SELECT}
        WHERE LOWER(p.nome || ' ' || COALESCE(p.cognome,'') || ' ' || COALESCE(p.ragione_sociale,'')) LIKE $1
           OR LOWER(COALESCE(p.email,'')) LIKE $1
           OR LOWER(COALESCE(p.codice_fiscale,'')) LIKE $1
           OR LOWER(COALESCE(p.codice,'')) LIKE $1
        GROUP BY p.id
        ORDER BY p.cognome NULLS LAST, p.nome
        LIMIT 50
      `, [like]);
      return rows.map(Persona.fromRow);
    },

    async create(dati) {
      const p = new Persona(dati);
      const rows = await q(`
        INSERT INTO v2.persona
          (tipo_persona, nome, cognome, ragione_sociale, codice_fiscale, p_iva,
           codice, email, telefono, indirizzo, note, validita_da, validita_a, attivo)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING *
      `, [
        p.tipoPersona, p.nome, p.cognome, p.ragioneSociale,
        p.codiceFiscale, p.pIva, p.codice,
        p.email, p.telefono, p.indirizzo, p.note,
        p.validitaDa, p.validitaA, p.attivo,
      ]);
      return Persona.fromRow({ ...rows[0], legacy_refs: [] });
    },

    async update(id, dati) {
      const rows = await q(`
        UPDATE v2.persona
        SET tipo_persona     = COALESCE($1,  tipo_persona),
            nome             = COALESCE($2,  nome),
            cognome          = $3,
            ragione_sociale  = $4,
            codice_fiscale   = $5,
            p_iva            = $6,
            codice           = $7,
            email            = $8,
            telefono         = $9,
            indirizzo        = $10,
            note             = $11,
            validita_da      = $12,
            validita_a       = $13,
            attivo           = COALESCE($14, attivo)
        WHERE id = $15
        RETURNING *
      `, [
        dati.tipoPersona  || dati.tipo_persona  || null,
        dati.nome?.trim() || null,
        dati.cognome?.trim()         || null,
        dati.ragioneSociale?.trim()  || dati.ragione_sociale?.trim() || null,
        dati.codiceFiscale?.trim()   || dati.codice_fiscale?.trim()  || null,
        dati.pIva?.trim()            || dati.p_iva?.trim()           || null,
        dati.codice?.trim()          || null,
        dati.email?.trim()           || null,
        dati.telefono?.trim()        || null,
        dati.indirizzo?.trim()       || null,
        dati.note?.trim()            || null,
        dati.validitaDa || dati.validita_da || null,
        dati.validitaA  || dati.validita_a  || null,
        dati.attivo ?? null,
        id,
      ]);
      if (!rows[0]) throw new NotFoundError("Persona", id);
      return this.findById(id);
    },

    async addLegacyRef(personaId, legacyTipo, legacyId) {
      await q(`
        INSERT INTO v2.persona_legacy (persona_id, legacy_tipo, legacy_id)
        VALUES ($1,$2,$3)
        ON CONFLICT DO NOTHING
      `, [personaId, legacyTipo, legacyId]);
    },

    async dipendenze(id) {
      const rows = await q(`
        SELECT
          (SELECT COUNT(*) FROM v2.ruolo_persona WHERE persona_id = $1::UUID)                                AS n_ruoli,
          (SELECT COUNT(*) FROM v2.ruolo_persona WHERE persona_id = $1::UUID
             AND (validita_da IS NULL OR validita_da <= CURRENT_DATE)
             AND (validita_a  IS NULL OR validita_a  >= CURRENT_DATE))                                       AS n_ruoli_attivi,
          (SELECT COUNT(*) FROM v2.fatto_economico WHERE persona_id         = $1::UUID
                                                     OR soggetto_pagante_id = $1::UUID
                                                     OR soggetto_incassante_id = $1::UUID)                   AS n_fatti,
          (SELECT COUNT(*) FROM v2.regola_riparto_dettaglio WHERE persona_id = $1::UUID)                     AS n_regole_riparto,
          (SELECT COUNT(*) FROM v2.persona_condominio WHERE persona_id = $1::UUID)                           AS n_condomini,
          (SELECT COUNT(*) FROM archivio_associazioni WHERE entita_tipo = 'persona' AND entita_id = $1::UUID) AS n_archivio
      `, [id]);
      const r = rows[0];
      return {
        nRuoli:         Number(r.n_ruoli),
        nRuoliAttivi:   Number(r.n_ruoli_attivi),
        nFatti:         Number(r.n_fatti),
        nRegoleRiparto: Number(r.n_regole_riparto),
        nCondomini:     Number(r.n_condomini),
        nArchivio:      Number(r.n_archivio),
      };
    },

    async elimina(id) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`DELETE FROM v2.persona_condominio WHERE persona_id = $1::UUID`, [id]);
        await client.query(`DELETE FROM v2.ruolo_persona       WHERE persona_id = $1::UUID`, [id]);
        await client.query(`DELETE FROM v2.persona_legacy      WHERE persona_id = $1::UUID`, [id]);
        const res = await client.query(`DELETE FROM v2.persona WHERE id = $1::UUID RETURNING id`, [id]);
        if (!res.rows[0]) throw new NotFoundError("Persona", id);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },

    async quadratura() {
      const rows = await q(`
        SELECT
          (SELECT COUNT(*) FROM proprietari)                                          AS legacy_proprietari,
          (SELECT COUNT(*) FROM componenti)                                           AS legacy_componenti,
          (SELECT COUNT(*) FROM v2.persona_legacy WHERE legacy_tipo='proprietario')   AS migrati_proprietari,
          (SELECT COUNT(*) FROM v2.persona_legacy WHERE legacy_tipo='componente')     AS migrati_componenti,
          (SELECT COUNT(*) FROM v2.persona)                                           AS persone_totali,
          (SELECT COUNT(*) FROM proprietari pr WHERE NOT EXISTS (
            SELECT 1 FROM v2.persona_legacy pl
            WHERE pl.legacy_tipo='proprietario' AND pl.legacy_id=pr.id
          ))                                                                          AS proprietari_orfani,
          (SELECT COUNT(*) FROM componenti co WHERE NOT EXISTS (
            SELECT 1 FROM v2.persona_legacy pl
            WHERE pl.legacy_tipo='componente' AND pl.legacy_id=co.id
          ))                                                                          AS componenti_orfani
      `);
      const r = rows[0];
      return {
        ...r,
        pass: (
          Number(r.legacy_proprietari) === Number(r.migrati_proprietari) &&
          Number(r.legacy_componenti)  === Number(r.migrati_componenti)  &&
          Number(r.proprietari_orfani) === 0 &&
          Number(r.componenti_orfani)  === 0
        ),
      };
    },
  };
}
