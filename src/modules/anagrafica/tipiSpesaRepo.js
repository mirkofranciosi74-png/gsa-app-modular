import { query } from "../../shared/db/pool.js";

export const tipiSpesaRepo = {
  async listAll()    { return query(`SELECT * FROM tipi_spesa ORDER BY descrizione`); },
  async findByDescrizione(d) {
    const r = await query(`SELECT * FROM tipi_spesa WHERE descrizione=$1`, [d]);
    return r[0] || null;
  },
  async create({ descrizione, categoria, riparto }) {
    const r = await query(
      `INSERT INTO tipi_spesa(descrizione,categoria,riparto) VALUES($1,$2,$3) RETURNING *`,
      [descrizione, categoria, riparto]
    );
    return r[0];
  },
  async update(id, { descrizione, categoria, riparto, attivo }) {
    const r = await query(
      `UPDATE tipi_spesa SET descrizione=$1,categoria=$2,riparto=$3,attivo=$4
       WHERE id=$5 RETURNING *`,
      [descrizione, categoria, riparto, attivo ?? true, id]
    );
    if (!r[0]) throw new Error(`Tipo spesa ${id} non trovato`);
    return r[0];
  },
  async remove(id) { await query(`DELETE FROM tipi_spesa WHERE id=$1`, [id]); },
};
