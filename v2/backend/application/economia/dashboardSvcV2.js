import { query } from "../../shared/db/pool.js";
import { righeGrigliaV2, grigliaProprietariV2 } from "./grigliaSvcV2.js";

const toYM  = v => (v ? String(v).slice(0, 7) : null);
const oggiYM = () => new Date().toISOString().slice(0, 7);
const FUTURO  = "2999-12";
const r2 = v => Math.round((v || 0) * 100) / 100;

function _mesiRange(da, a) {
  if (!da || !a || da > a) return [];
  const res = [];
  let [cy, cm] = da.split("-").map(Number);
  const [ey, em] = a.split("-").map(Number);
  while (cy < ey || (cy === ey && cm <= em)) {
    res.push(`${cy}-${String(cm).padStart(2, "0")}`);
    cm++; if (cm > 12) { cm = 1; cy++; }
  }
  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD INQUILINI
// ─────────────────────────────────────────────────────────────────────────────
export async function dashboardInquiliniV2(allowedIds = null) {
  const periodoA = oggiYM();

  let immobiliRows = await query(`
    SELECT i.id, i.nome FROM v2.immobile i
    WHERE i.attivo = TRUE AND LOWER(i.nome) NOT LIKE '%parma%'
    ORDER BY i.nome
  `);
  if (allowedIds) immobiliRows = immobiliRows.filter(r => allowedIds.includes(r.id));

  const perAppartamento = [];

  for (const imm of immobiliRows) {
    const primaRows = await query(`
      SELECT to_char(
        COALESCE(
          MIN(rp.validita_da),
          (SELECT MIN(COALESCE((fe.periodo_da || '-01')::date, fe.rif_da))
           FROM v2.fatto_economico fe
           WHERE fe.immobile_id = $1
              OR (fe.condominio_id = (SELECT condominio_id FROM v2.immobile WHERE id = $1)
                  AND fe.immobile_id IS NULL))
        ),
        'YYYY-MM'
      ) AS prima_data
      FROM v2.ruolo_persona rp
      WHERE rp.immobile_id = $1 AND rp.ruolo = 'inquilino'
    `, [imm.id]);
    const periodoDA = primaRows[0]?.prima_data || "2019-01";

    const g = await righeGrigliaV2(imm.id, periodoDA, periodoA);
    const { persone, righeSpese, righeEntrate, totaliDovuto, totaliVersato } = g;

    // Affitto: quota_affitto × mesi attivi
    const mesiPer = _mesiRange(periodoDA, periodoA);
    const totAff  = {};
    for (const p of persone) {
      totAff[p.id] = 0;
      const da = p.validitaDa || "2000-01";
      const a  = p.validitaA  || FUTURO;
      for (const mese of mesiPer) {
        if (mese >= da && mese <= a && p.quotaAffitto)
          totAff[p.id] += p.quotaAffitto;
      }
    }

    const totSpese   = r2(persone.reduce((s, p) => s + (totaliDovuto[p.id]  || 0), 0));
    const totVers    = r2(persone.reduce((s, p) => s + (totaliVersato[p.id] || 0), 0));
    const totAffGlob = r2(persone.reduce((s, p) => s + (totAff[p.id]        || 0), 0));
    const saldo      = r2(totVers - totSpese - totAffGlob);

    // Mesi scoperti: mesi attivi con quota_affitto ma senza entrata attribuita
    const mesiScoperti = [];
    for (const p of persone) {
      if (!p.quotaAffitto) continue;
      const da = p.validitaDa || "2000-01";
      const a  = p.validitaA  || FUTURO;
      const mancanti = [];
      for (const mese of mesiPer) {
        if (mese < da || mese > a) continue;
        const coperto = righeEntrate.some(r =>
          r.paganteId === p.id &&
          r.periodoDa <= mese &&
          (r.periodoA ?? r.periodoDa) >= mese
        );
        if (!coperto) mancanti.push(mese);
      }
      if (mancanti.length) mesiScoperti.push({ personaId: p.id, personaLabel: p.label, mesi: mancanti });
    }

    const perInquilino = persone.map(p => ({
      id:            p.id,
      nome:          p.label,
      totaleSpese:   r2(totaliDovuto[p.id]  || 0),
      totaleVersato: r2(totaliVersato[p.id] || 0),
      totaleAffitto: r2(totAff[p.id]        || 0),
      saldo:         r2((totaliVersato[p.id] || 0) - (totaliDovuto[p.id] || 0) - (totAff[p.id] || 0)),
    }));

    perAppartamento.push({
      id:               imm.id,
      nome:             imm.nome,
      periodoDA,
      totaleSpese:      totSpese,
      totaleVersamenti: totVers,
      totaleAffitto:    totAffGlob,
      saldo,
      mesiScoperti,
      perInquilino,
    });
  }

  return {
    periodoA,
    totaleSpese:      r2(perAppartamento.reduce((s, a) => s + a.totaleSpese,      0)),
    totaleVersamenti: r2(perAppartamento.reduce((s, a) => s + a.totaleVersamenti, 0)),
    totaleAffitto:    r2(perAppartamento.reduce((s, a) => s + a.totaleAffitto,    0)),
    saldoGlobale:     r2(perAppartamento.reduce((s, a) => s + a.saldo,            0)),
    perAppartamento,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD PROPRIETARI
// ─────────────────────────────────────────────────────────────────────────────
export async function dashboardProprietariV2(allowedIds = null) {
  const periodoA = oggiYM();

  let immobiliRows = await query(`
    SELECT id, nome FROM v2.immobile WHERE attivo = TRUE ORDER BY nome
  `);
  if (allowedIds) immobiliRows = immobiliRows.filter(r => allowedIds.includes(r.id));

  const perAppartamento = [];

  for (const imm of immobiliRows) {
    const primaRows = await query(`
      SELECT to_char(
        COALESCE(
          MIN(rp.validita_da),
          (SELECT MIN(COALESCE((fe.periodo_da || '-01')::date, fe.rif_da))
           FROM v2.fatto_economico fe
           WHERE fe.immobile_id = $1
              OR (fe.condominio_id = (SELECT condominio_id FROM v2.immobile WHERE id = $1)
                  AND fe.immobile_id IS NULL))
        ),
        'YYYY-MM'
      ) AS prima_data
      FROM v2.ruolo_persona rp
      WHERE rp.immobile_id = $1 AND rp.ruolo = 'proprietario'
    `, [imm.id]);
    const periodoDA = primaRows[0]?.prima_data || "2019-01";

    const g = await grigliaProprietariV2(imm.id, periodoDA, periodoA);
    const { props, totaliDareTeorico, totaliAvereTeorico, totaliPagato, totaliIncassato } = g;
    if (!props.length) continue;

    const perProprietario = props.map(p => {
      const dareTeorico  = r2(totaliDareTeorico[p.id]  || 0);
      const avereTeorico = r2(totaliAvereTeorico[p.id] || 0);
      const pagato       = r2(totaliPagato[p.id]       || 0);
      const incassato    = r2(totaliIncassato[p.id]    || 0);
      const conguaglio   = r2(pagato - incassato - dareTeorico + avereTeorico);
      return { id: p.id, nome: p.label, dareTeorico, avereTeorico, pagato, incassato, conguaglio };
    });

    const totalePagato    = r2(perProprietario.reduce((s, p) => s + p.pagato,    0));
    const totaleIncassato = r2(perProprietario.reduce((s, p) => s + p.incassato, 0));

    perAppartamento.push({
      id:    imm.id,
      nome:  imm.nome,
      periodoDA,
      saldoReale:     r2(totaleIncassato - totalePagato),
      totalePagato,
      totaleIncassato,
      perProprietario,
    });
  }

  const totPagato    = r2(perAppartamento.reduce((s, a) => s + a.totalePagato,    0));
  const totIncassato = r2(perAppartamento.reduce((s, a) => s + a.totaleIncassato, 0));

  return {
    periodoA,
    saldoReale: r2(totIncassato - totPagato),
    perAppartamento,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS FATTI (equivalente stats documenti v1)
// ─────────────────────────────────────────────────────────────────────────────
export async function dashboardStatsFattiV2() {
  const rows = await query(`
    SELECT
      COUNT(*) FILTER (WHERE stato = 'elaborato')      AS elaborati,
      COUNT(*) FILTER (WHERE stato = 'da_verificare')  AS da_verificare,
      COUNT(*) FILTER (WHERE stato = 'errore')         AS errori,
      COUNT(*) FILTER (WHERE stato = 'duplicato')      AS duplicati,
      COUNT(*) FILTER (WHERE nome_file IS NOT NULL)    AS con_pdf,
      COUNT(*)                                          AS totale
    FROM v2.fatto_economico
  `);
  return rows[0] || {};
}

// ─────────────────────────────────────────────────────────────────────────────
// FATTI RECENTI (ultimi con PDF allegato)
// ─────────────────────────────────────────────────────────────────────────────
export async function dashboardFattiRecentiV2() {
  return query(`
    SELECT fe.id, fe.nome, fe.nome_file, fe.stato, fe.periodo_da, fe.rif_da, fe.tipo,
           i.nome AS immobile_nome,
           ts.descrizione AS tipo_desc
    FROM v2.fatto_economico fe
    LEFT JOIN v2.immobile i  ON i.id  = fe.immobile_id
    LEFT JOIN tipi_spesa  ts ON ts.id = fe.tipo_spesa_id
    WHERE fe.nome_file IS NOT NULL
    ORDER BY fe.created_at DESC NULLS LAST, fe.id DESC
    LIMIT 10
  `);
}
