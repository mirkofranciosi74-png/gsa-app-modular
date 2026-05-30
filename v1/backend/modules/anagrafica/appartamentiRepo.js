import { query, transaction } from "../../shared/db/pool.js";

function dateStr(v) {
  if (!v || v === "") return null;
  return String(v).slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// APPARTAMENTI
// ─────────────────────────────────────────────────────────────────────────────
export async function listAll() {
  const apps = await query(
    `SELECT a.*, COALESCE(v.totale_spese,0) AS totale_spese
     FROM appartamenti a
     LEFT JOIN v_spese_appartamento v ON v.appartamento_id = a.id
     WHERE a.attivo = TRUE ORDER BY a.nome`
  );
  for (const a of apps) {
    a.componenti = await query(
      `SELECT c.*, COALESCE(s.versato_totale,0) AS versato_totale
       FROM componenti c
       LEFT JOIN v_saldo_componenti s ON s.componente_id = c.id
       WHERE c.appartamento_id = $1 ORDER BY c.nome`, [a.id]
    );
    const pRows = await query(
      `SELECT p.id, p.nome, p.cognome
       FROM appartamento_proprietari ap
       JOIN proprietari p ON p.id = ap.proprietario_id
       WHERE ap.appartamento_id = $1
         AND ap.proprietario_default = TRUE
         AND ap.data_inizio <= CURRENT_DATE
         AND (ap.data_fine IS NULL OR ap.data_fine >= CURRENT_DATE)
       ORDER BY ap.data_inizio DESC LIMIT 1`, [a.id]
    );
    a.default_proprietario = pRows[0] || null;
  }
  return apps;
}

export async function findById(id) {
  const rows = await query(`SELECT * FROM appartamenti WHERE id=$1`, [id]);
  const a = rows[0];
  if (!a) return null;
  a.componenti = await query(
    `SELECT * FROM componenti WHERE appartamento_id=$1 ORDER BY nome`, [id]
  );
  return a;
}

export async function create({ nome, via, citta, cap, note, componenti = [] }) {
  return transaction(async client => {
    const res = await client.query(
      `INSERT INTO appartamenti (nome,via,citta,cap,note)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [nome?.trim(), via||null, citta||null, cap||null, note||null]
    );
    const a = res.rows[0];
    a.componenti = [];
    for (const c of componenti) {
      const { id:_, _new:__, _appId:___, ...campi } = c;
      const cr = await client.query(
        `INSERT INTO componenti
           (appartamento_id,nome,cognome,email,telefono,
            percentuale,quota_affitto,caparra,validita_da,validita_a)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [a.id,
         campi.nome||null, campi.cognome||null,
         campi.email||null, campi.telefono||null,
         parseFloat(campi.percentuale||0),
         parseFloat(campi.quota_affitto||0)||null,
         parseFloat(campi.caparra||0)||null,
         dateStr(campi.validita_da), dateStr(campi.validita_a)]
      );
      a.componenti.push(cr.rows[0]);
    }
    return a;
  });
}

export async function update(id, { nome, via, citta, cap, note }) {
  const rows = await query(
    `UPDATE appartamenti SET nome=$1,via=$2,citta=$3,cap=$4,note=$5
     WHERE id=$6 RETURNING *`,
    [nome?.trim(), via||null, citta||null, cap||null, note||null, id]
  );
  if (!rows[0]) throw new Error(`Appartamento ${id} non trovato`);
  return rows[0];
}

export async function deactivate(id) {
  await query(`UPDATE appartamenti SET attivo=FALSE WHERE id=$1`, [id]);
}

export async function checkPercentuali(appId) {
  const rows = await query(
    `SELECT COALESCE(SUM(percentuale),0) AS tot
     FROM componenti WHERE appartamento_id=$1 AND attivo=TRUE`, [appId]
  );
  return parseFloat(rows[0]?.tot ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTI
// ─────────────────────────────────────────────────────────────────────────────
export async function addComponente(appId, c) {
  const { id:_, _new:__, _appId:___, ...campi } = c;
  const rows = await query(
    `INSERT INTO componenti
       (appartamento_id,nome,cognome,email,telefono,
        percentuale,quota_affitto,caparra,validita_da,validita_a)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [appId,
     campi.nome||null, campi.cognome||null,
     campi.email||null, campi.telefono||null,
     parseFloat(campi.percentuale||0),
     parseFloat(campi.quota_affitto||0)||null,
     parseFloat(campi.caparra||0)||null,
     dateStr(campi.validita_da), dateStr(campi.validita_a)]
  );
  return rows[0];
}

export async function updateComponente(appId, id, c) {
  const rows = await query(
    `UPDATE componenti
     SET nome=$1,cognome=$2,email=$3,telefono=$4,
         percentuale=$5,quota_affitto=$6,caparra=$7,
         validita_da=$8,validita_a=$9,attivo=$10
     WHERE id=$11 AND appartamento_id=$12 RETURNING *`,
    [c.nome||null, c.cognome||null, c.email||null, c.telefono||null,
     parseFloat(c.percentuale||0),
     parseFloat(c.quota_affitto||0)||null,
     parseFloat(c.caparra||0)||null,
     dateStr(c.validita_da), dateStr(c.validita_a),
     c.attivo ?? true,
     id, appId]
  );
  if (!rows[0]) throw new Error(`Componente ${id} non trovato`);
  return rows[0];
}

export async function deleteComponente(appId, id) {
  await query(
    `DELETE FROM componenti WHERE id=$1 AND appartamento_id=$2`, [id, appId]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPAGAZIONE DATE componente → movimenti
// ─────────────────────────────────────────────────────────────────────────────
export async function anteprimaPropagazioneDate(componenteId, validita_da, validita_a) {
  const vDa = dateStr(validita_da);
  const vA  = dateStr(validita_a);
  const rows = await query(
    `SELECT * FROM propaga_date_componente($1, $2::date, $3::date)`,
    [componenteId, vDa, vA]
  );
  return rows;
}

export async function propagaDateComponente(componenteId, validita_da, validita_a, altriCampi = {}) {
  const vDa = dateStr(validita_da);
  const vA  = dateStr(validita_a);

  return transaction(async client => {
    const preview = await client.query(
      `SELECT * FROM propaga_date_componente($1, $2::date, $3::date)`,
      [componenteId, vDa, vA]
    );

    await client.query(
      `UPDATE componenti
       SET nome=$1,cognome=$2,email=$3,telefono=$4,
           percentuale=$5,quota_affitto=$6,caparra=$7,
           validita_da=$8,validita_a=$9,attivo=$10
       WHERE id=$11`,
      [altriCampi.nome||null, altriCampi.cognome||null,
       altriCampi.email||null, altriCampi.telefono||null,
       parseFloat(altriCampi.percentuale||0),
       parseFloat(altriCampi.quota_affitto||0)||null,
       parseFloat(altriCampi.caparra||0)||null,
       vDa, vA,
       altriCampi.attivo ?? true,
       componenteId]
    );

    for (const row of preview.rows) {
      const newDa = row.new_val_da ? String(row.new_val_da).slice(0,10) : null;
      const newA  = row.new_val_a  ? String(row.new_val_a).slice(0,10)  : null;
      await client.query(
        `UPDATE movimenti SET validita_da=$1, validita_a=$2 WHERE id=$3`,
        [newDa, newA, row.mov_id]
      );
    }

    return preview.rows.length;
  });
}
