import { useState } from "react";

import Dashboard    from "./tabs/Dashboard.jsx";
import Appartamenti from "./tabs/appartamenti.jsx";
import { Componenti }   from "./tabs/componenti.jsx";
import { Tipologie }    from "./tabs/tipologie.jsx";
import { Riparti }      from "./tabs/riparti.jsx";
import { Griglia }      from "./tabs/griglia.jsx";
import { Report }       from "./tabs/report.jsx";
import { Documenti }    from "./tabs/documenti.jsx";
import { Versamenti }   from "./tabs/versamenti.jsx";
import { Proprietari }        from "./tabs/Proprietari.jsx";
import { Documentale }        from "./tabs/Documentale.jsx";
import { Admin }              from "./tabs/Admin.jsx";
import { SpeseProprietari }   from "./tabs/SpeseProprietari.jsx";

const TABS = [
  { id: "dashboard",    label: "Dashboard",       icon: "ti-layout-dashboard" },
  { id: "griglia",      label: "Griglia Economica",icon: "ti-table"           },
  { id: "report",       label: "Report",          icon: "ti-chart-bar"        },
  { id: "appartamenti", label: "Appartamenti",    icon: "ti-building"         },
  { id: "proprietari",  label: "Proprietari",     icon: "ti-user-circle"      },
  { id: "componenti",   label: "Inquilini",       icon: "ti-users"            },
  { id: "documenti",         label: "Spese Inquilini",  icon: "ti-files"            },
  { id: "spese_proprietari", label: "Spese Proprietari", icon: "ti-receipt"         },
  { id: "movimenti",         label: "Entrate",           icon: "ti-transfer-in"      },
  { id: "riparti",      label: "Riparti",         icon: "ti-adjustments-alt"  },
  { id: "documentale",  label: "Documentale",     icon: "ti-archive"          },
  { id: "admin",        label: "Amministrazione", icon: "ti-settings"         },
];

export default function App() {
  const [tab, setTab] = useState("dashboard");

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* ── Sidebar ───────────────────────────────────────────── */}
      <nav style={{
        width: 220, background: "var(--bg2)", borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column", flexShrink: 0,
        position: "sticky", top: 0, height: "100vh", overflowY: "auto",
      }}>
        <div style={{ padding: "18px 16px 12px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--accent)",
                          display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-home-2" style={{ fontSize: 20, color: "#fff" }} />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>GSA</p>
              <p style={{ fontSize: 10, color: "var(--text2)", margin: 0 }}>Gestione Spese</p>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, padding: "8px" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", borderRadius: 8, border: "none", cursor: "pointer",
              marginBottom: 2, fontSize: 13, transition: "all 0.15s",
              background: tab === t.id ? "var(--accent)" : "transparent",
              color:      tab === t.id ? "#fff" : "var(--text2)",
              fontWeight: tab === t.id ? 600 : 400,
            }}>
              <i className={`ti ${t.icon}`} style={{ fontSize: 18, flexShrink: 0 }} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Contenuto principale ──────────────────────────────── */}
      <main style={{ flex: 1, padding: 24, overflowY: "auto", minWidth: 0 }}>
        {tab === "dashboard"    && <Dashboard    setTab={setTab} />}
        {tab === "appartamenti" && <Appartamenti />}
        {tab === "componenti"   && <Componenti />}
        {tab === "proprietari"  && <Proprietari />}
        {tab === "documenti"         && <Documenti />}
        {tab === "spese_proprietari" && <SpeseProprietari />}
        {tab === "movimenti"         && <Versamenti />}
        {tab === "riparti"      && <Riparti />}
        {tab === "griglia"      && <Griglia />}
        {tab === "report"       && <Report />}
        {tab === "documentale"  && <Documentale />}
        {tab === "admin"        && <Admin />}
      </main>
    </div>
  );
}
