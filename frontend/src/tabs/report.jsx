import { useState, useEffect } from "react";
import { reportApi, appartamentiApi } from "../api.js";
import { Btn, Field, SectionHeader } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const euro   = v => Number(v || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const sgn    = v => Number(v) >= 0 ? "+" : "";
const mesAnn = s => {
  if (!s) return "—";
  const [y, m] = s.split("-");
  return ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"][parseInt(m,10)-1] + " " + y;
};

const SEZIONI_FULL = [
  ["spese",        "ti-file-invoice",    "Spese"],
  ["versamenti",   "ti-arrow-up-circle", "Versamenti"],
  ["inquilini",    "ti-users",           "Inquilini"],
  ["proprietari",  "ti-user-circle",     "Proprietari"],
  ["percentuali",  "ti-percent",         "Percentuali riparto"],
];
const SEZIONI_VIEWER = [
  ["spese",        "ti-file-invoice",    "Spese"],
  ["versamenti",   "ti-arrow-up-circle", "Versamenti"],
  ["inquilini",    "ti-users",           "Inquilini"],
  ["percentuali",  "ti-percent",         "Percentuali riparto"],
];

export function Report() {
  const { user } = useAuth();
  const isViewer = user?.ruolo === "viewer";

  const [periodoDA,    setPeriodoDA]   = useState("");
  const [periodoA,     setPeriodoA]    = useState("");
  const [vis, setVis] = useState({
    spese: true, versamenti: false, inquilini: true, proprietari: true, percentuali: false,
  });
  const [appartamenti,  setAppartamenti]  = useState([]);
  const [appartFiltro,  setAppartFiltro]  = useState(new Set());
  const [result,   setResult]   = useState(null);
  const [loading,  setLoad]     = useState(false);
  const [saved,    setSaved]    = useState([]);
  const [saveName, setSaveN]    = useState("");

  const togVis  = k  => setVis(v => ({ ...v, [k]: !v[k] }));
  const togApp  = id => setAppartFiltro(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  useEffect(() => {
    reportApi.list().then(setSaved).catch(() => {});
    appartamentiApi.list().then(setAppartamenti).catch(() => {});
  }, []);

  async function genera() {
    setLoad(true); setResult(null);
    try {
      setResult(await reportApi.genera({
        periodoDA, periodoA,
        mostraSpese:       vis.spese,
        mostraVersamenti:  vis.versamenti,
        mostraInquilini:   vis.inquilini,
        mostraSaldo:       true,
        mostraProprietari: vis.proprietari,
      }));
    } catch (e) { alert("Errore: " + e.message); }
    finally { setLoad(false); }
  }

  async function salva() {
    if (!saveName.trim() || !result) return;
    const r = await reportApi.save({
      nome: saveName.trim(),
      parametri: { periodoDA, periodoA, ...vis },
      testo: result.testo,
      pdf_base64: result.pdf,
    });
    setSaved(s => [r, ...s]); setSaveN("");
  }

  const vm = result?.vm;

  // Filtra le sezioni per appartamento, poi applica restrizioni inquilini per i viewer
  const sezioni = vm ? vm.sezioni
    .filter(s => {
      if (appartFiltro.size > 0 && !appartFiltro.has(s.id)) return false;
      if (isViewer && user?.allowedAppartamenti?.length > 0 && !user.allowedAppartamenti.includes(s.id)) return false;
      return true;
    })
    .map(s => {
      if (!isViewer || !user?.allowedInquilini?.length) return s;
      const allowedSet = new Set(user.allowedInquilini);
      const inquilini  = s.inquilini.filter(c => allowedSet.has(c.id));
      const versamenti = s.versamenti.filter(m => m.comp_id && allowedSet.has(m.comp_id));
      const totSpese   = inquilini.reduce((acc, c) => acc + c.dovutoSpese, 0);
      const totVersati = inquilini.reduce((acc, c) => acc + c.versato, 0);
      return { ...s, inquilini, versamenti, totSpese, totVersati };
    })
  : [];

  return (
    <div>
      <SectionHeader title="Report" />
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }}>

        {/* ── Pannello parametri ── */}
        <div className="card">
          <p style={{ fontWeight: 700, marginBottom: 12 }}>Parametri</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Periodo da">
              <input type="month" value={periodoDA} onChange={e => setPeriodoDA(e.target.value)} />
            </Field>
            <Field label="Periodo a">
              <input type="month" value={periodoA}  onChange={e => setPeriodoA(e.target.value)} />
            </Field>

            <hr className="divider" />
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text2)", marginBottom: 2 }}>
              Sezioni da visualizzare
            </p>

            {(isViewer ? SEZIONI_VIEWER : SEZIONI_FULL).map(([k, icon, label]) => (
              <label key={k} style={{
                display: "flex", alignItems: "center", gap: 8,
                cursor: "pointer", color: "var(--text)",
                padding: "5px 8px", borderRadius: 6,
                background: vis[k] ? "rgba(99,102,241,0.1)" : "transparent",
                border: `1px solid ${vis[k] ? "var(--accent)" : "var(--border)"}`,
                transition: "all 0.15s",
              }}>
                <input
                  type="checkbox"
                  checked={!!vis[k]}
                  onChange={() => togVis(k)}
                  style={{ accentColor: "var(--accent)" }}
                />
                <i className={`ti ${icon}`} style={{ fontSize: 14, color: vis[k] ? "var(--accent)" : "var(--text2)" }} />
                <span style={{ fontSize: 13 }}>{label}</span>
              </label>
            ))}

            {/* Filtro appartamenti (solo admin/editor; il viewer è già filtrato dal profilo) */}
            {!isViewer && appartamenti.length > 0 && (
              <>
                <hr className="divider" />
                <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text2)", marginBottom: 2 }}>
                  Appartamenti
                  {appartFiltro.size > 0 && (
                    <span
                      style={{ marginLeft: 6, color: "var(--accent)", cursor: "pointer", fontWeight: 400 }}
                      onClick={() => setAppartFiltro(new Set())}
                    >
                      (tutti)
                    </span>
                  )}
                </p>
                <div style={{
                  maxHeight: 160, overflowY: "auto",
                  display: "flex", flexDirection: "column", gap: 4,
                }}>
                  {appartamenti.map(a => {
                    const sel = appartFiltro.has(a.id);
                    return (
                      <label key={a.id} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        cursor: "pointer", color: "var(--text)",
                        padding: "4px 8px", borderRadius: 6,
                        background: sel ? "rgba(99,102,241,0.1)" : "transparent",
                        border: `1px solid ${sel ? "var(--accent)" : "var(--border)"}`,
                        transition: "all 0.15s",
                        fontSize: 12,
                      }}>
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => togApp(a.id)}
                          style={{ accentColor: "var(--accent)" }}
                        />
                        <i className="ti ti-building" style={{ fontSize: 12, color: sel ? "var(--accent)" : "var(--text2)" }} />
                        {a.nome}
                      </label>
                    );
                  })}
                </div>
              </>
            )}

            <Btn variant="primary" onClick={genera} disabled={loading} style={{ marginTop: 4 }}>
              <i className={`ti ${loading ? "ti-loader-2 ti-spin" : "ti-file-analytics"}`} />
              {loading ? "Generazione…" : "Genera Report"}
            </Btn>
          </div>

          {/* Report salvati */}
          {saved.length > 0 && (
            <>
              <hr className="divider" />
              <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Report salvati</p>
              {saved.map(r => (
                <div key={r.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 0", borderBottom: "1px solid var(--bg3)",
                }}>
                  <span style={{ fontSize: 12, cursor: "pointer", color: "var(--accent)" }}
                        onClick={() => reportApi.get(r.id).then(setResult)}>
                    {r.nome}
                  </span>
                  <Btn variant="danger" size="sm" onClick={async () => {
                    await reportApi.delete(r.id);
                    setSaved(s => s.filter(x => x.id !== r.id));
                  }}>
                    <i className="ti ti-trash" />
                  </Btn>
                </div>
              ))}
            </>
          )}
        </div>

        {/* ── Area risultato ── */}
        <div>
          {!result && !loading && (
            <div className="alert alert-info">
              <i className="ti ti-info-circle" /> Imposta i parametri e premi "Genera Report".
            </div>
          )}

          {result && (
            <div>
              {/* Header azioni + KPI */}
              <div className="card" style={{ marginBottom: 12 }}>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  flexWrap: "wrap", gap: 8, marginBottom: vm ? 12 : 0,
                }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>Report generato</p>
                    {vm && (
                      <p style={{ fontSize: 12, color: "var(--text2)", margin: "2px 0 0" }}>
                        {vm.periodoDA
                          ? `${mesAnn(vm.periodoDA)} → ${mesAnn(vm.periodoA)}`
                          : "Periodo completo"}
                        {" · "}{sezioni.length}/{vm.totAppartamenti} appartamenti · {vm.totDocumenti} documenti
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      value={saveName}
                      onChange={e => setSaveN(e.target.value)}
                      placeholder="Nome per salvare…"
                      style={{ width: 180 }}
                    />
                    <Btn variant="secondary" size="sm" onClick={salva} disabled={!saveName.trim()}>
                      <i className="ti ti-bookmark" /> Salva
                    </Btn>
                    <Btn variant="primary" size="sm"
                         onClick={() => reportApi.downloadPdf(result.pdf, `report-${periodoDA || "completo"}.pdf`)}>
                      <i className="ti ti-download" /> PDF
                    </Btn>
                  </div>
                </div>

                {vm && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                    {[
                      ["Totale spese",  euro(sezioni.reduce((s,a) => s + a.totSpese, 0))],
                      ["Versamenti",    euro(sezioni.reduce((s,a) => s + a.totVersati, 0))],
                      ["Saldo globale", (() => {
                        const sal = sezioni.reduce((s,a) => s + a.totVersati - a.totSpese, 0);
                        return sgn(sal) + euro(sal);
                      })()],
                      ["Documenti",     sezioni.reduce((s,a) => s + a.documenti.length, 0)],
                    ].map(([l, v]) => (
                      <div key={l} style={{
                        background: "var(--bg)", borderRadius: 8, padding: "8px 12px",
                        border: "1px solid var(--border)",
                      }}>
                        <div style={{ fontSize: 10, color: "var(--text2)", marginBottom: 2 }}>{l}</div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sezioni strutturate */}
              {vm && sezioni.map(app => (
                <div key={app.id || app.nome} className="card" style={{ marginBottom: 12 }}>
                  <p style={{
                    fontWeight: 700, fontSize: 14, marginBottom: 12,
                    color: "var(--accent)", display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <i className="ti ti-building" />
                    {app.nome}
                  </p>

                  {/* Spese */}
                  {vis.spese && (
                    <SezioneBlock
                      titolo={`Spese — ${app.documenti.length} documenti · ${euro(app.totSpese)}`}
                      colore="#e53e3e"
                    >
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "var(--bg3)" }}>
                            <Th>Tipo</Th><Th>Periodo</Th><Th>Fornitore</Th><Th align="right">Quota</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {app.documenti.map((d, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                              <Td>{d.tipo_descrizione || d.nome_file || "—"}</Td>
                              <Td>{d.periodo_a && d.periodo_a !== d.periodo_da
                                ? `${mesAnn(d.periodo_da)} → ${mesAnn(d.periodo_a)}`
                                : mesAnn(d.periodo_da)}</Td>
                              <Td>{d.fornitore || "—"}</Td>
                              <Td align="right">{euro(d.importo)}</Td>
                            </tr>
                          ))}
                          <tr style={{ background: "var(--bg3)", fontWeight: 700 }}>
                            <Td colSpan={3}>Totale</Td>
                            <Td align="right">{euro(app.totSpese)}</Td>
                          </tr>
                        </tbody>
                      </table>
                    </SezioneBlock>
                  )}

                  {/* Versamenti */}
                  {vis.versamenti && app.versamenti.length > 0 && (
                    <SezioneBlock
                      titolo={`Versamenti — ${euro(app.totVersati)}`}
                      colore="#2b7a0b"
                    >
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "var(--bg3)" }}>
                            <Th>Inquilino</Th><Th>Tipo</Th><Th>Periodo</Th><Th align="right">Importo</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {app.versamenti.map((m, i) => (
                            <tr key={i} style={{
                              borderBottom: "1px solid var(--border)",
                              color: m.segno < 0 ? "#c0392b" : undefined,
                            }}>
                              <Td>{m.comp_label}</Td>
                              <Td>{m.tipo}{m.segno < 0 ? " [rimborso]" : ""}</Td>
                              <Td>{m.periodo_a && m.periodo_a !== m.periodo_da
                                ? `${mesAnn(m.periodo_da)} → ${mesAnn(m.periodo_a)}`
                                : mesAnn(m.periodo_da)}</Td>
                              <Td align="right">{euro(Math.abs(m.importo))}</Td>
                            </tr>
                          ))}
                          <tr style={{ background: "var(--bg3)", fontWeight: 700 }}>
                            <Td colSpan={3}>Totale</Td>
                            <Td align="right">{euro(app.totVersati)}</Td>
                          </tr>
                        </tbody>
                      </table>
                    </SezioneBlock>
                  )}

                  {/* Inquilini */}
                  {vis.inquilini && (
                    <SezioneBlock titolo="Inquilini" colore="#2b6cb0">
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "var(--bg3)" }}>
                            <Th>Inquilino{vis.percentuali ? " (%)" : ""}</Th>
                            <Th align="right">Spese dovute</Th>
                            <Th align="right">Affitto</Th>
                            <Th align="right">Versato</Th>
                            <Th align="right">Conguaglio</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {app.inquilini.map((c, i) => (
                            <tr key={i} style={{
                              borderBottom: "1px solid var(--border)",
                              color: c.conguaglio < 0 ? "#c0392b" : undefined,
                            }}>
                              <Td>
                                {c.nome}
                                {vis.percentuali && (
                                  <span style={{ color: "var(--text2)", fontSize: 11 }}> ({c.percentuale}%)</span>
                                )}
                              </Td>
                              <Td align="right">{euro(c.dovutoSpese)}</Td>
                              <Td align="right">{euro(c.affitto)}</Td>
                              <Td align="right">{euro(c.versato)}</Td>
                              <Td align="right">{sgn(c.conguaglio)}{euro(c.conguaglio)}</Td>
                            </tr>
                          ))}
                          <tr style={{ background: "var(--bg3)", fontWeight: 700 }}>
                            <Td>Totale</Td>
                            <Td align="right">{euro(app.inquilini.reduce((s,c) => s + c.dovutoSpese, 0))}</Td>
                            <Td align="right">{euro(app.inquilini.reduce((s,c) => s + c.affitto, 0))}</Td>
                            <Td align="right">{euro(app.totVersati)}</Td>
                            <Td align="right">{(() => {
                              const tot = app.totVersati - app.inquilini.reduce((s,c) => s + c.dovutoTot, 0);
                              return <>{sgn(tot)}{euro(tot)}</>;
                            })()}</Td>
                          </tr>
                        </tbody>
                      </table>
                    </SezioneBlock>
                  )}

                  {/* Proprietari — cash flow reale */}
                  {vis.proprietari && !isViewer && app.proprietari.length > 0 && (
                    <SezioneBlock titolo="Proprietari — cash flow reale" colore="#276749">
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "var(--bg3)" }}>
                            <Th>Proprietario</Th>
                            <Th align="right">Spesa reale</Th>
                            <Th align="right">Incassato reale</Th>
                            <Th align="right">Cash flow</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {app.proprietari.map((p, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                              <Td>{p.nome}</Td>
                              <Td align="right">{euro(p.pagato)}</Td>
                              <Td align="right">{euro(p.incassato)}</Td>
                              <Td align="right">{sgn(p.cashFlow)}{euro(p.cashFlow)}</Td>
                            </tr>
                          ))}
                          <tr style={{ background: "var(--bg3)", fontWeight: 700 }}>
                            <Td>Totale</Td>
                            <Td align="right">{euro(app.totPagato)}</Td>
                            <Td align="right">{euro(app.totIncassato)}</Td>
                            <Td align="right">{sgn(app.cashFlowReale)}{euro(app.cashFlowReale)}</Td>
                          </tr>
                        </tbody>
                      </table>
                    </SezioneBlock>
                  )}

                  {/* Proprietari — conguaglio teorico */}
                  {vis.proprietari && !isViewer && app.proprietari.length > 0 && (
                    <SezioneBlock titolo="Proprietari — conguaglio teorico" colore="#6b46c1">
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "var(--bg3)" }}>
                            <Th>Proprietario</Th>
                            <Th align="right">Spesa teorica</Th>
                            <Th align="right">Incassato teorico</Th>
                            <Th align="right">Conguaglio</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {app.proprietari.map((p, i) => (
                            <tr key={i} style={{
                              borderBottom: "1px solid var(--border)",
                              color: p.conguaglio < 0 ? "#c0392b" : undefined,
                            }}>
                              <Td>{p.nome}</Td>
                              <Td align="right">{euro(p.dareTeorico)}</Td>
                              <Td align="right">{euro(p.avereTeorico)}</Td>
                              <Td align="right">{sgn(p.conguaglio)}{euro(p.conguaglio)}</Td>
                            </tr>
                          ))}
                          <tr style={{ background: "var(--bg3)", fontWeight: 700 }}>
                            <Td>Totale</Td>
                            <Td align="right">{euro(app.proprietari.reduce((s,p) => s + p.dareTeorico, 0))}</Td>
                            <Td align="right">{euro(app.proprietari.reduce((s,p) => s + p.avereTeorico, 0))}</Td>
                            <Td align="right">{(() => {
                              const tot = app.proprietari.reduce((s,p) => s + p.conguaglio, 0);
                              return <>{sgn(tot)}{euro(tot)}</>;
                            })()}</Td>
                          </tr>
                        </tbody>
                      </table>
                    </SezioneBlock>
                  )}
                </div>
              ))}

              {/* Fallback testo se vm non disponibile (report salvato vecchio) */}
              {!vm && result.testo && (
                <div className="card">
                  <pre style={{
                    whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 12,
                    lineHeight: 1.7, color: "var(--text2)", maxHeight: 600, overflowY: "auto",
                    background: "var(--bg)", padding: 12, borderRadius: 8,
                    border: "1px solid var(--border)", margin: 0,
                  }}>
                    {result.testo}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SezioneBlock({ titolo, colore, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: colore,
        padding: "3px 0 5px", marginBottom: 4,
        borderBottom: `2px solid ${colore}`,
        textTransform: "uppercase", letterSpacing: 0.5,
      }}>
        {titolo}
      </div>
      {children}
    </div>
  );
}

function Th({ children, align, colSpan }) {
  return (
    <th style={{
      padding: "5px 8px", textAlign: align || "left",
      fontSize: 11, fontWeight: 600, color: "var(--text2)",
    }} colSpan={colSpan}>{children}</th>
  );
}

function Td({ children, align, colSpan }) {
  return (
    <td style={{ padding: "4px 8px", textAlign: align || "left" }} colSpan={colSpan}>
      {children}
    </td>
  );
}
