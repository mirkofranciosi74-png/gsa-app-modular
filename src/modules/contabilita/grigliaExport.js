/**
 * src/pipeline/grigliaExport.js
 *
 * Genera un file ZIP contenente:
 *   griglia-economica.xlsx
 *   documenti/          — PDF originali dei documenti
 *
 * Usa solo moduli Node nativi per lo ZIP (niente archiver).
 * Dipendenza esterna: exceljs (già installato).
 */
import ExcelJS                              from "exceljs";
import { createWriteStream, unlinkSync,
         existsSync, mkdirSync }            from "node:fs";
import { writeFile, readFile, rm }          from "node:fs/promises";
import { join }                             from "node:path";
import { tmpdir }                           from "node:os";
import { createRequire }                    from "node:module";
import { leggiPdf }                         from "../../shared/storage.js";

// JSZip è CommonJS-friendly
const require = createRequire(import.meta.url);

// Usiamo il modulo 'jszip' che funziona bene in ESM via require
// Se non installato: npm install jszip
let JSZip;
try {
  JSZip = require("jszip");
} catch {
  throw new Error("jszip non installato — esegui: npm install jszip");
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper formatter
// ─────────────────────────────────────────────────────────────────────────────
const MESI = ["Gen","Feb","Mar","Apr","Mag","Giu",
              "Lug","Ago","Set","Ott","Nov","Dic"];

function ym2label(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return `${MESI[parseInt(m, 10) - 1]} ${y}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXCEL
// ─────────────────────────────────────────────────────────────────────────────
async function buildExcel(dati, periodoDA, periodoA) {
  const { comps, righeDocumenti, righeMovimenti,
          totaliDovuto, totaliVersato, conguagli } = dati;

  const wb = new ExcelJS.Workbook();
  wb.creator = "GSA";
  wb.created = new Date();

  const ws = wb.addWorksheet("Griglia Economica", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 3 }],
  });

  const C = {
    headerBg:    "1A3A5C", headerFg:    "FFFFFF",
    speseBg:     "C0392B", speseLight:  "FDECEA",
    versatoBg:   "1A7A3C", versatoLight:"E6F9EE",
    congBg:      "1A3A5C", congFg:      "FFFFFF",
    totBg:       "2C3E50", totFg:       "ECF0F1",
  };

  const fill  = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const fnt   = opts  => ({ name: "Calibri", size: 10, ...opts });
  const al    = (h, v = "middle") => ({ horizontal: h, vertical: v, wrapText: true });
  const brd   = () => ({
    top:    { style: "thin", color: { argb: "BDC3C7" } },
    left:   { style: "thin", color: { argb: "BDC3C7" } },
    bottom: { style: "thin", color: { argb: "BDC3C7" } },
    right:  { style: "thin", color: { argb: "BDC3C7" } },
  });

  const nCols = 3 + comps.length;  // voce + periodo + totale + N componenti

  // ── Riga 1: titolo ─────────────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, nCols);
  const titolo = ws.getCell(1, 1);
  const range  = [
    periodoDA ? ym2label(periodoDA) : "inizio",
    periodoA  ? ym2label(periodoA)  : "oggi",
  ].join(" → ");
  titolo.value     = `Griglia Economica — ${range}`;
  titolo.font      = fnt({ bold: true, size: 14, color: { argb: C.headerFg } });
  titolo.fill      = fill(C.headerBg);
  titolo.alignment = al("center");
  ws.getRow(1).height = 26;

  // ── Riga 2: intestazioni colonne ───────────────────────────────────────────
  ws.getRow(2).height = 42;
  const hdrs = ["Voce", "Periodo", "Totale", ...comps.map(c =>
    `${c.label}\n${c.percentuale}%` +
    (c.validita_da ? `\ndal ${ym2label(c.validita_da.slice(0,7))}` : "") +
    (c.validita_a  ? `\nal ${ym2label(c.validita_a.slice(0,7))}`  : "")
  )];
  hdrs.forEach((h, i) => {
    const cell     = ws.getCell(2, i + 1);
    cell.value     = h;
    cell.font      = fnt({ bold: true, color: { argb: C.headerFg } });
    cell.fill      = fill(C.headerBg);
    cell.alignment = al("center");
    cell.border    = brd();
  });

  let row = 3;

  // ── Sezione SPESE ──────────────────────────────────────────────────────────
  const addSep = (label, bg) => {
    ws.mergeCells(row, 1, row, nCols);
    const c     = ws.getCell(row, 1);
    c.value     = label;
    c.font      = fnt({ bold: true, color: { argb: "FFFFFF" } });
    c.fill      = fill(bg);
    c.alignment = al("left");
    ws.getRow(row).height = 18;
    row++;
  };

  const addDataRow = (label, periodo_da, periodo_a, totale, quoteMap, lightBg, color) => {
    ws.getRow(row).height = 20;
    const periodo = [
      ym2label(periodo_da),
      periodo_a && periodo_a !== periodo_da ? ym2label(periodo_a) : null,
    ].filter(Boolean).join(" → ");

    const c1 = ws.getCell(row, 1);
    c1.value = label; c1.fill = fill(lightBg); c1.border = brd(); c1.alignment = al("left"); c1.font = fnt({});

    const c2 = ws.getCell(row, 2);
    c2.value = periodo; c2.fill = fill(lightBg); c2.border = brd(); c2.alignment = al("center"); c2.font = fnt({ size: 9 });

    // Colonna totale
    const c3 = ws.getCell(row, 3);
    c3.value     = totale || null;
    c3.numFmt    = "#,##0.00";
    c3.fill      = fill(lightBg);
    c3.alignment = al("right");
    c3.border    = brd();
    c3.font      = fnt({ bold: true });

    comps.forEach((c, ci) => {
      const cell     = ws.getCell(row, 4 + ci);
      const v        = quoteMap?.[c.id] || 0;
      cell.value     = v !== 0 ? v : null;
      cell.numFmt    = "#,##0.00";
      cell.fill      = fill(lightBg);
      cell.alignment = al("right");
      cell.border    = brd();
      if (color) cell.font = fnt({ color: { argb: color } });
    });
    row++;
  };

  const addTotRow = (label, totaleGlobale, totMap, fontColor, bgColor) => {
    ws.getRow(row).height = 22;
    ws.mergeCells(row, 1, row, 2);
    const c1     = ws.getCell(row, 1);
    c1.value     = label;
    c1.font      = fnt({ bold: true, color: { argb: C.totFg } });
    c1.fill      = fill(bgColor);
    c1.alignment = al("left");

    const cTot     = ws.getCell(row, 3);
    cTot.value     = totaleGlobale;
    cTot.numFmt    = "#,##0.00";
    cTot.font      = fnt({ bold: true, color: { argb: fontColor } });
    cTot.fill      = fill(bgColor);
    cTot.alignment = al("right");
    cTot.border    = brd();

    comps.forEach((c, ci) => {
      const cell     = ws.getCell(row, 4 + ci);
      cell.value     = totMap[c.id] || 0;
      cell.numFmt    = "#,##0.00";
      cell.font      = fnt({ bold: true, color: { argb: fontColor } });
      cell.fill      = fill(bgColor);
      cell.alignment = al("right");
      cell.border    = brd();
    });
    row++;
  };

  const sumQuote = r => Object.values(r.quote).reduce((s, v) => s + v, 0);
  const sumMap   = map => comps.reduce((s, c) => s + (map[c.id] || 0), 0);

  addSep("▼  SPESE — quota dovuta per componente", C.speseBg);
  if (righeDocumenti.length === 0) {
    ws.mergeCells(row, 1, row, nCols);
    ws.getCell(row, 1).value = "Nessuna spesa nel periodo";
    ws.getCell(row, 1).font  = fnt({ color: { argb: "888888" } });
    row++;
  } else {
    for (const r of righeDocumenti)
      addDataRow(r.label, r.periodo_da, r.periodo_a, sumQuote(r), r.quote, C.speseLight);
  }
  addTotRow("Totale dovuto", sumMap(totaliDovuto), totaliDovuto, "C0392B", C.totBg);

  addSep("▼  VERSAMENTI — importi versati per componente", C.versatoBg);
  if (righeMovimenti.length === 0) {
    ws.mergeCells(row, 1, row, nCols);
    ws.getCell(row, 1).value = "Nessun versamento nel periodo";
    ws.getCell(row, 1).font  = fnt({ color: { argb: "888888" } });
    row++;
  } else {
    for (const r of righeMovimenti)
      addDataRow(r.label, r.periodo_da, r.periodo_a, sumQuote(r), r.quote, C.versatoLight, "1A7A3C");
  }
  addTotRow("Totale versato", sumMap(totaliVersato), totaliVersato, "1A7A3C", C.totBg);

  // ── Conguaglio ─────────────────────────────────────────────────────────────
  ws.getRow(row).height = 24;
  ws.mergeCells(row, 1, row, 2);
  const cCong     = ws.getCell(row, 1);
  cCong.value     = "Conguaglio finale";
  cCong.font      = fnt({ bold: true, size: 11, color: { argb: C.congFg } });
  cCong.fill      = fill(C.congBg);
  cCong.alignment = al("left");
  // col 3: totale conguaglio globale
  const totCong     = comps.reduce((s, c) => s + (conguagli[c.id] || 0), 0);
  const cCongTot    = ws.getCell(row, 3);
  cCongTot.value    = totCong;
  cCongTot.numFmt   = '+#,##0.00;-#,##0.00;"—"';
  cCongTot.font     = fnt({ bold: true, size: 11, color: { argb: totCong >= 0 ? "1A7A3C" : "C0392B" } });
  cCongTot.fill     = fill(C.congBg);
  cCongTot.alignment = al("right");
  cCongTot.border   = brd();
  // col 4+: conguaglio per componente
  comps.forEach((c, ci) => {
    const v        = conguagli[c.id] || 0;
    const cell     = ws.getCell(row, 4 + ci);
    cell.value     = v;
    cell.numFmt    = '+#,##0.00;-#,##0.00;"—"';
    cell.font      = fnt({ bold: true, size: 11, color: { argb: v >= 0 ? "1A7A3C" : "C0392B" } });
    cell.fill      = fill(C.congBg);
    cell.alignment = al("right");
    cell.border    = brd();
  });

  // ── Larghezze colonne ─────────────────────────────────────────────────────
  ws.getColumn(1).width = 40;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 14;  // Totale
  comps.forEach((_, ci) => { ws.getColumn(4 + ci).width = 17; });

  return wb;
}

// ─────────────────────────────────────────────────────────────────────────────
// ZIP (via jszip)
// ─────────────────────────────────────────────────────────────────────────────
export async function streamGrigliaZip(dati, documentiDB, periodoDA, periodoA, res) {
  const nomeFile = `griglia_${periodoDA || "tutto"}_${periodoA || "oggi"}.zip`;

  // 1. Costruisci Excel in memoria
  const wb         = await buildExcel(dati, periodoDA, periodoA);
  const xlsxBuffer = await wb.xlsx.writeBuffer();

  // 2. Crea ZIP in memoria con JSZip
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
    const nomeArchivio = nomePulito.endsWith(".pdf")
      ? nomePulito
      : `${nomePulito}.pdf`;

    docsFolder.file(nomeArchivio, buf);
    allegati++;
  }

  console.log(`[grigliaExport] ZIP: ${dati.righeDocumenti.length} righe spese, ${allegati} PDF allegati`);

  // 3. Genera il buffer ZIP e invia
  const zipBuffer = await zip.generateAsync({
    type:               "nodebuffer",
    compression:        "DEFLATE",
    compressionOptions: { level: 6 },
  });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${nomeFile}"`);
  res.setHeader("Content-Length", zipBuffer.length);
  res.send(zipBuffer);
}
