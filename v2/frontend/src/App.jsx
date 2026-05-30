import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";

import { PersoneV2 }     from "./tabs/PersoneV2.jsx";
import { PatrimonioV2 }  from "./tabs/PatrimonioV2.jsx";
import { EconomiaV2 }    from "./tabs/EconomiaV2.jsx";
import { RipartoV2 }     from "./tabs/RipartoV2.jsx";
import { GrigliaV2 }     from "./tabs/GrigliaV2.jsx";
import { DashboardV2 }   from "./tabs/DashboardV2.jsx";
import { AdminV2 }       from "./tabs/AdminV2.jsx";
import { DocumentaleV2 } from "./tabs/DocumentaleV2.jsx";
import { ReportV2 }      from "./tabs/ReportV2.jsx";
import { RuoliV2 }       from "./tabs/RuoliV2.jsx";
import { TipologieV2 }   from "./tabs/TipologieV2.jsx";

const TAB_ACCESS = {
  dashboard:   ["admin", "editor"],
  persone:     ["admin", "editor"],
  patrimonio:  ["admin"],
  economia:    ["admin", "editor"],
  riparto:     ["admin"],
  griglia:     ["admin", "editor", "viewer"],
  report:      ["admin", "editor", "viewer"],
  documentale: ["admin", "editor"],
  ruoli:       ["admin"],
  tipologie:   ["admin"],
  admin:       ["admin"],
};

const ALL_TABS = [
  { id: "dashboard",   label: "Dashboard",        icon: "ti-layout-dashboard" },
  { id: "persone",     label: "Persone",           icon: "ti-users" },
  { id: "patrimonio",  label: "Patrimonio",        icon: "ti-building-estate" },
  { id: "economia",    label: "Economia",          icon: "ti-coin" },
  { id: "riparto",     label: "Riparto",           icon: "ti-adjustments" },
  { id: "griglia",     label: "Griglia",           icon: "ti-table" },
  { id: "report",      label: "Report",            icon: "ti-chart-bar" },
  { id: "documentale", label: "Documentale",       icon: "ti-archive" },
  { id: "ruoli",       label: "Gestione Ruoli",    icon: "ti-shield-lock" },
  { id: "tipologie",   label: "Tipologie",         icon: "ti-tags" },
  { id: "admin",       label: "Amministrazione",   icon: "ti-settings" },
];

function Login() {
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Errore login"); return; }
      localStorage.setItem("gsa_v2_token", data.token);
      window.location.reload();
    } catch {
      setError("Errore di connessione");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center",
                  justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ width: 360, background: "var(--bg2)", borderRadius: 12,
                    padding: 32, border: "1px solid var(--border)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: "var(--green)",
                        display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <i className="ti ti-sparkles" style={{ fontSize: 28, color: "#fff" }} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>GSA v2</h1>
          <p style={{ color: "var(--text2)", fontSize: 13 }}>Nuova architettura DDD</p>
        </div>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "var(--text2)", display: "block", marginBottom: 4 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width: "100%", padding: "8px 12px", background: "var(--bg3)",
                       border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 14 }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: "var(--text2)", display: "block", marginBottom: 4 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: "100%", padding: "8px 12px", background: "var(--bg3)",
                       border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 14 }} />
          </div>
          {error && <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <button type="submit" disabled={loading}
            style={{ width: "100%", padding: "10px", background: "var(--green)", color: "#fff",
                     border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14 }}>
            {loading ? "Accesso…" : "Accedi"}
          </button>
        </form>
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <a href="/auth/google" style={{ color: "var(--text2)", fontSize: 13, textDecoration: "none",
                                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <i className="ti ti-brand-google" style={{ fontSize: 16 }} /> Accedi con Google
          </a>
        </div>
      </div>
    </div>
  );
}

function NavItem({ tab, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 10,
      padding: "9px 12px", borderRadius: 8, border: "none", cursor: "pointer",
      marginBottom: 2, fontSize: 13, transition: "all 0.15s",
      background: active ? "rgba(34,197,94,0.18)" : "transparent",
      color: active ? "var(--green)" : "var(--text2)",
      fontWeight: active ? 600 : 400,
      outline: active ? "1px solid rgba(34,197,94,0.4)" : "none",
    }}>
      <i className={`ti ${tab.icon}`} style={{ fontSize: 18, flexShrink: 0 }} />
      <span style={{ flex: 1, textAlign: "left" }}>{tab.label}</span>
    </button>
  );
}

function AppShell() {
  const { user, loading, logout } = useAuth();
  const [tab, setTab] = useState(null);

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center",
                  justifyContent: "center", background: "var(--bg)" }}>
      <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 32, color: "var(--green)" }} />
    </div>
  );

  if (!user) return <Login />;

  const visibleTabs = ALL_TABS.filter(t => (TAB_ACCESS[t.id] || []).includes(user.ruolo));
  const defaultTab  = visibleTabs[0]?.id || "dashboard";
  const activeTab   = tab && visibleTabs.find(t => t.id === tab) ? tab : defaultTab;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav style={{
        width: 220, background: "var(--bg2)", borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column", flexShrink: 0,
        position: "sticky", top: 0, height: "100vh", overflowY: "auto",
      }}>
        <div style={{ padding: "18px 16px 12px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--green)",
                          display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-sparkles" style={{ fontSize: 20, color: "#fff" }} />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>GSA v2</p>
              <p style={{ fontSize: 10, color: "var(--text2)", margin: 0 }}>Gestione Spese</p>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, padding: "8px" }}>
          {visibleTabs.map(t => (
            <NavItem key={t.id} tab={t} active={activeTab === t.id} onClick={() => setTab(t.id)} />
          ))}
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)",
                      display: "flex", alignItems: "center", gap: 10 }}>
          {user.avatar_url
            ? <img src={user.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
            : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--green)",
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <i className="ti ti-user" style={{ color: "#fff", fontSize: 15 }} />
              </div>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 600, fontSize: 12, margin: 0, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.nome || user.email}
            </p>
            <p style={{ fontSize: 10, color: "var(--text2)", margin: 0 }}>
              {user.ruolo === "admin" ? "Amministratore" : user.ruolo === "editor" ? "Editor" : "Visualizzatore"}
            </p>
          </div>
          <button onClick={logout} title="Esci" style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text2)", padding: 4, borderRadius: 6,
          }}>
            <i className="ti ti-logout" style={{ fontSize: 16 }} />
          </button>
        </div>
      </nav>

      <main style={{ flex: 1, padding: 24, overflowY: "auto", minWidth: 0 }}>
        {activeTab === "dashboard"   && <DashboardV2 setTab={setTab} />}
        {activeTab === "persone"     && <PersoneV2 />}
        {activeTab === "patrimonio"  && <PatrimonioV2 />}
        {activeTab === "economia"    && <EconomiaV2 />}
        {activeTab === "riparto"     && <RipartoV2 />}
        {activeTab === "griglia"     && <GrigliaV2 />}
        {activeTab === "report"      && <ReportV2 />}
        {activeTab === "documentale" && <DocumentaleV2 />}
        {activeTab === "ruoli"       && <RuoliV2 />}
        {activeTab === "tipologie"   && <TipologieV2 />}
        {activeTab === "admin"       && <AdminV2 />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
