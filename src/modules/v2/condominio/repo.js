import { query } from "../../../shared/db/pool.js";

export const condominioRepo = {

  async listAll() {
    return query(`
      SELECT c.*, COUNT(i.id) AS n_immobili
      FROM v2.condominio c
      LEFT JOIN v2.immobile i ON i.condominio_id = c.id
      GROUP BY c.id
      ORDER BY c.nome
    `);
  },

  async findById(id) {
    const rows = await query(`
      SELECT c.*, JSON_AGG(
        JSON_BUILD_OBJECT('id', i.id, 'nome', i.nome, 'attivo', i.attivo)
        ORDER BY i.nome
      ) FILTER (WHERE i.id IS NOT NULL) AS immobili
      FROM v2.condominio c
      LEFT JOIN v2.immobile i ON i.condominio_id = c.id
      WHERE c.id = $1
      GROUP BY c.id
    `, [id]);
    return rows[0] || null;
  },

  async create({ nome, indirizzo, citta, cap, note, virtuale = false }) {
    if (!nome?.trim()) throw Object.assign(new Error("nome obbligatorio"), { status: 400 });
    const rows = await query(`
      INSERT INTO v2.condominio (nome, indirizzo, citta, cap, note, virtuale)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [nome.trim(), indirizzo||null, citta||null, cap||null, note||null, virtuale]);
    return rows[0];
  },

  async update(id, { nome, indirizzo, citta, cap, note, attivo }) {
    const rows = await query(`
      UPDATE v2.condominio
      SET nome=$1, indirizzo=$2, citta=$3, cap=$4, note=$5,
          attivo=COALESCE($6, attivo)
      WHERE id=$7 RETURNING *
    `, [nome, indirizzo||null, citta||null, cap||null, note||null, attivo, id]);
    if (!rows[0]) throw Object.assign(new Error("Condominio non trovato"), { status: 404 });
    return rows[0];
  },

  // Consolida più condomini virtuali in uno reale
  async consolida(condominioRealId, condominioVirtualiIds) {
    await query(`
      UPDATE v2.immobile
      SET condominio_id = $1
      WHERE condominio_id = ANY($2::uuid[])
    `, [condominioRealId, condominioVirtualiIds]);

    await query(`
      DELETE FROM v2.condominio
      WHERE id = ANY($1::uuid[]) AND virtuale = TRUE
    `, [condominioVirtualiIds]);
  },
};
