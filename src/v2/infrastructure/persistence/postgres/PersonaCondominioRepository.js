import { NotFoundError } from "../../../domain/shared/DomainError.js";
import { PersonaCondominio } from "../../../domain/patrimonio/PersonaCondominio.js";

/**
 * @param {import('pg').Pool} pool
 */
export function makePersonaCondominioRepository(pool) {
  async function q(sql, params = []) {
    const client = await pool.connect();
    try   { return (await client.query(sql, params)).rows; }
    finally { client.release(); }
  }

  const BASE = `
    SELECT pc.*,
           p.nome AS persona_nome, p.cognome AS persona_cognome,
           c.nome AS condominio_nome
    FROM v2.persona_condominio pc
    JOIN v2.persona    p ON p.id = pc.persona_id
    JOIN v2.condominio c ON c.id = pc.condominio_id
  `;

  return {
    async listByCondominio(condominioId, { dataRif } = {}) {
      const params = [condominioId];
      let extra = "";
      if (dataRif) {
        params.push(dataRif);
        extra = ` AND (pc.validita_da IS NULL OR pc.validita_da <= $${params.length})
                  AND (pc.validita_a  IS NULL OR pc.validita_a  >= $${params.length})`;
      }
      const rows = await q(
        `${BASE} WHERE pc.condominio_id = $1 ${extra} ORDER BY p.cognome NULLS LAST, p.nome`,
        params
      );
      return rows.map(PersonaCondominio.fromRow);
    },

    async listByPersona(personaId) {
      const rows = await q(
        `${BASE} WHERE pc.persona_id = $1 ORDER BY pc.validita_da DESC NULLS LAST`,
        [personaId]
      );
      return rows.map(PersonaCondominio.fromRow);
    },

    async create(dati) {
      const pc = new PersonaCondominio(dati);
      const rows = await q(`
        INSERT INTO v2.persona_condominio
          (persona_id, condominio_id, ruolo, validita_da, validita_a, note)
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING *
      `, [
        pc.personaId, pc.condominioId, pc.ruolo,
        pc.validitaDa, pc.validitaA, pc.note,
      ]);
      // Ri-leggi con join
      const full = await q(`${BASE} WHERE pc.id = $1`, [rows[0].id]);
      return PersonaCondominio.fromRow(full[0]);
    },

    async update(id, dati) {
      const rows = await q(`
        UPDATE v2.persona_condominio
        SET ruolo       = COALESCE($1, ruolo),
            validita_da = COALESCE($2, validita_da),
            validita_a  = $3,
            note        = $4
        WHERE id = $5
        RETURNING *
      `, [
        dati.ruolo      || null,
        dati.validitaDa || dati.validita_da || null,
        dati.validitaA  || dati.validita_a  || null,
        dati.note?.trim() || null,
        id,
      ]);
      if (!rows[0]) throw new NotFoundError("PersonaCondominio", id);
      const full = await q(`${BASE} WHERE pc.id = $1`, [id]);
      return PersonaCondominio.fromRow(full[0]);
    },

    async remove(id) {
      const rows = await q(`DELETE FROM v2.persona_condominio WHERE id = $1 RETURNING id`, [id]);
      if (!rows[0]) throw new NotFoundError("PersonaCondominio", id);
    },
  };
}
