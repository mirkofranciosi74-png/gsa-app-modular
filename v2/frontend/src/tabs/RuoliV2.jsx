import { useState, useEffect, useCallback } from "react";
import { authApi } from "../api/apiV2.js";
import { condominiV2, immobiliV2 } from "../api/apiV2.js";
import { Btn } from "../../components/ui.jsx";

// ── Helpers ────────────────────────────────────────────────────────────────────
function nomeUtente(u) {
  return u.nome || u.cognome ? `${u.nome || ""} ${u.cognome || ""}`.trim() : u.email;
}
function nomePersona(p) {
  if (p.tipo_persona === "giuridica") return p.ragione_sociale || "(senza nome)";
  return [p.cognome, p.nome].filter(Boolean).join(" ") || "(senza nome)";
}

// ── Badge summary restrizioni ──────────────────────────────────────────────────
function SummaryBadge({ res, total }) {
  if (!res) return <span style={{ color: "var(--text2)", fontSize: 11 }}>…</span>;
  const { immobili, inquilini, proprietari } = res;
  const isTotal = immobili.length === 0 && inquilini.length === 0 && proprietari.length === 0;
  if (isTotal) {
    return (
      <span style={{
        fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
        background: "rgba(34,197,94,0.12)", color: "var(--green)",
        border: "1px solid rgba(34,197,94,0.3)",
      }}>Accesso totale</span>
    );
  }
  const parts = [];
  if (immobili.length > 0)    parts.push(`${immobili.length} imm.`);
  if (inquilini.length > 0)   parts.push(`${inquilini.length} inq.`);
  if (proprietari.length > 0) parts.push(`${proprietari.length} prop.`);
  return (
    <span style={{
      fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
      background: "rgba(99,102,241,0.1)", color: "var(--accent)",
      border: "1px solid rgba(99,102,241,0.3)",
    }}>{parts.join(", ")}</span>
  );
}

// ── Colonna di selezione ───────────────────────────────────────────────────────
function SelectColumn({ title, icon, items, selected, onToggle, onClear, renderItem, emptyText, filterNote }) {
  const [search, setSearch] = useState("");
  const filtered = search
    ? items.filter(it => renderItem(it).toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, minWidth: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <p style={{
          fontWeight: 700, fontSize: 12, margin: 0,
          color: "var(--text2)", textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          <i className={`ti ${icon}`} style={{ marginRight: 5 }} />
          {title}
          {filterNote && (
            <span style={{ fontSize: 10, color: "var(--text2)", marginLeft: 6, fontWeight: 400, textTransform: "none" }}>
              {filterNote}
            </span>
          )}
        </p>
        <span style={{
          fontSize: 11, padding: "2px 8px", borderRadius: 10,
          background: "var(--bg3)", color: "var(--text2)", fontWeight: 500,
        }}>
          {selected.length === 0 ? "tutti" : `${selected.length} / ${items.length}`}
        </span>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 6 }}>
        <i className="ti ti-search" style={{
          position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
          color: "var(--text2)", fontSize: 13, pointerEvents: "none",
        }} />
        <input
          className="inp"
          placeholder="Cerca…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ paddingLeft: 28, fontSize: 12, height: 30 }}
        />
      </div>

      {/* Clear */}
      {selected.length > 0 && (
        <button onClick={onClear} style={{
          fontSize: 11, color: "var(--text2)", background: "none", border: "none",
          cursor: "pointer", padding: "0 0 6px", display: "flex", alignItems: "center", gap: 3,
          textDecoration: "underline", alignSelf: "flex-start",
        }}>
          <i className="ti ti-x" style={{ fontSize: 10 }} /> rimuovi filtro
        </button>
      )}

      {/* List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 300, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <p style={{ color: "var(--text2)", fontSize: 12, padding: "8px 0" }}>
            {items.length === 0 ? emptyText : "Nessun risultato"}
          </p>
        ) : filtered.map(it => {
          const sel = selected.includes(it.id);
          return (
            <label key={it.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 8px", borderRadius: 6, cursor: "pointer",
              background: sel ? "rgba(99,102,241,0.08)" : "transparent",
              border: `1px solid ${sel ? "var(--accent)" : "var(--border)"}`,
              fontSize: 13, userSelect: "none",
            }}>
              <input
                type="checkbox" checked={sel}
                onChange={() => onToggle(it.id)}
                style={{ accentColor: "var(--accent)", flexShrink: 0 }}
              />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {renderItem(it)}
              </span>
              {it._sub && (
                <span style={{ fontSize: 10, color: "var(--text2)", flexShrink: 0 }}>{it._sub}</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Editor restrizioni per un viewer ──────────────────────────────────────────
function EditorRestrizioni({ viewer, allImmobili, allInquilini, allProprietari, onSaved, onClose }) {
  const [selImm,  setSelImm]  = useState([]);
  const [selInq,  setSelInq]  = useState([]);
  const [selProp, setSelProp] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    setLoading(true);
    authApi.getRestrizioniV2(viewer.id)
      .then(r => { setSelImm(r.immobili); setSelInq(r.inquilini); setSelProp(r.proprietari); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [viewer.id]);

  function toggle(set) { return id => set(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }

  async function handleSave() {
    setSaving(true);
    setErr(null);
    try {
      await Promise.all([
        authApi.setImmobiliV2(viewer.id, selImm),
        authApi.setInquiliniV2(viewer.id, selInq),
        authApi.setProprietariV2(viewer.id, selProp),
      ]);
      onSaved({ immobili: selImm, inquilini: selInq, proprietari: selProp });
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Inquilini filtrati per immobili selezionati
  const inquiliniFiltrati = selImm.length === 0
    ? allInquilini
    : allInquilini.filter(p => p._immobiliIds?.some(id => selImm.includes(id)));

  const proprietariFiltrati = selImm.length === 0
    ? allProprietari
    : allProprietari.filter(p => p._immobiliIds?.some(id => selImm.includes(id)));

  const isTotal = selImm.length === 0 && selInq.length === 0 && selProp.length === 0;

  return (
    <div style={{
      border: "2px solid var(--accent)", borderRadius: 12, padding: 20,
      background: "var(--bg2)", marginTop: 16,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>
            Restrizioni — {nomeUtente(viewer)}
          </p>
          <p style={{ fontSize: 12, color: "var(--text2)", margin: "3px 0 0" }}>
            Nessuna selezione = accesso totale. Seleziona per limitare la visibilità.
          </p>
        </div>
        <Btn variant="ghost" size="sm" onClick={onClose}><i className="ti ti-x" /></Btn>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 32, color: "var(--text2)" }}>
          <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 20 }} />
        </div>
      ) : (
        <>
          {err && (
            <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{err}</p>
          )}

          {/* Tre colonne */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
            <SelectColumn
              title="Immobili"
              icon="ti-building"
              items={allImmobili}
              selected={selImm}
              onToggle={toggle(setSelImm)}
              onClear={() => { setSelImm([]); setSelInq([]); setSelProp([]); }}
              renderItem={it => it.nome}
              emptyText="Nessun immobile"
            />
            <SelectColumn
              title="Inquilini"
              icon="ti-users"
              items={inquiliniFiltrati}
              selected={selInq}
              onToggle={toggle(setSelInq)}
              onClear={() => setSelInq([])}
              renderItem={p => nomePersona(p)}
              emptyText="Nessun inquilino"
              filterNote={selImm.length > 0 ? "(filtrati per imm. selezionati)" : undefined}
            />
            <SelectColumn
              title="Proprietari"
              icon="ti-user-circle"
              items={proprietariFiltrati}
              selected={selProp}
              onToggle={toggle(setSelProp)}
              onClear={() => setSelProp([])}
              renderItem={p => nomePersona(p)}
              emptyText="Nessun proprietario"
              filterNote={selImm.length > 0 ? "(filtrati per imm. selezionati)" : undefined}
            />
          </div>

          {/* Riepilogo */}
          <div style={{
            marginTop: 16, padding: "10px 14px", borderRadius: 8,
            background: "var(--bg3)", border: "1px solid var(--border)",
            fontSize: 12, color: "var(--text2)",
          }}>
            <i className="ti ti-info-circle" style={{ marginRight: 6 }} />
            {isTotal ? (
              "Questo utente vedrà tutti gli immobili, tutti gli inquilini e tutti i proprietari."
            ) : (
              <>
                Questo utente vedrà
                {selImm.length > 0
                  ? <strong> {selImm.length} immobile{selImm.length !== 1 ? "i" : ""}</strong>
                  : <strong> tutti gli immobili</strong>
                },{" "}
                {selInq.length > 0
                  ? <strong> {selInq.length} inquilin{selInq.length !== 1 ? "i" : "o"}</strong>
                  : <strong> tutti gli inquilini</strong>
                }{" "}e{" "}
                {selProp.length > 0
                  ? <strong> {selProp.length} proprietar{selProp.length !== 1 ? "i" : "io"}</strong>
                  : <strong> tutti i proprietari</strong>
                }.
              </>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
            <Btn variant="primary" onClick={handleSave} disabled={saving}>
              <i className="ti ti-check" /> {saving ? "Salvataggio…" : "Salva restrizioni"}
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab principale ─────────────────────────────────────────────────────────────
export function RuoliV2() {
  const [viewers,       setViewers]      = useState([]);
  const [summaries,     setSummaries]    = useState({});
  const [allImmobili,   setAllImmobili]  = useState([]);
  const [allInquilini,  setAllInquilini] = useState([]);
  const [allProprietari,setAllProprietari]= useState([]);
  const [selected,      setSelected]     = useState(null);
  const [loading,       setLoading]      = useState(true);
  const [err,           setErr]          = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [users, condomini] = await Promise.all([
        authApi.listUsers(),
        condominiV2.lista(),
      ]);

      const vws = users.filter(u => u.ruolo === "viewer");
      setViewers(vws);

      // Carica tutti gli immobili con condominio
      const imm = await immobiliV2.lista();
      const immConNome = imm.map(i => {
        const cond = condomini.find(c => c.id === i.condominioId);
        return { ...i, _sub: cond?.nome || "" };
      }).sort((a, b) => (a._sub + a.nome).localeCompare(b._sub + b.nome));
      setAllImmobili(immConNome);

      // Carica ruoli per tutti gli immobili → inquilini + proprietari con riferimento agli immobili
      const ruoliAll = await Promise.all(imm.map(i => immobiliV2.ruoli(i.id).catch(() => [])));
      const oggi = new Date().toISOString().slice(0, 10);

      const inqMap  = new Map(); // personaId → {persona, immobiliIds[]}
      const propMap = new Map();

      ruoliAll.forEach((ruoli, idx) => {
        const immId = imm[idx].id;
        ruoli.forEach(r => {
          const attivo = (!r.validitaDa || r.validitaDa <= oggi) && (!r.validitaA || r.validitaA >= oggi);
          if (!attivo) return;
          if (r.ruolo === "inquilino") {
            if (!inqMap.has(r.personaId)) {
              inqMap.set(r.personaId, {
                id: r.personaId, nome: r.personaNome, cognome: r.personaCognome,
                tipo_persona: "fisica", _immobiliIds: [],
                _sub: r.immobileNome,
              });
            }
            inqMap.get(r.personaId)._immobiliIds.push(immId);
          }
          if (r.ruolo === "proprietario") {
            if (!propMap.has(r.personaId)) {
              propMap.set(r.personaId, {
                id: r.personaId, nome: r.personaNome, cognome: r.personaCognome,
                tipo_persona: "fisica", _immobiliIds: [],
                _sub: r.immobileNome,
              });
            }
            propMap.get(r.personaId)._immobiliIds.push(immId);
          }
        });
      });

      setAllInquilini([...inqMap.values()].sort((a, b) =>
        (a.cognome || "").localeCompare(b.cognome || "") || (a.nome || "").localeCompare(b.nome || "")
      ));
      setAllProprietari([...propMap.values()].sort((a, b) =>
        (a.cognome || "").localeCompare(b.cognome || "") || (a.nome || "").localeCompare(b.nome || "")
      ));

      // Carica i summary per ogni viewer
      const sums = {};
      await Promise.all(vws.map(async v => {
        try { sums[v.id] = await authApi.getRestrizioniV2(v.id); }
        catch { sums[v.id] = { immobili: [], inquilini: [], proprietari: [] }; }
      }));
      setSummaries(sums);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSaved(userId, nuoveRestrizioni) {
    setSummaries(s => ({ ...s, [userId]: nuoveRestrizioni }));
    setSelected(null);
  }

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 48, color: "var(--text2)" }}>
        <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 28 }} />
        <p style={{ marginTop: 12, fontSize: 13 }}>Caricamento dati…</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Gestione Ruoli</h2>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12,
                       background: "#1e3a5f", color: "#60a5fa", border: "1px solid #3b82f6" }}>v2</span>
      </div>

      {err && (
        <div style={{
          background: "rgba(239,68,68,0.1)", border: "1px solid var(--red)",
          borderRadius: 8, padding: "10px 16px", marginBottom: 16,
          fontSize: 13, color: "var(--red)", display: "flex", alignItems: "center", gap: 8,
        }}>
          <i className="ti ti-alert-triangle" />
          {err}
          <Btn size="sm" variant="ghost" onClick={() => setErr(null)} style={{ marginLeft: "auto" }}>
            <i className="ti ti-x" />
          </Btn>
        </div>
      )}

      {viewers.length === 0 ? (
        <div style={{
          background: "var(--bg2)", border: "1px solid var(--border)",
          borderRadius: 12, textAlign: "center", padding: "48px 24px", color: "var(--text2)",
        }}>
          <i className="ti ti-eye-off" style={{ fontSize: 36, opacity: 0.35, display: "block", marginBottom: 14 }} />
          <p style={{ fontSize: 14, margin: "0 0 6px" }}>
            Nessun utente con ruolo <strong style={{ color: "var(--text)" }}>Visualizzatore</strong>.
          </p>
          <p style={{ fontSize: 12 }}>
            Aggiungi utenti e assegna il ruolo Visualizzatore dalla sezione Gestione Utenti.
          </p>
        </div>
      ) : (
        <>
          {/* Info box */}
          <div style={{
            padding: "10px 14px", borderRadius: 8, marginBottom: 16,
            background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)",
            fontSize: 12, color: "var(--text2)",
          }}>
            <i className="ti ti-shield-lock" style={{ marginRight: 6, color: "var(--accent)" }} />
            Le restrizioni si applicano solo agli utenti con ruolo <strong>Visualizzatore</strong>.
            Admin ed Editor hanno sempre accesso completo.
            Nessuna selezione = accesso totale.
          </div>

          {/* Card viewer */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 12, marginBottom: 4,
          }}>
            {viewers.map(v => {
              const isActive = selected?.id === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setSelected(isActive ? null : v)}
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
                      <p style={{
                        fontWeight: 700, fontSize: 13, margin: 0,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {nomeUtente(v)}
                      </p>
                      <p style={{
                        fontSize: 11, color: "var(--text2)", margin: "1px 0 0",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {v.email}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <SummaryBadge res={summaries[v.id]} />
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

          {/* Editor */}
          {selected && (
            <EditorRestrizioni
              viewer={selected}
              allImmobili={allImmobili}
              allInquilini={allInquilini}
              allProprietari={allProprietari}
              onSaved={r => handleSaved(selected.id, r)}
              onClose={() => setSelected(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
