import { useState, useEffect } from "react";
import { documentiApi, dashboardApi } from "../api.js";
import { StatoBadge } from "../components/ui.jsx";
import { euro, mesL } from "../utils/formatters.js";

export default function Dashboard({ setTab }) {
  const [docs,      setDocs]      = useState([]);
  const [dStats,    setDStats]    = useState(null);
  const [dash,      setDash]      = useState(null);
  const [dashProp,  setDashProp]  = useState(null);

  useEffect(() => {
    Promise.all([
      documentiApi.stats(),
      documentiApi.list(),
      dashboardApi.get(),
      dashboardApi.getProprietari(),
    ]).then(([s, d, da, dp]) => {
      setDStats(s); setDocs(d); setDash(da); setDashProp(dp);
    });
  }, []);

  const ym2L = ym => ym ? mesL(ym + "-01") : "";

  const kpis = [
    dash && {
      label: "Totale Spese · Inquilini",
      value: euro(dash.totaleSpese),
      icon: "ti-receipt", color: "#a5b4fc", bg: "#1e3a5f",
      rows: dash.perAppartamento.map(a => ({ label: a.nome, value: euro(a.totaleSpese), color: "#a5b4fc" })),
    },
    dash && {
      label: "Totale Entrate · Inquilini",
      value: euro(dash.totaleVersamenti),
      icon: "ti-transfer-in", color: "#4ade80", bg: "#14532d",
      rows: dash.perAppartamento.map(a => ({ label: a.nome, value: euro(a.totaleVersamenti), color: "#4ade80" })),
    },
    dash && {
      label: "Totale Affitto · Inquilini",
      value: euro(dash.totaleAffitto),
      icon: "ti-home", color: "#fbbf24", bg: "#422006",
      rows: dash.perAppartamento.map(a => ({ label: a.nome, value: euro(a.totaleAffitto), color: "#fbbf24" })),
    },
    dash && {
      label: "Saldo Globale · Inquilini",
      value: (dash.saldoGlobale >= 0 ? "+" : "") + euro(dash.saldoGlobale),
      icon: "ti-scale",
      color: dash.saldoGlobale >= 0 ? "#4ade80" : "#f87171",
      bg:    dash.saldoGlobale >= 0 ? "#14532d" : "#7f1d1d",
      rows: dash.perAppartamento.map(a => ({
        label: a.nome,
        value: (a.saldo >= 0 ? "+" : "") + euro(a.saldo),
        color: a.saldo >= 0 ? "#4ade80" : "#f87171",
      })),
    },
    dashProp && {
      label: "Saldo Spese/Entrate Reali · Appartamenti",
      value: (dashProp.saldoReale >= 0 ? "+" : "") + euro(dashProp.saldoReale),
      icon: "ti-building",
      color: dashProp.saldoReale >= 0 ? "#34d399" : "#fb923c",
      bg:    dashProp.saldoReale >= 0 ? "#064e3b" : "#431407",
      rows: dashProp.perAppartamento.map(a => ({
        label: a.nome,
        value: (a.saldoReale >= 0 ? "+" : "") + euro(a.saldoReale),
        color: a.saldoReale >= 0 ? "#34d399" : "#fb923c",
      })),
    },
    dashProp && (() => {
      // Saldo reale per proprietario: incassato - pagato (spese effettive)
      const byProp = {};
      for (const a of dashProp.perAppartamento) {
        for (const p of a.perProprietario) {
          if (!byProp[p.id]) byProp[p.id] = { nome: p.nome, incassato: 0, pagato: 0 };
          byProp[p.id].incassato += p.incassato;
          byProp[p.id].pagato    += p.pagato;
        }
      }
      const propList = Object.values(byProp);
      const totale   = propList.reduce((s, p) => s + (p.incassato - p.pagato), 0);
      return {
        label: "Saldo Spese/Entrate Reali · Proprietari",
        value: (totale >= 0 ? "+" : "") + euro(totale),
        icon: "ti-user-circle",
        color: totale >= 0 ? "#34d399" : "#fb923c",
        bg:    totale >= 0 ? "#064e3b" : "#431407",
        rows: propList.map(p => {
          const v = Math.round((p.incassato - p.pagato) * 100) / 100;
          return { label: p.nome, value: (v >= 0 ? "+" : "") + euro(v), color: v >= 0 ? "#34d399" : "#fb923c" };
        }),
      };
    })(),
    dStats && (() => {
      const nTrans    = parseInt(dStats.n_spese_inquilini || 0) + parseInt(dStats.n_allegati_spese_prop || 0);
      const nArchivio = parseInt(dStats.n_archivio || 0);
      return {
        label: "Documenti",
        value: nTrans + nArchivio,
        icon: "ti-files", color: "#a855f7", bg: "#581c87",
        action: () => setTab("documenti"),
        rows: [
          { label: "Spese Inquilini + Prop.", value: String(nTrans),    color: "#a855f7" },
          { label: "Documentale",             value: String(nArchivio), color: "#7c3aed" },
        ],
      };
    })(),
  ].filter(Boolean);

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>
        Dashboard
        {dash && (
          <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text2)", marginLeft: 12 }}>
            fino a {ym2L(dash.periodoA)}
          </span>
        )}
      </h2>

      {/* ── KPI: 4 colonne ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} className="card" onClick={k.action}
               style={{ cursor: k.action ? "pointer" : "default", borderColor: k.color + "44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: k.bg, flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className={`ti ${k.icon}`} style={{ fontSize: 17, color: k.color }} />
              </div>
              <span style={{ fontSize: 11, color: "var(--text2)", fontWeight: 500 }}>{k.label}</span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 700, color: k.color, margin: 0,
                        marginBottom: k.rows?.length ? 8 : 0 }}>
              {k.value}
            </p>
            {k.rows?.length > 0 && (
              <div style={{ borderTop: "1px solid var(--bg3)", paddingTop: 6 }}>
                {k.rows.map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between",
                    fontSize: 11, color: "var(--text2)", padding: "2px 0" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                   maxWidth: "60%" }}>{r.label}</span>
                    <span style={{ color: r.color, fontWeight: 600, flexShrink: 0 }}>{r.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── RIEPILOGO INQUILINI + PROPRIETARI ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Inquilini */}
        <div className="card">
          <p style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>
            Riepilogo Inquilini
            <span style={{ fontSize: 10, fontWeight: 400, color: "var(--text2)", marginLeft: 8 }}>
              dal primo inquilino ad oggi
            </span>
          </p>
          {dash ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--bg3)" }}>
                  <th style={{ textAlign: "left",  padding: "4px 6px", color: "var(--text2)", fontWeight: 600 }}>Appartamento</th>
                  <th style={{ textAlign: "right", padding: "4px 6px", color: "#a5b4fc",      fontWeight: 600 }}>Spese</th>
                  <th style={{ textAlign: "right", padding: "4px 6px", color: "#4ade80",      fontWeight: 600 }}>Versato</th>
                  <th style={{ textAlign: "right", padding: "4px 6px", color: "#fbbf24",      fontWeight: 600 }}>Affitto</th>
                  <th style={{ textAlign: "right", padding: "4px 6px", color: "var(--text2)", fontWeight: 600 }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {dash.perAppartamento.map(a => (
                  <tr key={a.id} style={{ borderBottom: "1px solid var(--bg3)" }}>
                    <td style={{ padding: "6px 6px", fontWeight: 500 }}>{a.nome}</td>
                    <td style={{ padding: "6px 6px", textAlign: "right", color: "#a5b4fc" }}>{euro(a.totaleSpese)}</td>
                    <td style={{ padding: "6px 6px", textAlign: "right", color: "#4ade80" }}>{euro(a.totaleVersamenti)}</td>
                    <td style={{ padding: "6px 6px", textAlign: "right", color: "#fbbf24" }}>{euro(a.totaleAffitto)}</td>
                    <td style={{ padding: "6px 6px", textAlign: "right", fontWeight: 700,
                                 color: a.saldo >= 0 ? "#4ade80" : "#f87171" }}>
                      {a.saldo >= 0 ? "+" : ""}{euro(a.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "var(--text2)", fontSize: 12 }}>Caricamento…</p>
          )}
        </div>

        {/* Proprietari — Riparto teorico */}
        <div className="card">
          <p style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>
            Riepilogo Proprietari
            <span style={{ fontSize: 10, fontWeight: 400, color: "var(--text2)", marginLeft: 8 }}>
              (Conguaglio)
            </span>
          </p>
          {dashProp ? (() => {
            // Totali per proprietario su tutti gli appartamenti
            const totPerProp = {};
            for (const a of dashProp.perAppartamento) {
              for (const p of a.perProprietario) {
                if (!totPerProp[p.id]) totPerProp[p.id] = { nome: p.nome, dareTeorico: 0, pagato: 0, avereTeorico: 0, incassato: 0, conguaglio: 0 };
                totPerProp[p.id].dareTeorico  += p.dareTeorico;
                totPerProp[p.id].pagato       += p.pagato;
                totPerProp[p.id].avereTeorico += p.avereTeorico;
                totPerProp[p.id].incassato    += p.incassato;
                totPerProp[p.id].conguaglio   += p.conguaglio;
              }
            }
            const totals = Object.values(totPerProp);
            const thP = { padding: "4px 6px", fontWeight: 600 };
            return (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--bg3)" }}>
                    <th style={{ ...thP, textAlign: "left",  color: "var(--text2)" }}>Appartamento</th>
                    <th style={{ ...thP, textAlign: "left",  color: "var(--text2)" }}>Proprietario</th>
                    <th style={{ ...thP, textAlign: "right", color: "#f87171" }} title="Dare teorico − Pagato reale (spese inquilini + proprietari)">Δ Spese</th>
                    <th style={{ ...thP, textAlign: "right", color: "#4ade80" }} title="Avere teorico − Incassato reale">Δ Entrate</th>
                    <th style={{ ...thP, textAlign: "right", color: "#fbbf24" }} title="Dare/avere verso gli altri proprietari">Conguaglio</th>
                  </tr>
                </thead>
                <tbody>
                  {dashProp.perAppartamento.flatMap(a =>
                    a.perProprietario.map((p, i) => {
                      const dSpese   = p.dareTeorico  - p.pagato;
                      const dEntrate = p.avereTeorico - p.incassato;
                      return (
                        <tr key={p.id + a.id} style={{ borderBottom: "1px solid var(--bg3)" }}>
                          <td style={{ padding: "6px 6px", fontSize: 10, color: "var(--text2)" }}>
                            {i === 0 ? a.nome : ""}
                          </td>
                          <td style={{ padding: "6px 6px", fontWeight: 500 }}>{p.nome}</td>
                          <td style={{ padding: "6px 6px", textAlign: "right",
                                       color: dSpese >= 0 ? "#f87171" : "#34d399" }}>
                            {dSpese >= 0 ? "+" : ""}{euro(dSpese)}
                          </td>
                          <td style={{ padding: "6px 6px", textAlign: "right",
                                       color: dEntrate >= 0 ? "#4ade80" : "#fb923c" }}>
                            {dEntrate >= 0 ? "+" : ""}{euro(dEntrate)}
                          </td>
                          <td style={{ padding: "6px 6px", textAlign: "right", fontWeight: 600,
                                       color: p.conguaglio >= 0 ? "#34d399" : "#fb923c" }}>
                            {p.conguaglio >= 0 ? "+" : ""}{euro(p.conguaglio)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                  <tr><td colSpan={5} style={{ padding: "2px 0" }} /></tr>
                  {totals.map(p => {
                    const dSpese   = p.dareTeorico  - p.pagato;
                    const dEntrate = p.avereTeorico - p.incassato;
                    return (
                      <tr key={"tot_" + p.nome} style={{ borderTop: "2px solid var(--border)", background: "var(--bg3)" }}>
                        <td style={{ padding: "7px 6px", fontSize: 10, color: "var(--text2)", fontStyle: "italic" }}>Totale</td>
                        <td style={{ padding: "7px 6px", fontWeight: 700 }}>{p.nome}</td>
                        <td style={{ padding: "7px 6px", textAlign: "right", fontWeight: 700,
                                     color: dSpese >= 0 ? "#f87171" : "#34d399" }}>
                          {dSpese >= 0 ? "+" : ""}{euro(dSpese)}
                        </td>
                        <td style={{ padding: "7px 6px", textAlign: "right", fontWeight: 700,
                                     color: dEntrate >= 0 ? "#4ade80" : "#fb923c" }}>
                          {dEntrate >= 0 ? "+" : ""}{euro(dEntrate)}
                        </td>
                        <td style={{ padding: "7px 6px", textAlign: "right", fontWeight: 700, fontSize: 13,
                                     color: p.conguaglio >= 0 ? "#34d399" : "#fb923c" }}>
                          {p.conguaglio >= 0 ? "+" : ""}{euro(p.conguaglio)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })() : (
            <p style={{ color: "var(--text2)", fontSize: 12 }}>Caricamento…</p>
          )}
        </div>
      </div>

      {/* ── RIEPILOGO PROPRIETARI CASSA ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>
          Riepilogo Proprietari
          <span style={{ fontSize: 10, fontWeight: 400, color: "var(--text2)", marginLeft: 8 }}>
            uscite/entrate (Cassa)
          </span>
        </p>
        {dashProp ? (() => {
          // Totali cassa per proprietario su tutti gli appartamenti
          const totCassa = {};
          for (const a of dashProp.perAppartamento) {
            for (const p of a.perProprietario) {
              if (!totCassa[p.id]) totCassa[p.id] = { nome: p.nome, pagato: 0, incassato: 0 };
              totCassa[p.id].pagato    += p.pagato;
              totCassa[p.id].incassato += p.incassato;
            }
          }
          const totals = Object.values(totCassa);
          const thP = { padding: "4px 6px", fontWeight: 600 };
          return (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--bg3)" }}>
                  <th style={{ ...thP, textAlign: "left",  color: "var(--text2)" }}>Appartamento</th>
                  <th style={{ ...thP, textAlign: "left",  color: "var(--text2)" }}>Proprietario</th>
                  <th style={{ ...thP, textAlign: "right", color: "#f87171"  }} title="Spese effettivamente pagate">Spese Pagate</th>
                  <th style={{ ...thP, textAlign: "right", color: "#4ade80"  }} title="Versamenti effettivamente incassati">Entrate Incassate</th>
                  <th style={{ ...thP, textAlign: "right", color: "#34d399"  }} title="Entrate reali − Spese reali">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {dashProp.perAppartamento.flatMap(a =>
                  a.perProprietario.map((p, i) => {
                    const saldo = p.incassato - p.pagato;
                    return (
                      <tr key={p.id + a.id + "_c"} style={{ borderBottom: "1px solid var(--bg3)" }}>
                        <td style={{ padding: "6px 6px", fontSize: 10, color: "var(--text2)" }}>
                          {i === 0 ? a.nome : ""}
                        </td>
                        <td style={{ padding: "6px 6px", fontWeight: 500 }}>{p.nome}</td>
                        <td style={{ padding: "6px 6px", textAlign: "right", color: "#f87171" }}>{euro(p.pagato)}</td>
                        <td style={{ padding: "6px 6px", textAlign: "right", color: "#4ade80" }}>{euro(p.incassato)}</td>
                        <td style={{ padding: "6px 6px", textAlign: "right", fontWeight: 600,
                                     color: saldo >= 0 ? "#34d399" : "#fb923c" }}>
                          {saldo >= 0 ? "+" : ""}{euro(saldo)}
                        </td>
                      </tr>
                    );
                  })
                )}
                <tr><td colSpan={5} style={{ padding: "2px 0" }} /></tr>
                {totals.map(p => {
                  const saldo = p.incassato - p.pagato;
                  return (
                    <tr key={"totc_" + p.nome} style={{ borderTop: "2px solid var(--border)", background: "var(--bg3)" }}>
                      <td style={{ padding: "7px 6px", fontSize: 10, color: "var(--text2)", fontStyle: "italic" }}>Totale</td>
                      <td style={{ padding: "7px 6px", fontWeight: 700 }}>{p.nome}</td>
                      <td style={{ padding: "7px 6px", textAlign: "right", color: "#f87171", fontWeight: 700 }}>{euro(p.pagato)}</td>
                      <td style={{ padding: "7px 6px", textAlign: "right", color: "#4ade80", fontWeight: 700 }}>{euro(p.incassato)}</td>
                      <td style={{ padding: "7px 6px", textAlign: "right", fontWeight: 700, fontSize: 13,
                                   color: saldo >= 0 ? "#34d399" : "#fb923c" }}>
                        {saldo >= 0 ? "+" : ""}{euro(saldo)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        })() : (
          <p style={{ color: "var(--text2)", fontSize: 12 }}>Caricamento…</p>
        )}
      </div>

      {/* ── SALDO GLOBALE PER APPARTAMENTO / INQUILINO ── */}
      {dash && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>
            Saldo Globale · Appartamenti / Inquilini
            <span style={{ fontSize: 10, fontWeight: 400, color: "var(--text2)", marginLeft: 8 }}>
              dal primo inquilino ad oggi
            </span>
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--bg3)" }}>
                <th style={{ textAlign: "left",  padding: "4px 6px", color: "var(--text2)", fontWeight: 600 }}>Appartamento</th>
                <th style={{ textAlign: "left",  padding: "4px 6px", color: "var(--text2)", fontWeight: 600 }}>Inquilino</th>
                <th style={{ textAlign: "right", padding: "4px 6px", color: "#a5b4fc",      fontWeight: 600 }} title="Spese ripartite">Spese</th>
                <th style={{ textAlign: "right", padding: "4px 6px", color: "#4ade80",      fontWeight: 600 }} title="Versamenti effettivi">Versato</th>
                <th style={{ textAlign: "right", padding: "4px 6px", color: "#fbbf24",      fontWeight: 600 }} title="Quota affitto maturata">Affitto</th>
                <th style={{ textAlign: "right", padding: "4px 6px", color: "var(--text2)", fontWeight: 600 }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {dash.perAppartamento.flatMap(a =>
                (a.perInquilino || []).filter(c => c.saldo !== 0).map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--bg3)" }}>
                    <td style={{ padding: "6px 6px", fontSize: 10, color: "var(--text2)" }}>
                      {i === 0 ? a.nome : ""}
                    </td>
                    <td style={{ padding: "6px 6px", fontWeight: 500 }}>{c.nome}</td>
                    <td style={{ padding: "6px 6px", textAlign: "right", color: "#a5b4fc" }}>{euro(c.totaleSpese)}</td>
                    <td style={{ padding: "6px 6px", textAlign: "right", color: "#4ade80" }}>{euro(c.totaleVersato)}</td>
                    <td style={{ padding: "6px 6px", textAlign: "right", color: "#fbbf24" }}>{euro(c.totaleAffitto)}</td>
                    <td style={{ padding: "6px 6px", textAlign: "right", fontWeight: 700,
                                 color: c.saldo >= 0 ? "#4ade80" : "#f87171" }}>
                      {c.saldo >= 0 ? "+" : ""}{euro(c.saldo)}
                    </td>
                  </tr>
                ))
              )}
              {/* Riga totale per appartamento */}
              {dash.perAppartamento.map(a => (
                <tr key={"tot_" + a.id} style={{ borderTop: "2px solid var(--border)", background: "var(--bg3)" }}>
                  <td style={{ padding: "7px 6px", fontWeight: 700 }}>{a.nome}</td>
                  <td style={{ padding: "7px 6px", fontSize: 10, color: "var(--text2)", fontStyle: "italic" }}>Totale</td>
                  <td style={{ padding: "7px 6px", textAlign: "right", color: "#a5b4fc", fontWeight: 700 }}>{euro(a.totaleSpese)}</td>
                  <td style={{ padding: "7px 6px", textAlign: "right", color: "#4ade80", fontWeight: 700 }}>{euro(a.totaleVersamenti)}</td>
                  <td style={{ padding: "7px 6px", textAlign: "right", color: "#fbbf24", fontWeight: 700 }}>{euro(a.totaleAffitto)}</td>
                  <td style={{ padding: "7px 6px", textAlign: "right", fontWeight: 700, fontSize: 13,
                               color: a.saldo >= 0 ? "#4ade80" : "#f87171" }}>
                    {a.saldo >= 0 ? "+" : ""}{euro(a.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── DOCUMENTI RECENTI ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>Documenti Recenti</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
          {docs.slice(0, 8).map(d => (
            <div key={d.id} style={{ display: "flex", justifyContent: "space-between",
                                     alignItems: "center", padding: "6px 8px",
                                     background: "var(--bg2)", borderRadius: 6 }}>
              <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                <p style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis",
                             whiteSpace: "nowrap", fontSize: 12, margin: 0 }}>{d.nome_file}</p>
                <p style={{ fontSize: 11, color: "var(--text2)", margin: 0 }}>
                  {d.appartamento_nome || "—"} · {mesL(d.periodo_da)}
                </p>
              </div>
              <StatoBadge stato={d.stato} />
            </div>
          ))}
        </div>
      </div>

      {/* ── AFFITTI SCOPERTI ── */}
      {dash && (() => {
        const appartamentiConScoperti = dash.perAppartamento.filter(a =>
          a.mesiScoperti.length > 0
        );
        if (appartamentiConScoperti.length === 0) return null;
        return (
          <div className="card" style={{ marginBottom: 16 }}>
            <p style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>
              <i className="ti ti-alert-triangle" style={{ color: "#eab308", marginRight: 6 }} />
              Affitti Scoperti
              <span style={{ fontSize: 10, fontWeight: 400, color: "var(--text2)", marginLeft: 8 }}>
                dal primo inquilino → {ym2L(dash.periodoA)}
              </span>
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {appartamentiConScoperti.map(a => (
                <div key={a.id} style={{
                  background: "var(--bg2)", borderRadius: 8, padding: 12,
                  border: "1px solid rgba(234,179,8,0.3)",
                }}>
                  <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 8px" }}>
                    <i className="ti ti-building" style={{ marginRight: 4, color: "#fbbf24" }} />
                    {a.nome}
                  </p>
                  {a.mesiScoperti.map(ms => (
                    <div key={ms.componenteId} style={{ marginBottom: 8 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text2)", margin: "0 0 4px" }}>
                        <i className="ti ti-user" style={{ marginRight: 3 }} />
                        {ms.componenteLabel}
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {ms.mesi.map(m => (
                          <span key={m} style={{
                            background: "rgba(234,179,8,0.15)", color: "#eab308",
                            border: "1px solid rgba(234,179,8,0.4)",
                            borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 600,
                          }}>
                            {ym2L(m)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── STATO DOCUMENTI ── */}
      {dStats && (
        <div className="card">
          <p style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>Stato Documenti</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            {[
              { label: "Elaborati",     v: dStats.elaborati,     color: "var(--green)"  },
              { label: "Da verificare", v: dStats.da_verificare, color: "var(--yellow)" },
              { label: "Errori",        v: dStats.errori,        color: "var(--red)"    },
              { label: "Duplicati",     v: dStats.duplicati,     color: "var(--purple)" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center", padding: "12px 8px",
                                          background: "var(--bg3)", borderRadius: 8 }}>
                <p style={{ fontSize: 28, fontWeight: 700, color: s.color, margin: 0 }}>
                  {parseInt(s.v) || 0}
                </p>
                <p style={{ fontSize: 11, color: "var(--text2)", marginTop: 2, marginBottom: 0 }}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
