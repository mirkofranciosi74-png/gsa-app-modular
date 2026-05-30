import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";

// ── Tab legacy ─────────────────────────────────────────────────────────────────
import Login           from "./tabs/Login.jsx";
import Dashboard       from "./tabs/Dashboard.jsx";
import Appartamenti    from "./tabs/appartamenti.jsx";
import { Componenti }        from "./tabs/componenti.jsx";
import { Tipologie }         from "./tabs/tipologie.jsx";
import { Riparti }           from "./tabs/riparti.jsx";
import { Griglia }           from "./tabs/griglia.jsx";
import { Report }            from "./tabs/report.jsx";
import { Documenti }         from "./tabs/documenti.jsx";
import { Versamenti }        from "./tabs/versamenti.jsx";
import { Proprietari }       from "./tabs/Proprietari.jsx";
import { Documentale }       from "./tabs/Documentale.jsx";
import { Admin }             from "./tabs/Admin.jsx";
import { SpeseProprietari }  from "./tabs/SpeseProprietari.jsx";
import { GestioneUtenti }    from "./tabs/GestioneUtenti.jsx";
import { GestioneRuoli }     from "./tabs/GestioneRuoli.jsx";


// ── Accesso per ruolo ──────────────────────────────────────────────────────────
const TAB_ACCESS = {
  // legacy
  dashboard:         ["admin", "editor"],
  griglia:           ["admin", "editor", "viewer"],
  report:            ["admin", "editor", "viewer"],
  appartamenti:      ["admin"],
  proprietari:       ["admin"],
  componenti:        ["admin"],
  documenti:         ["admin", "editor"],
  spese_proprietari: ["admin", "editor"],
  movimenti:         ["admin", "editor"],
  riparti:           ["admin"],
  documentale:       ["admin", "editor"],
  admin:             ["admin"],
  utenti:            ["admin"],
  ruoli:             ["admin"],
};

// section: "legacy" | "v2"
const ALL_TABS = [
  // ── Legacy ────────────────────────────────────────────────────────────────────
  { id: "dashboard",         label: "Dashboard",          icon: "ti-layout-dashboard", section: "legacy" },
  { id: "griglia",           label: "Griglia Economica",  icon: "ti-table",            section: "legacy" },
  { id: "report",            label: "Report",             icon: "ti-chart-bar",        section: "legacy" },
  { id: "appartamenti",      label: "Appartamenti",       icon: "ti-building",         section: "legacy" },
  { id: "proprietari",       label: "Proprietari",        icon: "ti-user-circle",      section: "legacy" },
  { id: "componenti",        label: "Inquilini",          icon: "ti-users",            section: "legacy" },
  { id: "documenti",         label: "Spese Inquilini",    icon: "ti-files",            section: "legacy" },
  { id: "spese_proprietari", label: "Spese Proprietari",  icon: "ti-receipt",          section: "legacy" },
  { id: "movimenti",         label: "Entrate",            icon: "ti-transfer-in",      section: "legacy" },
  { id: "riparti",           label: "Riparti",            icon: "ti-adjustments-alt",  section: "legacy" },
  { id: "documentale",       label: "Documentale",        icon: "ti-archive",          section: "legacy" },
  { id: "admin",             label: "Amministrazione",    icon: "ti-settings",         section: "legacy" },
  { id: "utenti",            label: "Gestione Utenti",    icon: "ti-users-group",      section: "legacy" },
  { id: "ruoli",             label: "Gestione Ruoli",     icon: "ti-shield-lock",      section: "legacy" },
];

function NavItem({ tab, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 10,
      padding: "9px 12px", borderRadius: 8, border: "none", cursor: "pointer",
      marginBottom: 2, fontSize: 13, transition: "all 0.15s",
      background: active ? "var(--accent)" : "transparent",
      color: active ? "#fff" : "var(--text2)",
      fontWeight: active ? 600 : 400,
    }}>
      <i className={`ti ${tab.icon}`} style={{ fontSize: 18, flexShrink: 0 }} />
      <span style={{ flex: 1, textAlign: "left" }}>{tab.label}</span>
    </button>
  );
}


// ── Shell principale ───────────────────────────────────────────────────────────
function AppShell() {
  const { user, loading, logout } = useAuth();
  const [tab, setTab] = useState(null);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center",
                    justifyContent: "center", background: "var(--bg)" }}>
        <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 32, color: "var(--accent)" }} />
      </div>
    );
  }

  if (!user) return <Login />;

  const visibleTabs = ALL_TABS.filter(t => (TAB_ACCESS[t.id] || []).includes(user.ruolo));
  const defaultTab  = visibleTabs[0]?.id || "griglia";
  const activeTab   = tab && visibleTabs.find(t => t.id === tab) ? tab : defaultTab;

  function renderNavItems() {
    return visibleTabs.map(t => (
      <NavItem key={t.id} tab={t} active={activeTab === t.id} onClick={() => setTab(t.id)} />
    ));
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* ── Sidebar ── */}
      <nav style={{
        width: 220, background: "var(--bg2)", borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column", flexShrink: 0,
        position: "sticky", top: 0, height: "100vh", overflowY: "auto",
      }}>
        {/* Logo */}
        <div style={{ padding: "18px 16px 12px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8, background: "var(--accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <i className="ti ti-home-2" style={{ fontSize: 20, color: "#fff" }} />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>GSA</p>
              <p style={{ fontSize: 10, color: "var(--text2)", margin: 0 }}>Gestione Spese</p>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <div style={{ flex: 1, padding: "8px" }}>
          {renderNavItems()}
        </div>

        {/* Footer utente */}
        <div style={{
          padding: "12px 16px", borderTop: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          {user.avatar_url
            ? <img src={user.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
            : <div style={{
                width: 32, height: 32, borderRadius: "50%", background: "var(--accent)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <i className="ti ti-user" style={{ color: "#fff", fontSize: 15 }} />
              </div>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 600, fontSize: 12, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

      {/* ── Main content ── */}
      <main style={{ flex: 1, padding: 24, overflowY: "auto", minWidth: 0 }}>
        {/* Legacy */}
        {activeTab === "dashboard"         && <Dashboard    setTab={setTab} />}
        {activeTab === "appartamenti"      && <Appartamenti />}
        {activeTab === "componenti"        && <Componenti />}
        {activeTab === "proprietari"       && <Proprietari />}
        {activeTab === "documenti"         && <Documenti />}
        {activeTab === "spese_proprietari" && <SpeseProprietari />}
        {activeTab === "movimenti"         && <Versamenti />}
        {activeTab === "riparti"           && <Riparti />}
        {activeTab === "griglia"           && <Griglia />}
        {activeTab === "report"            && <Report />}
        {activeTab === "documentale"       && <Documentale />}
        {activeTab === "admin"             && <Admin />}
        {activeTab === "utenti"            && <GestioneUtenti />}
        {activeTab === "ruoli"             && <GestioneRuoli />}
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
