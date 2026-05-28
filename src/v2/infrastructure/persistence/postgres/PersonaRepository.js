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
    async findAll({ attivo } = {}) {
      const where = attivo !== undefined ? "WHERE p.attivo = $1" : "";
      const params = attivo !== undefined ? [attivo] : [];
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
        WHERE LOWER(p.nome || ' ' || COALESCE(p.cognome,'')) LIKE $1
           OR LOWER(COALESCE(p.email,'')) LIKE $1
        GROUP BY p.id
        ORDER BY p.cognome NULLS LAST, p.nome
        LIMIT 50
      `, [like]);
      return rows.map(Persona.fromRow);
    },

    async create(dati) {
      const p = new Persona(dati);
      const rows = await q(`
        INSERT INTO v2.persona (nome, cognome, email, telefono, indirizzo, note, attivo)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
      `, [p.nome, p.cognome, p.email, p.telefono, p.indirizzo, p.note, p.attivo]);
      return Persona.fromRow({ ...rows[0], legacy_refs: [] });
    },

    async update(id, dati) {
      const rows = await q(`
        UPDATE v2.persona
        SET nome      = COALESCE($1, nome),
            cognome   = $2,
            email     = $3,
            telefono  = $4,
            indirizzo = $5,
            note      = $6,
            attivo    = COALESCE($7, attivo)
        WHERE id = $8
        RETURNING *
      `, [
        dati.nome?.trim() || null,
        dati.cognome?.trim() || null,
        dati.email?.trim()   || null,
        dati.telefono?.trim()|| null,
        dati.indirizzo?.trim()|| null,
        dati.note?.trim()    || null,
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
