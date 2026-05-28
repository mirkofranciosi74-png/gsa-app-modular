import { query } from "../../../shared/db/pool.js";

export const personaRepo = {

  async listAll({ attivo } = {}) {
    const where = attivo !== undefined ? "WHERE p.attivo = $1" : "";
    const params = attivo !== undefined ? [attivo] : [];
    return query(`
      SELECT
        p.*,
        JSON_AGG(
          JSON_BUILD_OBJECT('tipo', pl.legacy_tipo, 'legacy_id', pl.legacy_id)
          ORDER BY pl.legacy_tipo
        ) FILTER (WHERE pl.legacy_id IS NOT NULL) AS legacy_refs
      FROM v2.persona p
      LEFT JOIN v2.persona_legacy pl ON pl.persona_id = p.id
      ${where}
      GROUP BY p.id
      ORDER BY p.cognome NULLS LAST, p.nome
    `, params);
  },

  async findById(id) {
    const rows = await query(`
      SELECT
        p.*,
        JSON_AGG(
          JSON_BUILD_OBJECT('tipo', pl.legacy_tipo, 'legacy_id', pl.legacy_id)
          ORDER BY pl.legacy_tipo
        ) FILTER (WHERE pl.legacy_id IS NOT NULL) AS legacy_refs
      FROM v2.persona p
      LEFT JOIN v2.persona_legacy pl ON pl.persona_id = p.id
      WHERE p.id = $1
      GROUP BY p.id
    `, [id]);
    return rows[0] || null;
  },

  async findByLegacyId(legacyTipo, legacyId) {
    const rows = await query(`
      SELECT p.*
      FROM v2.persona p
      JOIN v2.persona_legacy pl ON pl.persona_id = p.id
      WHERE pl.legacy_tipo = $1 AND pl.legacy_id = $2
    `, [legacyTipo, legacyId]);
    return rows[0] || null;
  },

  async search(q) {
    const term = `%${q.toLowerCase()}%`;
    return query(`
      SELECT p.*
      FROM v2.persona p
      WHERE LOWER(p.nome || ' ' || COALESCE(p.cognome,'')) LIKE $1
         OR LOWER(COALESCE(p.email,'')) LIKE $1
      ORDER BY p.cognome NULLS LAST, p.nome
      LIMIT 50
    `, [term]);
  },

  async create({ nome, cognome, email, telefono, indirizzo, note, attivo = true }) {
    if (!nome?.trim()) throw Object.assign(new Error("nome obbligatorio"), { status: 400 });
    const rows = await query(`
      INSERT INTO v2.persona (nome, cognome, email, telefono, indirizzo, note, attivo)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [nome.trim(), cognome?.trim()||null, email?.trim()||null, telefono?.trim()||null,
        indirizzo?.trim()||null, note?.trim()||null, attivo]);
    return rows[0];
  },

  async update(id, { nome, cognome, email, telefono, indirizzo, note, attivo }) {
    const rows = await query(`
      UPDATE v2.persona
      SET nome=$1, cognome=$2, email=$3, telefono=$4, indirizzo=$5, note=$6,
          attivo=COALESCE($7, attivo)
      WHERE id=$8
      RETURNING *
    `, [nome?.trim(), cognome?.trim()||null, email?.trim()||null, telefono?.trim()||null,
        indirizzo?.trim()||null, note?.trim()||null, attivo, id]);
    if (!rows[0]) throw Object.assign(new Error("Persona non trovata"), { status: 404 });
    return rows[0];
  },

  async addLegacyRef(personaId, legacyTipo, legacyId) {
    await query(`
      INSERT INTO v2.persona_legacy (persona_id, legacy_tipo, legacy_id)
      VALUES ($1,$2,$3)
      ON CONFLICT DO NOTHING
    `, [personaId, legacyTipo, legacyId]);
  },

  // Statistiche per confronto legacy vs v2
  async quadratura() {
    const rows = await query(`
      SELECT
        (SELECT COUNT(*) FROM proprietari)                                       AS legacy_proprietari,
        (SELECT COUNT(*) FROM componenti)                                        AS legacy_componenti,
        (SELECT COUNT(*) FROM v2.persona_legacy WHERE legacy_tipo='proprietario') AS migrati_proprietari,
        (SELECT COUNT(*) FROM v2.persona_legacy WHERE legacy_tipo='componente')   AS migrati_componenti,
        (SELECT COUNT(*) FROM v2.persona)                                        AS persone_totali,
        (SELECT COUNT(*) FROM proprietari p WHERE NOT EXISTS (
          SELECT 1 FROM v2.persona_legacy pl WHERE pl.legacy_tipo='proprietario' AND pl.legacy_id=p.id
        ))                                                                       AS proprietari_orfani,
        (SELECT COUNT(*) FROM componenti c WHERE NOT EXISTS (
          SELECT 1 FROM v2.persona_legacy pl WHERE pl.legacy_tipo='componente' AND pl.legacy_id=c.id
        ))                                                                       AS componenti_orfani
    `);
    const r = rows[0];
    r.pass = (
      Number(r.legacy_proprietari) === Number(r.migrati_proprietari) &&
      Number(r.legacy_componenti)  === Number(r.migrati_componenti)  &&
      Number(r.proprietari_orfani) === 0 &&
      Number(r.componenti_orfani)  === 0
    );
    return r;
  },
};
