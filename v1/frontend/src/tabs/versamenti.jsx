import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { appartamentiApi, movimentiApi, proprietariApi, associazioniApi, tipiVersamentoApi } from "../api.js";
import { Btn, Badge, Modal, Confirm, Field, SectionHeader } from "../components/ui.jsx";
import { euro, toISO, toITdate, mesL } from "../utils/formatters.js";
import ImportazioneModal from "../components/ImportazioneModal.jsx";
import CreaRegolaModal   from "../components/CreaRegolaModal.jsx";

// ── Costanti ───────────────────────────────────────────────────────────────────

const PERI = [
  { value: "una_tantum",  label: "Una tantum"  },
  { value: "mensile",     label: "Mensile"      },
  { value: "bimestrale",  label: "Bimestrale"   },
  { value: "trimestrale", label: "Trimestrale"  },
  { value: "semestrale",  label: "Semestrale"   },
  { value: "annuale",     label: "Annuale"      },
];

const TV_COLOR_DEFAULT = { affitto: "blue", conguaglio: "purple", rimborso: "red", altro: "gray" };

const isUna = p => (p || "una_tantum") === "una_tantum";

function importoNetto(m) {
  return parseFloat(m.importo || 0) * (parseInt(m.segno) || 1);
}
function parseImportoNetto(v) {
  return parseFloat(String(v).replace(",", ".")) || 0;
}

// ── CSV helpers ────────────────────────────────────────────────────────────────

function parseCSVDate(s) {
  const t = (s || "").trim();
  const dmy = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return null;
}

function parseCSV(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    // Auto-rileva separatore: ; se presente, altrimenti ,
    const sep   = t.includes(";") ? ";" : ",";
    const parts = t.split(sep).map(p => p.trim().replace(/^"|"$/g, ""));
    // Rimuovi campi vuoti finali (es. riga terminata con ; extra)
    while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
    if (parts.length < 3) continue;
    const giorno = parseCSVDate(parts[0]);
    if (!giorno) continue;
    // Il campo importo usa , come decimale (es. 300,00) → sostituisci con .
    const importoRaw = parts[parts.length - 1].replace(",", ".").replace(/[^\d.\-]/g, "");
    const importo = Math.abs(parseFloat(importoRaw));
    if (!importo) continue;
    const descrizione = parts.slice(1, parts.length - 1).join(sep).trim();
    rows.push({ giorno, descrizione, importo });
  }
  return rows;
}

// Mappa mesi italiani → numero mm
const MESI_IT = [
  ["gennaio", "01"], ["febbraio", "02"], ["marzo",    "03"],
  ["aprile",  "04"], ["maggio",   "05"], ["giugno",   "06"],
  ["luglio",  "07"], ["agosto",   "08"], ["settembre","09"],
  ["ottobre", "10"], ["novembre", "11"], ["dicembre", "12"],
];

/**
 * Cerca nella descrizione un mese italiano, dopo aver rimosso tutti gli spazi
 * (gestisce troncamenti bancari tipo "MAG GIO" → "MAGGIO", "GEN NAIO" → "GENNAIO").
 * Cerca l'anno nei 15 chars immediatamente dopo il nome del mese.
 * Restituisce "YYYY-MM" o null.
 */
function detectMonthFromDescription(descrizione, fallbackDate) {
  const d = (descrizione || "").toLowerCase().replace(/\s+/g, "");
  for (const [nome, mm] of MESI_IT) {
    const pos = d.indexOf(nome);
    if (pos === -1) continue;
    const after = d.slice(pos + nome.length, pos + nome.length + 15);
    // Anno 4 cifre (2020-2099) subito dopo il mese
    const m4 = after.match(/(20\d{2})(?!\d)/);
    if (m4) return `${m4[1]}-${mm}`;
    // Anno 2 cifre subito dopo il mese (es. "MAGGIO26")
    const m2 = after.match(/^([2-9]\d)(?!\d)/);
    if (m2) return `20${m2[1]}-${mm}`;
    if (fallbackDate) return `${fallbackDate.slice(0, 4)}-${mm}`;
    return null;
  }
  return null;
}

function detectTenant(descrizione, apps) {
  const d = (descrizione || "").toLowerCase();
  // Prima passata: cognome (più distintivo — evita falsi positivi su nomi comuni)
  for (const app of apps) {
    for (const c of (app.componenti || [])) {
      const cogn = (c.cognome || "").toLowerCase().trim();
      if (cogn.length >= 3 && d.includes(cogn))
        return { appartamento_id: String(app.id), componente_id: String(c.id) };
    }
  }
  // Seconda passata: nome (fallback)
  for (const app of apps) {
    for (const c of (app.componenti || [])) {
      const nome = (c.nome || "").toLowerCase().trim();
      if (nome.length >= 3 && d.includes(nome))
        return { appartamento_id: String(app.id), componente_id: String(c.id) };
    }
  }
  return null;
}

// ── Confronto duplicati ────────────────────────────────────────────────────────

function DupRow({ data, mese, importo, descr }) {
  return (
    <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {data && <span style={{ color: "var(--text2)" }}><i className="ti ti-calendar-event" style={{ marginRight: 3, fontSize: 11 }} />{toITdate(data)}</span>}
        {mese && <span style={{ color: "var(--text2)" }}><i className="ti ti-calendar" style={{ marginRight: 3, fontSize: 11 }} />{mesL(mese)}</span>}
      </div>
      <span style={{ fontWeight: 700, color: "var(--green)", fontSize: 14 }}>{euro(Math.abs(importo))}</span>
      {descr && (
        <span style={{ fontSize: 11, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {descr}
        </span>
      )}
    </div>
  );
}

function DupPanel({ tipo, existing, nuovoData, nuovoMese, nuovoImporto, nuovoDescr }) {
  const exNetto = importoNetto(existing);
  return (
    <div style={{ border: "1px solid rgba(239,68,68,0.5)", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ background: "rgba(239,68,68,0.12)", padding: "8px 12px", fontSize: 12 }}>
        <i className="ti ti-alert-triangle" style={{ color: "var(--red)", marginRight: 6 }} />
        <strong style={{ color: "var(--red)" }}>
          {tipo === "mese" ? "Stesso mese di riferimento" : "Stessa data di versamento"}
        </strong>
        {" "}— controlla se è un duplicato prima di procedere
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ padding: "10px 12px", borderRight: "1px solid var(--border)" }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text2)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>Già presente</p>
          <DupRow
            data={toISO(existing.data_versamento) || toISO(existing.validita_da)}
            mese={existing.mese_riferimento}
            importo={exNetto}
            descr={existing.descrizione}
          />
        </div>
        <div style={{ padding: "10px 12px" }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>Nuovo</p>
          <DupRow data={nuovoData} mese={nuovoMese} importo={nuovoImporto} descr={nuovoDescr} />
        </div>
      </div>
    </div>
  );
}

// ── Stato badge (normale / sospetto / verificato + duplicato automatico) ───────

const STATO_CFG = {
  sospetto:   { bg: "rgba(249,115,22,0.18)", color: "#ea580c",        label: "⚠ sospetto" },
  verificato: { bg: "rgba(34,197,94,0.18)",  color: "var(--green)",   label: "✓ ok"       },
  auto:       { bg: "rgba(234,179,8,0.18)",  color: "#ca8a04",        label: "⚠ auto"     },
};

function StatoBadge({ m, allMovs, onSave }) {
  const [open, setOpen]     = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  // Chiudi cliccando fuori
  useEffect(() => {
    if (!open) return;
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Righe correlate: stesso inquilino + stesso importo+segno + stessa data O stesso mese
  const correlate = useMemo(() => {
    if (!allMovs) return [];
    return allMovs.filter(m2 =>
      m2.id !== m.id &&
      String(m2.componente_id) === String(m.componente_id) &&
      parseFloat(m2.importo)   === parseFloat(m.importo)   &&
      parseInt(m2.segno)        === parseInt(m.segno)       &&
      (
        (m2.data_versamento  && m.data_versamento  && toISO(m2.data_versamento)  === toISO(m.data_versamento))  ||
        (m2.mese_riferimento && m.mese_riferimento && m2.mese_riferimento.slice(0,7) === m.mese_riferimento.slice(0,7))
      )
    );
  }, [m, allMovs]);

  const hasDup = m.duplicato_rilevato || correlate.length > 0;
  const effKey = m.stato === "sospetto"   ? "sospetto"
               : m.stato === "verificato" ? "verificato"
               : hasDup                   ? "auto"
               : null;
  const cfg = effKey ? STATO_CFG[effKey] : null;

  async function set(s) {
    setOpen(false);
    setSaving(true);
    try { await onSave(s); } finally { setSaving(false); }
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        title={cfg ? "Clicca per dettagli e cambio stato" : "Clicca per impostare stato"}
        style={{
          background: cfg ? cfg.bg : "transparent",
          border: cfg ? `1px solid ${cfg.color}44` : "1px solid var(--border)",
          borderRadius: 10, padding: "2px 8px", cursor: "pointer",
          fontSize: 10, fontWeight: 700,
          color: cfg ? cfg.color : "var(--text2)",
          whiteSpace: "nowrap",
        }}>
        {saving
          ? <i className="ti ti-loader" style={{ fontSize: 10 }} />
          : cfg ? cfg.label : "●"}
      </button>

      {open && (
        <div style={{
          position: "absolute", zIndex: 200, right: 0, top: "calc(100% + 4px)",
          background: "var(--bg2)", border: "1px solid var(--border)",
          borderRadius: 10, boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
          minWidth: 260, maxWidth: 340, padding: 8,
        }}>

          {/* Stato corrente + cambio */}
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1,
            color: "var(--text2)", marginBottom: 5, paddingLeft: 4 }}>
            Imposta stato
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {[
              { k: "normale",    label: "● Normale",   color: "var(--text2)" },
              { k: "sospetto",   label: "⚠ Sospetto",  color: "#ea580c"      },
              { k: "verificato", label: "✓ Verificato", color: "var(--green)" },
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

          {/* Righe correlate */}
          {correlate.length > 0 && (
            <>
              <div style={{
                borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 2,
                fontSize: 10, textTransform: "uppercase", letterSpacing: 1,
                color: "var(--text2)", marginBottom: 5, paddingLeft: 4,
              }}>
                {correlate.length === 1 ? "Correlato con" : `Correlato con ${correlate.length} righe`}
              </div>
              {correlate.map(d => {
                const nD    = importoNetto(d);
                const dataD = d.data_versamento ? toITdate(d.data_versamento)
                            : d.validita_da     ? toITdate(d.validita_da) : "—";
                return (
                  <div key={d.id} style={{
                    background: "var(--bg3)", borderRadius: 6, padding: "6px 8px",
                    marginBottom: 4, fontSize: 11,
                    borderLeft: "3px solid rgba(234,179,8,0.6)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                      <span style={{ color: "var(--text2)" }}>
                        <i className="ti ti-calendar-event" style={{ marginRight: 3, fontSize: 10 }} />
                        {dataD}
                        {d.mese_riferimento && (
                          <span style={{ marginLeft: 6 }}>
                            <i className="ti ti-calendar" style={{ marginRight: 2, fontSize: 10 }} />
                            {mesL(d.mese_riferimento)}
                          </span>
                        )}
                      </span>
                      <span style={{ fontWeight: 700, color: nD < 0 ? "var(--red)" : "var(--green)" }}>
                        {nD < 0 ? "" : "+"}{euro(nD)}
                      </span>
                    </div>
                    <div style={{ color: "var(--text2)", fontSize: 10 }}>
                      {d.appartamento_nome}
                      {d.componente_nome && <span style={{ marginLeft: 6 }}>· {d.componente_nome}</span>}
                    </div>
                    {d.descrizione && (
                      <div style={{
                        color: "var(--text2)", fontSize: 10, marginTop: 2,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {d.descrizione}
                      </div>
                    )}
                    {/* Stato dell'altra riga */}
                    {d.stato && d.stato !== "normale" && (
                      <div style={{ marginTop: 2 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 8,
                          background: STATO_CFG[d.stato]?.bg, color: STATO_CFG[d.stato]?.color,
                        }}>
                          {STATO_CFG[d.stato]?.label}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Icona ordinamento ──────────────────────────────────────────────────────────

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

// ══════════════════════════════════════════════════════════════════════════════
// MODALE IMPORTAZIONE CSV
// ══════════════════════════════════════════════════════════════════════════════

function CsvImportModal({ apps, movs, proprietari, onSaved, onClose }) {
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
        alert("Nessuna riga valida trovata.\nFormato atteso: giorno, descrizione, importo");
        return;
      }
      setRows(parsed);
      setIdx(0);
      loadRow(parsed, 0);
    };
    reader.readAsText(file, "utf-8");
  }

  function loadRow(parsed, i) {
    const row    = parsed[i];
    const match  = detectTenant(row.descrizione, apps);
    const meseRif = detectMonthFromDescription(row.descrizione, row.giorno)
                    || row.giorno.slice(0, 7);
    setForzaDup(false);
    const newForm = {
      periodicita:      "una_tantum",
      tipo_versamento:  "affitto",
      data_versamento:  row.giorno,
      validita_da:      row.giorno,
      mese_riferimento: meseRif,
      importo_netto:    row.importo,
      descrizione:      row.descrizione,
      appartamento_id:  match?.appartamento_id || "",
      componente_id:    match?.componente_id   || "",
      incassato_da_proprietario_id: null,
    };
    setForm(newForm);
    // Auto-default proprietario
    if (match?.appartamento_id && row.giorno) {
      associazioniApi.defaultPerData(match.appartamento_id, row.giorno)
        .then(r => {
          if (r?.proprietario_id)
            setForm(f => f ? { ...f, incassato_da_proprietario_id: r.proprietario_id } : f);
        })
        .catch(() => {});
    }
  }

  // Duplicato: prima verifica mese_riferimento (per affitto), poi data versamento
  const dupInfo = useMemo(() => {
    if (!form?.componente_id) return null;
    if ((form.tipo_versamento || "affitto") === "affitto" && form.mese_riferimento) {
      const ex = movs.find(m =>
        String(m.componente_id) === String(form.componente_id) &&
        (m.mese_riferimento || "").slice(0, 7) === form.mese_riferimento
      );
      if (ex) return { tipo: "mese", existing: ex };
    }
    if (form.data_versamento) {
      const ex = movs.find(m =>
        String(m.componente_id) === String(form.componente_id) &&
        (toISO(m.data_versamento) || toISO(m.validita_da)) === form.data_versamento
      );
      if (ex) return { tipo: "data", existing: ex };
    }
    return null;
  }, [form, movs]);

  function advance(wasSaved) {
    setForzaDup(false);
    const nr = {
      saved:   results.saved   + (wasSaved ? 1 : 0),
      skipped: results.skipped + (wasSaved ? 0 : 1),
    };
    setResults(nr);
    const next = idx + 1;
    if (next >= rows.length) { setForm(null); return; }
    setIdx(next);
    loadRow(rows, next);
  }

  async function handleSave(forza = false) {
    if (!form.appartamento_id || !form.componente_id) {
      alert("Seleziona appartamento e inquilino."); return;
    }
    if (dupInfo && !forza) return;
    const netto = parseImportoNetto(form.importo_netto);
    if (!netto) { alert("Importo non valido."); return; }
    setSaving(true);
    try {
      await movimentiApi.create({
        appartamento_id:              form.appartamento_id,
        componente_id:                form.componente_id,
        periodicita:                  "una_tantum",
        importo_netto:                netto,
        validita_da:                  form.validita_da      || null,
        validita_a:                   null,
        descrizione:                  form.descrizione      || null,
        tipo_versamento:              form.tipo_versamento  || "affitto",
        data_versamento:              form.data_versamento  || null,
        mese_riferimento:             form.mese_riferimento || null,
        incassato_da_proprietario_id: form.incassato_da_proprietario_id || null,
      });
      onSaved();
      advance(true);
    } catch (e) { alert("Errore: " + e.message); }
    finally { setSaving(false); }
  }

  // ── Fase 1: nessun file ───────────────────────────────────────────────────
  if (!rows) return (
    <Modal title="Importa Entrate da CSV" onClose={onClose} width={520}
      footer={<Btn variant="ghost" onClick={onClose}>Annulla</Btn>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="alert alert-info">
          <i className="ti ti-info-circle" style={{ marginRight: 6 }} />
          <strong>Formato CSV atteso:</strong> <code>giorno, descrizione, importo</code><br />
          <span style={{ fontSize: 12 }}>
            Separatori supportati: virgola o punto e virgola.<br />
            Date: <code>GG/MM/AAAA</code> oppure <code>AAAA-MM-GG</code>.<br />
            L'inquilino viene rilevato automaticamente se il nome o cognome compare nella descrizione.
          </span>
        </div>
        <Field label="Seleziona file CSV">
          <input type="file" accept=".csv,.txt" onChange={onFileChange} />
        </Field>
      </div>
    </Modal>
  );

  // ── Fase 3: completato ────────────────────────────────────────────────────
  if (!form) return (
    <Modal title="Importazione completata" onClose={onClose} width={420}
      footer={<Btn variant="primary" onClick={onClose}><i className="ti ti-check" /> Chiudi</Btn>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="alert alert-info">
          <i className="ti ti-circle-check" style={{ marginRight: 6 }} />
          Elaborazione CSV completata.
        </div>
        <p>✅ Versamenti salvati: <strong>{results.saved}</strong></p>
        <p>⏭ Righe saltate: <strong>{results.skipped}</strong></p>
        <p style={{ color: "var(--text2)", fontSize: 12 }}>
          Totale righe nel file: {rows.length}
        </p>
      </div>
    </Modal>
  );

  // ── Fase 2: riga corrente ─────────────────────────────────────────────────
  const appSel  = apps.find(a => String(a.id) === String(form.appartamento_id));
  const comps   = appSel?.componenti || [];
  const pctDone = Math.round((idx / rows.length) * 100);

  return (
    <Modal
      title={`Importa CSV — Riga ${idx + 1} di ${rows.length}`}
      onClose={onClose} width={640} resizable
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Annulla tutto</Btn>
          <div style={{ flex: 1 }} />
          <Btn variant="secondary" onClick={() => advance(false)} disabled={saving}>
            <i className="ti ti-player-skip-forward" /> Salta
          </Btn>
          {dupInfo && !forzaDup ? (
            <Btn variant="danger" onClick={() => setForzaDup(true)}
              disabled={saving || !form.appartamento_id || !form.componente_id}>
              <i className="ti ti-alert-triangle" /> Inserisci comunque
            </Btn>
          ) : (
            <Btn variant="success" onClick={() => handleSave(forzaDup)}
              disabled={saving || !form.appartamento_id || !form.componente_id}>
              <i className={`ti ${saving ? "ti-loader" : "ti-check"}`} />
              {saving ? "Salvataggio…" : "Salva e prossimo"}
            </Btn>
          )}
        </>
      }
    >
      {/* Barra avanzamento */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ height: 5, background: "var(--bg3)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${pctDone}%`, height: "100%", background: "var(--accent)", transition: "width 0.3s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text2)", marginTop: 4 }}>
          <span>Salvati: {results.saved} · Saltati: {results.skipped}</span>
          <span>{pctDone}% elaborato</span>
        </div>
      </div>

      {/* Anteprima riga CSV */}
      <div style={{
        background: "var(--bg)", border: "1px solid var(--border)",
        borderRadius: 8, padding: "8px 12px", marginBottom: 14,
        fontSize: 12, color: "var(--text2)",
      }}>
        <strong style={{ color: "var(--text)" }}>Da CSV · riga {idx + 1}</strong>
        {" — "}
        {toITdate(rows[idx].giorno)}
        {rows[idx].descrizione ? ` · ${rows[idx].descrizione}` : ""}
        {" · "}
        <strong style={{ color: "var(--green)" }}>{euro(rows[idx].importo)}</strong>
      </div>

      {/* Confronto duplicato */}
      {dupInfo && (
        <DupPanel
          tipo={dupInfo.tipo}
          existing={dupInfo.existing}
          nuovoData={form.data_versamento}
          nuovoMese={form.mese_riferimento}
          nuovoImporto={parseImportoNetto(form.importo_netto)}
          nuovoDescr={form.descrizione}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Appartamento *" warn={!form.appartamento_id}>
          <select value={form.appartamento_id}
            onChange={e => setForm(f => ({ ...f, appartamento_id: e.target.value, componente_id: "" }))}>
            <option value="">-- Seleziona appartamento --</option>
            {apps.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </Field>

        <Field label="Inquilino *" warn={!form.componente_id}>
          <select value={form.componente_id} onChange={e => sf("componente_id", e.target.value)}>
            <option value="">-- Seleziona inquilino --</option>
            {comps.map(c => (
              <option key={c.id} value={c.id}>{c.nome} {c.cognome}</option>
            ))}
          </select>
        </Field>

        <div className="grid-2">
          <Field label="Tipo versamento">
            <select value={form.tipo_versamento} onChange={e => sf("tipo_versamento", e.target.value)}>
              {tipiVersAttivi.map(t => <option key={t.nome} value={t.nome}>{t.nome}</option>)}
            </select>
          </Field>
          <Field label="Mese di riferimento"
            hint={form.mese_riferimento && form.data_versamento &&
                  form.mese_riferimento !== form.data_versamento.slice(0, 7)
                  ? "⚡ rilevato dalla descrizione"
                  : undefined}>
            <input type="month" value={form.mese_riferimento}
              onChange={e => sf("mese_riferimento", e.target.value)}
              style={{
                borderColor: form.mese_riferimento && form.data_versamento &&
                             form.mese_riferimento !== form.data_versamento.slice(0, 7)
                             ? "var(--accent)" : undefined,
              }} />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Data versamento" hint="Giorno fisico del pagamento">
            <input type="date" value={form.data_versamento}
              onChange={e => setForm(f => ({
                ...f,
                data_versamento:  e.target.value,
                validita_da:      f.validita_da === f.data_versamento ? e.target.value : f.validita_da,
                mese_riferimento: e.target.value.slice(0, 7),
              }))} />
          </Field>
          <Field label="Importo €">
            <input type="number" step="0.01" min="0.01" value={form.importo_netto}
              onChange={e => sf("importo_netto", e.target.value)}
              style={{ fontWeight: 700, color: "var(--green)" }} />
          </Field>
        </div>

        <Field label="Note">
          <input value={form.descrizione || ""} onChange={e => sf("descrizione", e.target.value)}
            placeholder="Descrizione / note" />
        </Field>

        {proprietari.length > 0 && (
          <Field label="Incassato da (Proprietario)">
            <select value={form.incassato_da_proprietario_id || ""}
              onChange={e => sf("incassato_da_proprietario_id", e.target.value || null)}>
              <option value="">— Nessuno —</option>
              {proprietari.map(p => (
                <option key={p.id} value={p.id}>{p.nome} {p.cognome || ""}</option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// VERSAMENTI
// ══════════════════════════════════════════════════════════════════════════════
export function Versamenti() {
  const [movs,          setMovs]          = useState([]);
  const [apps,          setApps]          = useState([]);
  const [proprietari,   setProprietari]   = useState([]);
  const [tipiVers,      setTipiVers]      = useState([]);
  const [modal,         setModal]         = useState(null);
  const [conf,          setConf]          = useState(null);
  const [csvModal,      setCsvModal]      = useState(false);
  const [smartModal,    setSmartModal]    = useState(false);
  const [regolaModal,   setRegolaModal]   = useState(null);  // movimento su cui creare regola
  const [forzaSalvaModal, setForzaSalvaModal] = useState(false);

  // Filtri
  const [filtroAppartamento, setFiltroAppartamento] = useState("");
  const [filtroInquilino,    setFiltroInquilino]    = useState("");
  const [filtroPeriodic,     setFiltroPeriodic]     = useState("");
  const [filtroTipoVers,     setFiltroTipoVers]     = useState("");
  const [filtroTesto,        setFiltroTesto]        = useState("");
  const [filtroSoloFuori,    setFiltroSoloFuori]    = useState(false);
  const [filtroStato,        setFiltroStato]        = useState("");

  // Ordinamento
  const [sortCol, setSortCol] = useState("validita_da");
  const [sortDir, setSortDir] = useState("desc");

  const load = useCallback(() =>
    Promise.all([movimentiApi.list(), appartamentiApi.list(), proprietariApi.list(), tipiVersamentoApi.list()])
      .then(([m, a, p, tv]) => { setMovs(m); setApps(a); setProprietari(p); setTipiVers(tv); }),
  []);
  useEffect(() => { load(); }, [load]);

  const tipiVersAttivi = tipiVers.filter(t => t.attivo);
  const tvColor = tv => TV_COLOR_DEFAULT[tv] ?? (tipiVers.find(t => t.nome === tv)?.colore || "gray");
  const tvLabel = tv => tipiVers.find(t => t.nome === tv)?.nome ?? tv ?? "affitto";

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  const inquiliniFiltro = useMemo(() => {
    if (!filtroAppartamento) {
      const visti = new Map();
      movs.forEach(m => { if (!visti.has(m.componente_id)) visti.set(m.componente_id, m.componente_nome); });
      return [...visti.entries()].map(([id, nome]) => ({ id, nome }));
    }
    const app = apps.find(a => a.id === filtroAppartamento);
    return (app?.componenti || []).map(c => ({ id: c.id, nome: `${c.nome} ${c.cognome || ""}`.trim() }));
  }, [filtroAppartamento, movs, apps]);

  const movsFiltrati = useMemo(() => {
    let list = [...movs];
    if (filtroAppartamento) list = list.filter(m => m.appartamento_id === filtroAppartamento);
    if (filtroInquilino)    list = list.filter(m => m.componente_id   === filtroInquilino);
    if (filtroPeriodic)     list = list.filter(m => m.periodicita     === filtroPeriodic);
    if (filtroTipoVers)     list = list.filter(m => (m.tipo_versamento || "affitto") === filtroTipoVers);
    if (filtroSoloFuori)    list = list.filter(m => m.fuori_validita);
    if (filtroStato === "sospetti")   list = list.filter(m => m.stato === "sospetto" || m.duplicato_rilevato);
    if (filtroStato === "verificati") list = list.filter(m => m.stato === "verificato");
    if (filtroStato === "normali")    list = list.filter(m => m.stato === "normale" && !m.duplicato_rilevato);
    if (filtroTesto.trim()) {
      const q = filtroTesto.toLowerCase().trim();
      list = list.filter(m =>
        (m.appartamento_nome || "").toLowerCase().includes(q) ||
        (m.componente_nome   || "").toLowerCase().includes(q) ||
        (m.descrizione       || "").toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let va, vb;
      switch (sortCol) {
        case "appartamento_nome": va = a.appartamento_nome || ""; vb = b.appartamento_nome || ""; break;
        case "componente_nome":   va = a.componente_nome   || ""; vb = b.componente_nome   || ""; break;
        case "periodicita":       va = a.periodicita        || ""; vb = b.periodicita        || ""; break;
        case "tipo_versamento":   va = a.tipo_versamento    || ""; vb = b.tipo_versamento    || ""; break;
        case "validita_da":       va = a.validita_da        || ""; vb = b.validita_da        || ""; break;
        case "importo_netto":     va = importoNetto(a);            vb = importoNetto(b);            break;
        default: va = ""; vb = "";
      }
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return list;
  }, [movs, filtroAppartamento, filtroInquilino, filtroPeriodic, filtroTipoVers, filtroTesto, filtroSoloFuori, filtroStato, sortCol, sortDir]);

  const stats = useMemo(() => {
    const totPos = movsFiltrati.filter(m => importoNetto(m) >= 0).reduce((s, m) => s + importoNetto(m), 0);
    const totNeg = movsFiltrati.filter(m => importoNetto(m) <  0).reduce((s, m) => s + importoNetto(m), 0);
    return { totPos, totNeg, netto: totPos + totNeg };
  }, [movsFiltrati]);

  const haFiltri = filtroAppartamento || filtroInquilino || filtroPeriodic || filtroTipoVers || filtroTesto || filtroSoloFuori || filtroStato;
  function resetFiltri() {
    setFiltroAppartamento(""); setFiltroInquilino(""); setFiltroPeriodic("");
    setFiltroTipoVers(""); setFiltroTesto(""); setFiltroSoloFuori(false); setFiltroStato("");
  }

  async function save(f) {
    try {
      const netto = parseImportoNetto(f.importo_netto);
      if (netto === 0) { alert("Importo non valido."); return; }
      const una = isUna(f.periodicita);
      const payload = {
        appartamento_id:            f.appartamento_id,
        componente_id:              f.componente_id,
        periodicita:                f.periodicita,
        importo_netto:              netto,
        validita_da:                f.validita_da      || null,
        validita_a:                 f.validita_a       || null,
        descrizione:                f.descrizione      || null,
        tipo_versamento:            f.tipo_versamento  || "affitto",
        data_versamento:            una ? (f.data_versamento  || null) : null,
        mese_riferimento:           una ? (f.mese_riferimento || null) : null,
        incassato_da_proprietario_id: f.incassato_da_proprietario_id || null,
      };
      f.id ? await movimentiApi.update(f.id, payload) : await movimentiApi.create(payload);
      setModal(null); load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  // Duplicati per modal manuale (solo nuovi inserimenti, non modifiche)
  const modalDupInfo = useMemo(() => {
    if (!modal?.componente_id || modal.id) return null;
    if ((modal.tipo_versamento || "affitto") === "affitto" && modal.mese_riferimento) {
      const ex = movs.find(m =>
        String(m.componente_id) === String(modal.componente_id) &&
        (m.mese_riferimento || "").slice(0, 7) === modal.mese_riferimento
      );
      if (ex) return { tipo: "mese", existing: ex };
    }
    if (modal.data_versamento) {
      const ex = movs.find(m =>
        String(m.componente_id) === String(modal.componente_id) &&
        (toISO(m.data_versamento) || toISO(m.validita_da)) === modal.data_versamento
      );
      if (ex) return { tipo: "data", existing: ex };
    }
    return null;
  }, [modal, movs]);

  // Auto-default incassato_da_proprietario_id quando cambia appartamento o data
  useEffect(() => {
    if (!modal?.appartamento_id || !modal?.validita_da) return;
    if (modal.incassato_da_proprietario_id) return;
    associazioniApi.defaultPerData(modal.appartamento_id, modal.validita_da)
      .then(r => {
        if (r?.proprietario_id)
          setModal(m => m ? { ...m, incassato_da_proprietario_id: r.proprietario_id } : m);
      })
      .catch(() => {});
  }, [modal?.appartamento_id, modal?.validita_da]);

  function apriNuovo() {
    setForzaSalvaModal(false);
    setModal({
      periodicita:      "una_tantum",
      tipo_versamento:  "affitto",
      data_versamento:  "",
      mese_riferimento: "",
      importo_netto:    "",
      descrizione:      "",
      appartamento_id:  "",
      componente_id:    "",
      validita_da:      "",
      validita_a:       "",
      incassato_da_proprietario_id: null,
      _soloAttivi:      true,
    });
  }

  function apriModifica(m) {
    setForzaSalvaModal(false);
    setModal({
      ...m,
      appartamento_id:  String(m.appartamento_id ?? ""),
      componente_id:    String(m.componente_id   ?? ""),
      importo_netto:    importoNetto(m),
      tipo_versamento:  m.tipo_versamento  || "affitto",
      data_versamento:  toISO(m.data_versamento)  || "",
      mese_riferimento: m.mese_riferimento || "",
      validita_da:      toISO(m.validita_da) || "",
      validita_a:       isUna(m.periodicita) ? "" : toISO(m.validita_a) || "",
      _soloAttivi:      true,
    });
  }

  function onCompChange(compId, curr) {
    const app  = apps.find(a => String(a.id) === String(curr.appartamento_id));
    const comp = (app?.componenti || []).find(c => String(c.id) === String(compId));
    if (!comp) { setModal(m => ({ ...m, componente_id: compId })); return; }
    setModal(m => ({
      ...m, componente_id: compId,
      validita_da: m.validita_da || toISO(comp.validita_da) || "",
      validita_a:  isUna(m.periodicita) ? "" : m.validita_a || toISO(comp.validita_a) || "",
    }));
  }

  const periLabel     = p => PERI.find(x => x.value === p)?.label || p;
  const tipoVersLabel = tvLabel;

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <SectionHeader
        title="Entrate"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="secondary" onClick={() => setSmartModal(true)}>
              <i className="ti ti-sparkles" /> Importa estratto
            </Btn>
            <Btn variant="secondary" onClick={() => setCsvModal(true)}>
              <i className="ti ti-upload" /> Importa CSV
            </Btn>
            <Btn variant="primary" onClick={apriNuovo}>
              <i className="ti ti-plus" /> Nuovo Versamento
            </Btn>
          </div>
        }
      />

      {/* ── BARRA FILTRI ── */}
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
                placeholder="Appartamento, inquilino, note…"
                style={{ paddingLeft: 30, width: "100%" }} />
            </div>
          </div>

          <div style={{ flex: "1 1 130px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Appartamento</label>
            <select value={filtroAppartamento}
              onChange={e => { setFiltroAppartamento(e.target.value); setFiltroInquilino(""); }}
              style={{ width: "100%" }}>
              <option value="">Tutti</option>
              {apps.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>

          <div style={{ flex: "1 1 130px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Inquilino</label>
            <select value={filtroInquilino} onChange={e => setFiltroInquilino(e.target.value)} style={{ width: "100%" }}>
              <option value="">Tutti</option>
              {inquiliniFiltro.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          <div style={{ flex: "0 1 120px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Periodicità</label>
            <select value={filtroPeriodic} onChange={e => setFiltroPeriodic(e.target.value)} style={{ width: "100%" }}>
              <option value="">Tutte</option>
              {PERI.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <div style={{ flex: "0 1 120px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Tipo vers.</label>
            <select value={filtroTipoVers} onChange={e => setFiltroTipoVers(e.target.value)} style={{ width: "100%" }}>
              <option value="">Tutti</option>
              {tipiVersAttivi.map(t => <option key={t.nome} value={t.nome}>{t.nome}</option>)}
            </select>
          </div>

          <div style={{ flex: "0 1 130px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Stato</label>
            <select value={filtroStato} onChange={e => setFiltroStato(e.target.value)} style={{ width: "100%" }}>
              <option value="">Tutti</option>
              <option value="sospetti">⚠ Sospetti / duplicati</option>
              <option value="verificati">✓ Verificati</option>
              <option value="normali">● Normali</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 1 }}>
            <label style={{
              display: "flex", alignItems: "center", gap: 5,
              cursor: "pointer", fontSize: 12, color: "var(--yellow)",
              userSelect: "none", whiteSpace: "nowrap",
            }}>
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

        <div style={{
          display: "flex", gap: 20, flexWrap: "wrap",
          paddingTop: 10, marginTop: 10,
          borderTop: "1px solid var(--bg3)", fontSize: 12,
        }}>
          <span style={{ color: "var(--text2)" }}>
            <strong style={{ color: "var(--text)" }}>{movsFiltrati.length}</strong>{" "}
            versament{movsFiltrati.length === 1 ? "o" : "i"}
            {haFiltri ? " filtrati" : ""}
          </span>
          <span style={{ color: "var(--text2)" }}>
            Entrate: <strong style={{ color: "var(--green)" }}>{euro(stats.totPos)}</strong>
          </span>
          {stats.totNeg < 0 && (
            <span style={{ color: "var(--text2)" }}>
              Rimborsi: <strong style={{ color: "var(--red)" }}>{euro(stats.totNeg)}</strong>
            </span>
          )}
          <span style={{ color: "var(--text2)" }}>
            Netto: <strong style={{ color: stats.netto >= 0 ? "var(--green)" : "var(--red)" }}>
              {euro(stats.netto)}
            </strong>
          </span>
        </div>
      </div>

      {/* ── TABELLA ── */}
      {movsFiltrati.length === 0 ? (
        <div className="alert alert-info">
          <i className="ti ti-info-circle" />
          {movs.length === 0
            ? "Nessun versamento registrato."
            : "Nessun versamento corrisponde ai filtri selezionati."}
        </div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid var(--border)" }}>
          <table style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <ThSort col="appartamento_nome" label="Appartamento" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <ThSort col="componente_nome"   label="Inquilino"    sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <ThSort col="periodicita"        label="Periodicità"  sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <ThSort col="tipo_versamento"    label="Tipo"         sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <ThSort col="validita_da"        label="Data / Periodo" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <th style={{ color: "var(--text2)", whiteSpace: "nowrap" }}>Mese rif.</th>
                <th style={{ color: "var(--text2)" }}>Note</th>
                <ThSort col="importo_netto" label="Importo" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} align="right" />
                <th style={{ textAlign: "center", width: 90, color: "var(--text2)" }}>Stato</th>
                <th style={{ textAlign: "right", width: 80 }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {movsFiltrati.map(m => {
                const una    = isUna(m.periodicita);
                const netto  = importoNetto(m);
                const vDa    = m.validita_da ? toITdate(m.validita_da) : "—";
                const vA     = m.validita_a  ? toITdate(m.validita_a)  : "aperta";
                const isRimb = netto < 0;
                const tv     = m.tipo_versamento || "affitto";

                return (
                  <tr key={m.id} style={{
                    background: m.stato === "sospetto" || m.duplicato_rilevato
                      ? "rgba(249,115,22,0.05)"
                      : m.fuori_validita
                        ? "rgba(239,68,68,0.06)"
                        : m.stato === "verificato"
                          ? "rgba(34,197,94,0.03)"
                          : "",
                  }}>
                    <td>
                      <span style={{
                        display: "inline-block", fontSize: 11, fontWeight: 500,
                        padding: "2px 8px", borderRadius: 4,
                        background: "rgba(59,130,246,0.1)", color: "var(--accent)",
                      }}>
                        {m.appartamento_nome}
                      </span>
                    </td>

                    <td style={{ fontWeight: 600 }}>{m.componente_nome}</td>

                    <td>
                      <Badge label={periLabel(m.periodicita)}
                        color={una ? "purple" : "blue"} />
                    </td>

                    <td>
                      <Badge label={tipoVersLabel(tv)} color={tvColor(tv)} />
                    </td>

                    <td style={{ fontSize: 12, color: m.fuori_validita ? "var(--red)" : "var(--text2)" }}>
                      {una
                        ? <><i className="ti ti-calendar-event" style={{ marginRight: 3 }} />{vDa}</>
                        : <><i className="ti ti-calendar-stats"  style={{ marginRight: 3 }} />{vDa}{" → "}{vA}</>
                      }
                      {m.fuori_validita && (
                        <span style={{ marginLeft: 6, color: "var(--yellow)", fontSize: 11 }}>⚠</span>
                      )}
                    </td>

                    <td style={{ fontSize: 11, color: "var(--text2)", whiteSpace: "nowrap" }}>
                      {m.mese_riferimento
                        ? mesL(m.mese_riferimento)
                        : <span style={{ opacity: 0.35 }}>—</span>}
                    </td>

                    <td style={{ fontSize: 11, color: "var(--text2)", maxWidth: 130 }}>
                      {m.descrizione
                        ? <span title={m.descrizione} style={{
                            display: "block", overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>{m.descrizione}</span>
                        : <span style={{ opacity: 0.35 }}>—</span>}
                    </td>

                    <td style={{ textAlign: "right" }}>
                      <span style={{
                        display: "inline-block", fontWeight: 700, fontSize: 13,
                        padding: "3px 9px", borderRadius: 6,
                        color:      isRimb ? "var(--red)"    : "var(--green)",
                        background: isRimb ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                      }}>
                        {isRimb ? "" : "+"}{euro(netto)}
                      </span>
                    </td>

                    <td style={{ textAlign: "center" }}>
                      <StatoBadge
                        m={m}
                        allMovs={movs}
                        onSave={async (s) => {
                          await movimentiApi.updateStato(m.id, s);
                          load();
                        }}
                      />
                    </td>

                    <td>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        {m.descrizione && (
                          <Btn variant="ghost" size="sm"
                            onClick={() => setRegolaModal(m)}
                            title="Crea/aggiorna regola di associazione da questo versamento">
                            <i className="ti ti-list-check" />
                          </Btn>
                        )}
                        <Btn variant="secondary" size="sm" onClick={() => apriModifica(m)}>
                          <i className="ti ti-edit" />
                        </Btn>
                        <Btn variant="danger" size="sm"
                          onClick={() => setConf({
                            msg: `Eliminare il versamento di ${euro(Math.abs(netto))} per ${m.componente_nome}?`,
                            onYes: async () => { await movimentiApi.delete(m.id); setConf(null); load(); },
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
                <td colSpan={7} style={{ padding: "10px 12px", fontSize: 12, color: "var(--text2)", fontWeight: 600 }}>
                  Totale {movsFiltrati.length} versament{movsFiltrati.length === 1 ? "o" : "i"}
                  {stats.totNeg < 0 && (
                    <span style={{ marginLeft: 12 }}>
                      · Pagamenti: <span style={{ color: "var(--green)" }}>{euro(stats.totPos)}</span>
                      {" · "}Rimborsi: <span style={{ color: "var(--red)" }}>{euro(stats.totNeg)}</span>
                    </span>
                  )}
                </td>
                <td style={{
                  textAlign: "right", padding: "10px 12px",
                  fontWeight: 700, fontSize: 15,
                  color: stats.netto >= 0 ? "var(--green)" : "var(--red)",
                }}>
                  {stats.netto >= 0 ? "+" : ""}{euro(stats.netto)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── MODAL NUOVO/MODIFICA ── */}
      {modal && (() => {
        const app        = apps.find(a => String(a.id) === String(modal.appartamento_id));
        const oggi       = new Date().toISOString().slice(0, 10);
        const dataFiltro = modal.validita_da || oggi;
        const tuttiComps = app?.componenti || [];
        const comps      = modal._soloAttivi
          ? tuttiComps.filter(c => {
              if (c.attivo === false) return false;
              const vDa = toISO(c.validita_da) || null;
              const vA  = toISO(c.validita_a)  || null;
              if (vDa && vDa > dataFiltro) return false;
              if (vA  && vA  < dataFiltro) return false;
              return true;
            })
          : tuttiComps;

        const comp   = comps.find(c => String(c.id) === String(modal.componente_id))
                    || tuttiComps.find(c => String(c.id) === String(modal.componente_id));
        const compDa = comp?.validita_da ? toISO(comp.validita_da) : null;
        const compA  = comp?.validita_a  ? toISO(comp.validita_a)  : null;
        const una    = isUna(modal.periodicita);

        const vNetto = parseImportoNetto(modal.importo_netto);
        const errDa  = compDa && modal.validita_da && modal.validita_da < compDa;
        const errA   = !una && compA && modal.validita_a && modal.validita_a > compA;
        const errInt = !una && modal.validita_da && modal.validita_a && modal.validita_da > modal.validita_a;
        const errImp = modal.importo_netto !== "" && vNetto === 0;

        return (
          <Modal
            title={modal.id ? "Modifica Entrata" : "Nuova Entrata"}
            onClose={() => setModal(null)} width={560}
            footer={
              <>
                <Btn variant="ghost" onClick={() => setModal(null)}>Annulla</Btn>
                {modalDupInfo && !forzaSalvaModal ? (
                  <Btn variant="danger"
                    disabled={!!errDa || !!errA || !!errInt || errImp}
                    onClick={() => setForzaSalvaModal(true)}>
                    <i className="ti ti-alert-triangle" /> Inserisci comunque
                  </Btn>
                ) : (
                  <Btn variant="success"
                    disabled={!!errDa || !!errA || !!errInt || errImp}
                    onClick={() => save(modal)}>
                    <i className="ti ti-check" /> Salva
                  </Btn>
                )}
              </>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Confronto duplicato */}
              {modalDupInfo && (
                <DupPanel
                  tipo={modalDupInfo.tipo}
                  existing={modalDupInfo.existing}
                  nuovoData={modal.data_versamento || modal.validita_da}
                  nuovoMese={modal.mese_riferimento}
                  nuovoImporto={vNetto}
                  nuovoDescr={modal.descrizione}
                />
              )}

              <div className="grid-2">
                <Field label="Periodicità">
                  <select value={modal.periodicita}
                    onChange={e => setModal(m => ({
                      ...m, periodicita: e.target.value,
                      validita_a: e.target.value === "una_tantum" ? "" : m.validita_a,
                    }))}>
                    {PERI.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </Field>

                <Field label="Tipo versamento">
                  <select value={modal.tipo_versamento || "affitto"}
                    onChange={e => setModal(m => ({ ...m, tipo_versamento: e.target.value }))}>
                    {tipiVersAttivi.map(t => <option key={t.nome} value={t.nome}>{t.nome}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Appartamento *" warn={!modal.appartamento_id}>
                <select value={modal.appartamento_id}
                  onChange={e => setModal(m => ({
                    ...m, appartamento_id: e.target.value,
                    componente_id: "", validita_da: "", validita_a: "",
                  }))}>
                  <option value="">-- Seleziona appartamento --</option>
                  {apps.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </Field>

              {modal.appartamento_id && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ fontSize: 13, color: "var(--text2)" }}>Inquilino *</label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
                      <input type="checkbox" checked={modal._soloAttivi}
                        onChange={e => setModal(m => ({ ...m, _soloAttivi: e.target.checked, componente_id: "" }))} />
                      Solo attivi {modal.validita_da ? `al ${toITdate(modal.validita_da)}` : "oggi"}
                    </label>
                  </div>
                  <select value={modal.componente_id}
                    onChange={e => onCompChange(e.target.value, modal)}
                    style={{ borderColor: !modal.componente_id ? "var(--yellow)" : "" }}>
                    <option value="">-- Seleziona inquilino --</option>
                    {comps.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nome} {c.cognome}
                        {c.validita_da ? ` (dal ${toITdate(c.validita_da)})` : ""}
                        {c.validita_a  ? ` al ${toITdate(c.validita_a)}`  : ""}
                      </option>
                    ))}
                  </select>
                  {comp && (
                    <div className="alert alert-info">
                      <i className="ti ti-calendar-event" />
                      Valido dal <strong>{compDa ? toITdate(compDa) : "—"}</strong>
                      {compA ? ` al ${toITdate(compA)}` : " (ancora attivo)"}.
                    </div>
                  )}
                </>
              )}

              <Field label="Importo €"
                hint="Positivo = pagamento ricevuto · Negativo = rimborso erogato"
                warn={errImp}>
                <input type="number" step="0.01" value={modal.importo_netto}
                  onChange={e => setModal(m => ({ ...m, importo_netto: e.target.value }))}
                  placeholder="es. 200 oppure -50 per rimborso"
                  style={{
                    fontSize: 16, fontWeight: 700,
                    color: vNetto < 0 ? "var(--red)" : vNetto > 0 ? "var(--green)" : "var(--text)",
                    borderColor: errImp ? "var(--yellow)" : "",
                  }} />
                {vNetto !== 0 && (
                  <p style={{ fontSize: 11, marginTop: 4, color: vNetto < 0 ? "var(--red)" : "var(--green)" }}>
                    {vNetto < 0 ? "⬇ Rimborso" : "⬆ Pagamento"} — {euro(Math.abs(vNetto))} per occorrenza
                  </p>
                )}
              </Field>

              <hr className="divider" />
              <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text2)", margin: 0 }}>
                <i className="ti ti-calendar-event" style={{ marginRight: 6 }} />
                {una ? "Date del versamento" : "Periodo di validità"}
              </p>

              <div className={una ? "" : "grid-2"}>
                <Field label={una ? "Data contabile *" : "Valido dal *"}
                  warn={!modal.validita_da || !!errDa}
                  hint={compDa ? `Non prima del ${toITdate(compDa)}` : ""}>
                  <input type="date" value={modal.validita_da}
                    min={compDa || undefined}
                    max={una ? (compA || undefined) : undefined}
                    onChange={e => setModal(m => ({
                      ...m,
                      validita_da:      e.target.value,
                      mese_riferimento: e.target.value.slice(0, 7) || m.mese_riferimento,
                    }))}
                    style={{ borderColor: errDa || !modal.validita_da ? "var(--yellow)" : "" }} />
                </Field>
                {!una && (
                  <Field label="Valido fino al"
                    warn={!!errA || !!errInt}
                    hint={compA ? `Non dopo il ${toITdate(compA)}` : "Vuoto = oggi nei calcoli"}>
                    <input type="date" value={modal.validita_a}
                      min={modal.validita_da || compDa || undefined}
                      max={compA || undefined}
                      onChange={e => setModal(m => ({ ...m, validita_a: e.target.value }))}
                      style={{ borderColor: errA || errInt ? "var(--red)" : "" }} />
                  </Field>
                )}
              </div>

              {una && (
                <div className="grid-2">
                  <Field label="Data versamento (banca/bonifico)"
                    hint="Giorno fisico di ricezione — può differire dalla data contabile">
                    <input type="date" value={modal.data_versamento || ""}
                      onChange={e => setModal(m => ({
                        ...m,
                        data_versamento:  e.target.value,
                        mese_riferimento: e.target.value.slice(0, 7) || m.mese_riferimento,
                      }))} />
                  </Field>
                  <Field label="Mese di riferimento" hint="Mese contabile (AAAA-MM)">
                    <input type="month" value={modal.mese_riferimento || ""}
                      onChange={e => setModal(m => ({ ...m, mese_riferimento: e.target.value }))} />
                  </Field>
                </div>
              )}

              {errDa  && <div className="alert alert-danger"><i className="ti ti-alert-circle" /> Data antecedente alla validità dell'inquilino ({toITdate(compDa)}).</div>}
              {errA   && <div className="alert alert-danger"><i className="ti ti-alert-circle" /> Data fine successiva alla validità dell'inquilino ({toITdate(compA)}).</div>}
              {errInt && <div className="alert alert-danger"><i className="ti ti-alert-circle" /> La data fine non può essere precedente alla data inizio.</div>}

              <Field label="Descrizione / Note">
                <input value={modal.descrizione || ""}
                  onChange={e => setModal(m => ({ ...m, descrizione: e.target.value }))}
                  placeholder="Opzionale" />
              </Field>

              {proprietari.length > 0 && (
                <Field label="Incassato da (Proprietario)">
                  <select value={modal.incassato_da_proprietario_id || ""}
                    onChange={e => setModal(m => ({ ...m, incassato_da_proprietario_id: e.target.value || null }))}>
                    <option value="">— Nessuno —</option>
                    {proprietari.map(p => (
                      <option key={p.id} value={p.id}>{p.nome} {p.cognome || ""}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          </Modal>
        );
      })()}

      {/* ── CSV IMPORT MODAL ── */}
      {csvModal && (
        <CsvImportModal
          apps={apps}
          movs={movs}
          proprietari={proprietari}
          onSaved={load}
          onClose={() => setCsvModal(false)}
        />
      )}

      {/* ── SMART IMPORT MODAL ── */}
      {smartModal && (
        <ImportazioneModal
          appartamenti={apps}
          onSaved={load}
          onClose={() => setSmartModal(false)}
        />
      )}

      {/* ── CREA REGOLA MODAL ── */}
      {regolaModal && (
        <CreaRegolaModal
          movimento={regolaModal}
          appartamenti={apps}
          onSaved={() => {}}
          onClose={() => setRegolaModal(null)}
        />
      )}

      {conf && <Confirm msg={conf.msg} onYes={conf.onYes} onNo={() => setConf(null)} />}
    </div>
  );
}
