import { useRef, useState, useEffect, useCallback } from "react";
import { adminV2, fattiV2 } from "../api/apiV2.js";
import { adminApi }         from "../api/apiV2.js";
import { Btn }              from "../../components/ui.jsx";
import { TipologieV2 }      from "./TipologieV2.jsx";

const fmtEur  = v => v != null ? Number(v).toLocaleString("it-IT", { style: "currency", currency: "EUR" }) : "—";
const fmtData = d => d ? new Date(d).toLocaleDateString("it-IT") : "—";
const fmtMese = s => s || "—";

function formatBytes(b) {
  if (!b) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

// ── Badge contatore ────────────────────────────────────────────────────────────
function CountBadge({ n }) {
  if (!n) return null;
  const bg = "rgba(239,68,68,0.15)";
  const fg = "var(--red)";
  return (
    <span style={{ background: bg, color: fg, borderRadius: 20, padding: "2px 8px",
                   fontSize: 11, fontWeight: 700, marginLeft: 6 }}>
      {n}
    </span>
  );
}

// ── Sezione collassabile ───────────────────────────────────────────────────────
function Sezione({ titolo, icon, items, children }) {
  const [open, setOpen] = useState(!!(items?.length));
  const hasAnomalie = items?.length > 0;
  return (
    <div style={{ border: `1px solid ${hasAnomalie ? "var(--red)" : "var(--border)"}`,
                  borderRadius: 8, overflow: "hidden" }}>
      <button onClick={() => setOpen(o => !o)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8,
                       padding: "10px 14px", background: "var(--bg2)", border: "none",
                       cursor: "pointer", color: "var(--text)", fontSize: 13, fontWeight: 600 }}>
        <i className={`ti ${icon}`}
           style={{ color: hasAnomalie ? "var(--red)" : "#22c55e" }} />
        <span style={{ flex: 1, textAlign: "left" }}>{titolo}</span>
        <CountBadge n={items?.length} />
        {!hasAnomalie && <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 400 }}>OK</span>}
        <i className={`ti ti-chevron-${open ? "up" : "down"}`}
           style={{ color: "var(--text2)", fontSize: 12 }} />
      </button>
      {open && hasAnomalie && (
        <div style={{ padding: "12px 14px", background: "var(--bg3)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Tabella anomalie semplice ──────────────────────────────────────────────────
function Tabella({ rows, cols }) {
  const th = { padding: "4px 8px", textAlign: "left", fontSize: 11, color: "var(--text2)",
               borderBottom: "1px solid var(--border)", fontWeight: 600 };
  const td = { padding: "5px 8px", fontSize: 12, borderBottom: "1px solid var(--border)" };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>{cols.map(c => <th key={c.k} style={{ ...th, textAlign: c.right ? "right" : "left" }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map(c => (
                <td key={c.k} style={{ ...td, textAlign: c.right ? "right" : "left" }}>
                  {c.render ? c.render(r) : c.fmt ? c.fmt(r[c.k], r) : (r[c.k] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function groupByHash(rows) {
  const map = {};
  for (const r of rows) {
    if (!map[r.file_hash]) map[r.file_hash] = [];
    map[r.file_hash].push(r);
  }
  return Object.values(map);
}

// ── Sezione Verifica Coerenza ──────────────────────────────────────────────────
function VerificaCoerenzaSection() {
  const [report,     setReport]     = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState(null);
  const [backfilling,       setBackfilling]       = useState(false);
  const [backfillResult,    setBackfillResult]    = useState(null);
  const [backfillingProp,   setBackfillingProp]   = useState(false);
  const [backfillPropResult,setBackfillPropResult]= useState(null);
  const [ignorando,  setIgnorando]  = useState(new Set()); // ids in corso
  const reportRef = useRef();

  async function avvia() {
    setLoading(true); setErr(null); setReport(null); setBackfillResult(null);
    try { setReport(await adminV2.verificaCoerenza()); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  async function backfill() {
    setBackfilling(true); setBackfillResult(null);
    try {
      const r = await adminV2.backfillHash();
      setBackfillResult(r);
      setReport(await adminV2.verificaCoerenza());
    } catch (e) { setErr(e.message); }
    finally { setBackfilling(false); }
  }

  async function backfillSpeseProp() {
    setBackfillingProp(true); setBackfillPropResult(null);
    try {
      const r = await adminV2.backfillSpeseProp();
      setBackfillPropResult(r);
    } catch (e) { setErr(e.message); }
    finally { setBackfillingProp(false); }
  }

  async function ignoraDuplicato(id) {
    setIgnorando(s => new Set(s).add(id));
    try {
      await fattiV2.aggiorna(id, { stato: "duplicato" });
      setReport(await adminV2.verificaCoerenza());
    } catch (e) { setErr(e.message); }
    finally { setIgnorando(s => { const n = new Set(s); n.delete(id); return n; }); }
  }

  function stampa() {
    const w = window.open("", "_blank");
    w.document.write(`
      <html><head><title>Verifica coerenza GSA v2</title>
      <style>
        body{font-family:sans-serif;font-size:12px;color:#111;padding:20px}
        h1{font-size:18px;margin-bottom:4px}
        h2{font-size:14px;margin:16px 0 6px;color:#333;border-bottom:1px solid #ccc;padding-bottom:4px}
        table{width:100%;border-collapse:collapse;margin-bottom:12px}
        th{background:#f3f4f6;text-align:left;padding:4px 8px;font-size:11px;border:1px solid #ddd}
        td{padding:4px 8px;border:1px solid #ddd;font-size:11px}
        .ok{color:#16a34a}.err{color:#dc2626}
      </style></head><body>
      ${reportRef.current?.innerHTML || ""}
      </body></html>
    `);
    w.document.close(); w.print();
  }

  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: "#7c3aed",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className="ti ti-shield-check" style={{ fontSize: 22, color: "#fff" }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>Verifica coerenza dati</p>
          <p style={{ color: "var(--text2)", fontSize: 13, margin: 0 }}>
            Controlla proprietari, percentuali, periodi di validità, regole di riparto e allegati.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {report && (
            <Btn variant="secondary" size="sm" onClick={stampa}>
              <i className="ti ti-printer" /> Stampa
            </Btn>
          )}
          <Btn variant="primary" onClick={avvia} disabled={loading}>
            {loading
              ? <><i className="ti ti-loader-2 ti-spin" /> Analisi…</>
              : <><i className="ti ti-search" /> Avvia verifica</>}
          </Btn>
        </div>
      </div>

      {err && (
        <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)",
                      border: "1px solid var(--red)", borderRadius: 8, marginBottom: 12,
                      display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <i className="ti ti-alert-circle" style={{ color: "var(--red)" }} /> {err}
        </div>
      )}

      {report && (
        <div ref={reportRef}>
          {/* Riepilogo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
                        padding: "10px 16px", borderRadius: 8,
                        background: report.totale_anomalie === 0
                          ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                        border: `1px solid ${report.totale_anomalie === 0 ? "#22c55e" : "var(--red)"}` }}>
            <i className={`ti ti-${report.totale_anomalie === 0 ? "circle-check" : "alert-triangle"}`}
               style={{ fontSize: 22, color: report.totale_anomalie === 0 ? "#22c55e" : "var(--red)" }} />
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>
                {report.totale_anomalie === 0
                  ? "Nessuna anomalia rilevata"
                  : `${report.totale_anomalie} anomali${report.totale_anomalie === 1 ? "a" : "e"} rilevat${report.totale_anomalie === 1 ? "a" : "e"}`}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: "var(--text2)" }}>
                Generato il {new Date(report.generato_il).toLocaleString("it-IT")}
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>

            <Sezione titolo="Immobili senza proprietario" icon="ti-building-off"
                     items={report.immobili_senza_proprietario}>
              <Tabella rows={report.immobili_senza_proprietario}
                       cols={[{ k: "nome", label: "Immobile" }]} />
            </Sezione>

            <Sezione titolo="Percentuale proprietà ≠ 100% (periodo corrente)" icon="ti-percentage"
                     items={report.percentuali_scorrette}>
              <Tabella rows={report.percentuali_scorrette}
                       cols={[
                         { k: "immobile_nome", label: "Immobile" },
                         { k: "totale_pct",    label: "Totale %", right: true,
                           fmt: v => <span style={{ color: "var(--red)", fontWeight: 700 }}>{v}%</span> },
                         { k: "dettaglio", label: "Dettaglio",
                           fmt: v => (v || []).map(d => `${d.persona}: ${d.pct}%`).join(" · ") },
                       ]} />
            </Sezione>

            <Sezione titolo="Periodi di proprietà sovrapposti" icon="ti-layers-intersect"
                     items={report.periodi_sovrapposti}>
              <Tabella rows={report.periodi_sovrapposti}
                       cols={[
                         { k: "immobile_nome", label: "Immobile" },
                         { k: "persona_nome",  label: "Persona" },
                         { k: "da1", label: "Periodo 1 dal", fmt: fmtData },
                         { k: "a1",  label: "al",  fmt: v => v ? fmtData(v) : "aperto" },
                         { k: "da2", label: "Periodo 2 dal", fmt: fmtData },
                         { k: "a2",  label: "al",  fmt: v => v ? fmtData(v) : "aperto" },
                       ]} />
            </Sezione>

            <Sezione titolo="Entrate con proprietario inattivo" icon="ti-arrow-down-circle"
                     items={report.entrate_persona_inattiva}>
              <Tabella rows={report.entrate_persona_inattiva}
                       cols={[
                         { k: "immobile_nome",   label: "Immobile" },
                         { k: "persona_nome",    label: "Persona" },
                         { k: "data_riferimento",label: "Data",    fmt: fmtData },
                         { k: "periodo_da",      label: "Periodo", fmt: fmtMese },
                         { k: "importo",         label: "Importo", right: true, fmt: fmtEur },
                       ]} />
            </Sezione>

            <Sezione titolo="Spese con proprietario inattivo" icon="ti-file-invoice"
                     items={report.spese_persona_inattiva}>
              <Tabella rows={report.spese_persona_inattiva}
                       cols={[
                         { k: "immobile_nome",   label: "Immobile" },
                         { k: "persona_nome",    label: "Persona" },
                         { k: "data_riferimento",label: "Data",    fmt: fmtData },
                         { k: "periodo_da",      label: "Periodo", fmt: fmtMese },
                         { k: "importo",         label: "Importo", right: true, fmt: fmtEur },
                       ]} />
            </Sezione>

            <Sezione titolo="Entrate fuori dal periodo di validità del proprietario" icon="ti-calendar-off"
                     items={report.entrate_fuori_validita}>
              <Tabella rows={report.entrate_fuori_validita}
                       cols={[
                         { k: "immobile_nome",   label: "Immobile" },
                         { k: "persona_nome",    label: "Persona" },
                         { k: "data_riferimento",label: "Data",    fmt: fmtData },
                         { k: "periodo_da",      label: "Periodo", fmt: fmtMese },
                         { k: "importo",         label: "Importo", right: true, fmt: fmtEur },
                       ]} />
            </Sezione>

            <Sezione titolo="Spese fuori dal periodo di validità del proprietario" icon="ti-calendar-off"
                     items={report.spese_fuori_validita}>
              <Tabella rows={report.spese_fuori_validita}
                       cols={[
                         { k: "immobile_nome",   label: "Immobile" },
                         { k: "persona_nome",    label: "Persona" },
                         { k: "data_riferimento",label: "Data",    fmt: fmtData },
                         { k: "periodo_da",      label: "Periodo", fmt: fmtMese },
                         { k: "importo",         label: "Importo", right: true, fmt: fmtEur },
                       ]} />
            </Sezione>

            <Sezione titolo="Regole di riparto con proprietari non validi" icon="ti-git-branch"
                     items={report.regole_riparto_anomale}>
              <Tabella rows={report.regole_riparto_anomale}
                       cols={[
                         { k: "immobile_nome",  label: "Immobile" },
                         { k: "persona_nome",   label: "Persona" },
                         { k: "persona_attiva", label: "Attivo",
                           fmt: v => v ? "Sì" : <span style={{ color: "var(--red)" }}>No</span> },
                         { k: "ha_ruolo", label: "Ha ruolo",
                           fmt: v => v ? "Sì" : <span style={{ color: "var(--red)" }}>No</span> },
                         { k: "includi", label: "Tipo",
                           fmt: v => v ? "Incluso" : "Escluso" },
                       ]} />
            </Sezione>

            <Sezione titolo="Spese senza soggetto pagante" icon="ti-user-off"
                     items={report.spese_senza_pagante}>
              <Tabella rows={report.spese_senza_pagante}
                       cols={[
                         { k: "immobile_nome",   label: "Immobile",
                           render: r => r.immobile_nome || r.condominio_nome || "—" },
                         { k: "nome",            label: "Descrizione" },
                         { k: "data_riferimento",label: "Data",    fmt: fmtData },
                         { k: "periodo_da",      label: "Periodo", fmt: fmtMese },
                         { k: "importo",         label: "Importo", right: true, fmt: fmtEur },
                       ]} />
            </Sezione>

            <Sezione titolo="Entrate senza soggetto incassante" icon="ti-user-off"
                     items={report.entrate_senza_incassante}>
              <Tabella rows={report.entrate_senza_incassante}
                       cols={[
                         { k: "immobile_nome",   label: "Immobile",
                           render: r => r.immobile_nome || r.condominio_nome || "—" },
                         { k: "nome",            label: "Descrizione" },
                         { k: "data_riferimento",label: "Data",    fmt: fmtData },
                         { k: "periodo_da",      label: "Periodo", fmt: fmtMese },
                         { k: "importo",         label: "Importo", right: true, fmt: fmtEur },
                       ]} />
            </Sezione>

            {/* ── Hash duplicati fatti ── */}
            {(() => {
              const rows   = report.hash_duplicati_fatti || [];
              const gruppi = groupByHash(rows);
              return (
                <Sezione titolo="Spese/entrate con file duplicato (hash identico)"
                         icon="ti-copy" items={rows.length ? [1] : []}>
                  {gruppi.map((gruppo, gi) => (
                    <div key={gi} style={{ marginBottom: gi < gruppi.length - 1 ? 12 : 0,
                                           padding: "8px 10px", borderRadius: 6,
                                           border: "1px solid rgba(239,68,68,0.25)",
                                           background: "rgba(239,68,68,0.04)" }}>
                      <div style={{ fontSize: 10, color: "var(--text2)", fontFamily: "monospace",
                                    marginBottom: 6 }}>
                        hash: {gruppo[0].file_hash?.slice(0, 20)}…
                      </div>
                      <Tabella rows={gruppo} cols={[
                        { k: "tipo",         label: "Tipo" },
                        { k: "nome",         label: "Nome" },
                        { k: "immobile_nome",label: "Immobile" },
                        { k: "persona_nome", label: "Persona" },
                        { k: "importo",      label: "Importo", right: true, fmt: fmtEur },
                        { k: "data",         label: "Data", fmt: fmtData },
                        { k: "stato",        label: "Stato" },
                        {
                          k: "_azioni", label: "",
                          render: r => r.stato !== "duplicato" ? (
                            <Btn size="sm" variant="ghost"
                                 disabled={ignorando.has(r.id)}
                                 onClick={() => ignoraDuplicato(r.id)}
                                 title="Imposta stato 'duplicato' per ignorare questa anomalia">
                              {ignorando.has(r.id)
                                ? <i className="ti ti-loader-2 ti-spin" />
                                : <><i className="ti ti-eye-off" /> Ignora</>}
                            </Btn>
                          ) : <span style={{ fontSize: 11, color: "var(--text2)" }}>Ignorato</span>,
                        },
                      ]} />
                    </div>
                  ))}
                </Sezione>
              );
            })()}

            {/* ── Hash mancanti fatti ── */}
            {(() => {
              const rows = report.hash_mancanti_fatti || [];
              return (
                <Sezione titolo="Spese/entrate senza impronta digitale (hash mancante) ma con allegato"
                         icon="ti-fingerprint-off" items={rows}>
                  <Tabella rows={rows} cols={[
                    { k: "tipo",         label: "Tipo" },
                    { k: "nome",         label: "Nome" },
                    { k: "immobile_nome",label: "Immobile" },
                    { k: "nome_file",    label: "File" },
                    { k: "importo",      label: "Importo", right: true, fmt: fmtEur },
                    { k: "data",         label: "Data", fmt: fmtData },
                  ]} />
                </Sezione>
              );
            })()}

            {/* ── Backfill hash ── */}
            {(report.hash_mancanti_fatti?.length > 0) && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                             background: "var(--bg2)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <i className="ti ti-fingerprint" style={{ color: "var(--accent)", fontSize: 18 }} />
                <span style={{ flex: 1, fontSize: 13 }}>
                  Calcola gli hash mancanti rileggendo i file dal disco
                </span>
                <Btn variant="primary" size="sm" onClick={backfill} disabled={backfilling}>
                  {backfilling
                    ? <><i className="ti ti-loader-2 ti-spin" /> Calcolo…</>
                    : <><i className="ti ti-refresh" /> Calcola hash mancanti</>}
                </Btn>
              </div>
            )}

            {backfillResult && (
              <div style={{ padding: "10px 14px", background: "rgba(34,197,94,0.1)",
                            border: "1px solid #22c55e", borderRadius: 8, display: "flex", gap: 10 }}>
                <i className="ti ti-circle-check" style={{ color: "#22c55e", flexShrink: 0 }} />
                <div>
                  <strong style={{ fontSize: 13 }}>Hash calcolati</strong>
                  <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                    Aggiornati: {backfillResult.updated}
                    {backfillResult.missing > 0 && ` · File non trovati sul disco: ${backfillResult.missing}`}
                  </p>
                </div>
              </div>
            )}

            {/* ── Backfill spese proprietari ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                           background: "var(--bg2)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <i className="ti ti-tool" style={{ color: "var(--accent)", fontSize: 18 }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Correggi date spese proprietari migrate</span>
                <p style={{ fontSize: 11, color: "var(--text2)", margin: "2px 0 0" }}>
                  Popola rif_da/rif_a e periodo_da per le spese ricorrenti o con mese_competenza assente.
                  Necessario se la griglia proprietari v2 mostra totali diversi da v1.
                </p>
              </div>
              <Btn variant="secondary" size="sm" onClick={backfillSpeseProp} disabled={backfillingProp}>
                {backfillingProp
                  ? <><i className="ti ti-loader-2 ti-spin" /> Correzione…</>
                  : <><i className="ti ti-refresh" /> Correggi</>}
              </Btn>
            </div>

            {backfillPropResult && (
              <div style={{ padding: "10px 14px", background: "rgba(34,197,94,0.1)",
                            border: "1px solid #22c55e", borderRadius: 8, display: "flex", gap: 10 }}>
                <i className="ti ti-circle-check" style={{ color: "#22c55e", flexShrink: 0 }} />
                <div>
                  <strong style={{ fontSize: 13 }}>Date corrette</strong>
                  <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                    Periodi di validità aggiornati: {backfillPropResult.aggiornati_rif_da_a}
                    {backfillPropResult.aggiornati_periodo_da > 0 &&
                      ` · Periodo_da ripristinato: ${backfillPropResult.aggiornati_periodo_da}`}
                  </p>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

// ── Sezione Backup ─────────────────────────────────────────────────────────────
function BackupSection() {
  const [loading, setLoading] = useState(null);
  const [err,     setErr]     = useState(null);

  async function doBackup(tipo) {
    setLoading(tipo); setErr(null);
    try { await adminApi.backup(tipo); }
    catch (e) { setErr(e.message); }
    finally { setLoading(null); }
  }

  const tipi = [
    { id: "tutto",       label: "Backup completo",  desc: "DB + PDF spese + archivio documentale", icon: "ti-database-export" },
    { id: "db",          label: "Solo database",    desc: "Dump SQL del database PostgreSQL",       icon: "ti-database" },
    { id: "documentale", label: "Solo documentale", desc: "PDF allegati + file archivio (no DB)",   icon: "ti-folder-down" },
  ];

  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--accent)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className="ti ti-database-export" style={{ fontSize: 22, color: "#fff" }} />
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>Backup</p>
          <p style={{ color: "var(--text2)", fontSize: 13, margin: 0 }}>
            Scarica un file ZIP con i dati selezionati.
          </p>
        </div>
      </div>

      {err && (
        <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)",
                      border: "1px solid var(--red)", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="ti ti-alert-circle" /> {err}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tipi.map(t => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12,
                                    padding: "10px 14px", border: "1px solid var(--border)",
                                    borderRadius: 8, background: "var(--bg3)" }}>
            <i className={`ti ${t.icon}`} style={{ fontSize: 18, color: "var(--accent)", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 600, fontSize: 13, margin: 0 }}>{t.label}</p>
              <p style={{ fontSize: 12, color: "var(--text2)", margin: 0 }}>{t.desc}</p>
            </div>
            <Btn variant="primary" size="sm" onClick={() => doBackup(t.id)} disabled={loading !== null}>
              {loading === t.id
                ? <><i className="ti ti-loader-2 ti-spin" /> In corso…</>
                : <><i className="ti ti-download" /> Scarica</>}
            </Btn>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sezione Ripristino ─────────────────────────────────────────────────────────
function RipristinoSection() {
  const [tipo,    setTipo]    = useState("tutto");
  const [file,    setFile]    = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [err,     setErr]     = useState(null);
  const fileRef = useRef();

  async function doRestore() {
    if (!file) return;
    setLoading(true); setResult(null); setErr(null); setConfirm(false);
    try { setResult(await adminApi.restore(file, tipo)); setFile(null); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  const tipiOpt = [
    { id: "tutto",       label: "Completo (DB + documentale)" },
    { id: "db",          label: "Solo database" },
    { id: "documentale", label: "Solo documentale (file)" },
  ];

  const warningText = {
    tutto:       "Tutti i dati e i file verranno sovrascritti con il contenuto del backup.",
    db:          "Il database verrà sovrascritto con il dump del backup.",
    documentale: "I file PDF e archivio verranno sovrascritti. Il database non verrà modificato.",
  };

  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: "#dc2626",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className="ti ti-database-import" style={{ fontSize: 22, color: "#fff" }} />
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>Ripristina</p>
          <p style={{ color: "var(--text2)", fontSize: 13, margin: 0 }}>
            Carica un file di backup GSA (.zip).{" "}
            <strong style={{ color: "var(--red)" }}>Sovrascrive i dati esistenti.</strong>
          </p>
        </div>
      </div>

      {/* Tipo */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: "var(--text2)", display: "block", marginBottom: 6 }}>
          Cosa ripristinare
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tipiOpt.map(t => (
            <button key={t.id}
                    onClick={() => { setTipo(t.id); setConfirm(false); setResult(null); setErr(null); }}
                    style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                             border: tipo === t.id ? "1px solid var(--accent)" : "1px solid var(--border)",
                             background: tipo === t.id ? "rgba(59,130,246,0.15)" : "var(--bg3)",
                             color: tipo === t.id ? "var(--accent)" : "var(--text2)",
                             fontWeight: tipo === t.id ? 600 : 400 }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* File picker */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <input ref={fileRef} type="file" accept=".zip" style={{ display: "none" }}
               onChange={e => { setFile(e.target.files[0] || null); setResult(null); setErr(null); setConfirm(false); }} />
        <Btn variant="secondary" onClick={() => fileRef.current.click()}>
          <i className="ti ti-upload" /> Scegli file
        </Btn>
        {file && (
          <span style={{ fontSize: 13, color: "var(--text2)" }}>
            <i className="ti ti-file-zip" /> {file.name}{" "}
            ({(file.size / 1024 / 1024).toFixed(1)} MB)
          </span>
        )}
      </div>

      {file && !confirm && !loading && (
        <div style={{ padding: "12px 14px", background: "rgba(251,191,36,0.1)",
                      border: "1px solid rgba(251,191,36,0.5)", borderRadius: 8, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <i className="ti ti-alert-triangle" style={{ color: "#f59e0b" }} />
            <strong style={{ fontSize: 13 }}>Conferma ripristino</strong>
          </div>
          <p style={{ margin: "0 0 12px", fontSize: 13 }}>
            {warningText[tipo]} L'operazione non è reversibile.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="danger" size="sm" onClick={() => setConfirm(true)}>
              <i className="ti ti-check" /> Confermo, procedi
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => { setFile(null); setConfirm(false); }}>Annulla</Btn>
          </div>
        </div>
      )}

      {confirm && file && (
        <Btn variant="danger" onClick={doRestore} disabled={loading}>
          {loading
            ? <><i className="ti ti-loader-2 ti-spin" /> Ripristino in corso…</>
            : <><i className="ti ti-database-import" /> Avvia ripristino</>}
        </Btn>
      )}

      {result && (
        <div style={{ padding: "10px 14px", background: "rgba(34,197,94,0.1)",
                      border: "1px solid #22c55e", borderRadius: 8, marginTop: 12,
                      display: "flex", gap: 10, fontSize: 13 }}>
          <i className="ti ti-circle-check" style={{ color: "#22c55e", flexShrink: 0 }} />
          <div>
            <strong>Ripristino completato</strong>
            <p style={{ margin: "4px 0 0" }}>
              {result.pdfRipristinati > 0 && `PDF ripristinati: ${result.pdfRipristinati} · `}
              {result.archivioRipristinati > 0 && `File archivio: ${result.archivioRipristinati}`}
              {!result.pdfRipristinati && !result.archivioRipristinati && "Database ripristinato."}
            </p>
          </div>
        </div>
      )}

      {err && (
        <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)",
                      border: "1px solid var(--red)", borderRadius: 8, marginTop: 12, fontSize: 13 }}>
          <i className="ti ti-alert-circle" /> {err}
        </div>
      )}
    </div>
  );
}

// ── Sezione Log ────────────────────────────────────────────────────────────────
function LogSection() {
  const [status,      setStatus]   = useState(null);
  const [toggling,    setToggling] = useState(false);
  const [downloading, setDown]     = useState(false);
  const [clearing,    setClearing] = useState(false);
  const [err,         setErr]      = useState(null);

  const loadStatus = useCallback(
    () => adminApi.logsStatus().then(setStatus).catch(() => {}),
    []
  );
  useEffect(() => { loadStatus(); }, [loadStatus]);

  async function toggle() {
    if (!status) return;
    setToggling(true); setErr(null);
    try { const r = await adminApi.logsToggle(!status.enabled); setStatus(s => ({ ...s, ...r })); }
    catch (e) { setErr(e.message); }
    finally { setToggling(false); loadStatus(); }
  }

  async function download() {
    setDown(true); setErr(null);
    try { await adminApi.logsDownload(); }
    catch (e) { setErr(e.message); }
    finally { setDown(false); }
  }

  async function clear() {
    setClearing(true); setErr(null);
    try { await adminApi.logsClear(); loadStatus(); }
    catch (e) { setErr(e.message); }
    finally { setClearing(false); }
  }

  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10,
                      background: status?.enabled ? "#16a34a" : "var(--bg3)",
                      border: "1px solid var(--border)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, transition: "background 0.2s" }}>
          <i className="ti ti-terminal-2"
             style={{ fontSize: 22, color: status?.enabled ? "#fff" : "var(--text2)" }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>Log applicazione</p>
          <p style={{ color: "var(--text2)", fontSize: 13, margin: 0 }}>
            Registra le richieste HTTP e le operazioni amministrative.
          </p>
        </div>
        <Btn variant={status?.enabled ? "danger" : "success"} onClick={toggle}
             disabled={toggling || !status}>
          {toggling
            ? <><i className="ti ti-loader-2 ti-spin" /> …</>
            : status?.enabled
              ? <><i className="ti ti-player-stop" /> Disattiva</>
              : <><i className="ti ti-player-play" /> Attiva</>}
        </Btn>
      </div>

      {status && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--text2)" }}>
            {status.enabled
              ? <><i className="ti ti-circle-filled" style={{ color: "#22c55e", marginRight: 4 }} />Logging attivo</>
              : <><i className="ti ti-circle" style={{ marginRight: 4 }} />Logging disattivo</>}
          </span>
          {status.exists && (
            <>
              <span style={{ fontSize: 12, color: "var(--text2)" }}>·</span>
              <span style={{ fontSize: 12, color: "var(--text2)" }}>Log: {formatBytes(status.size)}</span>
              <Btn variant="secondary" size="sm" onClick={download} disabled={downloading}>
                {downloading
                  ? <><i className="ti ti-loader-2 ti-spin" /> …</>
                  : <><i className="ti ti-download" /> Scarica</>}
              </Btn>
              <Btn variant="ghost" size="sm" onClick={clear} disabled={clearing}>
                {clearing
                  ? <><i className="ti ti-loader-2 ti-spin" /> …</>
                  : <><i className="ti ti-trash" /> Cancella log</>}
              </Btn>
            </>
          )}
          {!status.exists && (
            <span style={{ fontSize: 12, color: "var(--text2)" }}>· Nessun log disponibile</span>
          )}
        </div>
      )}

      {err && (
        <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)",
                      border: "1px solid var(--red)", borderRadius: 8, marginTop: 8, fontSize: 13 }}>
          <i className="ti ti-alert-circle" /> {err}
        </div>
      )}
    </div>
  );
}

// ── Componente principale ──────────────────────────────────────────────────────
const SUB_TABS = [
  { id: "verifica",  label: "Verifica coerenza", icon: "ti-shield-check" },
  { id: "tipologie", label: "Tipologie",          icon: "ti-tags" },
  { id: "backup",    label: "Backup",             icon: "ti-database-export" },
  { id: "ripristino",label: "Ripristino",         icon: "ti-database-import" },
  { id: "log",       label: "Log",                icon: "ti-terminal-2" },
];

export function AdminV2() {
  const [sub, setSub] = useState("verifica");

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>Amministrazione v2</h2>
        <p style={{ color: "var(--text2)", fontSize: 13, margin: 0 }}>
          Verifica coerenza dati, tipologie, backup, ripristino e log di sistema.
        </p>
      </div>

      {/* Sub-nav */}
      <div style={{ display: "flex", gap: 4, marginBottom: 28, flexWrap: "wrap",
                    borderBottom: "2px solid var(--border)", paddingBottom: 0 }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
                  style={{ display: "flex", alignItems: "center", gap: 6,
                           padding: "8px 16px", border: "none", background: "none",
                           cursor: "pointer", fontSize: 13, fontWeight: sub === t.id ? 700 : 400,
                           color: sub === t.id ? "var(--accent)" : "var(--text2)",
                           borderBottom: sub === t.id ? "2px solid var(--accent)" : "2px solid transparent",
                           marginBottom: -2, transition: "all 0.15s" }}>
            <i className={`ti ${t.icon}`} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {sub === "verifica"   && <VerificaCoerenzaSection />}
      {sub === "tipologie"  && <TipologieV2 />}
      {sub === "backup"     && <BackupSection />}
      {sub === "ripristino" && <RipristinoSection />}
      {sub === "log"        && <LogSection />}
    </div>
  );
}
