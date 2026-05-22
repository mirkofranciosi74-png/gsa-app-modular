import { useRef, useState, useEffect, useCallback } from "react";
import { adminApi } from "../api.js";
import { Btn } from "../components/ui.jsx";

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

// ── Componente principale ──────────────────────────────────────────────────────
export function Admin() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>Amministrazione</h2>
        <p style={{ color: "var(--text2)", fontSize: 13, margin: 0 }}>
          Backup, ripristino e gestione del sistema.
        </p>
      </div>
      <BackupSection />
      <RestoreSection />
      <LogSection />
    </div>
  );
}
