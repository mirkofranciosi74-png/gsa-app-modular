import { useState, useEffect, useCallback } from "react";
import { personeV2, ruoliV2 } from "../api/apiV2.js";
import { Btn, Badge, Modal, Field } from "../../components/ui.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

// ── Costanti ───────────────────────────────────────────────────────────────────
const RUOLO_LEGACY = {
  proprietario: { label: "Proprietario", color: "blue"  },
  componente:   { label: "Inquilino",    color: "green" },
};
const RUOLO_V2 = {
  proprietario: { label: "Proprietario", color: "blue"   },
  inquilino:    { label: "Inquilino",    color: "green"  },
  garante:      { label: "Garante",      color: "yellow" },
  contatto:     { label: "Contatto",     color: "gray"   },
};

function nomeCompleto(p) {
  return [p.cognome, p.nome].filter(Boolean).join(" ");
}

// ── Debounce hook ──────────────────────────────────────────────────────────────
function useDebounced(value, ms = 300) {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return dv;
}

// ── Banner quadratura (solo admin) ────────────────────────────────────────────
function QuadraturaBanner() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    personeV2.quadratura().then(setData).catch(() => {});
  }, []);

  if (!data) return null;

  const ok = data.pass;
  return (
    <div style={{
      background: ok ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)",
      border:     `1px solid ${ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.4)"}`,
      borderRadius: 10, padding: "10px 16px", marginBottom: 16,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10,
                 background: "none", border: "none", cursor: "pointer", color: "var(--text)" }}
      >
        <i className={`ti ${ok ? "ti-circle-check" : "ti-alert-triangle"}`}
           style={{ color: ok ? "var(--green)" : "var(--red)", fontSize: 18, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1, textAlign: "left" }}>
          Quadratura legacy↔v2:{" "}
          {ok
            ? `✅ Allineato — ${data.persone_totali} persone, ${data.migrati_proprietari} prop., ${data.migrati_componenti} inq.`
            : `❌ Delta rilevato — espandi per dettagli`}
        </span>
        <i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ color: "var(--text2)" }} />
      </button>

      {open && (
        <div style={{ marginTop: 12, display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
          {[
            ["Proprietari legacy", data.legacy_proprietari, null],
            ["Migrati prop.",      data.migrati_proprietari, Number(data.legacy_proprietari) === Number(data.migrati_proprietari)],
            ["Inquilini legacy",   data.legacy_componenti, null],
            ["Migrati inq.",       data.migrati_componenti, Number(data.legacy_componenti) === Number(data.migrati_componenti)],
            ["Persone v2 totali",  data.persone_totali, null],
            ["Orfani prop.",       data.proprietari_orfani, Number(data.proprietari_orfani) === 0],
            ["Orfani inq.",        data.componenti_orfani, Number(data.componenti_orfani) === 0],
          ].map(([label, val, isOk]) => (
            <div key={label} style={{
              background: "var(--bg2)", borderRadius: 8, padding: "8px 12px",
              border: `1px solid ${isOk === false ? "var(--red)" : isOk === true ? "var(--green)" : "var(--border)"}`,
            }}>
              <p style={{ fontSize: 10, color: "var(--text2)", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {label}
              </p>
              <p style={{ fontSize: 20, fontWeight: 700, margin: 0,
                          color: isOk === false ? "var(--red)" : isOk === true ? "var(--green)" : "var(--text)" }}>
                {val}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Modale crea / modifica persona ────────────────────────────────────────────
function PersonaModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState({
    nome: "", cognome: "", email: "", telefono: "", indirizzo: "", note: "", attivo: true,
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);

  const set     = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setBool = k => e => setForm(f => ({ ...f, [k]: e.target.checked }));

  async function handleSave() {
    if (!form.nome?.trim()) { setErr("Nome obbligatorio"); return; }
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch (e) { setErr(e.message); setSaving(false); }
  }

  return (
    <Modal
      title={initial?.id ? "Modifica Persona" : "Nuova Persona"}
      subtitle={initial?.id ? nomeCompleto(initial) : undefined}
      onClose={onClose}
      width={500}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Salvo…" : "Salva"}
        </Btn>
      </>}
    >
      <div style={{ display: "grid", gap: 14 }}>
        {err && <p style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{err}</p>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Nome *">
            <input className="inp" value={form.nome} onChange={set("nome")} autoFocus />
          </Field>
          <Field label="Cognome">
            <input className="inp" value={form.cognome || ""} onChange={set("cognome")} />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Email">
            <input className="inp" type="email" value={form.email || ""} onChange={set("email")} />
          </Field>
          <Field label="Telefono">
            <input className="inp" value={form.telefono || ""} onChange={set("telefono")} />
          </Field>
        </div>
        <Field label="Indirizzo">
          <input className="inp" value={form.indirizzo || ""} onChange={set("indirizzo")} />
        </Field>
        <Field label="Note">
          <textarea className="inp" rows={2} value={form.note || ""} onChange={set("note")}
                    style={{ resize: "vertical" }} />
        </Field>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={!!form.attivo} onChange={setBool("attivo")} />
          Persona attiva
        </label>
      </div>
    </Modal>
  );
}

// ── Pannello dettaglio con ruoli ───────────────────────────────────────────────
function PersonaDettaglio({ persona, onEdit, onClose }) {
  const [ruoli,    setRuoli]    = useState(null);
  const [errRuoli, setErrRuoli] = useState(null);

  useEffect(() => {
    ruoliV2.perPersona(persona.id)
      .then(setRuoli)
      .catch(e => setErrRuoli(e.message));
  }, [persona.id]);

  const oggi      = new Date().toISOString().slice(0, 10);
  const legacyRef = persona.legacyRefs || [];

  return (
    <Modal
      title={nomeCompleto(persona)}
      subtitle={persona.email || undefined}
      onClose={onClose}
      width={580}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Chiudi</Btn>
        <Btn variant="primary" onClick={onEdit}>
          <i className="ti ti-pencil" /> Modifica
        </Btn>
      </>}
    >
      <div style={{ display: "grid", gap: 20 }}>
        {/* Dati anagrafici */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            ["Email",     persona.email],
            ["Telefono",  persona.telefono],
            ["Indirizzo", persona.indirizzo],
            ["Note",      persona.note],
          ].filter(([, v]) => v).map(([label, val]) => (
            <div key={label}>
              <p style={{ fontSize: 11, color: "var(--text2)", margin: "0 0 2px",
                          textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</p>
              <p style={{ fontSize: 13, margin: 0 }}>{val}</p>
            </div>
          ))}
          <div>
            <p style={{ fontSize: 11, color: "var(--text2)", margin: "0 0 4px",
                        textTransform: "uppercase", letterSpacing: 0.5 }}>Stato</p>
            <Badge label={persona.attivo ? "Attiva" : "Inattiva"} color={persona.attivo ? "green" : "gray"} />
          </div>
        </div>

        {/* Legacy refs */}
        {legacyRef.length > 0 && (
          <div>
            <p style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase",
                        letterSpacing: 0.8, margin: "0 0 8px", fontWeight: 700 }}>
              Collegamento legacy
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {legacyRef.map((ref, i) => {
                const info = RUOLO_LEGACY[ref.tipo] || { label: ref.tipo, color: "gray" };
                return (
                  <span key={i} style={{
                    fontSize: 12, padding: "3px 10px", borderRadius: 8,
                    background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--text2)",
                  }}>
                    <i className="ti ti-link" style={{ marginRight: 4, fontSize: 10 }} />
                    {info.label} #{ref.id}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Ruoli v2 */}
        <div>
          <p style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase",
                      letterSpacing: 0.8, margin: "0 0 10px", fontWeight: 700 }}>
            Ruoli immobili (v2)
          </p>
          {errRuoli && <p style={{ color: "var(--red)", fontSize: 12 }}>{errRuoli}</p>}
          {!ruoli && !errRuoli && (
            <p style={{ color: "var(--text2)", fontSize: 13 }}>
              <i className="ti ti-loader-2 ti-spin" style={{ marginRight: 6 }} />Carico ruoli…
            </p>
          )}
          {ruoli?.length === 0 && (
            <p style={{ color: "var(--text2)", fontSize: 13 }}>Nessun ruolo assegnato.</p>
          )}
          {ruoli && ruoli.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              {ruoli.map(r => {
                const attivo = (!r.validitaDa || r.validitaDa <= oggi)
                            && (!r.validitaA  || r.validitaA  >= oggi);
                const info = RUOLO_V2[r.ruolo] || { label: r.ruolo, color: "gray" };
                return (
                  <div key={r.id} style={{
                    background: "var(--bg3)", borderRadius: 8, padding: "10px 14px",
                    opacity: attivo ? 1 : 0.6,
                    border: `1px solid ${attivo ? "var(--border)" : "rgba(255,255,255,0.05)"}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <Badge label={info.label} color={info.color} />
                      {!attivo && <Badge label="Scaduto" color="gray" />}
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{r.immobileNome}</span>
                    </div>
                    <p style={{ fontSize: 11, color: "var(--text2)", margin: 0 }}>
                      {r.condominioNome}
                      {r.validitaDa && ` · dal ${r.validitaDa}`}
                      {r.validitaA  && ` al ${r.validitaA}`}
                      {r.quota != null && ` · quota ${r.quota}%`}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Card persona nella lista ───────────────────────────────────────────────────
function PersonaCard({ persona, onSelect, onEdit }) {
  const legacyRef = persona.legacyRefs || [];
  const [hover, setHover] = useState(false);

  return (
    <div
      onClick={() => onSelect(persona)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "var(--bg2)",
        border: `1px solid ${hover ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 10, padding: "13px 16px",
        display: "grid", gridTemplateColumns: "1fr auto",
        gap: 12, alignItems: "center", cursor: "pointer",
        transition: "border-color 0.15s",
      }}
    >
      <div style={{ minWidth: 0 }}>
        {/* Nome + badges */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            {nomeCompleto(persona) || "—"}
          </span>
          {!persona.attivo && <Badge label="Inattiva" color="gray" />}
          {legacyRef.map((ref, i) => {
            const info = RUOLO_LEGACY[ref.tipo] || { label: ref.tipo, color: "gray" };
            return <Badge key={i} label={info.label} color={info.color} />;
          })}
        </div>
        {/* Contatti */}
        <p style={{ fontSize: 12, color: "var(--text2)", margin: 0,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[persona.email, persona.telefono].filter(Boolean).join(" · ") || "—"}
        </p>
        {persona.indirizzo && (
          <p style={{ fontSize: 11, color: "var(--text2)", margin: "3px 0 0",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <i className="ti ti-map-pin" style={{ marginRight: 4 }} />
            {persona.indirizzo}
          </p>
        )}
      </div>

      {/* Azioni */}
      <div style={{ display: "flex", gap: 4 }}>
        <Btn size="sm" variant="ghost" title="Modifica"
             onClick={e => { e.stopPropagation(); onEdit(persona); }}>
          <i className="ti ti-pencil" />
        </Btn>
        <Btn size="sm" variant="ghost" title="Dettaglio"
             onClick={e => { e.stopPropagation(); onSelect(persona); }}>
          <i className="ti ti-chevron-right" />
        </Btn>
      </div>
    </div>
  );
}

// ── Schermo vuoto con invito a creare ──────────────────────────────────────────
function EmptyState({ query, onCreate }) {
  return (
    <div style={{ textAlign: "center", padding: "56px 24px", color: "var(--text2)" }}>
      <i className="ti ti-users-off" style={{ fontSize: 40, opacity: 0.35, display: "block", marginBottom: 14 }} />
      {query
        ? <p style={{ fontSize: 15 }}>Nessuna persona trovata per <strong style={{ color: "var(--text)" }}>"{query}"</strong></p>
        : <>
            <p style={{ fontSize: 15, marginBottom: 6 }}>Nessuna persona registrata.</p>
            <p style={{ fontSize: 13, marginBottom: 16 }}>
              Le persone v2 vengono popolate dalla migrazione legacy oppure create manualmente.
            </p>
            <Btn variant="primary" onClick={onCreate}>
              <i className="ti ti-plus" /> Crea la prima persona
            </Btn>
          </>
      }
    </div>
  );
}

// ── Tab principale ─────────────────────────────────────────────────────────────
export function PersoneV2() {
  const { user }                    = useAuth();
  const [persone,  setPersone]      = useState(null);
  const [query,    setQuery]        = useState("");
  const [selected, setSelected]     = useState(null);
  const [editing,  setEditing]      = useState(null);
  const [showForm, setShowForm]     = useState(false);
  const [loading,  setLoading]      = useState(false);
  const [err,      setErr]          = useState(null);

  const dq = useDebounced(query, 300);

  const load = useCallback(async q => {
    setLoading(true);
    setErr(null);
    try { setPersone(await personeV2.lista(q || undefined)); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(dq); }, [dq, load]);

  async function handleSave(form) {
    if (editing?.id) await personeV2.aggiorna(editing.id, form);
    else             await personeV2.crea(form);
    await load(dq);
  }

  function openEdit(persona) {
    setEditing(persona);
    setSelected(null);
    setShowForm(true);
  }

  function openNew() {
    setEditing(null);
    setShowForm(true);
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Persone</h2>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12,
                         background: "#1e3a5f", color: "#60a5fa", border: "1px solid #3b82f6" }}>v2</span>
          {persone && !loading && (
            <span style={{ fontSize: 12, color: "var(--text2)" }}>
              {persone.length} {persone.length === 1 ? "persona" : "persone"}
              {query && " trovate"}
            </span>
          )}
          {loading && (
            <i className="ti ti-loader-2 ti-spin" style={{ color: "var(--text2)", fontSize: 14 }} />
          )}
        </div>
        <Btn variant="primary" onClick={openNew}>
          <i className="ti ti-plus" /> Nuova Persona
        </Btn>
      </div>

      {/* ── Quadratura (admin) ── */}
      {user?.ruolo === "admin" && <QuadraturaBanner />}

      {/* ── Ricerca ── */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <i className="ti ti-search" style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
          color: "var(--text2)", fontSize: 16, pointerEvents: "none",
        }} />
        <input
          className="inp"
          placeholder="Cerca per nome, cognome, email…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ paddingLeft: 38, paddingRight: query ? 36 : undefined }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                     background: "none", border: "none", cursor: "pointer", color: "var(--text2)", padding: 4 }}>
            <i className="ti ti-x" style={{ fontSize: 15 }} />
          </button>
        )}
      </div>

      {/* ── Errore ── */}
      {err && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid var(--red)",
                      borderRadius: 8, padding: "10px 16px", marginBottom: 16,
                      display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--red)" }}>
          <i className="ti ti-alert-triangle" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{err}</span>
          <Btn size="sm" variant="ghost" onClick={() => setErr(null)}><i className="ti ti-x" /></Btn>
        </div>
      )}

      {/* ── Lista ── */}
      {!persone && !err && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text2)" }}>
          <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 24 }} />
        </div>
      )}

      {persone?.length === 0 && !loading && (
        <EmptyState query={query} onCreate={openNew} />
      )}

      {persone && persone.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {persone.map(p => (
            <PersonaCard
              key={p.id}
              persona={p}
              onSelect={setSelected}
              onEdit={openEdit}
            />
          ))}
        </div>
      )}

      {/* ── Modali ── */}
      {selected && (
        <PersonaDettaglio
          persona={selected}
          onEdit={() => openEdit(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      {showForm && (
        <PersonaModal
          initial={editing}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
