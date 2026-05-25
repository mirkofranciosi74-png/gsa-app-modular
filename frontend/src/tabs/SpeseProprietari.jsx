import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { appartamentiApi, proprietariApi, associazioniApi, speseProprietariApi, tipiSpesaApi, documentiApi } from "../api.js";
import { Btn, Badge, Modal, Confirm, Field, SectionHeader } from "../components/ui.jsx";
import { euro, toISO, toITdate, mesL } from "../utils/formatters.js";
import DocPreview from "../components/DocPreview.jsx";
import { usePdfQueue } from "../hooks/usePdfQueue.js";
import { PdfQueuePanel } from "../components/PdfQueuePanel.jsx";

function _mapSPExtract(e) {
  if (!e) return {};
  const p = {};
  if (e.importo        != null) p.importo              = String(e.importo);
  if (e.fornitore)              p.fornitore             = e.fornitore;
  if (e.numero_fattura)         p.numero_fattura        = e.numero_fattura;
  if (e.mese_competenza)        p.mese_competenza       = e.mese_competenza;
  if (e.tipo_spesa_id)          p.tipo_spesa_id         = e.tipo_spesa_id;
  if (e.appartamento_id)        p.appartamento_id       = e.appartamento_id;
  if (e.confidenza     != null) p._confidenza           = e.confidenza;
  if (e.metodo_estrazione)      p._metodo               = e.metodo_estrazione;
  if (e.appartamento_nome)      p._appartamento_nome    = e.appartamento_nome;
  if (e.tipo_descrizione)       p._tipo_descrizione     = e.tipo_descrizione;
  return p;
}

// ── Costanti ──────────────────────────────────────────────────────────────────

const PERI = [
  { value: "una_tantum",  label: "Una tantum"  },
  { value: "mensile",     label: "Mensile"      },
  { value: "bimestrale",  label: "Bimestrale"   },
  { value: "trimestrale", label: "Trimestrale"  },
  { value: "semestrale",  label: "Semestrale"   },
  { value: "annuale",     label: "Annuale"      },
];

const isUna = p => (p || "una_tantum") === "una_tantum";

const MESI_IT = [
  ["gennaio","01"],["febbraio","02"],["marzo","03"],["aprile","04"],
  ["maggio","05"],["giugno","06"],["luglio","07"],["agosto","08"],
  ["settembre","09"],["ottobre","10"],["novembre","11"],["dicembre","12"],
];

function detectMonthFromDescription(descrizione, fallbackDate) {
  const d = (descrizione || "").toLowerCase().replace(/\s+/g, "");
  for (const [nome, mm] of MESI_IT) {
    const pos = d.indexOf(nome);
    if (pos === -1) continue;
    const after = d.slice(pos + nome.length, pos + nome.length + 15);
    const m4 = after.match(/(20\d{2})(?!\d)/);
    if (m4) return `${m4[1]}-${mm}`;
    const m2 = after.match(/^([2-9]\d)(?!\d)/);
    if (m2) return `20${m2[1]}-${mm}`;
    if (fallbackDate) return `${fallbackDate.slice(0, 4)}-${mm}`;
    return null;
  }
  return null;
}

// Rilevamento tipo spesa dalle parole chiave nella descrizione → UUID
const KEYWORD_TIPO = [
  [["mutuo","rata","banca","finanziamento"],        "Mutuo"],
  [["ristrutt","lavori","edil","impianto","serram"], "Ristrutturazione"],
  [["arredi","mobili","elettrodomest","arredo"],     "Arredi"],
  [["assicuraz","polizza","incendio"],               "Assicurazione"],
  [["imu","tari","condominio","imposta","tassa"],    "Tasse e Imposte"],
  [["manut","riparaz","pulizia"],                    "Manutenzione Ordinaria"],
];

function detectTipoSpesaId(descrizione, tipi) {
  const d = (descrizione || "").toLowerCase();
  for (const [keywords, nome] of KEYWORD_TIPO) {
    if (keywords.some(k => d.includes(k))) {
      const t = tipi.find(x => x.descrizione === nome);
      if (t) return t.id;
    }
  }
  return tipi.find(x => x.descrizione === "Altro")?.id || null;
}

const CATEGORIA_COLOR = {
  Utenza: "blue", Tassa: "red", Condominio: "green",
  Proprietari: "orange", Altro: "gray",
};

// ── Validità proprietario per una data/periodo ────────────────────────────────
// assoc = record da appartamento_proprietari ({ data_inizio, data_fine })
// dataDa / dataA = stringhe YYYY-MM-DD (una_tantum: solo dataDa)
function checkValidita(assoc, dataDa, dataA) {
  if (!assoc) return { ok: false, msg: "Proprietario non associato a questo appartamento" };
  const dI = assoc.data_inizio ? String(assoc.data_inizio).slice(0, 10) : null;
  const dF = assoc.data_fine   ? String(assoc.data_fine).slice(0, 10)   : null;
  const dA = dataA || dataDa;
  if (dI && dataDa && dataDa < dI)
    return { ok: false, msg: `Proprietario valido dal ${toITdate(dI)} — data spesa antecedente` };
  if (dF && dA && dA > dF)
    return { ok: false, msg: `Proprietario valido fino al ${toITdate(dF)} — periodo spesa successivo` };
  return { ok: true };
}

// ── Editor riparto quote ──────────────────────────────────────────────────────
function RipartoEditor({ assocs, quote, onChange, dataDa, dataA }) {
  // assocs: array di record appartamento_proprietari con proprietario_nome/cognome
  // quote:  array di { proprietario_id, percentuale }
  // onChange: fn(newQuote)

  const totale = quote.reduce((s, q) => s + (parseFloat(q.percentuale) || 0), 0);
  const errSomma = Math.abs(totale - 100) > 0.1;

  function toggle(propId) {
    const has = quote.some(q => q.proprietario_id === propId);
    if (has) {
      onChange(quote.filter(q => q.proprietario_id !== propId));
    } else {
      const assoc = assocs.find(a => String(a.proprietario_id) === String(propId));
      const perc  = assoc?.percentuale_proprieta ?? 0;
      onChange([...quote, { proprietario_id: propId, percentuale: perc }]);
    }
  }

  function setPerc(propId, val) {
    onChange(quote.map(q => q.proprietario_id === propId
      ? { ...q, percentuale: val }
      : q
    ));
  }

  function distribuisciUguali() {
    if (!quote.length) return;
    const base = Math.floor(10000 / quote.length) / 100;
    const resto = parseFloat((100 - base * quote.length).toFixed(2));
    onChange(quote.map((q, i) => ({
      ...q, percentuale: i === 0 ? parseFloat((base + resto).toFixed(2)) : base,
    })));
  }

  function ripristinaDafault() {
    onChange(assocs.map(a => ({
      proprietario_id: a.proprietario_id,
      percentuale: parseFloat(a.percentuale_proprieta) || 0,
    })));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {assocs.map(a => {
        const propId  = String(a.proprietario_id);
        const q       = quote.find(x => x.proprietario_id === propId);
        const incluso = !!q;
        const val     = checkValidita(a, dataDa, dataA);
        const nome    = `${a.proprietario_nome || ""} ${a.proprietario_cognome || ""}`.trim();

        return (
          <div key={propId} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 10px", borderRadius: 8,
            border: `1px solid ${incluso ? "var(--accent)" : "var(--border)"}`,
            background: incluso ? "rgba(59,130,246,0.06)" : "var(--bg3)",
            opacity: incluso ? 1 : 0.6,
          }}>
            <input type="checkbox" checked={incluso} onChange={() => toggle(propId)}
              style={{ width: 15, height: 15, cursor: "pointer", flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: incluso ? 600 : 400 }}>{nome}</span>
            {!val.ok && (
              <span title={val.msg} style={{ color: "var(--red)", fontSize: 11, cursor: "help" }}>
                <i className="ti ti-alert-triangle" /> fuori periodo
              </span>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="number" min="0.01" max="100" step="0.01"
                value={incluso ? q.percentuale : ""}
                disabled={!incluso}
                onChange={e => setPerc(propId, parseFloat(e.target.value) || 0)}
                style={{
                  width: 72, textAlign: "right", fontWeight: 700,
                  borderColor: incluso && (!q.percentuale || q.percentuale <= 0) ? "var(--red)" : "",
                }}
              />
              <span style={{ fontSize: 12, color: "var(--text2)" }}>%</span>
            </div>
          </div>
        );
      })}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: errSomma ? "var(--red)" : "var(--green)",
        }}>
          Totale: {totale.toFixed(2)}%
          {errSomma && ` (mancano ${(100 - totale).toFixed(2)}%)`}
        </span>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" size="sm" onClick={distribuisciUguali} title="Distribuisci in parti uguali">
          <i className="ti ti-equal" /> Uguali
        </Btn>
        <Btn variant="ghost" size="sm" onClick={ripristinaDafault} title="Ripristina percentuali di proprietà">
          <i className="ti ti-refresh" /> Default
        </Btn>
      </div>
    </div>
  );
}

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSVDate(s) {
  const t = (s || "").trim();
  const dmy = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return null;
}

function parseCSV(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const sep   = t.includes(";") ? ";" : ",";
    const parts = t.split(sep).map(p => p.trim().replace(/^"|"$/g,""));
    while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
    if (parts.length < 3) continue;
    const giorno = parseCSVDate(parts[0]);
    if (!giorno) continue;
    const importoRaw = parts[parts.length - 1].replace(",",".").replace(/[^\d.\-]/g,"");
    const importo    = Math.abs(parseFloat(importoRaw));
    if (!importo) continue;
    const fornitore   = parts.length > 3 ? parts[parts.length - 2].trim() : "";
    const descrizione = parts.slice(1, parts.length - (fornitore ? 2 : 1)).join(sep).trim();
    rows.push({ giorno, descrizione, importo, fornitore });
  }
  return rows;
}

// ── Stato badge ───────────────────────────────────────────────────────────────

const STATO_CFG = {
  da_verificare: { bg: "rgba(249,115,22,0.18)", color: "#ea580c",       label: "⚠ da verif." },
  verificato:    { bg: "rgba(34,197,94,0.18)",  color: "var(--green)",  label: "✓ ok"        },
  auto:          { bg: "rgba(234,179,8,0.18)",  color: "#ca8a04",       label: "⚠ auto"      },
};

function StatoBadge({ m, allSpese, onSave }) {
  const [open,   setOpen]   = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const correlate = useMemo(() => {
    if (!allSpese) return [];
    return allSpese.filter(s2 =>
      s2.id !== m.id &&
      String(s2.proprietario_id) === String(m.proprietario_id) &&
      String(s2.appartamento_id) === String(m.appartamento_id) &&
      parseFloat(s2.importo)     === parseFloat(m.importo)     &&
      (
        (s2.data_pagamento  && m.data_pagamento  && toISO(s2.data_pagamento)  === toISO(m.data_pagamento))  ||
        (s2.mese_competenza && m.mese_competenza && s2.mese_competenza.slice(0,7) === m.mese_competenza.slice(0,7))
      )
    );
  }, [m, allSpese]);

  const hasDup  = m.duplicato_rilevato || correlate.length > 0;
  const effKey  = m.stato === "da_verificare" ? "da_verificare"
                : m.stato === "verificato"    ? "verificato"
                : hasDup                      ? "auto"
                : null;
  const cfg = effKey ? STATO_CFG[effKey] : null;

  async function set(s) {
    setOpen(false); setSaving(true);
    try { await onSave(s); } finally { setSaving(false); }
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(o => !o)} disabled={saving}
        style={{
          background: cfg ? cfg.bg : "transparent",
          border: cfg ? `1px solid ${cfg.color}44` : "1px solid var(--border)",
          borderRadius: 10, padding: "2px 8px", cursor: "pointer",
          fontSize: 10, fontWeight: 700,
          color: cfg ? cfg.color : "var(--text2)", whiteSpace: "nowrap",
        }}>
        {saving ? <i className="ti ti-loader" style={{ fontSize: 10 }} /> : cfg ? cfg.label : "●"}
      </button>

      {open && (
        <div style={{
          position: "absolute", zIndex: 200, right: 0, top: "calc(100% + 4px)",
          background: "var(--bg2)", border: "1px solid var(--border)",
          borderRadius: 10, boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
          minWidth: 260, maxWidth: 340, padding: 8,
        }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1,
            color: "var(--text2)", marginBottom: 5, paddingLeft: 4 }}>Imposta stato</div>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {[
              { k: "normale",      label: "● Normale",     color: "var(--text2)" },
              { k: "da_verificare",label: "⚠ Da verif.",   color: "#ea580c"      },
              { k: "verificato",   label: "✓ Verificato",  color: "var(--green)" },
            ].map(o => (
              <button key={o.k} onClick={() => set(o.k)} style={{
                flex: 1, padding: "5px 4px", textAlign: "center",
                background: m.stato === o.k ? "var(--bg3)" : "var(--bg)",
                border: `1px solid ${m.stato === o.k ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 6, cursor: "pointer",
                fontSize: 11, color: o.color, fontWeight: m.stato === o.k ? 700 : 400,
              }}>{o.label}</button>
            ))}
          </div>

          {correlate.length > 0 && (
            <>
              <div style={{
                borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 2,
                fontSize: 10, textTransform: "uppercase", letterSpacing: 1,
                color: "var(--text2)", marginBottom: 5, paddingLeft: 4,
              }}>
                {correlate.length === 1 ? "Correlato con" : `Correlato con ${correlate.length} righe`}
              </div>
              {correlate.map(d => (
                <div key={d.id} style={{
                  background: "var(--bg3)", borderRadius: 6, padding: "6px 8px",
                  marginBottom: 4, fontSize: 11, borderLeft: "3px solid rgba(234,179,8,0.6)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ color: "var(--text2)" }}>
                      {d.data_pagamento ? toITdate(d.data_pagamento) : d.validita_da ? toITdate(d.validita_da) : "—"}
                      {d.mese_competenza && <span style={{ marginLeft: 6 }}>{mesL(d.mese_competenza)}</span>}
                    </span>
                    <span style={{ fontWeight: 700, color: "var(--red)" }}>{euro(d.importo)}</span>
                  </div>
                  <div style={{ color: "var(--text2)", fontSize: 10 }}>{d.appartamento_nome}</div>
                  {d.fornitore && <div style={{ color: "var(--text2)", fontSize: 10 }}>{d.fornitore}</div>}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Icone ordinamento ─────────────────────────────────────────────────────────

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col)
    return <i className="ti ti-selector" style={{ fontSize: 11, color: "var(--border)", marginLeft: 3 }} />;
  return sortDir === "asc"
    ? <i className="ti ti-sort-ascending"  style={{ fontSize: 11, color: "var(--accent)", marginLeft: 3 }} />
    : <i className="ti ti-sort-descending" style={{ fontSize: 11, color: "var(--accent)", marginLeft: 3 }} />;
}

function ThSort({ col, label, sortCol, sortDir, onSort, align = "left", style: sx = {} }) {
  return (
    <th onClick={() => onSort(col)} style={{
      cursor: "pointer", textAlign: align, userSelect: "none", whiteSpace: "nowrap",
      background: sortCol === col ? "rgba(59,130,246,0.15)" : "",
      transition: "background 0.15s", ...sx,
    }}>
      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
    </th>
  );
}

// ── Pannello duplicato ────────────────────────────────────────────────────────

function DupPanel({ existing, nuovoData, nuovoMese, nuovoImporto, nuovoTipo, nuovoFornitore }) {
  const cellStyle = { padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4, fontSize: 12 };
  const labelStyle = { fontSize: 10, fontWeight: 700, color: "var(--text2)", margin: 0,
                       textTransform: "uppercase", letterSpacing: 1 };
  return (
    <div style={{ border: "2px solid rgba(239,68,68,0.6)", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ background: "rgba(239,68,68,0.15)", padding: "8px 12px", fontSize: 12,
                    display: "flex", alignItems: "center", gap: 8 }}>
        <i className="ti ti-alert-triangle" style={{ color: "var(--red)", fontSize: 16 }} />
        <strong style={{ color: "var(--red)" }}>Possibile duplicato rilevato</strong>
        <span style={{ color: "var(--text2)" }}>— verifica prima di procedere</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {/* Già presente */}
        <div style={{ ...cellStyle, borderRight: "1px solid var(--border)", background: "rgba(239,68,68,0.04)" }}>
          <p style={labelStyle}>⚠ Già presente</p>
          {existing.proprietario_nome && (
            <span style={{ fontWeight: 600 }}>{existing.proprietario_nome}</span>
          )}
          {existing.appartamento_nome && (
            <span style={{ color: "var(--text2)", fontSize: 11 }}>
              <i className="ti ti-building" style={{ marginRight: 3 }} />{existing.appartamento_nome}
            </span>
          )}
          {(existing.tipo_spesa || existing.tipo_spesa_descrizione) && (
            <span style={{ color: "var(--text2)", fontSize: 11 }}>
              <i className="ti ti-tag" style={{ marginRight: 3 }} />
              {existing.tipo_spesa || existing.tipo_spesa_descrizione}
            </span>
          )}
          {existing.data_pagamento && (
            <span style={{ color: "var(--text2)" }}>
              <i className="ti ti-calendar" style={{ marginRight: 3 }} />{toITdate(existing.data_pagamento)}
            </span>
          )}
          {existing.mese_competenza && (
            <span style={{ color: "var(--text2)" }}>
              <i className="ti ti-calendar-stats" style={{ marginRight: 3 }} />{mesL(existing.mese_competenza)}
            </span>
          )}
          {existing.fornitore && (
            <span style={{ color: "var(--text2)", fontSize: 11 }}>
              <i className="ti ti-building-factory" style={{ marginRight: 3 }} />{existing.fornitore}
            </span>
          )}
          {existing.descrizione && (
            <span style={{ color: "var(--text2)", fontSize: 11, fontStyle: "italic" }}>{existing.descrizione}</span>
          )}
          <span style={{ fontWeight: 700, color: "var(--red)", fontSize: 14, marginTop: 2 }}>
            {euro(existing.importo)}
          </span>
        </div>

        {/* Nuovo */}
        <div style={{ ...cellStyle }}>
          <p style={{ ...labelStyle, color: "var(--accent)" }}>+ Nuovo (da inserire)</p>
          {nuovoTipo && (
            <span style={{ color: "var(--text2)", fontSize: 11 }}>
              <i className="ti ti-tag" style={{ marginRight: 3 }} />{nuovoTipo}
            </span>
          )}
          {nuovoData && (
            <span style={{ color: "var(--text2)" }}>
              <i className="ti ti-calendar" style={{ marginRight: 3 }} />{toITdate(nuovoData)}
            </span>
          )}
          {nuovoMese && (
            <span style={{ color: "var(--text2)" }}>
              <i className="ti ti-calendar-stats" style={{ marginRight: 3 }} />{mesL(nuovoMese)}
            </span>
          )}
          {nuovoFornitore && (
            <span style={{ color: "var(--text2)", fontSize: 11 }}>
              <i className="ti ti-building-factory" style={{ marginRight: 3 }} />{nuovoFornitore}
            </span>
          )}
          <span style={{ fontWeight: 700, color: "var(--red)", fontSize: 14, marginTop: 2 }}>
            {euro(nuovoImporto)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL IMPORTA CSV
// ══════════════════════════════════════════════════════════════════════════════

function CsvImportModal({ apps, props, spese, tipiAttivi, onSaved, onClose }) {
  const [rows,     setRows]     = useState(null);
  const [idx,      setIdx]      = useState(0);
  const [form,     setForm]     = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [results,  setResults]  = useState({ saved: 0, skipped: 0 });
  const [forzaDup, setForzaDup] = useState(false);

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed = parseCSV(ev.target.result);
      if (!parsed.length) {
        alert("Nessuna riga valida trovata.\nFormato atteso: data, descrizione, importo[, fornitore]");
        return;
      }
      setRows(parsed); setIdx(0); loadRow(parsed, 0);
    };
    reader.readAsText(file, "utf-8");
  }

  function loadRow(parsed, i) {
    const row = parsed[i];
    const meseComp = detectMonthFromDescription(row.descrizione, row.giorno) || row.giorno.slice(0,7);
    setForzaDup(false);
    setForm({
      periodicita:     "una_tantum",
      tipo_spesa_id:   detectTipoSpesaId(row.descrizione, tipiAttivi),
      validita_da:     row.giorno,
      data_pagamento:  row.giorno,
      mese_competenza: meseComp,
      importo:         row.importo,
      fornitore:       row.fornitore || "",
      numero_fattura:  "",
      descrizione:     row.descrizione,
      proprietario_id: "",
      appartamento_id: "",
      stato:           "normale",
    });
  }

  const dupInfo = useMemo(() => {
    if (!form?.proprietario_id || !form?.appartamento_id) return null;
    if (form.mese_competenza) {
      const ex = spese.find(s =>
        String(s.proprietario_id) === String(form.proprietario_id) &&
        String(s.appartamento_id) === String(form.appartamento_id) &&
        (s.mese_competenza || "").slice(0,7) === form.mese_competenza &&
        String(s.tipo_spesa_id) === String(form.tipo_spesa_id)
      );
      if (ex) return ex;
    }
    if (form.data_pagamento) {
      const ex = spese.find(s =>
        String(s.proprietario_id) === String(form.proprietario_id) &&
        String(s.appartamento_id) === String(form.appartamento_id) &&
        toISO(s.data_pagamento) === form.data_pagamento
      );
      if (ex) return ex;
    }
    return null;
  }, [form, spese]);

  function advance(wasSaved) {
    setForzaDup(false);
    const nr = { saved: results.saved + (wasSaved ? 1 : 0), skipped: results.skipped + (wasSaved ? 0 : 1) };
    setResults(nr);
    const next = idx + 1;
    if (next >= rows.length) { setForm(null); return; }
    setIdx(next); loadRow(rows, next);
  }

  async function handleSave(forza = false) {
    if (!form.proprietario_id || !form.appartamento_id) {
      alert("Seleziona proprietario e appartamento."); return;
    }
    if (dupInfo && !forza) return;
    setSaving(true);
    try {
      await speseProprietariApi.create(form);
      onSaved(); advance(true);
    } catch (e) { alert("Errore: " + e.message); }
    finally { setSaving(false); }
  }

  // Fase 1: selezione file
  if (!rows) return (
    <Modal title="Importa Spese da CSV" onClose={onClose} width={520}
      footer={<Btn variant="ghost" onClick={onClose}>Annulla</Btn>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="alert alert-info">
          <i className="ti ti-info-circle" style={{ marginRight: 6 }} />
          <strong>Formato CSV atteso:</strong> <code>data, descrizione, importo[, fornitore]</code><br />
          <span style={{ fontSize: 12 }}>
            Separatori: virgola o punto e virgola.<br />
            Date: <code>GG/MM/AAAA</code> o <code>AAAA-MM-GG</code>.<br />
            Il tipo spesa viene rilevato automaticamente dalle parole chiave.
          </span>
        </div>
        <Field label="Seleziona file CSV">
          <input type="file" accept=".csv,.txt" onChange={onFileChange} />
        </Field>
      </div>
    </Modal>
  );

  // Fase 3: completato
  if (!form) return (
    <Modal title="Importazione completata" onClose={onClose} width={420}
      footer={<Btn variant="primary" onClick={onClose}><i className="ti ti-check" /> Chiudi</Btn>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="alert alert-info"><i className="ti ti-circle-check" style={{ marginRight: 6 }} />Importazione completata.</div>
        <p>✅ Spese salvate: <strong>{results.saved}</strong></p>
        <p>⏭ Righe saltate: <strong>{results.skipped}</strong></p>
        <p style={{ color: "var(--text2)", fontSize: 12 }}>Totale righe nel file: {rows.length}</p>
      </div>
    </Modal>
  );

  // Fase 2: riga corrente
  const appSel   = apps.find(a => String(a.id) === String(form.appartamento_id));
  const pctDone  = Math.round((idx / rows.length) * 100);

  return (
    <Modal title={`Importa CSV — Riga ${idx + 1} di ${rows.length}`}
      onClose={onClose} width={600} resizable
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Annulla tutto</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="secondary" onClick={() => advance(false)} disabled={saving}>
          <i className="ti ti-player-skip-forward" /> Salta
        </Btn>
        {dupInfo && !forzaDup ? (
          <Btn variant="danger" onClick={() => setForzaDup(true)}
            disabled={saving || !form.proprietario_id || !form.appartamento_id}>
            <i className="ti ti-alert-triangle" /> Inserisci comunque
          </Btn>
        ) : (
          <Btn variant="success" onClick={() => handleSave(forzaDup)}
            disabled={saving || !form.proprietario_id || !form.appartamento_id}>
            <i className={`ti ${saving ? "ti-loader" : "ti-check"}`} />
            {saving ? "Salvataggio…" : "Salva e prossimo"}
          </Btn>
        )}
      </>}
    >
      <div style={{ marginBottom: 14 }}>
        <div style={{ height: 5, background: "var(--bg3)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${pctDone}%`, height: "100%", background: "var(--accent)", transition: "width 0.3s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text2)", marginTop: 4 }}>
          <span>Salvati: {results.saved} · Saltati: {results.skipped}</span>
          <span>{pctDone}% elaborato</span>
        </div>
      </div>

      <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
                    padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "var(--text2)" }}>
        <strong style={{ color: "var(--text)" }}>Da CSV · riga {idx + 1}</strong>
        {" — "}{toITdate(rows[idx].giorno)}
        {rows[idx].descrizione ? ` · ${rows[idx].descrizione}` : ""}
        {rows[idx].fornitore   ? ` · ${rows[idx].fornitore}` : ""}
        {" · "}<strong style={{ color: "var(--red)" }}>{euro(rows[idx].importo)}</strong>
      </div>

      {dupInfo && (
        <DupPanel existing={dupInfo}
          nuovoData={form.data_pagamento} nuovoMese={form.mese_competenza}
          nuovoImporto={parseFloat(form.importo)}
          nuovoTipo={tipiAttivi.find(t => String(t.id) === String(form.tipo_spesa_id))?.descrizione}
          nuovoFornitore={form.fornitore} />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="grid-2">
          <Field label="Proprietario *" warn={!form.proprietario_id}>
            <select value={form.proprietario_id}
              onChange={e => setForm(f => ({ ...f, proprietario_id: e.target.value, appartamento_id: "" }))}>
              <option value="">— Seleziona —</option>
              {props.map(p => <option key={p.id} value={p.id}>{p.nome} {p.cognome || ""}</option>)}
            </select>
          </Field>
          <Field label="Appartamento *" warn={!form.appartamento_id}>
            <select value={form.appartamento_id} onChange={e => sf("appartamento_id", e.target.value)}>
              <option value="">— Seleziona —</option>
              {(form.proprietario_id
                ? (() => {
                    const p = props.find(x => String(x.id) === String(form.proprietario_id));
                    const ids = (p?.associazioni || []).map(a => String(a.appartamento_id));
                    return ids.length ? apps.filter(a => ids.includes(String(a.id))) : apps;
                  })()
                : apps
              ).map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Tipo spesa">
            <select value={form.tipo_spesa_id || ""} onChange={e => sf("tipo_spesa_id", e.target.value)}>
              {tipiAttivi.map(t => <option key={t.id} value={t.id}>{t.descrizione}</option>)}
            </select>
          </Field>
          <Field label="Importo €">
            <input type="number" step="0.01" min="0.01" value={form.importo}
              onChange={e => sf("importo", e.target.value)}
              style={{ fontWeight: 700, color: "var(--red)" }} />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Data pagamento">
            <input type="date" value={form.data_pagamento || ""}
              onChange={e => setForm(f => ({
                ...f, data_pagamento: e.target.value,
                validita_da: e.target.value,
                mese_competenza: e.target.value.slice(0,7) || f.mese_competenza,
              }))} />
          </Field>
          <Field label="Mese competenza"
            hint={form.mese_competenza && form.data_pagamento &&
                  form.mese_competenza !== form.data_pagamento.slice(0,7) ? "⚡ da descrizione" : undefined}>
            <input type="month" value={form.mese_competenza || ""}
              onChange={e => sf("mese_competenza", e.target.value)} />
          </Field>
        </div>
        <Field label="Fornitore">
          <input value={form.fornitore || ""} onChange={e => sf("fornitore", e.target.value)} placeholder="Ragione sociale" />
        </Field>
        <Field label="Note">
          <input value={form.descrizione || ""} onChange={e => sf("descrizione", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPALE
// ══════════════════════════════════════════════════════════════════════════════

export function SpeseProprietari() {
  const [spese,     setSpese]     = useState([]);
  const [apps,      setApps]      = useState([]);
  const [props,     setProps]     = useState([]);
  const [tipi,      setTipi]      = useState([]);
  const [modal,      setModal]      = useState(null);
  const [conf,       setConf]       = useState(null);
  const [csvModal,   setCsvModal]   = useState(false);
  const [forzaSalva, setForzaSalva] = useState(false);
  // Associazioni proprietari per l'appartamento selezionato nel modal
  const [assocModal,      setAssocModal]      = useState([]);
  const [allegati,        setAllegati]        = useState([]);
  const [allegatiLoading, setAllegatiLoading] = useState(false);
  const [selectedAllegato, setSelectedAllegato] = useState(null);
  const [dupWarnings,     setDupWarnings]     = useState([]);
  const [modalDocs,       setModalDocs]       = useState([]);  // documenti dell'appartamento selezionato
  const [suggLoading,     setSuggLoading]     = useState(false);
  const [pendingFile,     setPendingFile]     = useState(null);
  const [pendingPdfUrl,   setPendingPdfUrl]   = useState(null);
  const [hashDupWarning,   setHashDupWarning]   = useState(null); // { nome_file, duplicati_allegati, duplicati_documenti }
  const [hashDupIntercept, setHashDupIntercept] = useState(null); // stesso shape, apre modal intercetto
  const [postSaveWarnings, setPostSaveWarnings] = useState([]);
  const [auditLog,         setAuditLog]         = useState([]);
  const allegatiInputRef    = useRef(null);
  const pdfNuovoRef         = useRef(null);
  const formAllegaRef       = useRef(null);
  const currentQueueItemRef = useRef(null);  // queue item attivo nel modal

  // Filtri
  const [filtroProprietario, setFiltroProprietario] = useState("");
  const [filtroAppartamento, setFiltroAppartamento] = useState("");
  const [filtroTipo,         setFiltroTipo]         = useState("");
  const [filtroPeriodic,     setFiltroPeriodic]     = useState("");
  const [filtroTesto,        setFiltroTesto]        = useState("");
  const [filtroStato,        setFiltroStato]        = useState("");
  const [filtroSoloFuori,    setFiltroSoloFuori]    = useState(false);
  const [filtroDa,           setFiltroDa]           = useState("");
  const [filtroA,            setFiltroA]            = useState("");

  // Ordinamento
  const [sortCol, setSortCol] = useState("validita_da");
  const [sortDir, setSortDir] = useState("desc");

  const load = useCallback(() =>
    Promise.all([
      speseProprietariApi.list(),
      appartamentiApi.list(),
      proprietariApi.list(),
      tipiSpesaApi.list(),
    ]).then(([s, a, p, t]) => { setSpese(s); setApps(a); setProps(p); setTipi(t); }),
  []);

  useEffect(() => { load(); }, [load]);

  const { queue: spQueue, setQueue: setSpQueue, addFiles: addSpFiles, removeItem: removeSpItem, clearQueue: clearSpQueue, apriProssimo: apriProssimoSP } = usePdfQueue({
    extractFn: async (file) => {
      const [hashRes, extractRes] = await Promise.allSettled([
        documentiApi.checkHashGlobal(file),
        speseProprietariApi.extract(file),
      ]);
      return {
        hash:    hashRes.status    === "fulfilled" ? hashRes.value    : null,
        extract: extractRes.status === "fulfilled" ? extractRes.value : null,
      };
    },
    onReady: (item) => {
      currentQueueItemRef.current = item;
      const { hash, extract } = item.data || {};
      const hasDup = hash?.duplicati_allegati?.length || hash?.duplicati_documenti?.length || hash?.duplicati_archivio?.length;
      const prefill = _mapSPExtract(extract);
      setPendingPdfUrl(item.pdfUrl);
      if (hasDup) {
        const dupWarn = {
          nome_file:           item.nomeFile,
          duplicati_allegati:  hash.duplicati_allegati  || [],
          duplicati_documenti: hash.duplicati_documenti || [],
          duplicati_archivio:  hash.duplicati_archivio  || [],
        };
        setHashDupWarning(dupWarn);
        setHashDupIntercept({ ...dupWarn, fromForm: false });
      } else {
        setHashDupWarning(null);
        apriNuovo(prefill);
      }
    },
    onAfterBatch: load,
    keepFile: true,
  });

  const tipiAttivi = tipi.filter(t => t.attivo);

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  const speseFiltrate = useMemo(() => {
    let list = [...spese];
    if (filtroProprietario) list = list.filter(s => String(s.proprietario_id) === String(filtroProprietario));
    if (filtroAppartamento) list = list.filter(s => String(s.appartamento_id) === String(filtroAppartamento));
    if (filtroTipo)         list = list.filter(s => String(s.tipo_spesa_id) === filtroTipo);
    if (filtroPeriodic)     list = list.filter(s => s.periodicita === filtroPeriodic);
    if (filtroSoloFuori)    list = list.filter(s => s.fuori_validita);
    if (filtroDa)           list = list.filter(s => s.validita_da >= filtroDa);
    if (filtroA)            list = list.filter(s => s.validita_da <= filtroA);
    if (filtroStato === "da_verificare") list = list.filter(s => s.stato === "da_verificare" || s.duplicato_rilevato);
    if (filtroStato === "verificati")    list = list.filter(s => s.stato === "verificato");
    if (filtroStato === "normali")       list = list.filter(s => s.stato === "normale" && !s.duplicato_rilevato);
    if (filtroTesto.trim()) {
      const q = filtroTesto.toLowerCase().trim();
      list = list.filter(s =>
        (s.proprietario_nome || "").toLowerCase().includes(q) ||
        (s.appartamento_nome || "").toLowerCase().includes(q) ||
        (s.fornitore         || "").toLowerCase().includes(q) ||
        (s.numero_fattura    || "").toLowerCase().includes(q) ||
        (s.descrizione       || "").toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let va, vb;
      switch (sortCol) {
        case "proprietario_nome": va = a.proprietario_nome || ""; vb = b.proprietario_nome || ""; break;
        case "appartamento_nome": va = a.appartamento_nome || ""; vb = b.appartamento_nome || ""; break;
        case "tipo_spesa":        va = a.tipo_spesa        || ""; vb = b.tipo_spesa        || ""; break;
        case "periodicita":       va = a.periodicita       || ""; vb = b.periodicita       || ""; break;
        case "validita_da":       va = a.validita_da       || ""; vb = b.validita_da       || ""; break;
        case "importo":           va = parseFloat(a.importo); vb = parseFloat(b.importo);           break;
        default: va = ""; vb = "";
      }
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return list;
  }, [spese, filtroProprietario, filtroAppartamento, filtroTipo, filtroPeriodic,
      filtroTesto, filtroSoloFuori, filtroStato, filtroDa, filtroA, sortCol, sortDir]);

  const totale = useMemo(() =>
    speseFiltrate.reduce((s, r) => s + parseFloat(r.importo || 0), 0),
  [speseFiltrate]);

  // Top categorie per statistiche
  const topCategorie = useMemo(() => {
    const map = {};
    speseFiltrate.forEach(s => { map[s.tipo_spesa] = (map[s.tipo_spesa] || 0) + parseFloat(s.importo || 0); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [speseFiltrate]);

  const haFiltri = filtroProprietario || filtroAppartamento || filtroTipo || filtroPeriodic ||
                   filtroTesto || filtroSoloFuori || filtroStato || filtroDa || filtroA;

  function resetFiltri() {
    setFiltroProprietario(""); setFiltroAppartamento(""); setFiltroTipo(""); setFiltroPeriodic("");
    setFiltroTesto(""); setFiltroSoloFuori(false); setFiltroStato(""); setFiltroDa(""); setFiltroA("");
  }

  // Carica audit log quando si apre il modal per una spesa esistente
  useEffect(() => {
    if (!modal?.id) { setAuditLog([]); return; }
    speseProprietariApi.audit(modal.id).then(setAuditLog).catch(() => setAuditLog([]));
  }, [modal?.id]);

  // Carica associazioni quando cambia appartamento nel modal
  useEffect(() => {
    if (!modal?.appartamento_id) { setAssocModal([]); return; }
    associazioniApi.listByAppartamento(modal.appartamento_id)
      .then(setAssocModal)
      .catch(() => setAssocModal([]));
  }, [modal?.appartamento_id]);

  // Carica documenti elaborati dell'appartamento selezionato nel modal
  useEffect(() => {
    if (!modal?.appartamento_id) { setModalDocs([]); return; }
    documentiApi.list({ appartamentoId: modal.appartamento_id, stato: "elaborato" })
      .then(setModalDocs)
      .catch(() => setModalDocs([]));
  }, [modal?.appartamento_id]);

  // Quando le associazioni cambiano (nuovo appartamento), auto-popola le quote
  useEffect(() => {
    if (!assocModal.length) return;
    setModal(m => {
      if (!m) return m;
      // Non sovrascrivere se le quote sono già presenti e appartengono allo stesso appartamento
      if (m.quote && m.quote.length > 0 &&
          m.quote.every(q => assocModal.some(a => String(a.proprietario_id) === String(q.proprietario_id))))
        return m;
      return {
        ...m,
        quote: assocModal.map(a => ({
          proprietario_id: String(a.proprietario_id),
          percentuale: parseFloat(a.percentuale_proprieta) || 0,
        })),
      };
    });
  }, [assocModal]);

  // Carica allegati quando si apre la modifica
  useEffect(() => {
    if (!modal?.id) { setAllegati([]); setSelectedAllegato(null); setDupWarnings([]); return; }
    setAllegatiLoading(true);
    speseProprietariApi.allegati.list(modal.id)
      .then(list => { setAllegati(list); })
      .catch(() => setAllegati([]))
      .finally(() => setAllegatiLoading(false));
  }, [modal?.id]);

  async function handleUploadAllegati(files) {
    if (!modal?.id || !files?.length) return;
    setAllegatiLoading(true);
    try {
      const results = await speseProprietariApi.allegati.upload(modal.id, files);
      const newDups = results.filter(r =>
        r.duplicati_allegati?.length || r.duplicati_documenti?.length
      );
      setDupWarnings(newDups);
      setAllegati(prev => [...prev, ...results]);
      setSpese(ss => ss.map(s => s.id === modal.id
        ? { ...s, n_allegati: (s.n_allegati || 0) + results.length }
        : s
      ));
    } catch (e) { alert("Errore caricamento: " + e.message); }
    finally { setAllegatiLoading(false); if (allegatiInputRef.current) allegatiInputRef.current.value = ""; }
  }

  async function handleDeleteAllegato(allegatoId) {
    if (!modal?.id) return;
    try {
      await speseProprietariApi.allegati.delete(modal.id, allegatoId);
      setAllegati(prev => prev.filter(a => a.id !== allegatoId));
      if (selectedAllegato?.id === allegatoId) setSelectedAllegato(null);
      setSpese(ss => ss.map(s => s.id === modal.id
        ? { ...s, n_allegati: Math.max(0, (s.n_allegati || 1) - 1) }
        : s
      ));
    } catch (e) { alert("Errore cancellazione: " + e.message); }
  }

  function clearPendingFile() {
    setPendingFile(null);
    if (pendingPdfUrl) { try { URL.revokeObjectURL(pendingPdfUrl); } catch {} }
    setPendingPdfUrl(null);
    setHashDupWarning(null);
  }

  async function handleCaricaPdfInForm(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    let dupWarning = null;
    try {
      const result = await documentiApi.checkHashGlobal(file);
      if (result.duplicati_allegati?.length || result.duplicati_documenti?.length || result.duplicati_archivio?.length) {
        dupWarning = {
          nome_file:           file.name,
          duplicati_allegati:  result.duplicati_allegati  || [],
          duplicati_documenti: result.duplicati_documenti || [],
        };
      }
    } catch (e) { console.error("check-hash:", e.message); }
    setPendingFile(file);
    setPendingPdfUrl(url);
    if (dupWarning) {
      setHashDupWarning(dupWarning);
      setHashDupIntercept({ ...dupWarning, fromForm: true });
    } else {
      setHashDupWarning(null);
    }
  }

  function apriNuovo(prefill = {}) {
    setForzaSalva(false);
    setAssocModal([]);
    setModal({
      periodicita: "una_tantum", tipo_spesa_id: null,
      importo: "", validita_da: "", validita_a: "",
      data_pagamento: "", mese_competenza: "",
      proprietario_id: "", appartamento_id: "",
      fornitore: "", numero_fattura: "", descrizione: "",
      stato: "normale", quote: [], documento_id: null,
      ...prefill,
    });
  }

  function apriModifica(s) {
    setForzaSalva(false);
    setAssocModal([]);
    setModal({
      ...s,
      proprietario_id: String(s.proprietario_id ?? ""),
      appartamento_id: String(s.appartamento_id ?? ""),
      importo:         String(s.importo),
      validita_da:     toISO(s.validita_da)    || "",
      validita_a:      toISO(s.validita_a)     || "",
      data_pagamento:  toISO(s.data_pagamento) || "",
      mese_competenza: s.mese_competenza        || "",
      documento_id:    s.documento_id           || null,
      quote: (s.quote || []).map(q => ({
        proprietario_id: String(q.proprietario_id),
        percentuale: parseFloat(q.percentuale),
      })),
    });
  }

  // Duplicato per modal manuale (solo nuovi)
  const modalDupInfo = useMemo(() => {
    if (!modal?.proprietario_id || !modal?.appartamento_id || modal.id) return null;
    if (modal.mese_competenza) {
      const ex = spese.find(s =>
        String(s.proprietario_id) === String(modal.proprietario_id) &&
        String(s.appartamento_id) === String(modal.appartamento_id) &&
        (s.mese_competenza || "").slice(0,7) === modal.mese_competenza &&
        String(s.tipo_spesa_id) === String(modal.tipo_spesa_id)
      );
      if (ex) return ex;
    }
    if (modal.data_pagamento) {
      const ex = spese.find(s =>
        String(s.proprietario_id) === String(modal.proprietario_id) &&
        String(s.appartamento_id) === String(modal.appartamento_id) &&
        toISO(s.data_pagamento) === modal.data_pagamento
      );
      if (ex) return ex;
    }
    return null;
  }, [modal, spese]);

  async function save(f) {
    try {
      const importo = parseFloat(String(f.importo).replace(",", "."));
      if (!importo || importo <= 0) { alert("Importo non valido."); return; }
      // Validazione quote
      if (f.quote && f.quote.length > 0) {
        const tot = f.quote.reduce((s, q) => s + (parseFloat(q.percentuale) || 0), 0);
        if (Math.abs(tot - 100) > 0.1) {
          alert(`Le percentuali sommano a ${tot.toFixed(2)}% — devono sommare a 100%`);
          return;
        }
      }
      const una     = isUna(f.periodicita);
      const payload = {
        proprietario_id: f.proprietario_id,
        appartamento_id: f.appartamento_id,
        tipo_spesa_id:   f.tipo_spesa_id   || null,
        importo,
        periodicita:     f.periodicita,
        validita_da:     f.validita_da     || null,
        validita_a:      una ? null : (f.validita_a || null),
        data_pagamento:  una ? (f.data_pagamento  || null) : null,
        mese_competenza: una ? (f.mese_competenza || null) : null,
        fornitore:       f.fornitore       || null,
        numero_fattura:  f.numero_fattura  || null,
        descrizione:     f.descrizione     || null,
        stato:           f.stato           || "normale",
        documento_id:    f.documento_id    || null,
        quote:           f.quote           || [],
      };
      if (f.id) {
        await speseProprietariApi.update(f.id, payload);
        setModal(null); load();
      } else {
        const nuova = await speseProprietariApi.create(payload);
        setModal(null);

        const qItem = currentQueueItemRef.current;
        if (qItem?._file && nuova?.id) {
          try {
            const results = await speseProprietariApi.allegati.upload(nuova.id, [qItem._file]);
            const dups = results.filter(r => r.duplicati_allegati?.length || r.duplicati_documenti?.length);
            if (dups.length > 0) setPostSaveWarnings(dups);
          } catch (e) { console.error("Upload allegato:", e.message); }
        } else if (pendingFile && nuova?.id) {
          try {
            const results = await speseProprietariApi.allegati.upload(nuova.id, [pendingFile]);
            const dups = results.filter(r => r.duplicati_allegati?.length || r.duplicati_documenti?.length);
            if (dups.length > 0) setPostSaveWarnings(dups);
          } catch (e) { console.error("Upload allegato:", e.message); }
          clearPendingFile();
        }

        if (qItem) {
          setSpQueue(prev => {
            const next = prev.filter(q => q.id !== qItem.id);
            setTimeout(() => apriProssimoSP(next), 150);
            return next;
          });
          currentQueueItemRef.current = null;
        }
        load();
      }
    } catch (e) { alert("Errore: " + e.message); }
  }

  async function suggerisciRiparto() {
    if (!modal?.id) return;
    setSuggLoading(true);
    try {
      const r = await speseProprietariApi.riparto(modal.id);
      if (r.proprietari?.length) {
        setModal(m => ({
          ...m,
          quote: r.proprietari.map(p => ({
            proprietario_id: p.id,
            percentuale:     parseFloat(p.percentuale.toFixed(4)),
          })),
        }));
      } else {
        alert(r.motivo || "Nessun proprietario attivo trovato.");
      }
    } catch (e) { alert("Errore: " + e.message); }
    finally { setSuggLoading(false); }
  }

  const periLabel  = p => PERI.find(x => x.value === p)?.label || p;
  const tipoColore = id => CATEGORIA_COLOR[tipi.find(x => x.id === id)?.categoria] || "gray";

  // Appartamenti filtrati per proprietario nel modal
  // props[i].associazioni contiene { appartamento_id, ... } per ogni immobile associato
  const appsModal = useMemo(() => {
    if (!modal?.proprietario_id) return apps;
    const propSel = props.find(p => String(p.id) === String(modal.proprietario_id));
    const appIds  = (propSel?.associazioni || []).map(a => String(a.appartamento_id));
    return appIds.length ? apps.filter(a => appIds.includes(String(a.id))) : apps;
  }, [modal?.proprietario_id, props, apps]);

  const una      = modal ? isUna(modal.periodicita) : true;
  const vNetto   = modal ? parseFloat(String(modal.importo || "0").replace(",",".")) : 0;
  const errInt   = modal && !una && modal.validita_da && modal.validita_a && modal.validita_da > modal.validita_a;
  const errImp   = modal && modal.importo !== "" && (!vNetto || vNetto <= 0);
  const totQuote = modal?.quote?.reduce((s, q) => s + (parseFloat(q.percentuale) || 0), 0) ?? 0;
  const errQuote = modal?.quote?.length > 0 && Math.abs(totQuote - 100) > 0.1;

  return (
    <div>
      <SectionHeader
        title="Spese Proprietari"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="secondary" onClick={() => setCsvModal(true)}>
              <i className="ti ti-upload" /> Importa CSV
            </Btn>
            <Btn variant="secondary" onClick={() => pdfNuovoRef.current?.click()}>
              <i className="ti ti-file-type-pdf" /> Carica PDF
            </Btn>
            <input ref={pdfNuovoRef} type="file" accept=".pdf" multiple style={{ display: "none" }}
              onChange={e => { const fs = Array.from(e.target.files); e.target.value = ""; if (fs.length) addSpFiles(fs); }} />
            <Btn variant="primary" onClick={apriNuovo}>
              <i className="ti ti-plus" /> Nuova Spesa
            </Btn>
          </div>
        }
      />

      {/* ── CODA PDF ── */}
      <PdfQueuePanel
        queue={spQueue}
        onValida={item => {
          currentQueueItemRef.current = item;
          const prefill = item.data ? _mapSPExtract(item.data.extract) : {};
          apriNuovo(prefill);
        }}
        onRemove={removeSpItem}
        onClear={clearSpQueue}
        onProssimo={() => apriProssimoSP(spQueue)}
      />

      {/* ── FILTRI ── */}
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--border)",
        borderRadius: 10, padding: "14px 16px", marginBottom: 14,
      }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 180px", minWidth: 150 }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Cerca</label>
            <div style={{ position: "relative" }}>
              <i className="ti ti-search" style={{
                position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
                fontSize: 14, color: "var(--text2)", pointerEvents: "none",
              }} />
              <input value={filtroTesto} onChange={e => setFiltroTesto(e.target.value)}
                placeholder="Proprietario, appartamento, fornitore…"
                style={{ paddingLeft: 30, width: "100%" }} />
            </div>
          </div>

          <div style={{ flex: "1 1 130px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Proprietario</label>
            <select value={filtroProprietario} onChange={e => setFiltroProprietario(e.target.value)} style={{ width: "100%" }}>
              <option value="">Tutti</option>
              {props.map(p => <option key={p.id} value={p.id}>{p.nome} {p.cognome || ""}</option>)}
            </select>
          </div>

          <div style={{ flex: "1 1 130px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Appartamento</label>
            <select value={filtroAppartamento} onChange={e => setFiltroAppartamento(e.target.value)} style={{ width: "100%" }}>
              <option value="">Tutti</option>
              {apps.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>

          <div style={{ flex: "0 1 130px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Tipo spesa</label>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ width: "100%" }}>
              <option value="">Tutti</option>
              {tipiAttivi.map(t => <option key={t.id} value={t.id}>{t.descrizione}</option>)}
            </select>
          </div>

          <div style={{ flex: "0 1 110px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Periodicità</label>
            <select value={filtroPeriodic} onChange={e => setFiltroPeriodic(e.target.value)} style={{ width: "100%" }}>
              <option value="">Tutte</option>
              {PERI.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <div style={{ flex: "0 1 110px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Stato</label>
            <select value={filtroStato} onChange={e => setFiltroStato(e.target.value)} style={{ width: "100%" }}>
              <option value="">Tutti</option>
              <option value="da_verificare">⚠ Da verificare</option>
              <option value="verificati">✓ Verificati</option>
              <option value="normali">● Normali</option>
            </select>
          </div>

          <div style={{ flex: "0 1 120px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Dal</label>
            <input type="date" value={filtroDa} onChange={e => setFiltroDa(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ flex: "0 1 120px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Al</label>
            <input type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)} style={{ width: "100%" }} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 1 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
                            fontSize: 12, color: "var(--yellow)", userSelect: "none", whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={filtroSoloFuori} onChange={e => setFiltroSoloFuori(e.target.checked)} />
              Solo anomali ⚠
            </label>
            {haFiltri && (
              <Btn variant="ghost" size="sm" onClick={resetFiltri}>
                <i className="ti ti-x" /> Reset
              </Btn>
            )}
          </div>
        </div>

        {/* Statistiche */}
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", paddingTop: 10, marginTop: 10,
                      borderTop: "1px solid var(--bg3)", fontSize: 12 }}>
          <span style={{ color: "var(--text2)" }}>
            <strong style={{ color: "var(--text)" }}>{speseFiltrate.length}</strong>{" "}
            {speseFiltrate.length === 1 ? "spesa" : "spese"}{haFiltri ? " filtrate" : ""}
          </span>
          <span style={{ color: "var(--text2)" }}>
            Totale: <strong style={{ color: "var(--red)" }}>{euro(totale)}</strong>
          </span>
          {topCategorie.map(([tipo, val]) => (
            <span key={tipo} style={{ color: "var(--text2)" }}>
              {tipo}: <strong style={{ color: "var(--text)" }}>{euro(val)}</strong>
            </span>
          ))}
        </div>
      </div>

      {/* ── TABELLA ── */}
      {speseFiltrate.length === 0 ? (
        <div className="alert alert-info">
          <i className="ti ti-info-circle" />
          {spese.length === 0 ? "Nessuna spesa registrata." : "Nessuna spesa corrisponde ai filtri."}
        </div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid var(--border)" }}>
          <table style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <ThSort col="proprietario_nome" label="Proprietario" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <ThSort col="appartamento_nome" label="Appartamento" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <ThSort col="tipo_spesa"        label="Tipo"         sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <ThSort col="periodicita"       label="Periodicità"  sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <ThSort col="validita_da"       label="Data / Periodo" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <th style={{ color: "var(--text2)", whiteSpace: "nowrap" }}>Mese comp.</th>
                <th style={{ color: "var(--text2)" }}>Fornitore</th>
                <th style={{ color: "var(--text2)" }}>Note</th>
                <ThSort col="importo" label="Importo" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} align="right" />
                <th style={{ textAlign: "center", width: 90, color: "var(--text2)" }}>Stato</th>
                <th style={{ textAlign: "right", width: 60 }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {speseFiltrate.map(s => {
                const periUna = isUna(s.periodicita);
                const vDa     = s.validita_da ? toITdate(s.validita_da) : "—";
                const vA      = s.validita_a  ? toITdate(s.validita_a)  : "aperta";
                return (
                  <tr key={s.id} style={{
                    background: s.stato === "da_verificare" || s.duplicato_rilevato
                      ? "rgba(249,115,22,0.05)"
                      : s.fuori_validita
                        ? "rgba(239,68,68,0.06)"
                        : s.stato === "verificato"
                          ? "rgba(34,197,94,0.03)"
                          : "",
                  }}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{s.proprietario_nome}</div>
                      {s.quote && s.quote.length > 1 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
                          {s.quote.map(q => (
                            <span key={q.proprietario_id} style={{
                              fontSize: 10, padding: "1px 6px", borderRadius: 8,
                              background: "rgba(59,130,246,0.1)", color: "var(--accent)",
                            }}>
                              {q.proprietario_nome?.split(" ")[0]} {q.percentuale}%
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px",
                                     borderRadius: 4, background: "rgba(59,130,246,0.1)",
                                     color: "var(--accent)" }}>
                        {s.appartamento_nome}
                      </span>
                    </td>
                    <td><Badge label={s.tipo_spesa} color={tipoColore(s.tipo_spesa_id)} /></td>
                    <td><Badge label={periLabel(s.periodicita)} color={periUna ? "purple" : "blue"} /></td>
                    <td style={{ fontSize: 12, color: s.fuori_validita ? "var(--red)" : "var(--text2)" }}>
                      {periUna
                        ? <><i className="ti ti-calendar-event" style={{ marginRight: 3 }} />{vDa}</>
                        : <><i className="ti ti-calendar-stats"  style={{ marginRight: 3 }} />{vDa}{" → "}{vA}</>
                      }
                      {s.fuori_validita && <span style={{ marginLeft: 6, color: "var(--yellow)", fontSize: 11 }}>⚠</span>}
                    </td>
                    <td style={{ fontSize: 11, color: "var(--text2)", whiteSpace: "nowrap" }}>
                      {s.mese_competenza ? mesL(s.mese_competenza) : <span style={{ opacity: 0.35 }}>—</span>}
                    </td>
                    <td style={{ fontSize: 11, color: "var(--text2)", maxWidth: 120 }}>
                      {s.fornitore
                        ? <span title={s.fornitore} style={{ display: "block", overflow: "hidden",
                                                              textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.fornitore}
                          </span>
                        : <span style={{ opacity: 0.35 }}>—</span>}
                    </td>
                    <td style={{ fontSize: 11, color: "var(--text2)", maxWidth: 120 }}>
                      {s.descrizione
                        ? <span title={s.descrizione} style={{ display: "block", overflow: "hidden",
                                                                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.descrizione}
                          </span>
                        : <span style={{ opacity: 0.35 }}>—</span>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span style={{ display: "inline-block", fontWeight: 700, fontSize: 13,
                                     padding: "3px 9px", borderRadius: 6,
                                     color: "var(--red)", background: "rgba(239,68,68,0.12)" }}>
                        {euro(parseFloat(s.importo))}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <StatoBadge m={s} allSpese={spese}
                        onSave={async (st) => { await speseProprietariApi.updateStato(s.id, st); load(); }}
                      />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        {s.n_allegati > 0 && (
                          <Btn variant="ghost" size="sm" title={`${s.n_allegati} allegat${s.n_allegati === 1 ? "o" : "i"}`}
                            onClick={() => apriModifica(s)}>
                            <i className="ti ti-paperclip" style={{ color: "var(--red)" }} />
                          </Btn>
                        )}
                        <Btn variant="secondary" size="sm" onClick={() => apriModifica(s)}>
                          <i className="ti ti-edit" />
                        </Btn>
                        <Btn variant="danger" size="sm"
                          onClick={() => setConf({
                            msg: `Eliminare la spesa di ${euro(parseFloat(s.importo))} per ${s.proprietario_nome}?`,
                            onYes: async () => { await speseProprietariApi.delete(s.id); setConf(null); load(); },
                          })}>
                          <i className="ti ti-trash" />
                        </Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--border)", background: "var(--bg2)" }}>
                <td colSpan={8} style={{ padding: "10px 12px", fontSize: 12, color: "var(--text2)", fontWeight: 600 }}>
                  Totale {speseFiltrate.length} {speseFiltrate.length === 1 ? "spesa" : "spese"}
                </td>
                <td style={{ textAlign: "right", padding: "10px 12px", fontWeight: 700, fontSize: 15, color: "var(--red)" }}>
                  {euro(totale)}
                </td>
                <td /><td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── BANNER DUPLICATI POST-SALVATAGGIO ── */}
      {postSaveWarnings.length > 0 && (
        <div style={{ marginBottom: 14, border: "1px solid rgba(239,68,68,0.5)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                        background: "rgba(239,68,68,0.10)" }}>
            <i className="ti ti-alert-triangle" style={{ color: "var(--red)", fontSize: 18 }} />
            <span style={{ fontWeight: 700, fontSize: 13, color: "var(--red)", flex: 1 }}>
              Allegato caricato — Possibili duplicati rilevati
            </span>
            <Btn variant="ghost" size="sm" onClick={() => setPostSaveWarnings([])}>
              <i className="ti ti-x" />
            </Btn>
          </div>
          <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {postSaveWarnings.map((w, i) => (
              <div key={i}>
                <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  <i className="ti ti-paperclip" style={{ marginRight: 4 }} />{w.nome_file}
                </p>
                {w.duplicati_allegati?.map(d => (
                  <div key={d.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr",
                                           border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden",
                                           marginBottom: 6, fontSize: 12 }}>
                    <div style={{ padding: "8px 12px", borderRight: "1px solid var(--border)" }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text2)", margin: "0 0 4px",
                                  textTransform: "uppercase", letterSpacing: 1 }}>Già presente (allegato)</p>
                      <div>{d.spesa_descrizione}</div>
                      <div style={{ color: "var(--text2)", fontSize: 11 }}>{d.appartamento_nome}</div>
                      {d.importo && <div style={{ fontWeight: 700, color: "var(--red)" }}>{euro(parseFloat(d.importo))}</div>}
                    </div>
                    <div style={{ padding: "8px 12px" }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", margin: "0 0 4px",
                                  textTransform: "uppercase", letterSpacing: 1 }}>Nuovo (file appena caricato)</p>
                      <div style={{ fontSize: 11, color: "var(--text2)" }}>{w.nome_file}</div>
                    </div>
                  </div>
                ))}
                {w.duplicati_documenti?.map(d => (
                  <div key={d.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr",
                                           border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden",
                                           marginBottom: 6, fontSize: 12 }}>
                    <div style={{ padding: "8px 12px", borderRight: "1px solid var(--border)" }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text2)", margin: "0 0 4px",
                                  textTransform: "uppercase", letterSpacing: 1 }}>Già presente (spesa inquilini)</p>
                      <div>{d.nome_file}</div>
                      <div style={{ color: "var(--text2)", fontSize: 11 }}>{d.appartamento_nome}</div>
                      {d.importo && <div style={{ fontWeight: 700, color: "var(--red)" }}>{euro(parseFloat(d.importo))}</div>}
                      {d.data && <div style={{ fontSize: 10, color: "var(--text2)" }}>{d.data.slice(0,10)}</div>}
                    </div>
                    <div style={{ padding: "8px 12px" }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", margin: "0 0 4px",
                                  textTransform: "uppercase", letterSpacing: 1 }}>Nuovo (file appena caricato)</p>
                      <div style={{ fontSize: 11, color: "var(--text2)" }}>{w.nome_file}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL NUOVO/MODIFICA ── */}
      {modal && (
        <Modal
          title={modal.id ? "Modifica Spesa" : (pendingPdfUrl ? "Nuova Spesa — PDF caricato" : "Nuova Spesa")}
          onClose={() => {
            const qItem = currentQueueItemRef.current;
            if (qItem) {
              setSpQueue(prev => {
                const next = prev.filter(q => q.id !== qItem.id);
                setTimeout(() => apriProssimoSP(next), 150);
                return next;
              });
              currentQueueItemRef.current = null;
            }
            setModal(null);
            clearPendingFile();
          }}
          width={pendingPdfUrl && !modal.id ? 1120 : (modal.id ? 720 : 560)}
          footer={<>
            <Btn variant="ghost" onClick={() => {
              const qItem = currentQueueItemRef.current;
              if (qItem) {
                setSpQueue(prev => {
                  const next = prev.filter(q => q.id !== qItem.id);
                  setTimeout(() => apriProssimoSP(next), 150);
                  return next;
                });
                currentQueueItemRef.current = null;
              }
              setModal(null);
              clearPendingFile();
            }}>Annulla</Btn>
            {modalDupInfo && !forzaSalva ? (
              <Btn variant="danger"
                disabled={!!errInt || errImp || errQuote || !modal.proprietario_id || !modal.appartamento_id || !modal.validita_da}
                onClick={() => setForzaSalva(true)}>
                <i className="ti ti-alert-triangle" /> Inserisci comunque
              </Btn>
            ) : (
              <Btn variant="primary"
                disabled={!!errInt || errImp || errQuote || !modal.proprietario_id || !modal.appartamento_id || !modal.validita_da}
                onClick={() => save(modal)}>
                <i className="ti ti-check" /> Salva
              </Btn>
            )}
          </>}
        >
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 400px", display: "flex", flexDirection: "column", gap: 14,
                        maxHeight: pendingPdfUrl && !modal.id ? "74vh" : undefined,
                        overflowY: pendingPdfUrl && !modal.id ? "auto" : undefined }}>

            {/* ── REMINDER hash duplicato (user ha già visto l'intercetto) ── */}
            {hashDupWarning && (
              <div style={{
                background: "rgba(220,38,38,0.10)", border: "2px solid #dc2626",
                borderRadius: 8, padding: "10px 14px",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <i className="ti ti-fingerprint" style={{ color: "#dc2626", fontSize: 20, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <strong style={{ color: "#dc2626", fontSize: 12 }}>
                    File identico già presente ({hashDupWarning.duplicati_allegati.length + hashDupWarning.duplicati_documenti.length} documento/i)
                  </strong>
                  <div style={{ fontSize: 11, color: "var(--text2)" }}>
                    Stai procedendo comunque. Il PDF verrà allegato alla nuova spesa.
                  </div>
                </div>
              </div>
            )}

            {/* ── BANNER ESTRAZIONE AI ── */}
            {!modal.id && modal._confidenza != null && (
              <div style={{
                background:    "rgba(59,130,246,0.08)",
                border:        "1px solid rgba(59,130,246,0.25)",
                borderRadius:  8,
                padding:       "9px 12px",
                fontSize:      12,
                display:       "flex",
                alignItems:    "center",
                gap:           8,
              }}>
                <i className="ti ti-robot" style={{ color: "var(--accent)", fontSize: 16, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600 }}>Dati estratti dal PDF</span>
                  {" — "}confidenza: <strong style={{ color: modal._confidenza >= 70 ? "var(--green)" : "var(--yellow)" }}>
                    {modal._confidenza}%
                  </strong>
                  {modal._metodo === "tesseract-ocr" && (
                    <span style={{ marginLeft: 8, opacity: 0.7 }}>(OCR)</span>
                  )}
                  {modal._tipo_descrizione && !modal.tipo_spesa_id && (
                    <span style={{ marginLeft: 8, color: "var(--yellow)" }}>
                      — tipo "<em>{modal._tipo_descrizione}</em>" non trovato nel catalogo
                    </span>
                  )}
                  {modal._appartamento_nome && !modal.appartamento_id && (
                    <span style={{ marginLeft: 8, color: "var(--yellow)" }}>
                      — appartamento "<em>{modal._appartamento_nome}</em>" non abbinato con certezza
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: "var(--text2)", flexShrink: 0 }}>Verifica i campi</span>
              </div>
            )}

            {/* ── DUPLICATE SUI CAMPI (controllo separato) ── */}
            {modalDupInfo && (
              <DupPanel existing={modalDupInfo}
                nuovoData={modal.data_pagamento || modal.validita_da}
                nuovoMese={modal.mese_competenza}
                nuovoImporto={vNetto}
                nuovoTipo={tipiAttivi.find(t => String(t.id) === String(modal.tipo_spesa_id))?.descrizione}
                nuovoFornitore={modal.fornitore} />
            )}

            <div className="grid-2">
              <Field label="Pagato da *" hint="Proprietario che ha sostenuto la spesa" warn={!modal.proprietario_id}>
                <select value={modal.proprietario_id}
                  onChange={e => setModal(m => ({ ...m, proprietario_id: e.target.value, appartamento_id: "", quote: [] }))}>
                  <option value="">— Seleziona —</option>
                  {props.map(p => <option key={p.id} value={p.id}>{p.nome} {p.cognome || ""}</option>)}
                </select>
              </Field>
              <Field label="Appartamento *" warn={!modal.appartamento_id}>
                <select value={modal.appartamento_id}
                  onChange={e => setModal(m => ({ ...m, appartamento_id: e.target.value, quote: [] }))}>
                  <option value="">— Seleziona —</option>
                  {appsModal.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid-2">
              <Field label="Periodicità">
                <select value={modal.periodicita}
                  onChange={e => setModal(m => ({ ...m, periodicita: e.target.value, validita_a: "" }))}>
                  {PERI.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </Field>
              <Field label="Tipo spesa">
                <select value={modal.tipo_spesa_id || ""}
                  onChange={e => setModal(m => ({ ...m, tipo_spesa_id: e.target.value || null }))}>
                  <option value="">— Seleziona —</option>
                  {tipiAttivi.map(t => <option key={t.id} value={t.id}>{t.descrizione}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Importo €" warn={errImp}
              hint="Importo della spesa (sempre positivo)">
              <input type="number" step="0.01" min="0.01" value={modal.importo}
                onChange={e => setModal(m => ({ ...m, importo: e.target.value }))}
                placeholder="es. 1500"
                style={{ fontSize: 16, fontWeight: 700, color: "var(--red)",
                         borderColor: errImp ? "var(--yellow)" : "" }} />
            </Field>

            <hr className="divider" />
            <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text2)", margin: 0 }}>
              <i className="ti ti-calendar-event" style={{ marginRight: 6 }} />
              {una ? "Date della spesa" : "Periodo di validità"}
            </p>

            <div className={una ? "" : "grid-2"}>
              <Field label={una ? "Data competenza *" : "Valido dal *"} warn={!modal.validita_da}>
                <input type="date" value={modal.validita_da}
                  onChange={e => setModal(m => ({
                    ...m, validita_da: e.target.value,
                    mese_competenza: e.target.value.slice(0,7) || m.mese_competenza,
                  }))}
                  style={{ borderColor: !modal.validita_da ? "var(--yellow)" : "" }} />
              </Field>
              {!una && (
                <Field label="Valido fino al" warn={!!errInt}
                  hint="Vuoto = spesa aperta">
                  <input type="date" value={modal.validita_a}
                    min={modal.validita_da || undefined}
                    onChange={e => setModal(m => ({ ...m, validita_a: e.target.value }))}
                    style={{ borderColor: errInt ? "var(--red)" : "" }} />
                </Field>
              )}
            </div>

            {una && (
              <div className="grid-2">
                <Field label="Data pagamento" hint="Giorno fisico del pagamento">
                  <input type="date" value={modal.data_pagamento || ""}
                    onChange={e => setModal(m => ({
                      ...m, data_pagamento: e.target.value,
                      mese_competenza: e.target.value.slice(0,7) || m.mese_competenza,
                    }))} />
                </Field>
                <Field label="Mese competenza" hint="Mese contabile (AAAA-MM)">
                  <input type="month" value={modal.mese_competenza || ""}
                    onChange={e => setModal(m => ({ ...m, mese_competenza: e.target.value }))} />
                </Field>
              </div>
            )}

            {errInt && <div className="alert alert-danger"><i className="ti ti-alert-circle" /> Data fine precedente alla data inizio.</div>}

            <hr className="divider" />

            <div className="grid-2">
              <Field label="Fornitore" hint="Ragione sociale o nome">
                <input value={modal.fornitore || ""}
                  onChange={e => setModal(m => ({ ...m, fornitore: e.target.value }))}
                  placeholder="es. Impresa Rossi Srl" />
              </Field>
              <Field label="N° fattura / riferimento">
                <input value={modal.numero_fattura || ""}
                  onChange={e => setModal(m => ({ ...m, numero_fattura: e.target.value }))}
                  placeholder="es. 2024/0123" />
              </Field>
            </div>

            <Field label="Note">
              <input value={modal.descrizione || ""}
                onChange={e => setModal(m => ({ ...m, descrizione: e.target.value }))}
                placeholder="Descrizione libera" />
            </Field>

            {/* ── DOCUMENTO COLLEGATO ── */}
            {modalDocs.length > 0 && (
              <Field label="Documento collegato" hint="Fattura OCR già caricata">
                <select value={modal.documento_id || ""}
                  onChange={e => setModal(m => ({ ...m, documento_id: e.target.value || null }))}>
                  <option value="">— Nessuno —</option>
                  {modalDocs.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.nome_file}{d.periodo_da ? ` · ${d.periodo_da.slice(0,7)}` : ""}{d.importo ? ` · ${euro(d.importo)}` : ""}
                    </option>
                  ))}
                </select>
                {modal.documento_id && (() => {
                  const d = modalDocs.find(x => x.id === modal.documento_id);
                  return d ? (
                    <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 4,
                                  display: "flex", alignItems: "center", gap: 6 }}>
                      <i className="ti ti-link" />
                      {d.appartamento_nome || ""} — {d.tipo_descrizione || ""} — {euro(d.importo)}
                    </div>
                  ) : null;
                })()}
              </Field>
            )}

            {/* ── ALLEGA FILE (solo nuova spesa, prima del salvataggio) ── */}
            {!modal.id && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text2)", margin: 0 }}>
                    <i className="ti ti-paperclip" style={{ marginRight: 6 }} />
                    Allegato
                  </p>
                  <input ref={formAllegaRef} type="file" accept=".pdf,image/*"
                    style={{ display: "none" }}
                    onChange={e => { const f = e.target.files[0]; e.target.value = ""; if (f) handleCaricaPdfInForm(f); }} />
                  <Btn variant="secondary" size="sm"
                    onClick={() => formAllegaRef.current?.click()}>
                    <i className="ti ti-upload" /> {pendingFile ? "Sostituisci" : "Scegli file"}
                  </Btn>
                  {pendingFile && (
                    <Btn variant="ghost" size="sm" onClick={clearPendingFile} title="Rimuovi">
                      <i className="ti ti-x" />
                    </Btn>
                  )}
                </div>
                {pendingFile && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "var(--text2)",
                                display: "flex", alignItems: "center", gap: 6 }}>
                    <i className="ti ti-file-type-pdf" style={{ color: "var(--red)" }} />
                    {pendingFile.name}
                    <span style={{ opacity: 0.5 }}>— verrà allegato al salvataggio</span>
                  </div>
                )}
              </div>
            )}

            {/* ── ALLEGATI MULTIPLI ── */}
            {modal.id && (
              <>
                <hr className="divider" />
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text2)", margin: 0 }}>
                      <i className="ti ti-paperclip" style={{ marginRight: 6 }} />
                      Allegati {allegati.length > 0 && <span style={{ fontWeight: 400 }}>({allegati.length})</span>}
                    </p>
                    <input ref={allegatiInputRef} type="file" accept=".pdf,image/*" multiple
                      style={{ display: "none" }}
                      onChange={e => { const fs = Array.from(e.target.files); if (fs.length) handleUploadAllegati(fs); }} />
                    <Btn variant="secondary" size="sm" disabled={allegatiLoading}
                      onClick={() => allegatiInputRef.current?.click()}>
                      {allegatiLoading
                        ? <><i className="ti ti-loader-2 spin" /> Caricamento…</>
                        : <><i className="ti ti-upload" /> Aggiungi file</>}
                    </Btn>
                  </div>

                  {/* Avvisi duplicati */}
                  {dupWarnings.map((w, i) => (
                    <div key={i} style={{
                      background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
                      borderRadius: 8, padding: "10px 12px", marginBottom: 10, fontSize: 12,
                    }}>
                      <div style={{ fontWeight: 600, color: "var(--red)", marginBottom: 6 }}>
                        <i className="ti ti-alert-triangle" style={{ marginRight: 4 }} />
                        Possibile duplicato: <strong>{w.nome_file}</strong>
                      </div>
                      {w.duplicati_allegati?.map(d => (
                        <div key={d.id} style={{ marginBottom: 3, color: "var(--text2)" }}>
                          <i className="ti ti-receipt" style={{ marginRight: 4 }} />
                          Spesa: {d.spesa_descrizione} — {d.appartamento_nome} —{" "}
                          {d.importo ? euro(parseFloat(d.importo)) : ""}
                        </div>
                      ))}
                      {w.duplicati_documenti?.map(d => (
                        <div key={d.id} style={{ marginBottom: 3, color: "var(--text2)" }}>
                          <i className="ti ti-file-text" style={{ marginRight: 4 }} />
                          Documento: {d.nome_file} — {d.appartamento_nome} —{" "}
                          {d.importo ? euro(parseFloat(d.importo)) : ""} {d.data ? `(${d.data.slice(0,10)})` : ""}
                        </div>
                      ))}
                    </div>
                  ))}

                  {/* Layout a due colonne quando c'è preview */}
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    {/* Lista allegati */}
                    <div style={{ flex: "0 0 auto", minWidth: 200, maxWidth: selectedAllegato ? 220 : "100%" }}>
                      {allegati.length === 0 && !allegatiLoading && (
                        <span style={{ fontSize: 12, color: "var(--text2)" }}>
                          <i className="ti ti-file-off" style={{ marginRight: 4 }} />Nessun allegato
                        </span>
                      )}
                      {allegati.map(all => (
                        <div key={all.id} style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "5px 8px", borderRadius: 6, marginBottom: 4,
                          background: selectedAllegato?.id === all.id ? "var(--bg3)" : "var(--bg2)",
                          border: "1px solid var(--border)", cursor: "pointer",
                        }}
                          onClick={() => setSelectedAllegato(prev => prev?.id === all.id ? null : all)}
                        >
                          <i className={`ti ${
                            all.mime_type?.startsWith("image/") ? "ti-photo" :
                            all.mime_type === "application/pdf" ? "ti-file-type-pdf" : "ti-file"
                          }`} style={{ color: "var(--red)", fontSize: 16, flexShrink: 0 }} />
                          <span style={{
                            fontSize: 11, flex: 1, overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }} title={all.nome_file}>{all.nome_file}</span>
                          <Btn variant="ghost" size="sm"
                            onClick={e => { e.stopPropagation(); handleDeleteAllegato(all.id); }}
                            title="Elimina">
                            <i className="ti ti-trash" style={{ fontSize: 13, color: "var(--red)" }} />
                          </Btn>
                        </div>
                      ))}
                    </div>

                    {/* Preview */}
                    {selectedAllegato && (
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <DocPreview
                          url={speseProprietariApi.allegati.getUrl(modal.id, selectedAllegato.id)}
                          mime={selectedAllegato.mime_type}
                          nome={selectedAllegato.nome_file}
                          height={320}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ── RIPARTO QUOTE ── */}
            {assocModal.length > 0 && (
              <>
                <hr className="divider" />
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text2)", margin: 0 }}>
                      <i className="ti ti-percentage" style={{ marginRight: 6 }} />
                      Riparto tra proprietari
                    </p>
                    {errQuote && (
                      <span style={{ fontSize: 11, color: "var(--red)", fontWeight: 600 }}>
                        — totale: {totQuote.toFixed(2)}% (deve essere 100%)
                      </span>
                    )}
                    {modal.id && (
                      <Btn variant="secondary" size="sm" disabled={suggLoading} onClick={suggerisciRiparto}
                           title="Calcola quote teoriche dalle regole di riparto attive">
                        {suggLoading
                          ? <><i className="ti ti-loader" /> Calcolo…</>
                          : <><i className="ti ti-calculator" /> Suggerisci da regole</>}
                      </Btn>
                    )}
                  </div>
                  <RipartoEditor
                    assocs={assocModal}
                    quote={modal.quote || []}
                    onChange={q => setModal(m => ({ ...m, quote: q }))}
                    dataDa={modal.validita_da || modal.data_pagamento}
                    dataA={!una ? modal.validita_a : null}
                  />
                </div>
              </>
            )}

            {/* ── AUDIT LOG (solo spesa esistente) ── */}
            {modal?.id && auditLog.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)",
                              marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <i className="ti ti-history" />
                  Storico modifiche ({auditLog.length})
                </div>
                <div style={{ maxHeight: 180, overflowY: "auto",
                              border: "1px solid var(--border)", borderRadius: 6 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: "var(--bg3)" }}>
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600 }}>Campo</th>
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600 }}>Da</th>
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600 }}>A</th>
                        <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLog.map((r, i) => (
                        <tr key={i} style={{ borderTop: "1px solid var(--bg3)",
                                             background: i % 2 === 0 ? "transparent" : "var(--bg2)" }}>
                          <td style={{ padding: "4px 8px", color: "var(--accent)", fontWeight: 600 }}>{r.campo}</td>
                          <td style={{ padding: "4px 8px", color: "#f87171", maxWidth: 160,
                                       overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                              title={r.valore_da}>{r.valore_da || <span style={{ opacity: 0.3 }}>—</span>}</td>
                          <td style={{ padding: "4px 8px", color: "#4ade80", maxWidth: 160,
                                       overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                              title={r.valore_a}>{r.valore_a || <span style={{ opacity: 0.3 }}>—</span>}</td>
                          <td style={{ padding: "4px 8px", textAlign: "right", color: "var(--text2)",
                                       whiteSpace: "nowrap" }}>
                            {new Date(r.created_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>{/* fine colonna form */}

            {/* ── PREVIEW PDF (solo nuova spesa con file caricato) ── */}
            {pendingPdfUrl && !modal.id && (
              <div style={{ flex: "1 1 500px", minHeight: 580, display: "flex",
                            flexDirection: "column", background: "#111",
                            borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "6px 14px", fontSize: 11, color: "var(--text2)",
                              borderBottom: "1px solid var(--border)", display: "flex",
                              alignItems: "center", justifyContent: "space-between",
                              background: "var(--bg2)" }}>
                  <span><i className="ti ti-file-type-pdf" style={{ color: "#ef4444" }} /> PDF originale</span>
                  <a href={pendingPdfUrl} target="_blank" rel="noreferrer"
                     style={{ color: "var(--accent)", fontSize: 11, textDecoration: "none" }}>
                    <i className="ti ti-external-link" /> Apri
                  </a>
                </div>
                <iframe src={pendingPdfUrl} style={{ flex: 1, border: "none", width: "100%" }}
                        title="Anteprima PDF" />
              </div>
            )}
          </div>{/* fine flex row */}
        </Modal>
      )}

      {/* ── INTERCETTO HASH DUPLICATO ── */}
      {hashDupIntercept && (
        <Modal
          title=""
          onClose={() => {
            setHashDupIntercept(null);
            clearPendingFile();
            const qItem = currentQueueItemRef.current;
            if (qItem) {
              setSpQueue(prev => {
                const next = prev.filter(q => q.id !== qItem.id);
                setTimeout(() => apriProssimoSP(next), 150);
                return next;
              });
              currentQueueItemRef.current = null;
            }
          }}
          width={640}
          footer={<>
            <Btn variant="ghost" onClick={() => {
              setHashDupIntercept(null);
              clearPendingFile();
              const qItem = currentQueueItemRef.current;
              if (qItem) {
                setSpQueue(prev => {
                  const next = prev.filter(q => q.id !== qItem.id);
                  setTimeout(() => apriProssimoSP(next), 150);
                  return next;
                });
                currentQueueItemRef.current = null;
              }
            }}>
              <i className="ti ti-x" /> Annulla
            </Btn>
            <div style={{ flex: 1 }} />
            <Btn variant="danger" onClick={() => {
              const wasFromForm = hashDupIntercept?.fromForm;
              setHashDupIntercept(null);
              if (!wasFromForm) {
                const qItem = currentQueueItemRef.current;
                const prefill = qItem?.data ? _mapSPExtract(qItem.data.extract) : {};
                apriNuovo(prefill);
              }
            }}>
              <i className="ti ti-alert-triangle" /> Procedi comunque
            </Btn>
          </>}
        >
          {/* Header alert */}
          <div style={{
            background: "rgba(220,38,38,0.12)", border: "2px solid #dc2626",
            borderRadius: 10, padding: "16px 18px", marginBottom: 18,
            display: "flex", gap: 14, alignItems: "flex-start",
          }}>
            <i className="ti ti-fingerprint" style={{ color: "#dc2626", fontSize: 36, flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#dc2626", marginBottom: 4 }}>
                File già presente nel sistema
              </div>
              <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
                L'impronta digitale (SHA-256) di <strong>{hashDupIntercept.nome_file}</strong> corrisponde
                esattamente a {(hashDupIntercept.duplicati_allegati.length + hashDupIntercept.duplicati_documenti.length + (hashDupIntercept.duplicati_archivio?.length || 0))} documento/i già archiviato/i.
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 6 }}>
                Questo controllo è basato sul contenuto del file, non sul nome.
                Stai probabilmente caricando un file già presente.
              </div>
            </div>
          </div>

          {/* Allegati spese proprietari */}
          {hashDupIntercept.duplicati_allegati.map((d, i) => (
            <div key={d.id} style={{
              border: "1px solid rgba(220,38,38,0.4)", borderRadius: 10,
              overflow: "hidden", marginBottom: 12,
            }}>
              <div style={{ background: "rgba(220,38,38,0.08)", padding: "8px 14px",
                            fontSize: 11, fontWeight: 700, color: "#dc2626",
                            textTransform: "uppercase", letterSpacing: 1,
                            display: "flex", alignItems: "center", gap: 6 }}>
                <i className="ti ti-receipt" />
                Già presente come allegato · Spesa Proprietari
              </div>
              <div style={{ padding: "12px 14px", display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 16px", fontSize: 13 }}>
                {(d.proprietario_nome) && (
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text2)", fontWeight: 700,
                                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Proprietario</div>
                    <div style={{ fontWeight: 600 }}>
                      {d.proprietario_nome} {d.proprietario_cognome || ""}
                    </div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 10, color: "var(--text2)", fontWeight: 700,
                                textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Appartamento</div>
                  <div style={{ fontWeight: 600 }}>{d.appartamento_nome}</div>
                </div>
                {d.tipo_spesa && (
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text2)", fontWeight: 700,
                                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Tipo spesa</div>
                    <div>{d.tipo_spesa}</div>
                  </div>
                )}
                {(d.data_pagamento || d.validita_da) && (
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text2)", fontWeight: 700,
                                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Data</div>
                    <div>{toITdate(d.data_pagamento || d.validita_da)}</div>
                  </div>
                )}
                {d.fornitore && (
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text2)", fontWeight: 700,
                                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Fornitore</div>
                    <div>{d.fornitore}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 10, color: "var(--text2)", fontWeight: 700,
                                textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Importo</div>
                  <div style={{ fontWeight: 700, color: "#dc2626", fontSize: 15 }}>
                    {d.importo ? euro(parseFloat(d.importo)) : "—"}
                  </div>
                </div>
                {d.spesa_descrizione && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 10, color: "var(--text2)", fontWeight: 700,
                                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Note</div>
                    <div style={{ color: "var(--text2)", fontStyle: "italic" }}>{d.spesa_descrizione}</div>
                  </div>
                )}
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 10, color: "var(--text2)", fontWeight: 700,
                                textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Nome file allegato</div>
                  <div style={{ fontSize: 11, color: "var(--text2)" }}>
                    <i className="ti ti-paperclip" style={{ marginRight: 4 }} />{d.nome_file}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Documenti */}
          {hashDupIntercept.duplicati_documenti.map((d, i) => (
            <div key={d.id} style={{
              border: "1px solid rgba(220,38,38,0.4)", borderRadius: 10,
              overflow: "hidden", marginBottom: 12,
            }}>
              <div style={{ background: "rgba(220,38,38,0.08)", padding: "8px 14px",
                            fontSize: 11, fontWeight: 700, color: "#dc2626",
                            textTransform: "uppercase", letterSpacing: 1,
                            display: "flex", alignItems: "center", gap: 6 }}>
                <i className="ti ti-file-text" />
                Già presente come documento · Spese Inquilini
              </div>
              <div style={{ padding: "12px 14px", display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 16px", fontSize: 13 }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--text2)", fontWeight: 700,
                                textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Appartamento</div>
                  <div style={{ fontWeight: 600 }}>{d.appartamento_nome}</div>
                </div>
                {d.tipo_spesa && (
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text2)", fontWeight: 700,
                                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Tipo spesa</div>
                    <div>{d.tipo_spesa}</div>
                  </div>
                )}
                {d.data && (
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text2)", fontWeight: 700,
                                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Data caricamento</div>
                    <div>{d.data.slice(0, 10)}</div>
                  </div>
                )}
                {d.importo && (
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text2)", fontWeight: 700,
                                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Importo</div>
                    <div style={{ fontWeight: 700, color: "#dc2626", fontSize: 15 }}>
                      {euro(parseFloat(d.importo))}
                    </div>
                  </div>
                )}
                {d.fornitore && (
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text2)", fontWeight: 700,
                                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Fornitore</div>
                    <div>{d.fornitore}</div>
                  </div>
                )}
                {d.note && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 10, color: "var(--text2)", fontWeight: 700,
                                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Note AI</div>
                    <div style={{ color: "var(--text2)", fontStyle: "italic" }}>{d.note}</div>
                  </div>
                )}
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 10, color: "var(--text2)", fontWeight: 700,
                                textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Nome file</div>
                  <div style={{ fontSize: 11, color: "var(--text2)" }}>
                    <i className="ti ti-paperclip" style={{ marginRight: 4 }} />{d.nome_file}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Archivio documentale */}
          {(hashDupIntercept.duplicati_archivio || []).map((d) => (
            <div key={d.id} style={{
              border: "1px solid rgba(220,38,38,0.4)", borderRadius: 10,
              overflow: "hidden", marginBottom: 12,
            }}>
              <div style={{ background: "rgba(220,38,38,0.08)", padding: "8px 14px",
                            fontSize: 11, fontWeight: 700, color: "#dc2626",
                            textTransform: "uppercase", letterSpacing: 1,
                            display: "flex", alignItems: "center", gap: 6 }}>
                <i className="ti ti-archive" />
                Già presente nell&apos;archivio documentale
              </div>
              <div style={{ padding: "12px 14px", display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 16px", fontSize: 13 }}>
                {d.tipo_nome && (
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text2)", fontWeight: 700,
                                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Tipo</div>
                    <div>{d.tipo_nome}</div>
                  </div>
                )}
                {d.created_at && (
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text2)", fontWeight: 700,
                                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Archiviato il</div>
                    <div>{toITdate(d.created_at)}</div>
                  </div>
                )}
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 10, color: "var(--text2)", fontWeight: 700,
                                textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Nome file</div>
                  <div style={{ fontSize: 11, color: "var(--text2)" }}>
                    <i className="ti ti-paperclip" style={{ marginRight: 4 }} />{d.nome_file}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </Modal>
      )}

      {csvModal && (
        <CsvImportModal
          apps={apps} props={props} spese={spese} tipiAttivi={tipiAttivi}
          onSaved={load} onClose={() => setCsvModal(false)}
        />
      )}

      {conf && <Confirm msg={conf.msg} onYes={conf.onYes} onNo={() => setConf(null)} />}
    </div>
  );
}
