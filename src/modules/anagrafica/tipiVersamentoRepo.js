import { query } from "../../shared/db/pool.js";

export const tipiVersamentoRepo = {
  async listAll() {
    return query(`SELECT * FROM tipi_versamento ORDER BY nome`);
  },

  async create({ nome, colore = "gray" }) {
    const r = await query(
      `INSERT INTO tipi_versamento(nome, colore) VALUES($1,$2) RETURNING *`,
      [nome.trim(), colore]
    );
    return r[0];
  },

  async update(id, { nome, colore, attivo }) {
    const r = await query(
      `UPDATE tipi_versamento SET nome=$1, colore=$2, attivo=$3 WHERE id=$4 RETURNING *`,
      [nome.trim(), colore, attivo ?? true, id]
    );
    if (!r[0]) throw new Error(`Tipo versamento ${id} non trovato`);
    return r[0];
  },

  async remove(id) {
    const inUso = await query(
      `SELECT 1 FROM movimenti
       WHERE tipo_versamento = (SELECT nome FROM tipi_versamento WHERE id=$1)
       LIMIT 1`,
      [id]
    );
    if (inUso.length > 0) {
      const err = new Error("Tipo versamento in uso nei movimenti: impossibile eliminare");
      err.status = 409;
      throw err;
    }
    await query(`DELETE FROM tipi_versamento WHERE id=$1`, [id]);
  },
};
