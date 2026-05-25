import { query, transaction } from "../../shared/db/pool.js";
import bcrypt from "bcryptjs";

export const userRepo = {

  async findByProvider(provider, providerId) {
    const rows = await query(
      `SELECT * FROM users WHERE provider=$1 AND provider_id=$2`,
      [provider, providerId]
    );
    return rows[0] || null;
  },

  async upsert({ email, nome, cognome, avatar_url, provider, provider_id }) {
    // Se esiste un utente pre-registrato manualmente con questa email, aggiornalo con il provider OAuth
    const manual = await query(
      `SELECT * FROM users WHERE email=$1 AND provider='manual'`, [email.toLowerCase().trim()]
    );
    if (manual[0]) {
      const rows = await query(`
        UPDATE users SET
          provider    = $1,
          provider_id = $2,
          nome        = CASE WHEN nome='' OR nome IS NULL THEN $3::text ELSE nome END,
          cognome     = CASE WHEN cognome='' OR cognome IS NULL THEN $4::text ELSE cognome END,
          avatar_url  = COALESCE($5::text, avatar_url),
          last_login  = now()
        WHERE id = $6 RETURNING *
      `, [provider, provider_id, nome, cognome, avatar_url, manual[0].id]);
      return rows[0];
    }

    const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
    const isAdmin    = adminEmail && email.toLowerCase() === adminEmail;

    const [{ count }] = await query(`SELECT COUNT(*)::int AS count FROM users`);
    const defaultRuolo = (isAdmin || count === 0) ? "admin" : "viewer";

    const rows = await query(`
      INSERT INTO users (email, nome, cognome, avatar_url, provider, provider_id, ruolo, last_login)
      VALUES ($1,$2,$3,$4,$5,$6,$7,now())
      ON CONFLICT (provider, provider_id) DO UPDATE SET
        email      = EXCLUDED.email,
        nome       = EXCLUDED.nome,
        cognome    = EXCLUDED.cognome,
        avatar_url = EXCLUDED.avatar_url,
        last_login = now(),
        ruolo = CASE
          WHEN users.ruolo = 'admin' THEN 'admin'
          WHEN $8                    THEN 'admin'
          ELSE users.ruolo
        END
      RETURNING *
    `, [email, nome, cognome, avatar_url, provider, provider_id, defaultRuolo, isAdmin]);
    return rows[0];
  },

  async createManual({ email, nome, cognome, ruolo }) {
    const em = email.toLowerCase().trim();
    const rows = await query(`
      INSERT INTO users (email, nome, cognome, provider, provider_id, ruolo)
      VALUES ($1, $2, $3, 'manual', $1, $4)
      ON CONFLICT (email) DO UPDATE SET
        ruolo   = EXCLUDED.ruolo,
        nome    = CASE WHEN EXCLUDED.nome='' THEN users.nome ELSE EXCLUDED.nome END,
        cognome = CASE WHEN EXCLUDED.cognome='' THEN users.cognome ELSE EXCLUDED.cognome END
      RETURNING *
    `, [em, nome || '', cognome || '', ruolo]);
    return rows[0];
  },

  async listAll() {
    return query(
      `SELECT id, email, nome, cognome, avatar_url, ruolo, attivo, created_at, last_login
       FROM users ORDER BY created_at`
    );
  },

  async findById(id) {
    const rows = await query(`SELECT * FROM users WHERE id=$1`, [id]);
    return rows[0] || null;
  },

  async updateRuolo(id, ruolo) {
    const rows = await query(
      `UPDATE users SET ruolo=$2 WHERE id=$1 RETURNING *`, [id, ruolo]
    );
    return rows[0];
  },

  async updateAttivo(id, attivo) {
    const rows = await query(
      `UPDATE users SET attivo=$2 WHERE id=$1 RETURNING *`, [id, attivo]
    );
    return rows[0];
  },

  async remove(id) {
    await query(`DELETE FROM users WHERE id=$1`, [id]);
  },

  // ── Restrizioni viewer ──────────────────────────────────────────────────────

  async getAppartamenti(userId) {
    return query(
      `SELECT a.id, a.nome
       FROM viewer_appartamenti va
       JOIN appartamenti a ON a.id = va.appartamento_id
       WHERE va.user_id = $1
       ORDER BY a.nome`, [userId]
    );
  },

  async setAppartamenti(userId, ids) {
    await transaction(async c => {
      await c.query(`DELETE FROM viewer_appartamenti WHERE user_id=$1`, [userId]);
      for (const id of ids) {
        await c.query(
          `INSERT INTO viewer_appartamenti(user_id,appartamento_id)
           VALUES($1,$2) ON CONFLICT DO NOTHING`, [userId, id]
        );
      }
    });
  },

  async getInquilini(userId) {
    return query(
      `SELECT c.id, c.nome, c.cognome
       FROM viewer_inquilini vi
       JOIN componenti c ON c.id = vi.componente_id
       WHERE vi.user_id = $1
       ORDER BY c.cognome, c.nome`, [userId]
    );
  },

  async setPassword(userId, plainPassword) {
    const hash = await bcrypt.hash(plainPassword, 12);
    await query(`UPDATE users SET password_hash=$2 WHERE id=$1`, [userId, hash]);
  },

  async removePassword(userId) {
    await query(`UPDATE users SET password_hash=NULL WHERE id=$1`, [userId]);
  },

  async verifyPassword(email, plainPassword) {
    const rows = await query(
      `SELECT * FROM users WHERE email=$1 AND attivo=true`,
      [email.toLowerCase().trim()]
    );
    const user = rows[0];
    if (!user || !user.password_hash) return null;
    const ok = await bcrypt.compare(plainPassword, user.password_hash);
    return ok ? user : null;
  },

  async setInquilini(userId, ids) {
    await transaction(async c => {
      await c.query(`DELETE FROM viewer_inquilini WHERE user_id=$1`, [userId]);
      for (const id of ids) {
        await c.query(
          `INSERT INTO viewer_inquilini(user_id,componente_id)
           VALUES($1,$2) ON CONFLICT DO NOTHING`, [userId, id]
        );
      }
    });
  },
};
