import { useRef, useState, useEffect, useCallback } from "react";
import { adminApi } from "../api.js";
import { Btn } from "../components/ui.jsx";
import { Tipologie } from "./tipologie.jsx";

const fmtEuro  = v => v != null ? Number(v).toLocaleString("it-IT", { style: "currency", currency: "EUR" }) : "—";
const fmtData  = d => d ? new Date(d).toLocaleDateString("it-IT") : "—";
const fmtMese  = s => s || "—";

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

// ── Sezione backup ─────────────────────────────────────────────────────────────
function BackupSection() {
  const [loading, setLoading] = useState(null); // null | "tutto" | "db" | "documentale"
  const [err, setErr] = useState(null);

  async function doBackup(tipo) {
    setLoading(tipo); setErr(null);
    try { await adminApi.backup(tipo); }
    catch (e) { setErr(e.message); }
    finally { setLoading(null); }
  }

  const tipi = [
    { id: "tutto",       label: "Backup completo",    desc: "DB + PDF spese + archivio documentale", icon: "ti-database-export" },
    { id: "db",          label: "Solo database",      desc: "Dump SQL del database PostgreSQL",       icon: "ti-database" },
    { id: "documentale", label: "Solo documentale",   desc: "PDF spese + file archivio (no dati DB)", icon: "ti-folder-down" },
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
        <div className="alert alert-danger" style={{ marginBottom: 12 }}>
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
            <Btn variant="primary" size="sm" onClick={() => doBackup(t.id)}
                 disabled={loading !== null}>
              {loading === t.id
                ? <><i className="ti ti-loader-2 spin" /> In corso…</>
                : <><i className="ti ti-download" /> Scarica</>}
            </Btn>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sezione ripristino ─────────────────────────────────────────────────────────
function RestoreSection() {
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
    try {
      const r = await adminApi.restore(file, tipo);
      setResult(r); setFile(null);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  const tipiOpt = [
    { id: "tutto",       label: "Completo (DB + documentale)" },
    { id: "db",          label: "Solo database" },
    { id: "documentale", label: "Solo documentale (file)" },
  ];

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
            Carica un file di backup GSA (.zip) per ripristinare i dati.
            <strong style={{ color: "var(--red)" }}> Sovrascrive i dati esistenti.</strong>
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
            <button key={t.id} onClick={() => { setTipo(t.id); setConfirm(false); setResult(null); setErr(null); }}
                    style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                      border: tipo === t.id ? "1px solid var(--accent)" : "1px solid var(--border)",
                      background: tipo === t.id ? "rgba(59,130,246,0.15)" : "var(--bg3)",
                      color: tipo === t.id ? "var(--accent)" : "var(--text2)",
                      fontWeight: tipo === t.id ? 600 : 400,
                    }}>
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
            <span style={{ color: "var(--text3)" }}>({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
          </span>
        )}
      </div>

      {file && !confirm && !loading && (
        <div className="alert alert-warn" style={{ marginBottom: 12 }}>
          <i className="ti ti-alert-triangle" />
          <div>
            <strong>Conferma ripristino</strong>
            <p style={{ margin: "4px 0 10px", fontSize: 13 }}>
              {tipo === "tutto" && "Tutti i dati e i file verranno sovrascritti con il contenuto del backup."}
              {tipo === "db" && "Il database verrà sovrascritto con il dump del backup."}
              {tipo === "documentale" && "I file PDF e archivio verranno sovrascritti. Il database non verrà modificato."}
              {" "}L'operazione non è reversibile.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="danger" size="sm" onClick={() => setConfirm(true)}>
                <i className="ti ti-check" /> Confermo, procedi
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => { setFile(null); setConfirm(false); }}>Annulla</Btn>
            </div>
          </div>
        </div>
      )}

      {confirm && file && (
        <Btn variant="danger" onClick={doRestore} disabled={loading}>
          {loading
            ? <><i className="ti ti-loader-2 spin" /> Ripristino in corso…</>
            : <><i className="ti ti-database-import" /> Avvia ripristino</>}
        </Btn>
      )}

      {result && (
        <div className="alert alert-success" style={{ marginTop: 12 }}>
          <i className="ti ti-circle-check" />
          <div>
            <strong>Ripristino completato</strong>
            <p style={{ margin: "4px 0 0", fontSize: 13 }}>
              {result.pdfRipristinati > 0 && `PDF ripristinati: ${result.pdfRipristinati} · `}
              {result.archivioRipristinati > 0 && `File archivio: ${result.archivioRipristinati}`}
              {result.pdfRipristinati === 0 && result.archivioRipristinati === 0 && "Database ripristinato."}
            </p>
          </div>
        </div>
      )}

      {err && (
        <div className="alert alert-danger" style={{ marginTop: 12 }}>
          <i className="ti ti-alert-circle" /> {err}
        </div>
      )}
    </div>
  );
}

// ── Sezione log ────────────────────────────────────────────────────────────────
function LogSection() {
  const [status,      setStatus]   = useState(null);
  const [toggling,    setToggling] = useState(false);
  const [downloading, setDown]     = useState(false);
  const [clearing,    setClearing] = useState(false);
  const [err,         setErr]      = useState(null);

  const loadStatus = useCallback(() =>
    adminApi.logsStatus().then(setStatus).catch(() => {}), []);

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
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      transition: "background 0.2s" }}>
          <i className="ti ti-terminal-2" style={{ fontSize: 22, color: status?.enabled ? "#fff" : "var(--text2)" }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>Log applicazione</p>
          <p style={{ color: "var(--text2)", fontSize: 13, margin: 0 }}>
            Registra le richieste HTTP e le operazioni amministrative in un file di log.
          </p>
        </div>
        <Btn variant={status?.enabled ? "danger" : "success"} onClick={toggle} disabled={toggling || !status}>
          {toggling
            ? <><i className="ti ti-loader-2 spin" /> …</>
            : status?.enabled
              ? <><i className="ti ti-player-stop" /> Disattiva</>
              : <><i className="ti ti-player-play" /> Attiva</>}
        </Btn>
      </div>

      {status && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                      marginBottom: err ? 12 : 0 }}>
          <span style={{ fontSize: 12, color: "var(--text2)" }}>
            {status.enabled
              ? <><i className="ti ti-circle-filled" style={{ color: "#22c55e", marginRight: 4 }} />Logging attivo</>
              : <><i className="ti ti-circle" style={{ marginRight: 4 }} />Logging disattivo</>}
          </span>
          {status.exists && (
            <>
              <span style={{ fontSize: 12, color: "var(--text2)" }}>·</span>
              <span style={{ fontSize: 12, color: "var(--text2)" }}>
                Log: {formatBytes(status.size)}
              </span>
              <Btn variant="secondary" size="sm" onClick={download} disabled={downloading}>
                {downloading
                  ? <><i className="ti ti-loader-2 spin" /> …</>
                  : <><i className="ti ti-download" /> Scarica</>}
              </Btn>
              <Btn variant="ghost" size="sm" onClick={clear} disabled={clearing}>
                {clearing
                  ? <><i className="ti ti-loader-2 spin" /> …</>
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
        <div className="alert alert-danger" style={{ marginTop: 8 }}>
          <i className="ti ti-alert-circle" /> {err}
        </div>
      )}
    </div>
  );
}

// ── helpers render ─────────────────────────────────────────────────────────────
function Badge({ n, color = "red" }) {
  if (!n) return null;
  const bg = color === "green" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)";
  const fg = color === "green" ? "var(--green)" : "var(--red)";
  return (
    <span style={{ background: bg, color: fg, borderRadius: 20, padding: "2px 8px",
                   fontSize: 11, fontWeight: 700, marginLeft: 6 }}>
      {n}
    </span>
  );
}

function Sezione({ titolo, icon, items, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen || items?.length > 0);
  return (
    <div style={{ border: `1px solid ${items?.length ? "var(--red)" : "var(--border)"}`,
                  borderRadius: 8, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8,
                 padding: "10px 14px", background: "var(--bg2)", border: "none",
                 cursor: "pointer", color: "var(--text1)", fontSize: 13, fontWeight: 600 }}
      >
        <i className={`ti ${icon}`} style={{ color: items?.length ? "var(--red)" : "var(--green)" }} />
        <span style={{ flex: 1, textAlign: "left" }}>{titolo}</span>
        <Badge n={items?.length} color={items?.length ? "red" : "green"} />
        {!items?.length && (
          <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 400 }}>OK</span>
        )}
        <i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ color: "var(--text2)", fontSize: 12 }} />
      </button>
      {open && items?.length > 0 && (
        <div style={{ padding: "12px 14px", background: "var(--bg3)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function TabellaAnomalieSimple({ rows, cols }) {
  const th = { padding: "4px 8px", textAlign: "left", fontSize: 11,
               color: "var(--text2)", borderBottom: "1px solid var(--border)", fontWeight: 600 };
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
                  {c.fmt ? c.fmt(r[c.k], r) : (r[c.k] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── helpers hash ──────────────────────────────────────────────────────────────
function groupByHash(rows) {
  const map = {};
  for (const r of rows) {
    if (!map[r.file_hash]) map[r.file_hash] = [];
    map[r.file_hash].push(r);
  }
  return Object.values(map);
}

// ── Sezione verifica coerenza ──────────────────────────────────────────────────
function VerificaCoerenzaSection() {
  const [report,    setReport]    = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);
  const reportRef = useRef();

  async function avvia() {
    setLoading(true); setErr(null); setReport(null); setBackfillResult(null);
    try { setReport(await adminApi.verificaCoerenza()); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  async function backfill() {
    setBackfilling(true); setBackfillResult(null);
    try {
      const r = await adminApi.backfillHash();
      setBackfillResult(r);
      setReport(await adminApi.verificaCoerenza());
    } catch (e) { setErr(e.message); }
    finally { setBackfilling(false); }
  }

  function stampa() {
    const w = window.open("", "_blank");
    w.document.write(`
      <html><head><title>Verifica coerenza GSA</title>
      <style>
        body { font-family: sans-serif; font-size: 12px; color: #111; padding: 20px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        h2 { font-size: 14px; margin: 16px 0 6px; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        th { background: #f3f4f6; text-align: left; padding: 4px 8px; font-size: 11px; border: 1px solid #ddd; }
        td { padding: 4px 8px; border: 1px solid #ddd; font-size: 11px; }
        .ok { color: #16a34a; }
        .err { color: #dc2626; }
        .meta { color: #666; font-size: 11px; margin-bottom: 20px; }
      </style></head><body>
      ${reportRef.current?.innerHTML || ""}
      </body></html>
    `);
    w.document.close();
    w.print();
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
            Controlla proprietari, percentuali, date di validità e riparti.
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
              ? <><i className="ti ti-loader-2 spin" /> Analisi…</>
              : <><i className="ti ti-search" /> Avvia verifica</>}
          </Btn>
        </div>
      </div>

      {err && (
        <div className="alert alert-danger">
          <i className="ti ti-alert-circle" /> {err}
        </div>
      )}

      {report && (
        <div ref={reportRef}>
          {/* Riepilogo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
                        padding: "10px 16px", borderRadius: 8,
                        background: report.totale_anomalie === 0 ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                        border: `1px solid ${report.totale_anomalie === 0 ? "var(--green)" : "var(--red)"}` }}>
            <i className={`ti ti-${report.totale_anomalie === 0 ? "circle-check" : "alert-triangle"}`}
               style={{ fontSize: 22, color: report.totale_anomalie === 0 ? "var(--green)" : "var(--red)" }} />
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
            <Sezione titolo="Appartamenti senza proprietario" icon="ti-building-off"
                     items={report.appartamenti_senza_proprietario}>
              <TabellaAnomalieSimple
                rows={report.appartamenti_senza_proprietario}
                cols={[{ k: "nome", label: "Appartamento" }]}
              />
            </Sezione>

            <Sezione titolo="Percentuale proprietà ≠ 100% (periodo corrente)" icon="ti-percentage"
                     items={report.percentuali_scorrette}>
              <TabellaAnomalieSimple
                rows={report.percentuali_scorrette}
                cols={[
                  { k: "appartamento_nome", label: "Appartamento" },
                  { k: "totale_pct", label: "Totale %", right: true,
                    fmt: v => <span style={{ color: "var(--red)", fontWeight: 700 }}>{v}%</span> },
                  { k: "dettaglio", label: "Dettaglio",
                    fmt: v => (v || []).map(d =>
                      `${d.proprietario}: ${d.pct}%`
                    ).join(" · ") },
                ]}
              />
            </Sezione>

            <Sezione titolo="Periodi di proprietà sovrapposti" icon="ti-layers-intersect"
                     items={report.periodi_sovrapposti}>
              <TabellaAnomalieSimple
                rows={report.periodi_sovrapposti}
                cols={[
                  { k: "appartamento_nome", label: "Appartamento" },
                  { k: "proprietario_nome", label: "Proprietario" },
                  { k: "da1", label: "Periodo 1 dal", fmt: fmtData },
                  { k: "a1",  label: "al",            fmt: v => v ? fmtData(v) : "aperto" },
                  { k: "da2", label: "Periodo 2 dal", fmt: fmtData },
                  { k: "a2",  label: "al",            fmt: v => v ? fmtData(v) : "aperto" },
                ]}
              />
            </Sezione>

            <Sezione titolo="Entrate con proprietario inattivo" icon="ti-arrow-down-circle"
                     items={report.movimenti_proprietario_inattivo}>
              <TabellaAnomalieSimple
                rows={report.movimenti_proprietario_inattivo}
                cols={[
                  { k: "appartamento_nome",  label: "Appartamento" },
                  { k: "proprietario_nome",  label: "Proprietario" },
                  { k: "data_riferimento",   label: "Data",     fmt: fmtData },
                  { k: "mese_riferimento",   label: "Periodo",  fmt: fmtMese },
                  { k: "importo",            label: "Importo",  right: true, fmt: fmtEuro },
                ]}
              />
            </Sezione>

            <Sezione titolo="Spese con proprietario inattivo" icon="ti-file-invoice"
                     items={report.documenti_proprietario_inattivo}>
              <TabellaAnomalieSimple
                rows={report.documenti_proprietario_inattivo}
                cols={[
                  { k: "appartamento_nome", label: "Appartamento" },
                  { k: "proprietario_nome", label: "Proprietario" },
                  { k: "data_riferimento",  label: "Data",        fmt: fmtData },
                  { k: "descrizione",       label: "Descrizione" },
                  { k: "importo",           label: "Importo", right: true, fmt: fmtEuro },
                ]}
              />
            </Sezione>

            <Sezione titolo="Entrate fuori dal periodo di validità del proprietario" icon="ti-calendar-off"
                     items={report.movimenti_fuori_validita}>
              <TabellaAnomalieSimple
                rows={report.movimenti_fuori_validita}
                cols={[
                  { k: "appartamento_nome", label: "Appartamento" },
                  { k: "proprietario_nome", label: "Proprietario" },
                  { k: "data_riferimento",  label: "Data",    fmt: fmtData },
                  { k: "mese_riferimento",  label: "Periodo", fmt: fmtMese },
                  { k: "importo",           label: "Importo", right: true, fmt: fmtEuro },
                ]}
              />
            </Sezione>

            <Sezione titolo="Spese fuori dal periodo di validità del proprietario" icon="ti-calendar-off"
                     items={report.documenti_fuori_validita}>
              <TabellaAnomalieSimple
                rows={report.documenti_fuori_validita}
                cols={[
                  { k: "appartamento_nome", label: "Appartamento" },
                  { k: "proprietario_nome", label: "Proprietario" },
                  { k: "data_riferimento",  label: "Data",        fmt: fmtData },
                  { k: "descrizione",       label: "Descrizione" },
                  { k: "importo",           label: "Importo", right: true, fmt: fmtEuro },
                ]}
              />
            </Sezione>

            <Sezione titolo="Regole di riparto con proprietari non validi" icon="ti-git-branch"
                     items={report.regole_riparto_anomale}>
              <TabellaAnomalieSimple
                rows={report.regole_riparto_anomale}
                cols={[
                  { k: "appartamento_nome",  label: "Appartamento" },
                  { k: "proprietario_nome",  label: "Proprietario" },
                  { k: "proprietario_attivo", label: "Attivo",
                    fmt: v => v ? "Sì" : <span style={{ color: "var(--red)" }}>No</span> },
                  { k: "ha_associazione", label: "Assoc. presente",
                    fmt: v => v ? "Sì" : <span style={{ color: "var(--red)" }}>No</span> },
                  { k: "tipo_riferimento", label: "Tipo" },
                ]}
              />
            </Sezione>

            {/* ── Hash duplicati ── */}
            {[
              { key: "hash_duplicati_documenti",  label: "Spese con file duplicato (hash identico)",         icon: "ti-copy" },
              { key: "hash_duplicati_allegati",   label: "Allegati spese proprietari duplicati",             icon: "ti-copy" },
              { key: "hash_duplicati_archivio",   label: "File archivio duplicati",                          icon: "ti-copy" },
            ].map(({ key, label, icon }) => {
              const rows  = report[key] || [];
              const gruppi = groupByHash(rows);
              return (
                <Sezione key={key} titolo={label} icon={icon}
                         items={rows.length ? [1] : []}>
                  {gruppi.map((gruppo, gi) => (
                    <div key={gi} style={{ marginBottom: gi < gruppi.length - 1 ? 12 : 0,
                                           padding: "8px 10px", borderRadius: 6,
                                           border: "1px solid rgba(239,68,68,0.25)",
                                           background: "rgba(239,68,68,0.04)" }}>
                      <div style={{ fontSize: 10, color: "var(--text2)", fontFamily: "monospace",
                                    marginBottom: 6 }}>
                        hash: {gruppo[0].file_hash?.slice(0, 16)}…
                      </div>
                      <TabellaAnomalieSimple rows={gruppo} cols={[
                        { k: "nome_file",         label: "File" },
                        { k: "appartamento_nome", label: "Appartamento" },
                        { k: "tipo_spesa",        label: "Tipo" },
                        { k: "tipo_nome",         label: "Tipo" },
                        { k: "importo",           label: "Importo", right: true, fmt: v => v != null ? fmtEuro(v) : "—" },
                        { k: "data",              label: "Data",    fmt: fmtData },
                      ].filter(c => gruppo[0][c.k] !== undefined)} />
                    </div>
                  ))}
                </Sezione>
              );
            })}

            {/* ── Hash mancanti ── */}
            {[
              { key: "hash_mancanti_documenti", label: "Spese senza impronta digitale (hash mancante)",  icon: "ti-fingerprint-off" },
              { key: "hash_mancanti_allegati",  label: "Allegati spese proprietari senza hash",           icon: "ti-fingerprint-off" },
              { key: "hash_mancanti_archivio",  label: "File archivio senza hash",                        icon: "ti-fingerprint-off" },
            ].map(({ key, label, icon }) => {
              const rows = report[key] || [];
              return (
                <Sezione key={key} titolo={label} icon={icon} items={rows}>
                  <TabellaAnomalieSimple rows={rows} cols={[
                    { k: "nome_file",         label: "File" },
                    { k: "appartamento_nome", label: "Appartamento" },
                    { k: "importo",           label: "Importo", right: true, fmt: v => v != null ? fmtEuro(v) : "—" },
                    { k: "data",              label: "Data",    fmt: fmtData },
                    { k: "tipo_nome",         label: "Tipo" },
                  ].filter(c => rows[0]?.[c.k] !== undefined)} />
                </Sezione>
              );
            })}

            {/* ── Backfill hash ── */}
            {(
              (report.hash_mancanti_documenti?.length || 0) +
              (report.hash_mancanti_allegati?.length  || 0) +
              (report.hash_mancanti_archivio?.length  || 0)
            ) > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                             background: "var(--bg2)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <i className="ti ti-fingerprint" style={{ color: "var(--accent)", fontSize: 18 }} />
                <span style={{ flex: 1, fontSize: 13 }}>
                  Calcola gli hash mancanti rileggendo i file dal disco
                </span>
                <Btn variant="primary" size="sm" onClick={backfill} disabled={backfilling}>
                  {backfilling
                    ? <><i className="ti ti-loader-2 spin" /> Calcolo…</>
                    : <><i className="ti ti-refresh" /> Calcola hash mancanti</>}
                </Btn>
              </div>
            )}

            {backfillResult && (
              <div className="alert alert-success">
                <i className="ti ti-circle-check" />
                <div>
                  <strong>Hash calcolati</strong>
                  <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                    Spese: {backfillResult.updatedDocs} aggiornate
                    {backfillResult.missingDocs > 0 && `, ${backfillResult.missingDocs} file non trovati`}
                    {" · "}Allegati: {backfillResult.updatedAllegati} aggiornati
                    {backfillResult.missingAllegati > 0 && `, ${backfillResult.missingAllegati} file non trovati`}
                    {" · "}Archivio: {backfillResult.updatedArchivio} aggiornati
                    {backfillResult.missingArchivio > 0 && `, ${backfillResult.missingArchivio} file non trovati`}
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

// ── Componente principale ──────────────────────────────────────────────────────
export function Admin() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 32 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>Amministrazione</h2>
        <p style={{ color: "var(--text2)", fontSize: 13, margin: 0 }}>
          Backup, ripristino, gestione del sistema e tipologie documento.
        </p>
      </div>

      {/* ── Verifica coerenza ───────────────────────────────────────────────── */}
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 16px", color: "var(--text)" }}>
          <i className="ti ti-shield-check" style={{ marginRight: 8, color: "#7c3aed" }} />
          Verifica coerenza
        </h3>
        <VerificaCoerenzaSection />
      </div>

      {/* ── Tipi Documento ──────────────────────────────────────────────────── */}
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 16px", color: "var(--text)" }}>
          <i className="ti ti-tag" style={{ marginRight: 8, color: "var(--accent)" }} />
          Tipi Documento
        </h3>
        <Tipologie />
      </div>

      {/* ── Sistema ─────────────────────────────────────────────────────────── */}
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 16px", color: "var(--text)" }}>
          <i className="ti ti-settings" style={{ marginRight: 8, color: "var(--accent)" }} />
          Sistema
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <BackupSection />
          <RestoreSection />
          <LogSection />
        </div>
      </div>
    </div>
  );
}
