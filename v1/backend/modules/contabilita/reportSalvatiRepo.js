import { query } from "../../shared/db/pool.js";

export const reportSalvatiRepo = {
  async listAll() {
    return query(`SELECT id,nome,parametri,created_at FROM report_salvati ORDER BY created_at DESC`);
  },
  async findById(id) {
    const r = await query(`SELECT * FROM report_salvati WHERE id=$1`, [id]);
    return r[0] || null;
  },
  async create({ nome, parametri, testo, pdf_base64 }) {
    const r = await query(
      `INSERT INTO report_salvati(nome,parametri,testo,pdf_base64)
       VALUES($1,$2,$3,$4) RETURNING id,nome,created_at`,
      [nome, JSON.stringify(parametri), testo, pdf_base64]
    );
    return r[0];
  },
  async remove(id) { await query(`DELETE FROM report_salvati WHERE id=$1`, [id]); },
};
