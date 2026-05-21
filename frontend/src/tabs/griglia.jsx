import React, { useState, useEffect } from "react";
import { appartamentiApi, movimentiApi, grigliaApi } from "../api.js";
import { Btn, Field, SectionHeader } from "../components/ui.jsx";
import { euro, mesL, toISO } from "../utils/formatters.js";

export function Griglia() {
  const [apps,        setApps]   = useState([]);
  const [selApp,      setSelApp] = useState("");
  const [inquilini,   setInquilini] = useState([]);
  const [pDA,         setPDA]    = useState("");
  const [pA,          setPA]     = useState("");
  const [dati,        setDati]   = useState(null);
  const [datiProp,    setDatiProp] = useState(null);
  const [loading,     setLoad]   = useState(false);
  const [exporting,   setExport] = useState(false);
  const [errore,      setErr]    = useState(null);
  const [sintetico,     setSintetico]   = useState(false);
  const [modoProp,      setModoProp]    = useState(false);
  const [selInquilino,  setSelInquilino] = useState("");

  useEffect(() => { appartamentiApi.list().then(setApps); }, []);

  useEffect(() => {
    setSelInquilino("");
    if (!selApp) { setInquilini([]); return; }
    appartamentiApi.get(selApp).then(a => {
      const comps = (a.componenti || [])
        .filter(c => c.validita_da || c.validita_a)
        .sort((a, b) => (a.nome + (a.cognome||"")).localeCompare(b.nome + (b.cognome||"")));
      setInquilini(comps);
    });
  }, [selApp]);

  function selezionaInquilino(compId) {
    setSelInquilino(compId);
    if (!compId) return;
    const c = inquilini.find(x => x.id === compId);
    if (!c) return;
    setPDA(c.validita_da ? c.validita_da.slice(0, 7) : "");
    setPA(c.validita_a  ? c.validita_a.slice(0, 7)  : "");
  }

  async function calcola() {
    if (!selApp) return;
    setLoad(true); setErr(null); setDati(null); setDatiProp(null);
    try {
      const [d, dp] = await Promise.all([
        grigliaApi.get({ appartamentoId: selApp, periodoDA: pDA || undefined, periodoA: pA || undefined, componenteId: selInquilino || undefined }),
        grigliaApi.getProprietari({ appartamentoId: selApp, periodoDA: pDA || undefined, periodoA: pA || undefined }),
      ]);
      setDati(d);
      setDatiProp(dp);
    } catch (e) { setErr(e.message); }
    finally { setLoad(false); }
  }

  async function esportaZip() {
    setExport(true);
    try {
      await grigliaApi.downloadZip({
        appartamentoId: selApp,
        periodoDA: pDA || undefined,
        periodoA:  pA  || undefined,
      });
    } catch (e) { alert("Errore export: " + e.message); }
    finally { setExport(false); }
  }

  const ym2L = ym => ym ? mesL(ym + "-01") : "";

  const thS = {
    padding: "9px 10px", fontWeight: 600, fontSize: 11,
    background: "var(--bg3)", whiteSpace: "nowrap",
  };

  return (
    <div>
      <SectionHeader title="Griglia Economica" />

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto auto auto", gap: 12, alignItems: "flex-end" }}>
          <Field label="Appartamento">
            <select value={selApp} onChange={e => setSelApp(e.target.value)}>
              <option value="">-- Seleziona --</option>
              {apps.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </Field>
          <Field label="Periodo da">
            <input type="month" value={pDA} onChange={e => setPDA(e.target.value)} />
          </Field>
          <Field label="Periodo a">
            <input type="month" value={pA}  onChange={e => setPA(e.target.value)} />
          </Field>
          <Btn variant="primary" onClick={calcola} disabled={!selApp || loading}>
            <i className="ti ti-calculator" />{loading ? "Calcolo…" : "Calcola"}
          </Btn>
          {dati && (
            <Btn variant="secondary" onClick={esportaZip} disabled={exporting}
              title="Scarica Excel + PDF allegati">
              <i className="ti ti-file-zip" />{exporting ? "Export…" : "ZIP"}
            </Btn>
          )}
          {dati && (
            <Btn variant={modoProp ? "primary" : "secondary"}
              onClick={() => setModoProp(s => !s)}
              title="Modalità proprietari: pagato/incassato per proprietario">
              <i className="ti ti-user-circle" />
              {modoProp ? "Inquilini" : "Proprietari"}
            </Btn>
          )}
          {dati && !modoProp && (
            <Btn variant={sintetico ? "primary" : "secondary"}
              onClick={() => setSintetico(s => !s)}
              title="Vista sintetica: raggruppa versamenti per tipo e mese">
              <i className="ti ti-table-options" />
              {sintetico ? "Dettaglio" : "Sintetico"}
            </Btn>
          )}
        </div>
        {inquilini.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--text2)", whiteSpace: "nowrap" }}>
              <i className="ti ti-user-search" style={{ marginRight: 4 }} />
              Filtro per inquilino:
            </span>
            <select
              value={selInquilino}
              onChange={e => selezionaInquilino(e.target.value)}
              style={{ flex: 1, maxWidth: 280 }}
            >
              <option value="">— seleziona inquilino per impostare il periodo —</option>
              {inquilini.map(c => {
                const da = c.validita_da ? c.validita_da.slice(0, 7) : null;
                const a  = c.validita_a  ? c.validita_a.slice(0, 7)  : null;
                const periodo = da || a
                  ? ` (${da ? ym2L(da) : "…"} → ${a ? ym2L(a) : "oggi"})`
                  : "";
                return (
                  <option key={c.id} value={c.id}>
                    {c.nome} {c.cognome || ""}{periodo}
                  </option>
                );
              })}
            </select>
            <span style={{ fontSize: 11, color: "var(--text2)" }}>
              → imposta periodo e premi Calcola
            </span>
          </div>
        )}
      </div>

      {!selApp && !dati && (
        <div className="alert alert-info">
          <i className="ti ti-info-circle" />
          Seleziona un appartamento e il periodo, poi premi Calcola.
        </div>
      )}
      {errore && (
        <div className="alert alert-danger">
          <i className="ti ti-alert-circle" />{errore}
        </div>
      )}

      {dati && modoProp && datiProp && (() => {
        const { props: propList,
                righeDocumenti: righeDocRaw, righeMovimenti: righeMovRaw,
                totaliDareTeorico, totaliAvereTeorico,
                totaliPagato, totaliIncassato } = datiProp;

        const righeDocumenti = righeDocRaw.filter(r =>
          Object.values(r.quote).some(v => v !== 0) || r.pagato_da_proprietario_id
        );
        const righeMovimenti = righeMovRaw.filter(r =>
          Object.values(r.quoteReale).some(v => v !== 0) ||
          (r.quoteTeorica && Object.values(r.quoteTeorica).some(v => v !== 0))
        );

        if (!propList || propList.length === 0) return (
          <div className="alert alert-warn">
            <i className="ti ti-alert-triangle" />
            Nessun proprietario associato a questo appartamento nel periodo.
          </div>
        );

        const nCols = 2 + propList.length;
        const thP   = { padding: "9px 10px", fontWeight: 600, fontSize: 11, background: "var(--bg3)", whiteSpace: "nowrap" };
        const tdN   = (color, bold, bg) => ({
          padding: "7px 10px", textAlign: "right",
          fontWeight: bold ? 700 : 500, color: color || "var(--text)",
          background: bg || "transparent", whiteSpace: "nowrap",
        });

        const SepP = ({ label, color }) => (
          <tr>
            <td colSpan={nCols} style={{
              padding: "6px 10px", fontWeight: 700, fontSize: 12, color,
              background: "var(--bg2)", borderTop: "2px solid var(--border)", borderBottom: "1px solid var(--border)",
            }}>{label}</td>
          </tr>
        );

        // conguaglio per proprietario: pagato - incassato - dare_teorico + avere_teorico
        const conguaglio = {};
        let totCong = 0;
        for (const p of propList) {
          const pid = p.proprietario_id;
          const v = (totaliPagato[pid]||0) - (totaliIncassato[pid]||0)
                  - (totaliDareTeorico[pid]||0) + (totaliAvereTeorico[pid]||0);
          conguaglio[pid] = v;
          totCong += v;
        }

        const TV_COLOR = { affitto:"#4ade80", conguaglio:"#c084fc", rimborso:"#f87171", altro:"#94a3b8" };
        const TV_LABEL = { affitto:"Affitto", conguaglio:"Conguaglio", rimborso:"Rimborso", altro:"Altro" };

        return (
          <div style={{ overflowX: "auto" }}>
            <div className="alert alert-info" style={{ marginBottom: 12, fontSize: 12 }}>
              <i className="ti ti-info-circle" />
              Conguaglio = Pagato reale − Incassato reale − Dare teorico + Avere teorico
            </div>
            <table style={{ minWidth: 500, borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...thP, textAlign: "left", minWidth: 220 }}>Voce</th>
                  <th style={{ ...thP, textAlign: "right", minWidth: 110 }}>Importo</th>
                  {propList.map(p => (
                    <th key={p.proprietario_id} style={{ ...thP, textAlign: "right", minWidth: 120 }}>
                      {p.proprietario_nome} {p.proprietario_cognome || ""}
                      <br />
                      <span style={{ fontWeight: 400, fontSize: 10, color: "var(--text2)" }}>
                        {parseFloat(p.percentuale_proprieta).toFixed(1)}%
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* ── SPESE ── */}
                <SepP label="▼  SPESE — quota teorica a carico dei proprietari" color="#f87171" />
                {righeDocumenti.length === 0
                  ? <tr><td colSpan={nCols} style={{ padding: 10, color: "var(--text2)", fontSize: 12 }}>Nessuna spesa nel periodo.</td></tr>
                  : righeDocumenti.map((r, i) => {
                    const pagante = r.pagato_da_proprietario_id
                      ? propList.find(x => x.proprietario_id === r.pagato_da_proprietario_id)
                      : null;
                    return (
                      <React.Fragment key={"d"+i}>
                        {/* riga quota teorica */}
                        <tr style={{ borderBottom: pagante ? "none" : "1px solid var(--bg3)" }}>
                          <td style={{ padding: "7px 10px" }}>
                            <p style={{ fontWeight: 600, margin: 0, fontSize: 13 }}>{r.tipo_descrizione}</p>
                            {r.fornitore && <p style={{ fontSize: 10, color: "var(--text2)", margin: "2px 0 0" }}>{r.fornitore}</p>}
                            <p style={{ fontSize: 10, color: "var(--text2)", margin: "2px 0 0", fontStyle: "italic" }}>Quota teorica</p>
                          </td>
                          <td style={{ ...tdN("#a5b4fc", true, "rgba(99,102,241,0.07)") }}>{euro(r.importo)}</td>
                          {propList.map(p => {
                            const q = r.quote[p.proprietario_id] || 0;
                            return (
                              <td key={p.proprietario_id} style={{ ...tdN(q !== 0 ? "var(--text)" : "var(--text2)") }}>
                                {q !== 0 ? euro(q) : <span style={{ opacity: 0.25 }}>—</span>}
                              </td>
                            );
                          })}
                        </tr>
                        {/* sub-riga: chi ha pagato effettivamente */}
                        <tr style={{ borderBottom: "1px solid var(--bg3)", background: "rgba(165,180,252,0.04)" }}>
                          <td style={{ padding: "4px 10px 6px 20px", fontSize: 11, color: "#a5b4fc" }}>
                            <i className="ti ti-credit-card" style={{ marginRight: 4 }} />
                            {pagante ? `Pagato da: ${pagante.proprietario_nome}` : "Pagante non registrato"}
                          </td>
                          <td style={{ ...tdN("#a5b4fc", false), fontSize: 11 }}>{euro(r.importo)}</td>
                          {propList.map(p => {
                            const isPagante = p.proprietario_id === r.pagato_da_proprietario_id;
                            return (
                              <td key={p.proprietario_id} style={{ ...tdN(isPagante ? "#a5b4fc" : "var(--text2)", isPagante), fontSize: 11 }}>
                                {isPagante ? euro(r.importo) : <span style={{ opacity: 0.25 }}>—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      </React.Fragment>
                    );
                  })
                }
                <tr style={{ background: "rgba(239,68,68,0.08)", borderTop: "2px solid var(--border)" }}>
                  <td colSpan={2} style={{ padding: "9px 10px", fontWeight: 700, fontSize: 13 }}>Totale dare teorico</td>
                  {propList.map(p => (
                    <td key={p.proprietario_id} style={{ ...tdN("#f87171", true) }}>
                      {euro(totaliDareTeorico[p.proprietario_id] || 0)}
                    </td>
                  ))}
                </tr>
                <tr style={{ background: "rgba(165,180,252,0.06)", borderTop: "1px solid var(--border)" }}>
                  <td colSpan={2} style={{ padding: "7px 10px", fontSize: 12, color: "var(--text2)", fontStyle: "italic" }}>
                    ↳ Pagato effettivamente
                  </td>
                  {propList.map(p => (
                    <td key={p.proprietario_id} style={{ ...tdN("#a5b4fc", false) }}>
                      {totaliPagato[p.proprietario_id] ? euro(totaliPagato[p.proprietario_id]) : <span style={{ opacity: 0.3 }}>—</span>}
                    </td>
                  ))}
                </tr>

                {/* ── VERSAMENTI ── */}
                <SepP label="▼  VERSAMENTI — incassato per proprietario" color="#4ade80" />
                {righeMovimenti.length === 0
                  ? <tr><td colSpan={nCols} style={{ padding: 10, color: "var(--text2)", fontSize: 12 }}>Nessun versamento nel periodo.</td></tr>
                  : righeMovimenti.map((r, i) => {
                    const col = TV_COLOR[r.tipo_versamento] || "#4ade80";
                    return (
                      <React.Fragment key={"m"+i}>
                        {/* riga incassato reale */}
                        <tr style={{ borderBottom: "none" }}>
                          <td style={{ padding: "7px 10px" }}>
                            <p style={{ fontWeight: 600, margin: 0, fontSize: 13, color: col }}>
                              {TV_LABEL[r.tipo_versamento] || r.tipo_versamento}
                              {r.mese ? <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text2)", marginLeft: 6 }}>
                                {ym2L(r.mese)}{r.periodo_a ? ` → ${ym2L(r.periodo_a)}` : ""}
                              </span> : null}
                            </p>
                            {r.comp_label && <p style={{ fontSize: 10, color: "var(--text2)", margin: "2px 0 0" }}>{r.comp_label}</p>}
                            <p style={{ fontSize: 10, color: "var(--text2)", margin: "2px 0 0", fontStyle: "italic" }}>Incassato reale</p>
                          </td>
                          <td style={{ ...tdN(col, true, "rgba(74,222,128,0.05)") }}>{euro(r.importo)}</td>
                          {propList.map(p => {
                            const q = r.quoteReale[p.proprietario_id] || 0;
                            return (
                              <td key={p.proprietario_id} style={{ ...tdN(q !== 0 ? col : "var(--text2)", q !== 0) }}>
                                {q !== 0 ? euro(q) : <span style={{ opacity: 0.25 }}>—</span>}
                              </td>
                            );
                          })}
                        </tr>
                        {/* sub-riga quota teorica */}
                        <tr style={{ borderBottom: "1px solid var(--bg3)", background: "rgba(251,191,36,0.04)" }}>
                          <td style={{ padding: "4px 10px 6px 20px", fontSize: 11, color: "#fbbf24" }}>
                            <i className="ti ti-calculator" style={{ marginRight: 4 }} />
                            Quota teorica (riparto)
                          </td>
                          <td style={{ ...tdN("#fbbf24", false), fontSize: 11 }}>{euro(r.importo)}</td>
                          {propList.map(p => {
                            const qt = r.quoteTeorica[p.proprietario_id] || 0;
                            return (
                              <td key={p.proprietario_id} style={{ ...tdN(qt !== 0 ? "#fbbf24" : "var(--text2)", false), fontSize: 11 }}>
                                {qt !== 0 ? euro(qt) : <span style={{ opacity: 0.25 }}>—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      </React.Fragment>
                    );
                  })
                }
                <tr style={{ background: "rgba(74,222,128,0.08)", borderTop: "2px solid var(--border)" }}>
                  <td colSpan={2} style={{ padding: "9px 10px", fontWeight: 700, fontSize: 13 }}>Totale incassato reale</td>
                  {propList.map(p => (
                    <td key={p.proprietario_id} style={{ ...tdN("#4ade80", true) }}>
                      {euro(totaliIncassato[p.proprietario_id] || 0)}
                    </td>
                  ))}
                </tr>
                <tr style={{ background: "rgba(251,191,36,0.05)", borderTop: "1px solid var(--border)" }}>
                  <td colSpan={2} style={{ padding: "7px 10px", fontSize: 12, color: "var(--text2)", fontStyle: "italic" }}>
                    ↳ Avere teorico (% sul totale versato)
                  </td>
                  {propList.map(p => (
                    <td key={p.proprietario_id} style={{ ...tdN("#fbbf24", false) }}>
                      {euro(totaliAvereTeorico[p.proprietario_id] || 0)}
                    </td>
                  ))}
                </tr>

                {/* ── CONGUAGLIO ── */}
                <tr style={{ background: "var(--bg3)", borderTop: "2px solid var(--border)" }}>
                  <td colSpan={2} style={{ padding: "11px 10px", fontWeight: 700, fontSize: 14 }}>Conguaglio finale</td>
                  {propList.map(p => {
                    const v = conguaglio[p.proprietario_id] || 0;
                    return (
                      <td key={p.proprietario_id}
                        title={[
                          `Pagato: ${euro(totaliPagato[p.proprietario_id]||0)}`,
                          `Incassato: ${euro(totaliIncassato[p.proprietario_id]||0)}`,
                          `Dare teorico: ${euro(totaliDareTeorico[p.proprietario_id]||0)}`,
                          `Avere teorico: ${euro(totaliAvereTeorico[p.proprietario_id]||0)}`,
                          `─────`,
                          `Conguaglio: ${v>=0?"+":""}${euro(v)}`,
                        ].join('\n')}
                        style={{ padding: "11px 10px", textAlign: "right", fontWeight: 700, fontSize: 14,
                                 color: v >= 0 ? "#4ade80" : "#f87171", cursor: "help" }}>
                        {v >= 0 ? "+" : ""}{euro(v)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })()}

      {dati && !modoProp && (() => {
        const { comps,
                righeDocumenti: righeDocRaw, righeMovimenti: righeMovRaw,
                totaliDovuto, totaliVersato } = dati;

        const righeDocumenti = righeDocRaw.filter(r =>
          Object.values(r.quote).some(v => v !== 0)
        );
        const righeMovimenti = righeMovRaw.filter(r =>
          Object.values(r.quote).some(v => v !== 0)
        );

        if (!comps || comps.length === 0)
          return (
            <div className="alert alert-warn">
              <i className="ti ti-alert-triangle" />
              Nessun componente attivo nel periodo.
            </div>
          );

        const mesiGriglia = (() => {
          if (!pDA && !pA) return [];
          const da = pDA || "2000-01";
          const a  = pA  || new Date().toISOString().slice(0,7);
          const result = [];
          let [y, m] = da.split("-").map(Number);
          const [ya, ma] = a.split("-").map(Number);
          while (y < ya || (y === ya && m <= ma)) {
            result.push(`${y}-${String(m).padStart(2,"0")}`);
            m++; if (m > 12) { m = 1; y++; }
          }
          return result;
        })();

        const righeAffitto = mesiGriglia.map(mese => {
          const quoteAff = {};
          for (const c of comps) {
            const cDa = c.validita_da ? (c.validita_da.slice ? c.validita_da.slice(0,7) : String(c.validita_da).slice(0,7)) : "2000-01";
            const cA  = c.validita_a  ? (c.validita_a.slice  ? c.validita_a.slice(0,7)  : String(c.validita_a).slice(0,7))  : "2999-12";
            const attivo = mese >= cDa && mese <= cA;
            quoteAff[c.id] = attivo && parseFloat(c.quota_affitto || 0) > 0
              ? parseFloat(c.quota_affitto)
              : 0;
          }
          return { mese, quote: quoteAff };
        }).filter(r => Object.values(r.quote).some(v => v > 0));

        const totaliAffitto = {};
        for (const c of comps) {
          totaliAffitto[c.id] = righeAffitto.reduce((s, r) => s + (r.quote[c.id] || 0), 0);
        }
        const totAff = comps.reduce((s, c) => s + (totaliAffitto[c.id] || 0), 0);

        // Conguaglio = Versato - Dovuto(spese) - Affitto
        const conguagliCorretti = {};
        for (const c of comps) {
          conguagliCorretti[c.id] =
            (totaliVersato[c.id]  || 0) -
            (totaliDovuto[c.id]   || 0) -
            (totaliAffitto[c.id]  || 0);
        }

        const compsVisibili = comps.filter(c =>
          (totaliDovuto[c.id]      || 0) !== 0 ||
          (totaliVersato[c.id]     || 0) !== 0 ||
          (conguagliCorretti[c.id] || 0) !== 0 ||
          (totaliAffitto[c.id]     || 0) !== 0
        );
        const compsNascosti = comps.filter(c => !compsVisibili.includes(c));

        const totD = compsVisibili.reduce((s, c) => s + (totaliDovuto[c.id]  || 0), 0);
        const totV = compsVisibili.reduce((s, c) => s + (totaliVersato[c.id] || 0), 0);
        const totC = compsVisibili.reduce((s, c) => s + (conguagliCorretti[c.id] || 0), 0);
        const totFattureNelFiltro = righeDocumenti.reduce((s, r) => s + (r.importo || 0), 0);

        const TV_LABEL = { affitto:"Affitto", conguaglio:"Conguaglio", rimborso:"Rimborso", altro:"Altro" };
        const TV_COLOR = { affitto:"#4ade80", conguaglio:"#c084fc", rimborso:"#f87171", altro:"#94a3b8" };

        const righeSintetiche = (() => {
          const gruppi = new Map();
          for (const r of righeMovimenti) {
            const tipo = r.tipo_versamento || "affitto";
            const mese = r.mese_riferimento || r.periodo_da;
            const key  = `${tipo}::${mese}`;
            if (!gruppi.has(key)) {
              const quote = {};
              for (const c of comps) quote[c.id] = 0;
              gruppi.set(key, { tipo, mese, importo: 0, quote });
            }
            const g = gruppi.get(key);
            g.importo += r.importo;
            for (const c of comps) g.quote[c.id] = (g.quote[c.id] || 0) + (r.quote[c.id] || 0);
          }
          return [...gruppi.values()].sort((a, b) =>
            a.mese < b.mese ? -1 : a.mese > b.mese ? 1 : a.tipo.localeCompare(b.tipo)
          );
        })();

        const nCols = 3 + compsVisibili.length;

        const tdNum = (color, bold, bg) => ({
          padding: "7px 10px", textAlign: "right",
          fontWeight: bold ? 700 : 500,
          color: color || "var(--text)",
          background: bg || "transparent",
          whiteSpace: "nowrap",
        });

        const SepRow = ({ label, color }) => (
          <tr>
            <td colSpan={nCols} style={{
              padding: "6px 10px", fontWeight: 700, fontSize: 12,
              color, background: "var(--bg2)",
              borderTop: "2px solid var(--border)",
              borderBottom: "1px solid var(--border)",
            }}>
              {label}
            </td>
          </tr>
        );

        return (
          <>
            {compsNascosti.length > 0 && (
              <div className="alert alert-info" style={{ marginBottom: 12 }}>
                <i className="ti ti-eye-off" />
                Componenti senza movimenti nel periodo (nascosti):{" "}
                <strong>{compsNascosti.map(c => c.label).join(", ")}</strong>
              </div>
            )}

            <div style={{ overflowX: "auto" }}>
              <table style={{ minWidth: 400, borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ ...thS, textAlign: "left", minWidth: 220 }}>Voce</th>
                    <th style={{ ...thS, textAlign: "center", minWidth: 130 }}>Periodo</th>
                    <th style={{ ...thS, textAlign: "right", minWidth: 110 }}
                      title="Importo della fattura nel periodo selezionato">
                      Importo
                    </th>
                    {compsVisibili.map(c => (
                      <th key={c.id} style={{ ...thS, textAlign: "right", minWidth: 120 }}>
                        {c.label}
                        <br />
                        <span style={{ fontWeight: 400, fontSize: 10, color: "var(--text2)" }}>
                          {c.percentuale}%
                          {c.validita_da ? ` · dal ${ym2L(toISO(c.validita_da).slice(0,7))}` : ""}
                          {c.validita_a  ? ` al ${ym2L(toISO(c.validita_a).slice(0,7))}`  : ""}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  <SepRow label="▼  SPESE — quota dovuta per inquilino nel periodo" color="#f87171" />

                  {righeDocumenti.length === 0 ? (
                    <tr>
                      <td colSpan={nCols} style={{ padding: "10px", color: "var(--text2)", fontSize: 12 }}>
                        Nessuna spesa nel periodo.
                      </td>
                    </tr>
                  ) : righeDocumenti.map((r, i) => (
                    <tr key={"d" + i} style={{ borderBottom: "1px solid var(--bg3)" }}>
                      <td style={{ padding: "7px 10px" }}>
                        <p style={{ fontWeight: 600, margin: 0, fontSize: 13 }}>
                          {r.tipo_descrizione || r.nome_file}
                        </p>
                        {r.fornitore && (
                          <p style={{ fontSize: 10, color: "var(--text2)", margin: "2px 0 0" }}>
                            <i className="ti ti-building-store" style={{ marginRight: 3 }} />
                            {r.fornitore}
                          </p>
                        )}
                        {r.mesi_filtro < r.mesi_fattura && (
                          <p style={{ fontSize: 10, color: "var(--accent)", margin: "2px 0 0" }}>
                            {r.mesi_filtro}/{r.mesi_fattura} mesi · fattura totale {euro(r.importo_fattura)}
                          </p>
                        )}
                      </td>
                      <td style={{ padding: "7px 10px", textAlign: "center", fontSize: 11, color: "var(--text2)" }}>
                        {ym2L(r.periodo_da)}
                        {r.periodo_a && r.periodo_a !== r.periodo_da ? ` → ${ym2L(r.periodo_a)}` : ""}
                      </td>
                      <td
                        title={[
                          `Totale a carico inquilini: ${euro(Object.values(r.quote).reduce((s,v)=>s+v,0))}`,
                          `─────`,
                          `Fattura totale: ${euro(r.importo_fattura)} su ${r.mesi_fattura} mesi`,
                          `Nel filtro (${r.mesi_filtro} mesi): ${euro(r.importo)}`,
                        ].join('\n')}
                        style={{ ...tdNum("#a5b4fc", true, "rgba(99,102,241,0.07)"), cursor: "help" }}
                      >
                        {euro(Object.values(r.quote).reduce((s, v) => s + v, 0))}
                      </td>
                      {compsVisibili.map(c => {
                        const q = r.quote[c.id] || 0;
                        return (
                          <td key={c.id}
                            title={q !== 0 ? `${c.label}: ${euro(q)}` : ""}
                            style={{ ...tdNum(q !== 0 ? "var(--text)" : "var(--text2)", false), cursor: q !== 0 ? "help" : "default" }}>
                            {q !== 0 ? euro(q) : <span style={{ opacity: 0.25 }}>—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  <tr style={{ background: "rgba(239,68,68,0.10)", borderTop: "2px solid var(--border)" }}>
                    <td colSpan={2} style={{ padding: "9px 10px", fontWeight: 700, fontSize: 13 }}>
                      Totale dovuto
                    </td>
                    <td style={{ ...tdNum("#a5b4fc", true, "rgba(99,102,241,0.10)") }}
                      title={`Fatture nel periodo: ${euro(totFattureNelFiltro)}`}>
                      {euro(totD)}
                    </td>
                    {compsVisibili.map(c => (
                      <td key={c.id}
                        title={`${c.label} — dovuto: ${euro(totaliDovuto[c.id] || 0)}`}
                        style={{ ...tdNum("#f87171", true), cursor: "help" }}>
                        {euro(totaliDovuto[c.id] || 0)}
                      </td>
                    ))}
                  </tr>

                  <SepRow label="▼  VERSAMENTI — importi versati per inquilino nel periodo" color="#4ade80" />

                  {righeMovimenti.length === 0 ? (
                    <tr>
                      <td colSpan={nCols} style={{ padding: "10px", color: "var(--text2)", fontSize: 12 }}>
                        Nessun versamento nel periodo.
                      </td>
                    </tr>
                  ) : sintetico ? righeSintetiche.map((r, i) => {
                    const col = TV_COLOR[r.tipo] || "#4ade80";
                    return (
                      <tr key={"vs" + i} style={{ borderBottom: "1px solid var(--bg3)" }}>
                        <td style={{ padding: "7px 10px" }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: col }}>
                            {TV_LABEL[r.tipo] || r.tipo}
                          </span>
                        </td>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontSize: 11, color: "var(--text2)" }}>
                          {ym2L(r.mese)}
                        </td>
                        <td style={{ ...tdNum(col, true, "rgba(74,222,128,0.05)") }}>
                          {euro(r.importo)}
                        </td>
                        {compsVisibili.map(c => {
                          const q = r.quote[c.id] || 0;
                          return (
                            <td key={c.id}
                              title={q !== 0 ? `${c.label}: ${euro(q)}` : ""}
                              style={{ ...tdNum(q !== 0 ? col : "var(--text2)", false), cursor: q !== 0 ? "help" : "default" }}>
                              {q !== 0 ? euro(q) : <span style={{ opacity: 0.25 }}>—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  }) : righeMovimenti.map((r, i) => {
                    const isRimb = (r.segno ?? 1) < 0;
                    const col = isRimb ? "var(--red)" : "#4ade80";
                    const hasQuotaTeorica = r.quotaTeorica !== null && r.quotaTeorica !== undefined;
                    return (
                      <React.Fragment key={"v" + i}>
                        <tr style={{ borderBottom: hasQuotaTeorica ? "none" : "1px solid var(--bg3)" }}>
                          <td style={{ padding: "7px 10px" }}>
                            <p style={{ fontWeight: 600, margin: 0, fontSize: 13, color: col }}>
                              {r.label}
                            </p>
                            {r.descrizione && r.comp_label && (
                              <p style={{ fontSize: 10, color: "var(--text2)", margin: "2px 0 0" }}>
                                <i className="ti ti-user" style={{ marginRight: 3 }} />
                                {r.comp_label}
                                {r.periodicita && r.periodicita !== "una_tantum" ? ` · ${r.periodicita}` : ""}
                              </p>
                            )}
                          </td>
                          <td style={{ padding: "7px 10px", textAlign: "center", fontSize: 11, color: "var(--text2)" }}>
                            {ym2L(r.periodo_da)}
                            {r.periodo_a && r.periodo_a !== r.periodo_da ? ` → ${ym2L(r.periodo_a)}` : ""}
                          </td>
                          <td
                            title={`Importo totale nel periodo: ${euro(r.importo)}`}
                            style={{ ...tdNum(col, true, "rgba(74,222,128,0.05)"), cursor: "help" }}>
                            {euro(r.importo)}
                          </td>
                          {compsVisibili.map(c => {
                            const q = r.quote[c.id] || 0;
                            return (
                              <td key={c.id}
                                title={q !== 0 ? `${c.label}: ${euro(q)}` : ""}
                                style={{ ...tdNum(q !== 0 ? col : "var(--text2)", false), cursor: q !== 0 ? "help" : "default" }}>
                                {q !== 0 ? euro(q) : <span style={{ opacity: 0.25 }}>—</span>}
                              </td>
                            );
                          })}
                        </tr>
                        {hasQuotaTeorica && (
                          <tr style={{ borderBottom: "1px solid var(--bg3)", background: "rgba(251,191,36,0.04)" }}>
                            <td style={{ padding: "4px 10px 6px 20px", fontSize: 11, color: "#fbbf24" }}>
                              <i className="ti ti-calculator" style={{ marginRight: 4 }} />
                              Quota teorica (riparto)
                            </td>
                            <td style={{ padding: "4px 10px", textAlign: "center", fontSize: 11, color: "var(--text2)" }} />
                            <td style={{ ...tdNum("#fbbf24", false), fontSize: 11 }}>{euro(r.importo)}</td>
                            {compsVisibili.map(c => {
                              const qt = r.quotaTeorica[c.id] || 0;
                              return (
                                <td key={c.id} style={{ ...tdNum(qt !== 0 ? "#fbbf24" : "var(--text2)", false), fontSize: 11 }}>
                                  {qt !== 0 ? euro(qt) : <span style={{ opacity: 0.25 }}>—</span>}
                                </td>
                              );
                            })}
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                  <tr style={{ background: "rgba(74,222,128,0.10)", borderTop: "2px solid var(--border)" }}>
                    <td colSpan={2} style={{ padding: "9px 10px", fontWeight: 700, fontSize: 13 }}>
                      Totale versato
                    </td>
                    <td style={{ ...tdNum("#4ade80", true, "rgba(74,222,128,0.08)") }}>
                      {euro(totV)}
                    </td>
                    {compsVisibili.map(c => (
                      <td key={c.id}
                        title={`${c.label} — versato: ${euro(totaliVersato[c.id] || 0)}`}
                        style={{ ...tdNum("#4ade80", true), cursor: "help" }}>
                        {euro(totaliVersato[c.id] || 0)}
                      </td>
                    ))}
                  </tr>

                  <SepRow label="▼  AFFITTO — quota mensile dovuta per inquilino" color="#fbbf24" />

                  {righeAffitto.length === 0 ? (
                    <tr>
                      <td colSpan={nCols} style={{ padding: "10px", color: "var(--text2)", fontSize: 12 }}>
                        Nessuna quota affitto nel periodo (verificare che gli inquilini abbiano quota affitto impostata).
                      </td>
                    </tr>
                  ) : righeAffitto.map((r, i) => (
                    <tr key={"aff" + i} style={{ borderBottom: "1px solid var(--bg3)" }}>
                      <td style={{ padding: "7px 10px" }}>
                        <p style={{ fontWeight: 600, margin: 0, fontSize: 13, color: "#fbbf24" }}>
                          Affitto
                        </p>
                      </td>
                      <td style={{ padding: "7px 10px", textAlign: "center", fontSize: 11, color: "var(--text2)" }}>
                        {ym2L(r.mese)}
                      </td>
                      <td style={{ ...tdNum("#fbbf24", true, "rgba(251,191,36,0.06)") }}>
                        {euro(Object.values(r.quote).reduce((s, v) => s + v, 0))}
                      </td>
                      {compsVisibili.map(c => {
                        const q = r.quote[c.id] || 0;
                        return (
                          <td key={c.id}
                            title={q !== 0 ? `${c.label}: ${euro(q)}/mese` : ""}
                            style={{ ...tdNum(q !== 0 ? "#fbbf24" : "var(--text2)", false), cursor: q !== 0 ? "help" : "default" }}>
                            {q !== 0 ? euro(q) : <span style={{ opacity: 0.25 }}>—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  <tr style={{ background: "rgba(251,191,36,0.10)", borderTop: "2px solid var(--border)" }}>
                    <td colSpan={2} style={{ padding: "9px 10px", fontWeight: 700, fontSize: 13 }}>
                      Totale affitto
                    </td>
                    <td style={{ ...tdNum("#fbbf24", true, "rgba(251,191,36,0.12)") }}>
                      {euro(totAff)}
                    </td>
                    {compsVisibili.map(c => (
                      <td key={c.id}
                        title={`${c.label} — affitto: ${euro(totaliAffitto[c.id] || 0)}`}
                        style={{ ...tdNum("#fbbf24", true), cursor: "help" }}>
                        {euro(totaliAffitto[c.id] || 0)}
                      </td>
                    ))}
                  </tr>

                  <tr style={{ background: "var(--bg3)", borderTop: "2px solid var(--border)" }}>
                    <td colSpan={2} style={{ padding: "11px 10px", fontWeight: 700, fontSize: 14 }}>
                      Conguaglio finale
                    </td>
                    <td style={{ padding: "11px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: 10, color: "var(--text2)", marginBottom: 2 }}>Saldo globale</div>
                      <strong style={{ fontSize: 14, color: totC >= 0 ? "#4ade80" : "#f87171" }}>
                        {totC >= 0 ? "+" : ""}{euro(totC)}
                      </strong>
                    </td>
                    {compsVisibili.map(c => {
                      const v = conguagliCorretti[c.id] || 0;
                      return (
                        <td key={c.id}
                          title={[
                            `${c.label}`,
                            `Spese dovute: ${euro(totaliDovuto[c.id]  || 0)}`,
                            `Versato:      ${euro(totaliVersato[c.id] || 0)}`,
                            `Affitto:      ${euro(totaliAffitto[c.id] || 0)}`,
                            `─────────────────────`,
                            `Conguaglio: ${v >= 0 ? "+" : ""}${euro(v)}`,
                            v >= 0 ? "✓ Credito (ha pagato di più)" : "⚠ Da versare",
                          ].join('\n')}
                          style={{
                            padding: "11px 10px", textAlign: "right",
                            fontWeight: 700, fontSize: 14,
                            color: v >= 0 ? "#4ade80" : "#f87171",
                            cursor: "help",
                          }}>
                          {v >= 0 ? "+" : ""}{euro(v)}
                        </td>
                      );
                    })}
                  </tr>

                  <tr style={{ background: "var(--bg2)", borderTop: "2px solid var(--border)" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 600, fontSize: 12, color: "var(--text2)" }}>
                      Riepilogo
                    </td>
                    <td style={{ padding: "8px 10px", fontSize: 11, color: "var(--text2)" }} />
                    <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, color: "var(--text2)" }}
                      title={`Fatture nel periodo: ${euro(totFattureNelFiltro)}`}>
                      Spese: <strong style={{ color: "#a5b4fc" }}>{euro(totD)}</strong>
                    </td>
                    <td colSpan={compsVisibili.length} style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, color: "var(--text2)" }}>
                      Spese: <strong style={{ color: "#f87171" }}>{euro(totD)}</strong>
                      {"  ·  "}
                      Affitto: <strong style={{ color: "#fbbf24" }}>{euro(totAff)}</strong>
                      {"  ·  "}
                      Versato: <strong style={{ color: "#4ade80" }}>{euro(totV)}</strong>
                      {"  ·  "}
                      Saldo: <strong style={{ color: totC >= 0 ? "#4ade80" : "#f87171" }}>
                        {totC >= 0 ? "+" : ""}{euro(totC)}
                      </strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        );
      })()}
    </div>
  );
}
