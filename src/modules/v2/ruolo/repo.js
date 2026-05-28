import { query } from "../../../shared/db/pool.js";

export const ruoloRepo = {

  async listByImmobile(immobileId, { ruolo, dataRif } = {}) {
    const params = [immobileId];
    let where = "WHERE rp.immobile_id = $1";
    if (ruolo) { params.push(ruolo); where += ` AND rp.ruolo = $${params.length}`; }
    if (dataRif) {
      params.push(dataRif);
      where += ` AND (rp.validita_da IS NULL OR rp.validita_da <= $${params.length})`;
      params.push(dataRif);
      where += ` AND (rp.validita_a IS NULL OR rp.validita_a >= $${params.length})`;
    }
    return query(`
      SELECT rp.*,
             p.nome, p.cognome, p.email,
             i.nome AS immobile_nome
      FROM v2.ruolo_persona rp
      JOIN v2.persona  p ON p.id = rp.persona_id
      JOIN v2.immobile i ON i.id = rp.immobile_id
      ${where}
      ORDER BY rp.validita_da NULLS FIRST, p.cognome NULLS LAST, p.nome
    `, params);
  },

  async listByPersona(personaId) {
    return query(`
      SELECT rp.*,
             i.nome AS immobile_nome,
             c.nome AS condominio_nome
      FROM v2.ruolo_persona rp
      JOIN v2.immobile   i ON i.id = rp.immobile_id
      JOIN v2.condominio c ON c.id = i.condominio_id
      WHERE rp.persona_id = $1
      ORDER BY rp.validita_da NULLS FIRST
    `, [personaId]);
  },

  async create({ personaId, immobileId, ruolo, validitaDa, validitaA, quota, quotaAffitto, caparra }) {
    const rows = await query(`
      INSERT INTO v2.ruolo_persona
        (persona_id, immobile_id, ruolo, validita_da, validita_a, quota, quota_affitto, caparra)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [personaId, immobileId, ruolo, validitaDa||null, validitaA||null,
        quota||null, quotaAffitto||null, caparra||null]);
    return rows[0];
  },

  async update(id, { validitaDa, validitaA, quota, quotaAffitto, caparra, defaultFlag }) {
    const rows = await query(`
      UPDATE v2.ruolo_persona
      SET validita_da=COALESCE($1, validita_da),
          validita_a=COALESCE($2, validita_a),
          quota=COALESCE($3, quota),
          quota_affitto=COALESCE($4, quota_affitto),
          caparra=COALESCE($5, caparra),
          default_flag=COALESCE($6, default_flag)
      WHERE id=$7 RETURNING *
    `, [validitaDa, validitaA, quota, quotaAffitto, caparra, defaultFlag, id]);
    if (!rows[0]) throw Object.assign(new Error("Ruolo non trovato"), { status: 404 });
    return rows[0];
  },

  async remove(id) {
    await query("DELETE FROM v2.ruolo_persona WHERE id=$1", [id]);
  },

  // Verifica che le quote proprietari per immobile e periodo sommino a 100
  async verificaQuote(immobileId, validitaDa, validitaA) {
    const rows = await query(`
      SELECT COALESCE(SUM(quota), 0) AS totale
      FROM v2.ruolo_persona
      WHERE immobile_id = $1
        AND ruolo = 'proprietario'
        AND (validita_da IS NULL OR validita_da <= COALESCE($3, '9999-12-31'::DATE))
        AND (validita_a  IS NULL OR validita_a  >= COALESCE($2, '0001-01-01'::DATE))
    `, [immobileId, validitaDa||null, validitaA||null]);
    return rows[0];
  },
};
