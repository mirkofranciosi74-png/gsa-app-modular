import ExcelJS         from "exceljs";
import { createRequire } from "node:module";
import { leggiPdf }      from "../../shared/storage.js";

const require = createRequire(import.meta.url);
let JSZip;
try { JSZip = require("jszip"); }
catch { throw new Error("jszip non installato — esegui: npm install jszip"); }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const MESI    = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
const FUTURO  = "2999-12";
const TV_LABEL = { affitto:"Affitto", conguaglio:"Conguaglio", rimborso:"Rimborso", altro:"Altro" };

function ym2label(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return `${MESI[parseInt(m, 10) - 1]} ${y}`;
}
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
function toYM(v) { return v ? String(v).slice(0, 7) : null; }

/** Righe affitto mensili a partire da comps.quota_affitto */
function _buildRigheAffitto(comps, periodoDA, periodoA) {
  if (!periodoDA && !periodoA) return [];
  const oggiYM = new Date().toISOString().slice(0, 7);
  return _mesiRange(periodoDA || "2000-01", periodoA || oggiYM)
    .map(mese => {
      const quote = {};
      for (const c of comps) {
        const cDa = toYM(c.validita_da) || "2000-01";
        const cA  = toYM(c.validita_a)  || FUTURO;
        quote[c.id] = mese >= cDa && mese <= cA && parseFloat(c.quota_affitto || 0) > 0
          ? parseFloat(c.quota_affitto)
          : 0;
      }
      return { mese, quote };
    })
    .filter(r => Object.values(r.quote).some(v => v > 0));
}

/** Spese raggruppate per tipo (vista sintetica) */
function _righeSinteticheDocumenti(righeDocumenti, comps) {
  const gruppi = new Map();
  for (const r of righeDocumenti) {
    const tipo = r.tipo_descrizione || r.nome_file || "Spesa";
    if (!gruppi.has(tipo)) {
      const quote = {};
      for (const c of comps) quote[c.id] = 0;
      gruppi.set(tipo, { label: tipo, periodo_da: r.periodo_da, periodo_a: r.periodo_a || r.periodo_da, importo: 0, quote });
    }
    const g = gruppi.get(tipo);
    g.importo += r.importo || 0;
    if (r.periodo_da && (!g.periodo_da || r.periodo_da < g.periodo_da)) g.periodo_da = r.periodo_da;
    const fa = r.periodo_a || r.periodo_da;
    if (fa && (!g.periodo_a || fa > g.periodo_a)) g.periodo_a = fa;
    for (const c of comps) g.quote[c.id] = (g.quote[c.id] || 0) + (r.quote[c.id] || 0);
  }
  return [...gruppi.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Versamenti raggruppati per tipo+mese (vista sintetica) */
function _righeSintetiche(righeMovimenti, comps) {
  const gruppi = new Map();
  for (const r of righeMovimenti) {
    const tipo = r.tipo_versamento || "affitto";
    const mese = r.mese_riferimento ? String(r.mese_riferimento).slice(0, 7) : r.periodo_da;
    const key  = `${tipo}::${mese}`;
    if (!gruppi.has(key)) {
      const quote = {};
      for (const c of comps) quote[c.id] = 0;
      gruppi.set(key, { tipo, mese, periodo_da: mese, periodo_a: mese, importo: 0, quote });
    }
    const g = gruppi.get(key);
    g.importo += r.importo;
    for (const c of comps) g.quote[c.id] = (g.quote[c.id] || 0) + (r.quote[c.id] || 0);
  }
  return [...gruppi.values()].sort((a, b) =>
    a.mese < b.mese ? -1 : a.mese > b.mese ? 1 : a.tipo.localeCompare(b.tipo)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stili comuni
// ─────────────────────────────────────────────────────────────────────────────
function makeStyles() {
  const fill = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const fnt  = o    => ({ name: "Calibri", size: 10, ...o });
  const al   = (h, v = "middle") => ({ horizontal: h, vertical: v, wrapText: true });
  const brd  = () => ({
    top:    { style: "thin", color: { argb: "BDC3C7" } },
    left:   { style: "thin", color: { argb: "BDC3C7" } },
    bottom: { style: "thin", color: { argb: "BDC3C7" } },
    right:  { style: "thin", color: { argb: "BDC3C7" } },
  });
  return { fill, fnt, al, brd };
}

// ─────────────────────────────────────────────────────────────────────────────
// SHEET INQUILINI  (dettaglio o sintetico)
// ─────────────────────────────────────────────────────────────────────────────
function _buildSheetInquilini(wb, dati, periodoDA, periodoA, sintetico = false) {
  const { comps, righeDocumenti, righeMovimenti, totaliDovuto, totaliVersato } = dati;
  const { fill, fnt, al, brd } = makeStyles();

  const righeAffitto = _buildRigheAffitto(comps, periodoDA, periodoA);
  const totaliAffitto = {};
  for (const c of comps)
    totaliAffitto[c.id] = righeAffitto.reduce((s, r) => s + (r.quote[c.id] || 0), 0);
  const conguagli = {};
  for (const c of comps)
    conguagli[c.id] = (totaliVersato[c.id] || 0) - (totaliDovuto[c.id] || 0) - (totaliAffitto[c.id] || 0);

  const wsName = sintetico ? "Sintetica Inquilini" : "Griglia Inquilini";
  const ws = wb.addWorksheet(wsName, { views: [{ state: "frozen", xSplit: 2, ySplit: 3 }] });

  const C = {
    headerBg:     "1A3A5C", headerFg:     "FFFFFF",
    speseBg:      "C0392B", speseLight:   "FDECEA",
    versatoBg:    "1A7A3C", versatoLight: "E6F9EE",
    affittoBg:    "B7770D", affittoLight: "FFFBEB",
    congBg:       "1A3A5C",
    totBg:        "2C3E50", totFg:        "ECF0F1",
  };

  const nCols = 3 + comps.length;

  // ── Titolo (riga 1) ──────────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, nCols);
  const titolo = ws.getCell(1, 1);
  const rangeL = [
    periodoDA ? ym2label(periodoDA) : "inizio",
    periodoA  ? ym2label(periodoA)  : "oggi",
  ].join(" → ");
  titolo.value     = `Griglia Economica Inquilini${sintetico ? " (Sintetica)" : ""} — ${rangeL}`;
  titolo.font      = fnt({ bold: true, size: 14, color: { argb: C.headerFg } });
  titolo.fill      = fill(C.headerBg);
  titolo.alignment = al("center");
  ws.getRow(1).height = 26;

  // ── Intestazioni colonne (riga 2) ────────────────────────────────────────
  ws.getRow(2).height = 42;
  ["Voce", "Periodo", "Totale", ...comps.map(c =>
    `${c.label || `${c.nome} ${c.cognome || ""}`.trim()}\n${c.percentuale || ""}%` +
    (c.validita_da ? `\ndal ${ym2label(String(c.validita_da).slice(0, 7))}` : "") +
    (c.validita_a  ? `\nal ${ym2label(String(c.validita_a).slice(0, 7))}`   : "")
  )].forEach((h, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = h; cell.font = fnt({ bold: true, color: { argb: C.headerFg } });
    cell.fill  = fill(C.headerBg); cell.alignment = al("center"); cell.border = brd();
  });

  let row = 3;

  const addSep = (label, bg) => {
    ws.mergeCells(row, 1, row, nCols);
    const c = ws.getCell(row, 1);
    c.value = label; c.font = fnt({ bold: true, color: { argb: "FFFFFF" } });
    c.fill = fill(bg); c.alignment = al("left");
    ws.getRow(row).height = 18; row++;
  };

  const addDataRow = (label, periodo_da, periodo_a, totale, quoteMap, lightBg, fontColor) => {
    ws.getRow(row).height = 20;
    const periodo = [
      ym2label(periodo_da),
      periodo_a && periodo_a !== periodo_da ? ym2label(periodo_a) : null,
    ].filter(Boolean).join(" → ");

    const c1 = ws.getCell(row, 1);
    c1.value = label; c1.fill = fill(lightBg); c1.border = brd();
    c1.alignment = al("left"); c1.font = fnt({});

    const c2 = ws.getCell(row, 2);
    c2.value = periodo; c2.fill = fill(lightBg); c2.border = brd();
    c2.alignment = al("center"); c2.font = fnt({ size: 9 });

    const c3 = ws.getCell(row, 3);
    c3.value = totale || null; c3.numFmt = "#,##0.00";
    c3.fill = fill(lightBg); c3.alignment = al("right");
    c3.border = brd(); c3.font = fnt({ bold: true });

    comps.forEach((c, ci) => {
      const cell = ws.getCell(row, 4 + ci);
      const v = quoteMap?.[c.id] || 0;
      cell.value = v !== 0 ? v : null;
      cell.numFmt = "#,##0.00"; cell.fill = fill(lightBg);
      cell.alignment = al("right"); cell.border = brd();
      if (fontColor) cell.font = fnt({ color: { argb: fontColor } });
    });
    row++;
  };

  const addTotRow = (label, totMap, fontArgb, bgArgb) => {
    ws.getRow(row).height = 22;
    ws.mergeCells(row, 1, row, 2);
    const c1 = ws.getCell(row, 1);
    c1.value = label; c1.font = fnt({ bold: true, color: { argb: C.totFg } });
    c1.fill = fill(bgArgb); c1.alignment = al("left");

    const totGlob = comps.reduce((s, c) => s + (totMap[c.id] || 0), 0);
    const cT = ws.getCell(row, 3);
    cT.value = totGlob; cT.numFmt = "#,##0.00";
    cT.font = fnt({ bold: true, color: { argb: fontArgb } });
    cT.fill = fill(bgArgb); cT.alignment = al("right"); cT.border = brd();

    comps.forEach((c, ci) => {
      const cell = ws.getCell(row, 4 + ci);
      cell.value = totMap[c.id] || 0; cell.numFmt = "#,##0.00";
      cell.font = fnt({ bold: true, color: { argb: fontArgb } });
      cell.fill = fill(bgArgb); cell.alignment = al("right"); cell.border = brd();
    });
    row++;
  };

  const sumQ = r => comps.reduce((s, c) => s + (r.quote[c.id] || 0), 0);

  // ── SPESE ──────────────────────────────────────────────────────────────────
  const righeSpese = sintetico
    ? _righeSinteticheDocumenti(righeDocumenti, comps)
    : righeDocumenti;
  addSep("▼  SPESE — quota dovuta per componente", C.speseBg);
  if (righeSpese.length === 0) {
    ws.mergeCells(row, 1, row, nCols);
    ws.getCell(row, 1).value = "Nessuna spesa nel periodo";
    ws.getCell(row, 1).font = fnt({ color: { argb: "888888" } }); row++;
  } else {
    for (const r of righeSpese)
      addDataRow(r.label, r.periodo_da, r.periodo_a, sumQ(r), r.quote, C.speseLight);
  }
  addTotRow("Totale dovuto (spese)", totaliDovuto, "C0392B", C.totBg);

  // ── VERSAMENTI ─────────────────────────────────────────────────────────────
  const righeVers = sintetico ? _righeSintetiche(righeMovimenti, comps) : righeMovimenti;
  addSep("▼  VERSAMENTI — importi versati per componente", C.versatoBg);
  if (righeVers.length === 0) {
    ws.mergeCells(row, 1, row, nCols);
    ws.getCell(row, 1).value = "Nessun versamento nel periodo";
    ws.getCell(row, 1).font = fnt({ color: { argb: "888888" } }); row++;
  } else {
    for (const r of righeVers) {
      const label = sintetico ? (TV_LABEL[r.tipo] || r.tipo) : r.label;
      addDataRow(label, r.periodo_da, r.periodo_a, sumQ(r), r.quote, C.versatoLight, "1A7A3C");
    }
  }
  addTotRow("Totale versato", totaliVersato, "1A7A3C", C.totBg);

  // ── AFFITTO ────────────────────────────────────────────────────────────────
  addSep("▼  AFFITTO — quota mensile dovuta per componente", C.affittoBg);
  if (righeAffitto.length === 0) {
    ws.mergeCells(row, 1, row, nCols);
    ws.getCell(row, 1).value = "Nessuna quota affitto nel periodo";
    ws.getCell(row, 1).font = fnt({ color: { argb: "888888" } }); row++;
  } else {
    for (const r of righeAffitto)
      addDataRow("Affitto", r.mese, null, sumQ(r), r.quote, C.affittoLight, "B7770D");
  }
  addTotRow("Totale affitto", totaliAffitto, "B7770D", C.totBg);

  // ── CONGUAGLIO ─────────────────────────────────────────────────────────────
  ws.getRow(row).height = 24;
  ws.mergeCells(row, 1, row, 2);
  const cCong = ws.getCell(row, 1);
  cCong.value     = "Conguaglio finale  (Versato − Spese − Affitto)";
  cCong.font      = fnt({ bold: true, size: 11, color: { argb: "FFFFFF" } });
  cCong.fill      = fill(C.congBg);
  cCong.alignment = al("left");

  const totCong = comps.reduce((s, c) => s + (conguagli[c.id] || 0), 0);
  const cCongTot = ws.getCell(row, 3);
  cCongTot.value     = totCong;
  cCongTot.numFmt    = '+#,##0.00;-#,##0.00;"—"';
  cCongTot.font      = fnt({ bold: true, size: 11, color: { argb: totCong >= 0 ? "1A7A3C" : "C0392B" } });
  cCongTot.fill      = fill(C.congBg);
  cCongTot.alignment = al("right");
  cCongTot.border    = brd();

  comps.forEach((c, ci) => {
    const v    = conguagli[c.id] || 0;
    const cell = ws.getCell(row, 4 + ci);
    cell.value     = v;
    cell.numFmt    = '+#,##0.00;-#,##0.00;"—"';
    cell.font      = fnt({ bold: true, size: 11, color: { argb: v >= 0 ? "1A7A3C" : "C0392B" } });
    cell.fill      = fill(C.congBg);
    cell.alignment = al("right");
    cell.border    = brd();
  });

  // ── Larghezze ──────────────────────────────────────────────────────────────
  ws.getColumn(1).width = 40;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 14;
  comps.forEach((_, ci) => { ws.getColumn(4 + ci).width = 17; });
}

// ─────────────────────────────────────────────────────────────────────────────
// SHEET PROPRIETARI
// ─────────────────────────────────────────────────────────────────────────────
function _buildSheetProprietari(wb, datiProp, periodoDA, periodoA) {
  const { props, righeDocumenti, righeMovimenti,
          righeSpeseProp,
          totaliDareTeorico, totaliAvereTeorico,
          totaliPagato, totaliIncassato,
          totaliDareTeoricoProp, totaliPagatoProp } = datiProp;

  if (!props || props.length === 0) return;

  const { fill, fnt, al, brd } = makeStyles();
  const ws = wb.addWorksheet("Griglia Proprietari", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 3 }],
  });

  const C = {
    headerBg:   "1A3A5C", headerFg:   "FFFFFF",
    speseBg:    "C0392B", speseLight: "FDECEA",
    spesePBg:   "C2540A", spesePLight:"FEF3EC",
    versatoBg:  "1A7A3C", versatoLight:"E6F9EE",
    congBg:     "1A3A5C",
    totBg:      "2C3E50", totFg:      "ECF0F1",
    subPagBg:   "F8F8FF",
  };

  const nCols = 2 + props.length;
  let row = 1;

  // ── Titolo ────────────────────────────────────────────────────────────────
  ws.mergeCells(row, 1, row, nCols);
  const titolo = ws.getCell(row, 1);
  const rangeL = [
    periodoDA ? ym2label(periodoDA) : "inizio",
    periodoA  ? ym2label(periodoA)  : "oggi",
  ].join(" → ");
  titolo.value     = `Griglia Economica Proprietari — ${rangeL}`;
  titolo.font      = fnt({ bold: true, size: 14, color: { argb: C.headerFg } });
  titolo.fill      = fill(C.headerBg);
  titolo.alignment = al("center");
  ws.getRow(row).height = 26; row++;

  // ── Intestazioni ──────────────────────────────────────────────────────────
  ws.getRow(row).height = 38;
  ["Voce", "Importo", ...props.map(p =>
    `${p.proprietario_nome} ${p.proprietario_cognome || ""}`.trim() +
    `\n${parseFloat(p.percentuale_proprieta || 0).toFixed(1)}%`
  )].forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h; cell.font = fnt({ bold: true, color: { argb: C.headerFg } });
    cell.fill  = fill(C.headerBg); cell.alignment = al("center"); cell.border = brd();
  });
  row++;

  const addSep = (label, bg) => {
    ws.mergeCells(row, 1, row, nCols);
    const c = ws.getCell(row, 1);
    c.value = label; c.font = fnt({ bold: true, color: { argb: "FFFFFF" } });
    c.fill = fill(bg); c.alignment = al("left");
    ws.getRow(row).height = 18; row++;
  };

  const addDataRow = (label, importo, quoteMap, lightBg, fontArgb) => {
    ws.getRow(row).height = 18;
    const c1 = ws.getCell(row, 1);
    c1.value = label; c1.fill = fill(lightBg); c1.border = brd();
    c1.alignment = al("left"); c1.font = fnt({});
    const c2 = ws.getCell(row, 2);
    c2.value = importo; c2.numFmt = "#,##0.00";
    c2.fill = fill(lightBg); c2.border = brd();
    c2.alignment = al("right"); c2.font = fnt({ bold: true });
    props.forEach((p, pi) => {
      const cell = ws.getCell(row, 3 + pi);
      const v = quoteMap?.[p.proprietario_id] || 0;
      cell.value = v !== 0 ? v : null; cell.numFmt = "#,##0.00";
      cell.fill = fill(lightBg); cell.alignment = al("right"); cell.border = brd();
      if (fontArgb && v !== 0) cell.font = fnt({ color: { argb: fontArgb } });
    });
    row++;
  };

  const addSubRow = (label, importo, quoteMap, lightBg, fontArgb) => {
    ws.getRow(row).height = 15;
    const c1 = ws.getCell(row, 1);
    c1.value = label; c1.fill = fill(lightBg); c1.border = brd();
    c1.alignment = al("left"); c1.font = fnt({ size: 9, color: { argb: fontArgb } });
    const c2 = ws.getCell(row, 2);
    c2.value = importo; c2.numFmt = "#,##0.00";
    c2.fill = fill(lightBg); c2.border = brd();
    c2.alignment = al("right"); c2.font = fnt({ size: 9, color: { argb: fontArgb } });
    props.forEach((p, pi) => {
      const cell = ws.getCell(row, 3 + pi);
      const v = quoteMap?.[p.proprietario_id] || 0;
      cell.value = v !== 0 ? v : null; cell.numFmt = "#,##0.00";
      cell.fill = fill(lightBg); cell.alignment = al("right"); cell.border = brd();
      cell.font = fnt({ size: 9, color: { argb: v !== 0 ? fontArgb : "BBBBBB" } });
    });
    row++;
  };

  const addTotRow = (label, totMap, fontArgb, bgArgb) => {
    ws.getRow(row).height = 22;
    const c1 = ws.getCell(row, 1);
    c1.value = label; c1.font = fnt({ bold: true, color: { argb: C.totFg } });
    c1.fill = fill(bgArgb); c1.alignment = al("left"); c1.border = brd();
    const totGlob = props.reduce((s, p) => s + (totMap[p.proprietario_id] || 0), 0);
    const c2 = ws.getCell(row, 2);
    c2.value = totGlob; c2.numFmt = "#,##0.00";
    c2.font = fnt({ bold: true, color: { argb: fontArgb } });
    c2.fill = fill(bgArgb); c2.alignment = al("right"); c2.border = brd();
    props.forEach((p, pi) => {
      const cell = ws.getCell(row, 3 + pi);
      cell.value = totMap[p.proprietario_id] || 0; cell.numFmt = "#,##0.00";
      cell.font = fnt({ bold: true, color: { argb: fontArgb } });
      cell.fill = fill(bgArgb); cell.alignment = al("right"); cell.border = brd();
    });
    row++;
  };

  // ── SPESE documenti ────────────────────────────────────────────────────────
  addSep("▼  SPESE — quota teorica a carico dei proprietari", C.speseBg);
  if (righeDocumenti.length === 0) {
    ws.mergeCells(row, 1, row, nCols);
    ws.getCell(row, 1).value = "Nessuna spesa nel periodo";
    ws.getCell(row, 1).font = fnt({ color: { argb: "888888" } }); row++;
  } else {
    for (const r of righeDocumenti) {
      const label = `${r.tipo_descrizione || r.nome_file || ""} ${ym2label(r.periodo_da)}` +
                    (r.periodo_a && r.periodo_a !== r.periodo_da ? ` → ${ym2label(r.periodo_a)}` : "");
      addDataRow(label, r.importo, r.quote, C.speseLight);

      // sub-riga: chi ha pagato effettivamente
      const pagante  = props.find(p => p.proprietario_id === r.pagato_da_proprietario_id);
      const subLabel = pagante
        ? `↳ Pagato da: ${pagante.proprietario_nome} ${pagante.proprietario_cognome || ""}`.trim()
        : "↳ Pagante non registrato";
      const pagQuote = {};
      for (const p of props) pagQuote[p.proprietario_id] = 0;
      if (r.pagato_da_proprietario_id) pagQuote[r.pagato_da_proprietario_id] = r.importo;
      addSubRow(subLabel, r.importo, pagQuote, C.subPagBg, "A5B4FC");
    }
  }
  addTotRow("Totale dare teorico (spese doc.)", totaliDareTeorico, "C0392B", C.totBg);
  addTotRow("Pagato effettivamente (spese doc.)", totaliPagato, "A5B4FC", C.totBg);

  // ── SPESE PROPRIETARI ──────────────────────────────────────────────────────
  const _righeSpeseProp = Array.isArray(righeSpeseProp) ? righeSpeseProp : [];
  addSep("▼  SPESE PROPRIETARI — quote teoriche per proprietario", C.spesePBg);
  if (_righeSpeseProp.length === 0) {
    ws.mergeCells(row, 1, row, nCols);
    ws.getCell(row, 1).value = "Nessuna spesa proprietari nel periodo";
    ws.getCell(row, 1).font = fnt({ color: { argb: "888888" } }); row++;
  } else {
    for (const r of _righeSpeseProp) {
      const label = `${r.tipo_descrizione || r.descrizione || "Spesa proprietari"} ${ym2label(r.periodo_da)}` +
                    (r.periodo_a && r.periodo_a !== r.periodo_da ? ` → ${ym2label(r.periodo_a)}` : "");
      addDataRow(label, r.importo, r.quote, C.spesePLight);

      // sub-riga: chi ha pagato effettivamente
      const pagante  = props.find(p => p.proprietario_id === r.pagato_da_proprietario_id);
      const subLabel = pagante
        ? `↳ Pagato da: ${pagante.proprietario_nome} ${pagante.proprietario_cognome || ""}`.trim()
        : "↳ Pagante non registrato";
      const pagQuote = {};
      for (const p of props) pagQuote[p.proprietario_id] = 0;
      if (r.pagato_da_proprietario_id) pagQuote[r.pagato_da_proprietario_id] = r.importo;
      addSubRow(subLabel, r.importo, pagQuote, C.subPagBg, "FB923C");
    }
  }
  const _totaliDareTeoricoProp = totaliDareTeoricoProp || {};
  const _totaliPagatoProp      = totaliPagatoProp      || {};
  addTotRow("Totale dare teorico (sp. prop.)", _totaliDareTeoricoProp, "C2540A", C.totBg);
  addTotRow("Pagato effettivamente (sp. prop.)", _totaliPagatoProp, "FB923C", C.totBg);

  // ── VERSAMENTI ─────────────────────────────────────────────────────────────
  addSep("▼  VERSAMENTI — incassato per proprietario", C.versatoBg);
  if (righeMovimenti.length === 0) {
    ws.mergeCells(row, 1, row, nCols);
    ws.getCell(row, 1).value = "Nessun versamento nel periodo";
    ws.getCell(row, 1).font = fnt({ color: { argb: "888888" } }); row++;
  } else {
    for (const r of righeMovimenti) {
      const label = `${TV_LABEL[r.tipo_versamento] || r.tipo_versamento} ${ym2label(r.mese)}` +
                    (r.comp_label ? ` (${r.comp_label})` : "");
      addDataRow(label, r.importo, r.quoteReale, C.versatoLight, "1A7A3C");
      // sub-riga: quota teorica
      addSubRow("↳ Quota teorica (riparto)", r.importo, r.quoteTeorica, "FFFBEB", "FBBF24");
    }
  }
  addTotRow("Totale incassato reale", totaliIncassato, "1A7A3C", C.totBg);
  addTotRow("Avere teorico (% sul versato)", totaliAvereTeorico, "FBBF24", C.totBg);

  // ── CONGUAGLIO ─────────────────────────────────────────────────────────────
  ws.getRow(row).height = 26;
  const cCong = ws.getCell(row, 1);
  cCong.value     = "Conguaglio finale  (Pagato doc + Pagato sp.prop − Incassato − Dare teorico doc − Dare teorico sp.prop + Avere teorico)";
  cCong.font      = fnt({ bold: true, size: 11, color: { argb: "FFFFFF" } });
  cCong.fill      = fill(C.congBg);
  cCong.alignment = al("left");
  cCong.border    = brd();

  const conguagli = {};
  for (const p of props) {
    const pid = p.proprietario_id;
    conguagli[pid] = (totaliPagato[pid] || 0) + (_totaliPagatoProp[pid] || 0)
                   - (totaliIncassato[pid] || 0)
                   - (totaliDareTeorico[pid] || 0) - (_totaliDareTeoricoProp[pid] || 0)
                   + (totaliAvereTeorico[pid] || 0);
  }
  const totCong = props.reduce((s, p) => s + (conguagli[p.proprietario_id] || 0), 0);
  const cT = ws.getCell(row, 2);
  cT.value = totCong; cT.numFmt = '+#,##0.00;-#,##0.00;"—"';
  cT.font  = fnt({ bold: true, size: 11, color: { argb: totCong >= 0 ? "1A7A3C" : "C0392B" } });
  cT.fill  = fill(C.congBg); cT.alignment = al("right"); cT.border = brd();

  props.forEach((p, pi) => {
    const v    = conguagli[p.proprietario_id] || 0;
    const cell = ws.getCell(row, 3 + pi);
    cell.value     = v;
    cell.numFmt    = '+#,##0.00;-#,##0.00;"—"';
    cell.font      = fnt({ bold: true, size: 11, color: { argb: v >= 0 ? "1A7A3C" : "C0392B" } });
    cell.fill      = fill(C.congBg);
    cell.alignment = al("right");
    cell.border    = brd();
  });

  // ── Larghezze ──────────────────────────────────────────────────────────────
  ws.getColumn(1).width = 46;
  ws.getColumn(2).width = 14;
  props.forEach((_, pi) => { ws.getColumn(3 + pi).width = 18; });
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT ZIP (Excel inquilini + PDF)
// ─────────────────────────────────────────────────────────────────────────────
// modo: "dettaglio" | "sintetico" | "tutti"
export async function streamGrigliaZip(dati, datiProp, documentiDB, periodoDA, periodoA, modo = "dettaglio", res) {
  const nomeFile = `griglia_${modo}_${periodoDA || "tutto"}_${periodoA || "oggi"}.zip`;

  const wb = new ExcelJS.Workbook();
  wb.creator = "GSA"; wb.created = new Date();

  if (modo === "dettaglio" || modo === "tutti")
    _buildSheetInquilini(wb, dati, periodoDA, periodoA, false);
  if (modo === "sintetico" || modo === "tutti")
    _buildSheetInquilini(wb, dati, periodoDA, periodoA, true);
  if (modo === "tutti" && datiProp)
    _buildSheetProprietari(wb, datiProp, periodoDA, periodoA);

  const xlsxBuffer = await wb.xlsx.writeBuffer();

  const zip = new JSZip();
  zip.file("griglia-economica.xlsx", xlsxBuffer);

  const docsFolder = zip.folder("documenti");
  let allegati = 0;
  for (const doc of documentiDB) {
    const buf = leggiPdf(doc.id);
    if (!buf) continue;
    const nomePulito = (doc.nome_file || doc.id)
      .replace(/[^a-zA-Z0-9._\-àèéìòù ]/g, "_")
      .replace(/\s+/g, "_");
    docsFolder.file(nomePulito.endsWith(".pdf") ? nomePulito : `${nomePulito}.pdf`, buf);
    allegati++;
  }

  console.log(`[grigliaExport] ZIP: ${dati.righeDocumenti.length} righe, ${allegati} PDF`);

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 },
  });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${nomeFile}"`);
  res.setHeader("Content-Length", zipBuffer.length);
  res.send(zipBuffer);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT EXCEL SOLO  (senza PDF)
// modo: "inquilini" | "sintetico" | "proprietari" | "tutti"
// ─────────────────────────────────────────────────────────────────────────────
export async function streamExcelOnly(dati, datiProp, periodoDA, periodoA, modo, res) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "GSA"; wb.created = new Date();

  if (modo === "inquilini" || modo === "tutti")
    _buildSheetInquilini(wb, dati, periodoDA, periodoA, false);
  if (modo === "sintetico" || modo === "tutti")
    _buildSheetInquilini(wb, dati, periodoDA, periodoA, true);
  if (modo === "proprietari" || modo === "tutti")
    _buildSheetProprietari(wb, datiProp, periodoDA, periodoA);

  const xlsxBuffer = await wb.xlsx.writeBuffer();
  const nomeFile   = `griglia_${modo}_${periodoDA || "tutto"}_${periodoA || "oggi"}.xlsx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${nomeFile}"`);
  res.setHeader("Content-Length", xlsxBuffer.byteLength);
  res.send(Buffer.from(xlsxBuffer));
}
