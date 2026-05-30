import PDFDocument from "pdfkit";

const euro   = v => Number(v || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const mesAnn = s => {
  if (!s) return "—";
  const [y, m] = s.split("-");
  return ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"][parseInt(m,10)-1] + " " + y;
};
const sgn   = v => Number(v) >= 0 ? "+" : "";
const toYM  = v => v ? String(v).slice(0, 7) : null;
const oggi  = () => new Date().toISOString().slice(0, 7);

const TV_LABEL = { affitto:"Affitto", conguaglio:"Conguaglio", rimborso:"Rimborso", altro:"Altro" };

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────
export async function report({ params, datiPerApp }) {
  const vm  = _vm({ params, datiPerApp });
  const pdf = await _pdf(vm, params);
  return { testo: _testo(vm, params), pdf: pdf.toString("base64"), vm };
}

// ─────────────────────────────────────────────────────────────────────────────
// View-model
// ─────────────────────────────────────────────────────────────────────────────
function _vm({ params, datiPerApp }) {
  const { periodoDA, periodoA } = params;
  const FUTURO = "2999-12";
  const fDA = periodoDA || "2000-01";
  const fA  = periodoA  || oggi();

  const mesiRange = _mesiRange(fDA, fA);

  const sezioni = [];
  let totSpese = 0, totVersati = 0;

  for (const { app, griglia, grigliaProp } of datiPerApp) {
    const {
      comps,
      righeDocumenti: riDoc,
      righeMovimenti: riMov,
      totaliDovuto,
      totaliVersato,
    } = griglia;

    const {
      props,
      totaliDareTeorico,
      totaliAvereTeorico,
      totaliPagato,
      totaliIncassato,
      totaliDareTeoricoProp = {},
      totaliPagatoProp      = {},
    } = grigliaProp;

    if (!riDoc.length && !comps.length) continue;

    const totSpeseApp  = comps.reduce((s, c) => s + (totaliDovuto[c.id]  || 0), 0);
    const totVersApp   = comps.reduce((s, c) => s + (totaliVersato[c.id] || 0), 0);
    totSpese   += totSpeseApp;
    totVersati += totVersApp;

    // Affitto teorico
    const totaliAffitto = {};
    for (const c of comps) {
      const cDa = toYM(c.validita_da) || "2000-01";
      const cA  = toYM(c.validita_a)  || FUTURO;
      totaliAffitto[c.id] = mesiRange.filter(m => m >= cDa && m <= cA).length
                          * parseFloat(c.quota_affitto || 0);
    }

    const inquilini = comps.map(c => {
      const aff  = totaliAffitto[c.id] || 0;
      const dow  = totaliDovuto[c.id]  || 0;
      const vers = totaliVersato[c.id] || 0;
      return {
        id:          c.id,
        nome:        `${c.nome} ${c.cognome || ""}`.trim(),
        percentuale: parseFloat(c.percentuale || 0),
        dovutoSpese: dow,
        affitto:     aff,
        dovutoTot:   dow + aff,
        versato:     vers,
        conguaglio:  vers - dow - aff,
      };
    });

    const versamenti = (riMov || []).map(m => ({
      comp_id:     m.comp_id    || null,
      comp_label:  m.comp_label || "",
      tipo:        TV_LABEL[m.tipo_versamento] || m.tipo_versamento || "Affitto",
      periodo_da:  m.periodo_da,
      periodo_a:   m.periodo_a,
      importo:     m.importo,
      segno:       parseInt(m.segno ?? 1),
    })).filter(m => m.importo !== 0);

    const proprietari = props.map(p => {
      const pid      = p.proprietario_id;
      const dareTot  = (totaliDareTeorico[pid] || 0) + (totaliDareTeoricoProp[pid] || 0);
      const pagatoTot = (totaliPagato[pid] || 0) + (totaliPagatoProp[pid] || 0);
      const cong = pagatoTot - (totaliIncassato[pid] || 0)
                 - dareTot + (totaliAvereTeorico[pid] || 0);
      return {
        nome:         `${p.proprietario_nome} ${p.proprietario_cognome || ""}`.trim(),
        dareTeorico:  dareTot,
        avereTeorico: totaliAvereTeorico[pid] || 0,
        pagato:       pagatoTot,
        incassato:    totaliIncassato[pid]    || 0,
        cashFlow:    (totaliIncassato[pid] || 0) - pagatoTot,
        conguaglio:   cong,
      };
    });

    const totIncassato  = props.reduce((s, p) => s + (totaliIncassato[p.proprietario_id] || 0), 0);
    const totPagato     = props.reduce((s, p) => s + (totaliPagato[p.proprietario_id] || 0) + (totaliPagatoProp[p.proprietario_id] || 0), 0);
    const cashFlowReale = totIncassato - totPagato;

    sezioni.push({
      id:           app.id,
      nome:         app.nome,
      totSpese:     totSpeseApp,
      totVersati:   totVersApp,
      documenti:    riDoc,
      versamenti,
      inquilini,
      proprietari,
      totIncassato,
      totPagato,
      cashFlowReale,
    });
  }

  return {
    periodoDA, periodoA,
    totAppartamenti: sezioni.length,
    totDocumenti:    sezioni.reduce((s, a) => s + a.documenti.length, 0),
    totSpese, totVersati,
    saldoGlobale:    totVersati - totSpese,
    sezioni,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Testo ASCII
// ─────────────────────────────────────────────────────────────────────────────
function _testo(vm, params = {}) {
  const {
    mostraSpese       = true,
    mostraVersamenti  = false,
    mostraInquilini   = true,
    mostraSaldo       = true,
    mostraProprietari = true,
  } = params;

  const SEP1 = "═".repeat(56);
  const SEP2 = "─".repeat(56);
  const nl   = "\n";

  let t = `${SEP1}${nl}`;
  t += `  REPORT SPESE APPARTAMENTI  —  ${new Date().toLocaleDateString("it-IT")}${nl}`;
  t += `  Periodo: ${vm.periodoDA ? mesAnn(vm.periodoDA) + " → " + mesAnn(vm.periodoA) : "Completo"}${nl}`;
  t += `${SEP1}${nl}${nl}`;

  t += `RIEPILOGO GENERALE${nl}`;
  t += `  Appartamenti : ${vm.totAppartamenti}${nl}`;
  t += `  Documenti    : ${vm.totDocumenti}${nl}`;
  t += `  Totale spese : ${euro(vm.totSpese)}${nl}`;
  t += `  Versamenti   : ${euro(vm.totVersati)}${nl}`;
  t += `  Saldo globale: ${sgn(vm.saldoGlobale)}${euro(vm.saldoGlobale)}${nl}${nl}`;

  for (const app of vm.sezioni) {
    t += `${SEP2}${nl}`;
    t += `APPARTAMENTO: ${app.nome}${nl}${nl}`;

    // Spese
    if (mostraSpese) {
      t += `  SPESE  (${app.documenti.length} documenti · totale ${euro(app.totSpese)})${nl}`;
      for (const d of app.documenti) {
        const per = d.periodo_a && d.periodo_a !== d.periodo_da
          ? `${mesAnn(d.periodo_da)} → ${mesAnn(d.periodo_a)}`
          : mesAnn(d.periodo_da);
        t += `  · ${d.tipo_descrizione || d.nome_file || "—"}  ${per}${nl}`;
        t += `    Quota: ${euro(d.importo)}${d.fornitore ? `  (${d.fornitore})` : ""}${nl}`;
      }
      t += nl;
    }

    // Versamenti
    if (mostraVersamenti && app.versamenti.length > 0) {
      t += `  VERSAMENTI  (totale ${euro(app.totVersati)})${nl}`;
      for (const m of app.versamenti) {
        const per = m.periodo_a && m.periodo_a !== m.periodo_da
          ? `${mesAnn(m.periodo_da)} → ${mesAnn(m.periodo_a)}`
          : mesAnn(m.periodo_da);
        const segnoStr = m.segno < 0 ? " [rimborso]" : "";
        t += `  · ${m.comp_label}  ${m.tipo}${segnoStr}  ${per}  ${euro(Math.abs(m.importo))}${nl}`;
      }
      t += nl;
    }

    // Inquilini
    if (mostraInquilini) {
      t += `  INQUILINI${nl}`;
      for (const c of app.inquilini) {
        t += `  · ${c.nome} (${c.percentuale}%)${nl}`;
        t += `    Spese: ${euro(c.dovutoSpese)}  Affitto: ${euro(c.affitto)}  Versato: ${euro(c.versato)}`;
        if (mostraSaldo) t += `  Conguaglio: ${sgn(c.conguaglio)}${euro(c.conguaglio)}`;
        t += nl;
      }
      t += nl;
    }

    // Proprietari
    if (mostraProprietari && app.proprietari.length > 0) {
      t += `  PROPRIETARI${nl}`;
      for (const p of app.proprietari) {
        t += `  · ${p.nome}${nl}`;
        t += `    Dare teorico: ${euro(p.dareTeorico)}  Avere teorico: ${euro(p.avereTeorico)}${nl}`;
        t += `    Pagato reale: ${euro(p.pagato)}  Incassato reale: ${euro(p.incassato)}${nl}`;
        if (mostraSaldo)
          t += `    Cash flow: ${sgn(p.cashFlow)}${euro(p.cashFlow)}  Conguaglio: ${sgn(p.conguaglio)}${euro(p.conguaglio)}${nl}`;
      }
      t += nl;
      t += `  CASH FLOW REALE APPARTAMENTO${nl}`;
      t += `    Incassato: ${euro(app.totIncassato)}  Pagato: ${euro(app.totPagato)}${nl}`;
      t += `    Netto:     ${sgn(app.cashFlowReale)}${euro(app.cashFlowReale)}${nl}${nl}`;
    }
  }

  t += `${SEP1}${nl}`;
  return t;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF
// ─────────────────────────────────────────────────────────────────────────────
function _pdf(vm, params = {}) {
  const {
    mostraSpese       = true,
    mostraVersamenti  = false,
    mostraInquilini   = true,
    mostraSaldo       = true,
    mostraProprietari = true,
  } = params;

  return new Promise((res, rej) => {
    const doc    = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
    const chunks = [];
    doc.on("data",  c => chunks.push(c));
    doc.on("end",   () => res(Buffer.concat(chunks)));
    doc.on("error", rej);

    const W   = 495;
    const X0  = 50;

    // ── Header ───────────────────────────────────────────────────────────────
    doc.fillColor("#1a3a5c").rect(X0, 40, W, 55).fill();
    doc.fillColor("white").fontSize(17).font("Helvetica-Bold")
       .text("REPORT SPESE APPARTAMENTI", X0 + 15, 53);
    doc.fontSize(9).font("Helvetica")
       .text(
         `${new Date().toLocaleDateString("it-IT")}` +
         (vm.periodoDA ? `  ·  ${mesAnn(vm.periodoDA)} → ${mesAnn(vm.periodoA)}` : "  ·  Periodo completo"),
         X0 + 15, 77
       );
    doc.y = 115;

    // ── KPI boxes ────────────────────────────────────────────────────────────
    const kpi = [
      ["Spese",      euro(vm.totSpese)],
      ["Versamenti", euro(vm.totVersati)],
      ["Saldo",      sgn(vm.saldoGlobale) + euro(vm.saldoGlobale)],
      ["Documenti",  String(vm.totDocumenti)],
    ];
    const kW = (W - 15) / 4;
    kpi.forEach(([l, v], i) => {
      const x = X0 + i * (kW + 5);
      doc.fillColor("#f5f7fa").rect(x, doc.y, kW, 46).fill();
      doc.fillColor("#888").fontSize(8).font("Helvetica")
         .text(l, x + 6, doc.y + 8, { width: kW - 10 });
      doc.fillColor("#1a3a5c").fontSize(12).font("Helvetica-Bold")
         .text(String(v), x + 6, doc.y + 22, { width: kW - 10 });
    });
    doc.y += 60;

    // ── Sezioni appartamento ──────────────────────────────────────────────────
    for (const app of vm.sezioni) {
      if (doc.y > 650) doc.addPage();

      doc.fillColor("#1a3a5c").fontSize(12).font("Helvetica-Bold")
         .text(`▶  ${app.nome}`, X0, doc.y);
      doc.moveDown(0.3);
      doc.fillColor("#ccc").moveTo(X0, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);

      // ── Spese ─────────────────────────────────────────────────────────────
      if (mostraSpese) {
        _label(doc, "SPESE", "#e53e3e", X0);
        _row(doc, ["Tipo", "Periodo", "Fornitore", "Quota"], true, W);
        for (const d of app.documenti) {
          const per = d.periodo_a && d.periodo_a !== d.periodo_da
            ? `${mesAnn(d.periodo_da)} → ${mesAnn(d.periodo_a)}`
            : mesAnn(d.periodo_da);
          _row(doc, [d.tipo_descrizione || d.nome_file || "—", per, d.fornitore || "—", euro(d.importo)], false, W);
        }
        _row(doc, ["Totale", "", "", euro(app.totSpese)], "total", W);
        doc.moveDown(0.6);
      }

      // ── Versamenti ────────────────────────────────────────────────────────
      if (mostraVersamenti && app.versamenti.length > 0) {
        if (doc.y > 650) doc.addPage();
        _label(doc, "VERSAMENTI", "#2b7a0b", X0);
        _row(doc, ["Inquilino", "Tipo", "Periodo", "Importo"], true, W);
        for (const m of app.versamenti) {
          const per = m.periodo_a && m.periodo_a !== m.periodo_da
            ? `${mesAnn(m.periodo_da)} → ${mesAnn(m.periodo_a)}`
            : mesAnn(m.periodo_da);
          const label = m.tipo + (m.segno < 0 ? " [rimb.]" : "");
          _row(doc, [m.comp_label, label, per, euro(Math.abs(m.importo))], false, W, m.segno < 0);
        }
        _row(doc, ["Totale", "", "", euro(app.totVersati)], "total", W);
        doc.moveDown(0.6);
      }

      // ── Inquilini ─────────────────────────────────────────────────────────
      if (mostraInquilini) {
        if (doc.y > 650) doc.addPage();
        _label(doc, "INQUILINI", "#2b6cb0", X0);
        const hdrInq = mostraSaldo
          ? ["Inquilino (%)", "Spese dovute", "Affitto", "Versato", "Conguaglio"]
          : ["Inquilino (%)", "Spese dovute", "Affitto", "Versato"];
        _row(doc, hdrInq, true, W);
        for (const c of app.inquilini) {
          const rowData = [
            `${c.nome} (${c.percentuale}%)`,
            euro(c.dovutoSpese),
            euro(c.affitto),
            euro(c.versato),
          ];
          if (mostraSaldo) rowData.push(sgn(c.conguaglio) + euro(c.conguaglio));
          _row(doc, rowData, false, W, mostraSaldo && c.conguaglio < 0);
        }
        const totRow = [
          "Totale",
          euro(app.inquilini.reduce((s, c) => s + c.dovutoSpese, 0)),
          euro(app.inquilini.reduce((s, c) => s + c.affitto,     0)),
          euro(app.totVersati),
        ];
        if (mostraSaldo) {
          const totCong = app.totVersati - app.inquilini.reduce((s, c) => s + c.dovutoTot, 0);
          totRow.push(sgn(totCong) + euro(totCong));
        }
        _row(doc, totRow, "total", W);
        doc.moveDown(0.6);
      }

      // ── Proprietari ───────────────────────────────────────────────────────
      if (mostraProprietari && app.proprietari.length > 0) {
        if (doc.y > 650) doc.addPage();
        _label(doc, "PROPRIETARI", "#276749", X0);
        const hdrProp = mostraSaldo
          ? ["Proprietario", "Dare teorico", "Incassato reale", "Cash flow", "Conguaglio"]
          : ["Proprietario", "Dare teorico", "Incassato reale", "Cash flow"];
        _row(doc, hdrProp, true, W);
        for (const p of app.proprietari) {
          const rowData = [
            p.nome,
            euro(p.dareTeorico),
            euro(p.incassato),
            sgn(p.cashFlow) + euro(p.cashFlow),
          ];
          if (mostraSaldo) rowData.push(sgn(p.conguaglio) + euro(p.conguaglio));
          _row(doc, rowData, false, W, mostraSaldo && p.conguaglio < 0);
        }
        _row(doc, [
          "Cash flow reale",
          euro(app.totPagato),
          euro(app.totIncassato),
          sgn(app.cashFlowReale) + euro(app.cashFlowReale),
          ...(mostraSaldo ? [""] : []),
        ], "total", W);
        doc.moveDown(0.8);
      }
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const r = doc.bufferedPageRange();
    for (let i = 0; i < r.count; i++) {
      doc.switchToPage(r.start + i);
      doc.fillColor("#aaa").fontSize(7).font("Helvetica")
         .text(`Pag. ${i+1}/${r.count}  ·  GSA`, X0, 820, { align: "center", width: W });
    }

    doc.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper PDF
// ─────────────────────────────────────────────────────────────────────────────
function _label(doc, text, color, x) {
  doc.fillColor(color).fontSize(8).font("Helvetica-Bold").text(text, x, doc.y);
  doc.moveDown(0.2);
}

function _row(doc, cols, header, W, danger = false) {
  const cw = W / cols.length;
  const rh = 16;
  const y  = doc.y;

  if (header === true)    doc.fillColor("#e8eef6").rect(50, y, W, rh).fill();
  if (header === "total") doc.fillColor("#d0dcf0").rect(50, y, W, rh).fill();

  cols.forEach((t, i) => {
    doc.fillColor(header ? "#1a3a5c" : danger ? "#c0392b" : "#222")
       .fontSize(7.5)
       .font(header ? "Helvetica-Bold" : "Helvetica")
       .text(String(t), 50 + i * cw + 4, y + 4, { width: cw - 8, align: i === 0 ? "left" : "right" });
  });

  doc.y = y + rh;
  if (!header) doc.fillColor("#eee").moveTo(50, doc.y).lineTo(545, doc.y).stroke();
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────
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
