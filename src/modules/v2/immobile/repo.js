import { query } from "../../../shared/db/pool.js";

export const immobileRepo = {

  async listAll({ condominioId, attivo } = {}) {
    const conds = [];
    const params = [];
    if (condominioId) { params.push(condominioId); conds.push(`i.condominio_id=$${params.length}`); }
    if (attivo !== undefined) { params.push(attivo); conds.push(`i.attivo=$${params.length}`); }
    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
    return query(`
      SELECT i.*, c.nome AS condominio_nome
      FROM v2.immobile i
      JOIN v2.condominio c ON c.id = i.condominio_id
      ${where}
      ORDER BY c.nome, i.nome
    `, params);
  },

  async findById(id) {
    const rows = await query(`
      SELECT i.*, c.nome AS condominio_nome
      FROM v2.immobile i
      JOIN v2.condominio c ON c.id = i.condominio_id
      WHERE i.id = $1
    `, [id]);
    return rows[0] || null;
  },

  async findByLegacyId(legacyId) {
    const rows = await query(`
      SELECT * FROM v2.immobile WHERE legacy_id = $1
    `, [legacyId]);
    return rows[0] || null;
  },

  async create({ condominioId, nome, via, citta, cap, note }) {
    if (!nome?.trim()) throw Object.assign(new Error("nome obbligatorio"), { status: 400 });
    if (!condominioId) throw Object.assign(new Error("condominioId obbligatorio"), { status: 400 });
    const rows = await query(`
      INSERT INTO v2.immobile (condominio_id, nome, via, citta, cap, note)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [condominioId, nome.trim(), via||null, citta||null, cap||null, note||null]);
    return rows[0];
  },

  async update(id, { nome, via, citta, cap, note, attivo, condominioId }) {
    const rows = await query(`
      UPDATE v2.immobile
      SET nome=$1, via=$2, citta=$3, cap=$4, note=$5,
          attivo=COALESCE($6, attivo),
          condominio_id=COALESCE($7, condominio_id)
      WHERE id=$8 RETURNING *
    `, [nome, via||null, citta||null, cap||null, note||null, attivo, condominioId||null, id]);
    if (!rows[0]) throw Object.assign(new Error("Immobile non trovato"), { status: 404 });
    return rows[0];
  },
};
