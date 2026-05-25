import { useState, useEffect, useMemo } from "react";
import { authApi, appartamentiApi } from "../api.js";
import { Btn, SectionHeader } from "../components/ui.jsx";

export function GestioneRuoli() {
  const [viewers,      setViewers]      = useState([]);
  const [apps,         setApps]         = useState([]);
  const [allInquilini, setAllInquilini] = useState([]); // { id, nome, cognome, appartamento_id, appartamento_nome }
  const [selected,     setSelected]     = useState(null); // viewer corrente
  const [selApps,      setSelApps]      = useState([]);
  const [selInq,       setSelInq]       = useState([]);
  const [summaries,    setSummaries]    = useState({}); // { userId: { apps, inq } }
  const [loading,      setLoading]      = useState(true);
  const [loadingRes,   setLoadingRes]   = useState(false);
  const [saving,       setSaving]       = useState(false);

  // Carica tutti i viewer + appartamenti + inquilini al mount
  useEffect(() => {
    async function load() {
      const [users, appsData] = await Promise.all([
        authApi.listUsers(),
        appartamentiApi.list(),
      ]);
      const vws = users.filter(u => u.ruolo === "viewer");
      setViewers(vws);
      setApps(appsData);

      // Carica tutti gli inquilini di tutti gli appartamenti
      const inqAll = [];
      for (const a of appsData) {
        try {
          const aData = await appartamentiApi.get(a.id);
          (aData.componenti || []).forEach(c => {
            if (!inqAll.find(x => x.id === c.id)) {
              inqAll.push({ ...c, appartamento_id: a.id, appartamento_nome: a.nome });
            }
          });
        } catch { /* skip */ }
      }
      setAllInquilini(inqAll);

      // Carica i summary per ogni viewer
      const sums = {};
      await Promise.all(vws.map(async v => {
        const [va, vi] = await Promise.all([
          authApi.getAppartamenti(v.id),
          authApi.getInquilini(v.id),
        ]);
        sums[v.id] = { apps: va.map(a => a.id), inq: vi.map(c => c.id) };
      }));
      setSummaries(sums);
    }
    load().finally(() => setLoading(false));
  }, []);

  async function selectViewer(v) {
    if (selected?.id === v.id) { setSelected(null); return; }
    setLoadingRes(true);
    setSelected(v);
    const s = summaries[v.id] || { apps: [], inq: [] };
    setSelApps(s.apps);
    setSelInq(s.inq);
    setLoadingRes(false);
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await Promise.all([
        authApi.setAppartamenti(selected.id, selApps),
        authApi.setInquilini(selected.id, selInq),
      ]);
      setSummaries(s => ({ ...s, [selected.id]: { apps: selApps, inq: selInq } }));
      setSelected(null);
    } finally { setSaving(false); }
  }

  // Inquilini visibili nel pannello: se nessun appartamento selezionato mostra tutti;
  // se almeno uno selezionato, filtra per appartamenti selezionati
  const visibleInq = useMemo(() => {
    if (selApps.length === 0) return allInquilini;
    return allInquilini.filter(c => selApps.includes(c.appartamento_id));
  }, [allInquilini, selApps]);

  function toggleApp(id) {
    setSelApps(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleInq(id) {
    setSelInq(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function summaryLabel(userId) {
    const s = summaries[userId];
    if (!s) return <span style={{ color: "var(--text2)", fontSize: 11 }}>…</span>;
    const parts = [];
    if (s.apps.length > 0) parts.push(`${s.apps.length} app.`);
    else parts.push("tutti gli app.");
    if (s.inq.length > 0) parts.push(`${s.inq.length} inq.`);
    else parts.push("tutti gli inq.");
    const isFull = s.apps.length === 0 && s.inq.length === 0;
    return (
      <span style={{
        fontSize: 11, padding: "2px 7px", borderRadius: 10, fontWeight: 500,
        background: isFull ? "rgba(39,103,73,0.12)" : "rgba(99,102,241,0.12)",
        color: isFull ? "#276749" : "var(--accent)",
      }}>
        {isFull ? "Accesso totale" : parts.join(", ")}
      </span>
    );
  }

  if (loading) return <div style={{ padding: 32, color: "var(--text2)" }}>Caricamento…</div>;

  return (
    <div>
      <SectionHeader title="Gestione Ruoli e Restrizioni" />

      {viewers.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--text2)" }}>
          <i className="ti ti-eye-off" style={{ fontSize: 36, marginBottom: 12, display: "block" }} />
          <p style={{ fontSize: 14, margin: 0 }}>Nessun utente con ruolo <strong>Visualizzatore</strong>.</p>
          <p style={{ fontSize: 12, marginTop: 6 }}>
            Aggiungi utenti e assegna il ruolo Visualizzatore dalla sezione Gestione Utenti.
          </p>
        </div>
      ) : (
        <>
          {/* Cards viewer */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, marginBottom: 20 }}>
            {viewers.map(v => {
              const isActive = selected?.id === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => selectViewer(v)}
                  style={{
                    textAlign: "left", padding: 14, borderRadius: 10, cursor: "pointer",
                    border: `2px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                    background: isActive ? "rgba(99,102,241,0.06)" : "var(--bg2)",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    {v.avatar_url
                      ? <img src={v.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
                      : <div style={{
                          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                          background: isActive ? "var(--accent)" : "var(--border)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <i className="ti ti-user" style={{ color: isActive ? "#fff" : "var(--text2)", fontSize: 16 }} />
                        </div>
                    }
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: 13, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {v.nome || v.cognome ? `${v.nome} ${v.cognome}`.trim() : v.email}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--text2)", margin: "1px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {v.email}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {summaryLabel(v.id)}
                    {isActive && (
                      <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>
                        <i className="ti ti-pencil" style={{ fontSize: 11 }} /> modifica
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Editor restrizioni */}
          {selected && (
            <div className="card" style={{ border: "2px solid var(--accent)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>
                    Restrizioni — {selected.nome || selected.cognome
                      ? `${selected.nome} ${selected.cognome}`.trim()
                      : selected.email}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--text2)", margin: "3px 0 0" }}>
                    Nessuna selezione = accesso totale. Seleziona per limitare la visibilità puntualmente.
                  </p>
                </div>
                <Btn variant="secondary" size="sm" onClick={() => setSelected(null)}>
                  <i className="ti ti-x" />
                </Btn>
              </div>

              {loadingRes ? (
                <div style={{ textAlign: "center", padding: 24, color: "var(--text2)" }}>Caricamento…</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                    {/* Appartamenti */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <p style={SECT_LABEL}>
                          <i className="ti ti-building" style={{ marginRight: 5 }} />
                          Appartamenti
                        </p>
                        <span style={BADGE_STYLE}>
                          {selApps.length === 0 ? "tutti" : `${selApps.length} / ${apps.length}`}
                        </span>
                      </div>
                      {selApps.length > 0 && (
                        <button
                          onClick={() => { setSelApps([]); setSelInq([]); }}
                          style={CLEAR_BTN}
                        >
                          <i className="ti ti-x" style={{ fontSize: 10 }} /> rimuovi filtro
                        </button>
                      )}
                      <div style={LIST_WRAP}>
                        {apps.map(a => {
                          const sel = selApps.includes(a.id);
                          return (
                            <label key={a.id} style={checkRow(sel)}>
                              <input
                                type="checkbox" checked={sel}
                                onChange={() => toggleApp(a.id)}
                                style={{ accentColor: "var(--accent)", flexShrink: 0 }}
                              />
                              <i className="ti ti-building" style={{ color: sel ? "var(--accent)" : "var(--text2)", fontSize: 13 }} />
                              <span style={{ flex: 1 }}>{a.nome}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Inquilini */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <p style={SECT_LABEL}>
                          <i className="ti ti-users" style={{ marginRight: 5 }} />
                          Inquilini
                          {selApps.length > 0 && (
                            <span style={{ fontSize: 10, color: "var(--text2)", marginLeft: 6, fontWeight: 400 }}>
                              (filtrati per app. selezionati)
                            </span>
                          )}
                        </p>
                        <span style={BADGE_STYLE}>
                          {selInq.length === 0 ? "tutti" : `${selInq.length} / ${visibleInq.length}`}
                        </span>
                      </div>
                      {selInq.length > 0 && (
                        <button onClick={() => setSelInq([])} style={CLEAR_BTN}>
                          <i className="ti ti-x" style={{ fontSize: 10 }} /> rimuovi filtro
                        </button>
                      )}
                      <div style={LIST_WRAP}>
                        {visibleInq.length === 0 ? (
                          <p style={{ color: "var(--text2)", fontSize: 12, padding: "8px 0" }}>
                            Nessun inquilino trovato
                          </p>
                        ) : visibleInq.map(c => {
                          const sel = selInq.includes(c.id);
                          return (
                            <label key={c.id} style={checkRow(sel)}>
                              <input
                                type="checkbox" checked={sel}
                                onChange={() => toggleInq(c.id)}
                                style={{ accentColor: "var(--accent)", flexShrink: 0 }}
                              />
                              <i className="ti ti-user" style={{ color: sel ? "var(--accent)" : "var(--text2)", fontSize: 13 }} />
                              <span style={{ flex: 1 }}>{c.nome} {c.cognome}</span>
                              <span style={{ fontSize: 10, color: "var(--text2)" }}>{c.appartamento_nome}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Riepilogo */}
                  <div style={{
                    marginTop: 16, padding: "10px 14px", borderRadius: 8,
                    background: "var(--bg3)", border: "1px solid var(--border)",
                    fontSize: 12, color: "var(--text2)",
                  }}>
                    <i className="ti ti-info-circle" style={{ marginRight: 6 }} />
                    {selApps.length === 0 && selInq.length === 0
                      ? "Questo utente vedrà tutti gli appartamenti e tutti gli inquilini."
                      : <>
                          Questo utente vedrà
                          {selApps.length > 0
                            ? <strong> {selApps.length} appartament{selApps.length === 1 ? "o" : "i"}</strong>
                            : <strong> tutti gli appartamenti</strong>
                          }
                          {" "}e
                          {selInq.length > 0
                            ? <strong> {selInq.length} inquilin{selInq.length === 1 ? "o" : "i"}</strong>
                            : <strong> tutti gli inquilini</strong>
                          } degli appartamenti selezionati.
                        </>
                    }
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                    <Btn variant="secondary" onClick={() => setSelected(null)}>Annulla</Btn>
                    <Btn variant="primary" onClick={save} disabled={saving}>
                      <i className="ti ti-check" /> {saving ? "Salvataggio…" : "Salva restrizioni"}
                    </Btn>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const SECT_LABEL = {
  fontWeight: 600, fontSize: 12, margin: 0,
  color: "var(--text2)", textTransform: "uppercase", letterSpacing: 0.5,
};
const BADGE_STYLE = {
  fontSize: 11, padding: "2px 8px", borderRadius: 10,
  background: "var(--bg3)", color: "var(--text2)", fontWeight: 500,
};
const CLEAR_BTN = {
  fontSize: 11, color: "var(--text2)", background: "none", border: "none",
  cursor: "pointer", padding: "0 0 8px", display: "flex", alignItems: "center", gap: 3,
  textDecoration: "underline",
};
const LIST_WRAP = {
  display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto",
};

function checkRow(sel) {
  return {
    display: "flex", alignItems: "center", gap: 8,
    padding: "6px 8px", borderRadius: 6, cursor: "pointer",
    background: sel ? "rgba(99,102,241,0.08)" : "transparent",
    border: `1px solid ${sel ? "var(--accent)" : "var(--border)"}`,
    fontSize: 13, userSelect: "none",
  };
}
