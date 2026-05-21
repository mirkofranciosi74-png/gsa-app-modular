import { useRef, useState } from "react";
import { adminApi } from "../api.js";
import { Btn } from "../components/ui.jsx";

export function Admin() {
  const [backupLoading,  setBackupLoading]  = useState(false);
  const [backupErr,      setBackupErr]      = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreResult,  setRestoreResult]  = useState(null);
  const [restoreErr,     setRestoreErr]     = useState(null);
  const [confirm,        setConfirm]        = useState(false);
  const [fileSelezionato, setFile]          = useState(null);
  const fileRef = useRef();

  async function doBackup() {
    setBackupLoading(true);
    setBackupErr(null);
    try {
      await adminApi.backup();
    } catch (e) {
      setBackupErr(e.message);
    } finally {
      setBackupLoading(false);
    }
  }

  async function doRestore() {
    if (!fileSelezionato) return;
    setRestoreLoading(true);
    setRestoreResult(null);
    setRestoreErr(null);
    setConfirm(false);
    try {
      const r = await adminApi.restore(fileSelezionato);
      setRestoreResult(r);
      setFile(null);
    } catch (e) {
      setRestoreErr(e.message);
    } finally {
      setRestoreLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>Amministrazione</h2>
        <p style={{ color: "var(--text2)", fontSize: 13, margin: 0 }}>
          Backup e ripristino del database e dell'archivio documentale.
        </p>
      </div>

      {/* ── BACKUP ── */}
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)",
                    borderRadius: 12, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--accent)",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-database-export" style={{ fontSize: 22, color: "#fff" }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: 15, margin: "0 0 4px" }}>Backup</p>
            <p style={{ color: "var(--text2)", fontSize: 13, margin: "0 0 16px" }}>
              Scarica un file ZIP contenente il dump del database e tutti i file PDF e documentali.
            </p>
            {backupErr && (
              <div className="alert alert-danger" style={{ marginBottom: 12 }}>
                <i className="ti ti-alert-circle" /> {backupErr}
              </div>
            )}
            <Btn variant="primary" onClick={doBackup} disabled={backupLoading}>
              {backupLoading
                ? <><i className="ti ti-loader-2 spin" /> Generazione in corso…</>
                : <><i className="ti ti-download" /> Scarica backup</>}
            </Btn>
          </div>
        </div>
      </div>

      {/* ── RIPRISTINA ── */}
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)",
                    borderRadius: 12, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#dc2626",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-database-import" style={{ fontSize: 22, color: "#fff" }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: 15, margin: "0 0 4px" }}>Ripristina</p>
            <p style={{ color: "var(--text2)", fontSize: 13, margin: "0 0 16px" }}>
              Carica un file di backup GSA (.zip) per ripristinare il database e i file documentali.
              <strong style={{ color: "var(--red)" }}> Attenzione: sovrascrive tutti i dati esistenti.</strong>
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <input
                ref={fileRef}
                type="file"
                accept=".zip"
                style={{ display: "none" }}
                onChange={e => { setFile(e.target.files[0] || null); setRestoreResult(null); setRestoreErr(null); }}
              />
              <Btn variant="secondary" onClick={() => fileRef.current.click()}>
                <i className="ti ti-upload" /> Scegli file
              </Btn>
              {fileSelezionato && (
                <span style={{ fontSize: 13, color: "var(--text2)" }}>
                  <i className="ti ti-file-zip" /> {fileSelezionato.name}{" "}
                  <span style={{ color: "var(--text3)" }}>
                    ({(fileSelezionato.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </span>
              )}
            </div>

            {fileSelezionato && !confirm && !restoreLoading && (
              <div className="alert alert-warn" style={{ marginBottom: 12 }}>
                <i className="ti ti-alert-triangle" />
                <div>
                  <strong>Conferma ripristino</strong>
                  <p style={{ margin: "4px 0 10px", fontSize: 13 }}>
                    Tutti i dati attuali verranno sovrascritti con il contenuto del backup.
                    L'operazione non è reversibile.
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn variant="danger" size="sm" onClick={() => setConfirm(true)}>
                      <i className="ti ti-check" /> Confermo, procedi
                    </Btn>
                    <Btn variant="ghost" size="sm" onClick={() => { setFile(null); setConfirm(false); }}>
                      Annulla
                    </Btn>
                  </div>
                </div>
              </div>
            )}

            {confirm && fileSelezionato && (
              <Btn variant="danger" onClick={doRestore} disabled={restoreLoading}>
                {restoreLoading
                  ? <><i className="ti ti-loader-2 spin" /> Ripristino in corso…</>
                  : <><i className="ti ti-database-import" /> Avvia ripristino</>}
              </Btn>
            )}

            {restoreResult && (
              <div className="alert alert-success" style={{ marginTop: 12 }}>
                <i className="ti ti-circle-check" />
                <div>
                  <strong>Ripristino completato</strong>
                  <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                    PDF ripristinati: {restoreResult.pdfRipristinati} ·{" "}
                    File archivio: {restoreResult.archivioRipristinati}
                  </p>
                </div>
              </div>
            )}

            {restoreErr && (
              <div className="alert alert-danger" style={{ marginTop: 12 }}>
                <i className="ti ti-alert-circle" /> {restoreErr}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
