/**
 * Motore di calcolo riparti v2.
 * Implementa la gerarchia di regole dichiarativa e temporale.
 *
 * Gerarchia (priorità decrescente):
 *   1. Regola specifica: immobile + tipo_spesa + periodo
 *   2. Regola tipo_spesa: immobile + tipo_spesa (senza periodo)
 *   3. Default immobile: immobile (tipo_spesa NULL)
 *   4. Default globale: parti uguali tra tutti i ruoli attivi nel periodo
 */

import { query } from "../../../shared/db/pool.js";

async function trovaRegola(immobileId, tipoSpesaId, mese) {
  // Cerca regola più specifica applicabile al mese
  const rows = await query(`
    SELECT rr.*, ARRAY_AGG(
      JSON_BUILD_OBJECT(
        'persona_id', rrd.persona_id,
        'includi', rrd.includi,
        'percentuale', rrd.percentuale
      )
    ) FILTER (WHERE rrd.id IS NOT NULL) AS dettagli
    FROM v2.regola_riparto rr
    LEFT JOIN v2.regola_riparto_dettaglio rrd ON rrd.regola_id = rr.id
    WHERE rr.immobile_id = $1
      AND ($2::UUID IS NULL OR rr.tipo_spesa_id = $2 OR rr.tipo_spesa_id IS NULL)
      AND (rr.validita_da IS NULL OR rr.validita_da <= $3)
      AND (rr.validita_a  IS NULL OR rr.validita_a  >= $3)
    GROUP BY rr.id
    ORDER BY
      -- Priorità: con tipo_spesa > senza; con periodo > senza
      (rr.tipo_spesa_id IS NOT NULL) DESC,
      (rr.validita_da IS NOT NULL OR rr.validita_a IS NOT NULL) DESC
    LIMIT 1
  `, [immobileId, tipoSpesaId||null, mese]);

  return rows[0] || null;
}

async function ruoliAttiviInMese(immobileId, mese, target) {
  return query(`
    SELECT rp.persona_id, rp.quota, p.nome, p.cognome
    FROM v2.ruolo_persona rp
    JOIN v2.persona p ON p.id = rp.persona_id
    WHERE rp.immobile_id = $1
      AND rp.ruolo = $2
      AND (rp.validita_da IS NULL OR rp.validita_da <= ($3 || '-01')::DATE)
      AND (rp.validita_a  IS NULL OR rp.validita_a  >= ($3 || '-01')::DATE)
  `, [immobileId, target === 'proprietari' ? 'proprietario' : 'inquilino', mese]);
}

/**
 * Calcola la distribuzione di un importo tra le persone.
 * @returns Array di { persona_id, nome, cognome, quota_pct, importo }
 */
export async function calcolaRiparto({ immobileId, tipoSpesaId, mese, importo, target = 'inquilini' }) {
  const regola   = await trovaRegola(immobileId, tipoSpesaId, mese);
  const attivi   = await ruoliAttiviInMese(immobileId, mese, target);

  if (attivi.length === 0) return [];

  // Nessuna regola → default parti uguali
  if (!regola) {
    const quota = 100 / attivi.length;
    return attivi.map(a => ({
      persona_id: a.persona_id,
      nome:       a.nome,
      cognome:    a.cognome,
      quota_pct:  quota,
      importo:    Math.round(importo * quota) / 100,
      fonte:      'default_uguale',
    }));
  }

  // Determina chi partecipa
  const dettagli = regola.dettagli || [];
  const esclusioni = new Set(dettagli.filter(d => !d.includi).map(d => d.persona_id));
  const inclusioni = new Set(dettagli.filter(d => d.includi).map(d => d.persona_id));

  let partecipanti;
  if (regola.modalita === 'includi' && inclusioni.size > 0) {
    partecipanti = attivi.filter(a => inclusioni.has(a.persona_id));
  } else {
    partecipanti = attivi.filter(a => !esclusioni.has(a.persona_id));
  }

  if (partecipanti.length === 0) return [];

  // Calcola quote
  const quotaTotale = Number(regola.quota_totale_pct);

  if (regola.split_uguale) {
    const quota = quotaTotale / partecipanti.length;
    return partecipanti.map(p => ({
      persona_id: p.persona_id,
      nome:       p.nome,
      cognome:    p.cognome,
      quota_pct:  quota,
      importo:    Math.round(importo * quota) / 100,
      fonte:      'split_uguale',
    }));
  }

  // Quote per percentuale (da dettaglio o da quota persona)
  return partecipanti.map(p => {
    const det = dettagli.find(d => d.persona_id === p.persona_id && d.includi);
    const quotaPct = det?.percentuale != null
      ? Number(det.percentuale)
      : Number(p.quota) || (quotaTotale / partecipanti.length);
    return {
      persona_id: p.persona_id,
      nome:       p.nome,
      cognome:    p.cognome,
      quota_pct:  quotaPct,
      importo:    Math.round(importo * quotaPct) / 100,
      fonte:      det?.percentuale != null ? 'regola_dettaglio' : 'quota_persona',
    };
  });
}

/**
 * Confronto output legacy vs v2 per un immobile e un mese.
 */
export async function confrontaConLegacy(immobileId, mese) {
  // Legacy: usa la vista v_movimenti_dettaglio che contiene importo_netto per componente
  const legacyRows = await query(`
    SELECT
      pl.persona_id,
      SUM(m.importo * m.segno) AS legacy_netto
    FROM movimenti m
    JOIN v2.persona_legacy pl ON pl.legacy_tipo='componente' AND pl.legacy_id=m.componente_id
    WHERE m.appartamento_id = (SELECT legacy_id FROM v2.immobile WHERE id = $1)
      AND m.mese_riferimento = $2
    GROUP BY pl.persona_id
  `, [immobileId, mese]);

  // v2: fatti economici del mese
  const v2Rows = await query(`
    SELECT
      fe.persona_id,
      SUM(fe.importo * fe.segno) AS v2_netto
    FROM v2.fatto_economico fe
    WHERE fe.immobile_id = $1
      AND fe.periodo_da = $2
    GROUP BY fe.persona_id
  `, [immobileId, mese]);

  const result = new Map();
  legacyRows.forEach(r => {
    result.set(r.persona_id, { legacy_netto: Number(r.legacy_netto), v2_netto: 0 });
  });
  v2Rows.forEach(r => {
    const existing = result.get(r.persona_id) || { legacy_netto: 0, v2_netto: 0 };
    existing.v2_netto = Number(r.v2_netto);
    result.set(r.persona_id, existing);
  });

  return Array.from(result.entries()).map(([persona_id, v]) => ({
    persona_id,
    legacy_netto: v.legacy_netto,
    v2_netto:     v.v2_netto,
    delta:        Math.abs(v.legacy_netto - v.v2_netto),
    ok:           Math.abs(v.legacy_netto - v.v2_netto) < 0.01,
  }));
}
