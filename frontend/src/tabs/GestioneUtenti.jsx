import { useState, useEffect } from "react";
import { authApi } from "../api.js";
import { Btn, SectionHeader } from "../components/ui.jsx";

const RUOLO_LABEL = { admin: "Amministratore", editor: "Editor", viewer: "Visualizzatore" };
const RUOLO_COLOR = { admin: "#6b46c1", editor: "#2b6cb0", viewer: "#276749" };

const EMPTY_FORM = { email: "", nome: "", cognome: "", ruolo: "viewer", password: "" };

export function GestioneUtenti() {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState("");

  // password modal state
  const [pwdUser,   setPwdUser]   = useState(null);  // utente di cui si sta impostando la pw
  const [pwdValue,  setPwdValue]  = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdErr,    setPwdErr]    = useState("");

  useEffect(() => {
    authApi.listUsers()
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  async function addUser(e) {
    e.preventDefault();
    setErr("");
    if (form.password && form.password.length < 6) {
      setErr("La password deve essere di almeno 6 caratteri");
      return;
    }
    setSaving(true);
    try {
      const { password, ...userData } = form;
      const created = await authApi.createUser(userData);
      if (password) {
        await authApi.setPassword(created.id, password);
      }
      setUsers(u => [...u, created]);
      setForm(EMPTY_FORM);
      setShowAdd(false);
    } catch (ex) {
      setErr(ex.message || "Errore durante la creazione");
    } finally {
      setSaving(false);
    }
  }

  async function changeRuolo(user, ruolo) {
    const updated = await authApi.updateRuolo(user.id, ruolo);
    setUsers(u => u.map(x => x.id === user.id ? { ...x, ruolo: updated.ruolo } : x));
  }

  async function toggleAttivo(user) {
    const updated = await authApi.updateAttivo(user.id, !user.attivo);
    setUsers(u => u.map(x => x.id === user.id ? { ...x, attivo: updated.attivo } : x));
  }

  async function removeUser(user) {
    if (!confirm(`Eliminare l'utente ${user.email}?`)) return;
    await authApi.deleteUser(user.id);
    setUsers(u => u.filter(x => x.id !== user.id));
  }

  function openPwd(user) {
    setPwdUser(user);
    setPwdValue("");
    setPwdErr("");
  }

  async function savePwd(e) {
    e.preventDefault();
    setPwdErr("");
    setPwdSaving(true);
    try {
      await authApi.setPassword(pwdUser.id, pwdValue || null);
      setPwdUser(null);
    } catch (ex) {
      setPwdErr(ex.message || "Errore");
    } finally {
      setPwdSaving(false);
    }
  }

  async function removePwd() {
    if (!confirm(`Rimuovere la password locale di ${pwdUser.email}?`)) return;
    setPwdSaving(true);
    try {
      await authApi.setPassword(pwdUser.id, null);
      setPwdUser(null);
    } catch (ex) {
      setPwdErr(ex.message || "Errore");
    } finally {
      setPwdSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 32, color: "var(--text2)" }}>Caricamento…</div>;

  return (
    <div>
      <SectionHeader
        title="Gestione Utenti"
        action={
          <Btn variant="primary" onClick={() => { setShowAdd(s => !s); setErr(""); }}>
            <i className="ti ti-user-plus" /> Aggiungi Utente
          </Btn>
        }
      />

      {/* Form aggiungi utente */}
      {showAdd && (
        <div className="card" style={{ marginBottom: 16, border: "2px solid var(--accent)" }}>
          <p style={{ fontWeight: 700, fontSize: 14, margin: "0 0 12px" }}>
            <i className="ti ti-user-plus" style={{ marginRight: 6 }} />
            Registra nuovo utente
          </p>
          <p style={{ fontSize: 12, color: "var(--text2)", margin: "0 0 16px" }}>
            Con password: l'utente accede subito con email e password.
            Senza password: l'utente accede con Google/Apple usando questa email.
          </p>
          <form onSubmit={addUser}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
              <div>
                <label style={LBL}>Email *</label>
                <input
                  type="email" required placeholder="utente@esempio.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={INPUT}
                />
              </div>
              <div>
                <label style={LBL}>Nome</label>
                <input
                  type="text" placeholder="Mario"
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  style={INPUT}
                />
              </div>
              <div>
                <label style={LBL}>Cognome</label>
                <input
                  type="text" placeholder="Rossi"
                  value={form.cognome}
                  onChange={e => setForm(f => ({ ...f, cognome: e.target.value }))}
                  style={INPUT}
                />
              </div>
              <div>
                <label style={LBL}>Password <span style={{ fontWeight: 400, opacity: 0.7 }}>(opzionale)</span></label>
                <input
                  type="password" placeholder="min. 6 caratteri"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  style={INPUT}
                />
              </div>
              <div>
                <label style={LBL}>Ruolo</label>
                <select
                  value={form.ruolo}
                  onChange={e => setForm(f => ({ ...f, ruolo: e.target.value }))}
                  style={{ ...INPUT, color: RUOLO_COLOR[form.ruolo] }}
                >
                  <option value="admin">Amministratore</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Visualizzatore</option>
                </select>
              </div>
            </div>
            {err && (
              <p style={{ color: "#c53030", fontSize: 12, margin: "8px 0 0" }}>{err}</p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <Btn variant="secondary" onClick={() => { setShowAdd(false); setErr(""); }}>
                Annulla
              </Btn>
              <Btn variant="primary" disabled={saving}>
                <i className="ti ti-check" /> {saving ? "Salvataggio…" : "Registra"}
              </Btn>
            </div>
          </form>
        </div>
      )}

      {/* Modal password */}
      {pwdUser && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{
            background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 14,
            padding: "28px 28px 24px", width: 360, boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          }}>
            <p style={{ fontWeight: 700, fontSize: 15, margin: "0 0 4px" }}>
              <i className="ti ti-lock" style={{ marginRight: 6 }} />
              Password locale
            </p>
            <p style={{ fontSize: 12, color: "var(--text2)", margin: "0 0 16px" }}>
              {pwdUser.email}
            </p>
            <form onSubmit={savePwd} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={LBL}>Nuova password (min. 6 caratteri)</label>
                <input
                  type="password" placeholder="Lascia vuoto per rimuovere"
                  value={pwdValue}
                  onChange={e => setPwdValue(e.target.value)}
                  style={INPUT}
                  autoFocus
                />
              </div>
              {pwdErr && <p style={{ color: "#c53030", fontSize: 12, margin: 0 }}>{pwdErr}</p>}
              <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 4 }}>
                <Btn variant="danger" size="sm" type="button" onClick={removePwd} disabled={pwdSaving}>
                  <i className="ti ti-trash" /> Rimuovi password
                </Btn>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="secondary" type="button" onClick={() => setPwdUser(null)}>
                    Annulla
                  </Btn>
                  <Btn variant="primary" disabled={pwdSaving || (pwdValue.length > 0 && pwdValue.length < 6)}>
                    <i className="ti ti-check" /> {pwdSaving ? "…" : "Salva"}
                  </Btn>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tabella utenti */}
      <div className="card">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg3)" }}>
              <th style={TH}>Utente</th>
              <th style={TH}>Ultimo accesso</th>
              <th style={TH}>Ruolo</th>
              <th style={TH}>Stato</th>
              <th style={TH}>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: "1px solid var(--border)", opacity: u.attivo ? 1 : 0.5 }}>
                <td style={TD}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {u.avatar_url
                      ? <img src={u.avatar_url} alt="" style={{ width: 30, height: 30, borderRadius: "50%" }} />
                      : <div style={{
                          width: 30, height: 30, borderRadius: "50%",
                          background: u.provider === "manual" ? "var(--border)" : "var(--accent)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <i className="ti ti-user" style={{ color: u.provider === "manual" ? "var(--text2)" : "#fff", fontSize: 14 }} />
                        </div>
                    }
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {u.nome || u.cognome ? `${u.nome} ${u.cognome}`.trim() : <span style={{ color: "var(--text2)" }}>—</span>}
                        {u.provider === "manual" && (
                          <span style={{
                            marginLeft: 6, fontSize: 10, padding: "1px 5px", borderRadius: 4,
                            background: "rgba(0,0,0,0.07)", color: "var(--text2)",
                          }}>in attesa</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text2)" }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td style={TD}>
                  <span style={{ fontSize: 12, color: "var(--text2)" }}>
                    {u.last_login ? new Date(u.last_login).toLocaleString("it-IT") : "—"}
                  </span>
                </td>
                <td style={TD}>
                  <select
                    value={u.ruolo}
                    onChange={e => changeRuolo(u, e.target.value)}
                    style={{
                      padding: "3px 8px", borderRadius: 6, fontSize: 12,
                      border: `1px solid ${RUOLO_COLOR[u.ruolo]}`,
                      color: RUOLO_COLOR[u.ruolo], background: "transparent", cursor: "pointer",
                    }}
                  >
                    <option value="admin">Amministratore</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Visualizzatore</option>
                  </select>
                </td>
                <td style={TD}>
                  <button
                    onClick={() => toggleAttivo(u)}
                    style={{
                      padding: "3px 10px", borderRadius: 6, fontSize: 11,
                      border: "none", cursor: "pointer", fontWeight: 600,
                      background: u.attivo ? "rgba(39,103,73,0.15)" : "rgba(197,48,48,0.15)",
                      color: u.attivo ? "#276749" : "#c53030",
                    }}
                  >
                    {u.attivo ? "Attivo" : "Disabilitato"}
                  </button>
                </td>
                <td style={TD}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn size="sm" variant="secondary" onClick={() => openPwd(u)} title="Imposta password locale">
                      <i className="ti ti-lock" />
                    </Btn>
                    <Btn size="sm" variant="danger" onClick={() => removeUser(u)} title="Elimina utente">
                      <i className="ti ti-trash" />
                    </Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <p style={{ textAlign: "center", padding: 24, color: "var(--text2)", fontSize: 13 }}>
            Nessun utente registrato. Gli utenti appariranno qui dopo il primo accesso o dopo la registrazione manuale.
          </p>
        )}
      </div>
    </div>
  );
}

const TH  = { padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text2)" };
const TD  = { padding: "10px 12px", verticalAlign: "middle" };
const LBL = { display: "block", fontSize: 11, color: "var(--text2)", marginBottom: 4, fontWeight: 600 };
const INPUT = {
  width: "100%", padding: "7px 10px", borderRadius: 6, fontSize: 13,
  border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)",
  boxSizing: "border-box",
};
