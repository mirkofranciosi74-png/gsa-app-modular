import { useState, useEffect, useCallback } from "react";
import { condominiV2, immobiliV2, ruoliV2, personeV2 } from "../api/apiV2.js";
import { Btn, Badge, Modal, Field } from "../../components/ui.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtEur = v =>
  v == null ? "—" : Number(v).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

const RUOLO_INFO = {
  proprietario: { label: "Proprietario", color: "blue"   },
  inquilino:    { label: "Inquilino",    color: "green"  },
  garante:      { label: "Garante",      color: "yellow" },
  contatto:     { label: "Contatto",     color: "gray"   },
};

function oggi() { return new Date().toISOString().slice(0, 10); }
function isAttivoRuolo(r) {
  const d = oggi();
  return (!r.validitaDa || r.validitaDa <= d) && (!r.validitaA || r.validitaA >= d);
}

// ── Sotto-tab navigation ──────────────────────────────────────────────────────
function SubTabs({ active, onChange }) {
  const tabs = [
    { id: "immobili",  icon: "ti-building",        label: "Immobili"  },
    { id: "condomini", icon: "ti-building-estate",  label: "Condomini" },
  ];
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 20,
                  borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "8px 16px", border: "none", cursor: "pointer", fontSize: 13,
          background: "none", fontWeight: active === t.id ? 700 : 400,
          color: active === t.id ? "var(--accent)" : "var(--text2)",
          borderBottom: active === t.id ? "2px solid var(--accent)" : "2px solid transparent",
          marginBottom: -1, transition: "all 0.15s",
        }}>
          <i className={`ti ${t.icon}`} style={{ fontSize: 16 }} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Modale crea/modifica Condominio ───────────────────────────────────────────
function CondominioModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState({ nome: "", indirizzo: "", ...initial });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSave() {
    if (!form.nome?.trim()) { setErr("Nome obbligatorio"); return; }
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch (e) { setErr(e.message); setSaving(false); }
  }

  return (
    <Modal title={initial?.id ? "Modifica Condominio" : "Nuovo Condominio"}
           onClose={onClose} width={440}
           footer={<>
             <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
             <Btn variant="primary" onClick={handleSave} disabled={saving}>
               {saving ? "Salvo…" : "Salva"}
             </Btn>
           </>}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <p style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{err}</p>}
        <Field label="Nome *">
          <input className="inp" value={form.nome} onChange={set("nome")} autoFocus />
        </Field>
        <Field label="Indirizzo">
          <input className="inp" value={form.indirizzo || ""} onChange={set("indirizzo")} />
        </Field>
      </div>
    </Modal>
  );
}

// ── Modale riassegna condominio ───────────────────────────────────────────────
function RiassegnaModal({ immobile, condomini, onSave, onClose }) {
  const [condominioId, setCondominioId] = useState(immobile.condominioId || "");
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);

  async function handleSave() {
    if (!condominioId || condominioId === immobile.condominioId) {
      setErr("Seleziona un condominio diverso da quello attuale");
      return;
    }
    setSaving(true);
    try { await onSave(condominioId); onClose(); }
    catch (e) { setErr(e.message); setSaving(false); }
  }

  const altri = condomini.filter(c => c.id !== immobile.condominioId);

  return (
    <Modal title={`Sposta "${immobile.nome}"`} onClose={onClose} width={400}
           footer={<>
             <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
             <Btn variant="primary" onClick={handleSave} disabled={saving}>
               {saving ? "Sposto…" : "Sposta"}
             </Btn>
           </>}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <p style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{err}</p>}
        <div style={{
          padding: "9px 12px", borderRadius: 8, background: "var(--bg3)",
          fontSize: 12, color: "var(--text2)",
        }}>
          <i className="ti ti-building-estate" style={{ marginRight: 6 }} />
          Condominio attuale: <strong style={{ color: "var(--text)" }}>{immobile.condominioNome}</strong>
        </div>
        <Field label="Sposta in *">
          <select className="inp" value={condominioId}
                  onChange={e => setCondominioId(e.target.value)} autoFocus>
            <option value="">— Seleziona —</option>
            {altri.map(c => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </Field>
        {altri.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--text2)", fontStyle: "italic", margin: 0 }}>
            Non ci sono altri condomini disponibili.
          </p>
        )}
      </div>
    </Modal>
  );
}

// ── Modale crea/modifica Immobile ─────────────────────────────────────────────
function ImmobileModal({ initial, condomini, onSave, onClose }) {
  const [form, setForm] = useState({
    nome: "", via: "", citta: "", cap: "", note: "",
    ...initial,
    condominioId: initial?.condominioId || "",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSave() {
    if (!form.nome?.trim())     { setErr("Nome obbligatorio"); return; }
    if (!form.condominioId)     { setErr("Condominio obbligatorio"); return; }
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch (e) { setErr(e.message); setSaving(false); }
  }

  return (
    <Modal title={initial?.id ? "Modifica Immobile" : "Nuovo Immobile"}
           onClose={onClose} width={500}
           footer={<>
             <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
             <Btn variant="primary" onClick={handleSave} disabled={saving}>
               {saving ? "Salvo…" : "Salva"}
             </Btn>
           </>}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <p style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{err}</p>}
        <Field label="Nome *">
          <input className="inp" value={form.nome} onChange={set("nome")} autoFocus />
        </Field>
        <Field label="Condominio *">
          <select className="inp" value={form.condominioId} onChange={set("condominioId")}>
            <option value="">— Seleziona —</option>
            {condomini.map(c => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </Field>
        <Field label="Via / Indirizzo">
          <input className="inp" value={form.via || ""} onChange={set("via")} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <Field label="Città">
            <input className="inp" value={form.citta || ""} onChange={set("citta")} />
          </Field>
          <Field label="CAP">
            <input className="inp" value={form.cap || ""} onChange={set("cap")}
                   style={{ width: 90 }} />
          </Field>
        </div>
        <Field label="Note">
          <textarea className="inp" rows={2} value={form.note || ""} onChange={set("note")}
                    style={{ resize: "vertical" }} />
        </Field>
      </div>
    </Modal>
  );
}

// ── Modale aggiunta/modifica Ruolo ────────────────────────────────────────────
function RuoloModal({ initial, immobileId, onSave, onClose }) {
  const [persone,  setPersone]  = useState([]);
  const [queryP,   setQueryP]   = useState(initial ? `${initial.personaCognome || ""} ${initial.personaNome || ""}`.trim() : "");
  const [form, setForm] = useState({
    personaId:    initial?.personaId    || "",
    ruolo:        initial?.ruolo        || "inquilino",
    validitaDa:   initial?.validitaDa   || "",
    validitaA:    initial?.validitaA    || "",
    quota:        initial?.quota        ?? "",
    quotaAffitto: initial?.quotaAffitto ?? "",
    caparra:      initial?.caparra      ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      personeV2.lista(queryP || undefined).then(setPersone).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [queryP]);

  const set    = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setNum = k => e => setForm(f => ({ ...f, [k]: e.target.value === "" ? "" : Number(e.target.value) }));

  async function handleSave() {
    if (!form.personaId) { setErr("Seleziona una persona"); return; }
    setSaving(true);
    try {
      await onSave({ ...form, immobileId, quota: form.quota !== "" ? form.quota : null,
                     quotaAffitto: form.quotaAffitto !== "" ? form.quotaAffitto : null,
                     caparra: form.caparra !== "" ? form.caparra : null });
      onClose();
    } catch (e) { setErr(e.message); setSaving(false); }
  }

  return (
    <Modal title={initial ? "Modifica Ruolo" : "Assegna Persona"}
           onClose={onClose} width={480}
           footer={<>
             <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
             <Btn variant="primary" onClick={handleSave} disabled={saving}>
               {saving ? "Salvo…" : "Salva"}
             </Btn>
           </>}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <p style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{err}</p>}

        {/* Ricerca persona */}
        <Field label="Persona *">
          <input className="inp" placeholder="Cerca per nome…" value={queryP}
                 onChange={e => { setQueryP(e.target.value); setForm(f=>({...f, personaId:""})); }} />
          {persone.length > 0 && !form.personaId && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, marginTop: 4,
                          maxHeight: 160, overflowY: "auto", background: "var(--bg2)" }}>
              {persone.map(p => {
                const nome = [p.cognome, p.nome].filter(Boolean).join(" ");
                return (
                  <button key={p.id} onClick={() => { setForm(f=>({...f, personaId: p.id})); setQueryP(nome); }}
                          style={{ width: "100%", padding: "8px 12px", border: "none", background: "none",
                                   cursor: "pointer", color: "var(--text)", fontSize: 13, textAlign: "left",
                                   borderBottom: "1px solid var(--border)" }}>
                    {nome}
                    {p.legacyRefs?.map((r,i) => (
                      <span key={i} style={{ marginLeft: 8, fontSize: 10, color: "var(--text2)" }}>
                        {r.tipo === "proprietario" ? "prop." : "inq."}
                      </span>
                    ))}
                  </button>
                );
              })}
            </div>
          )}
          {form.personaId && (
            <p style={{ fontSize: 12, color: "var(--green)", margin: "4px 0 0" }}>
              <i className="ti ti-circle-check" style={{ marginRight: 4 }} />
              {queryP} selezionata
            </p>
          )}
        </Field>

        <Field label="Ruolo *">
          <select className="inp" value={form.ruolo} onChange={set("ruolo")}>
            <option value="proprietario">Proprietario</option>
            <option value="inquilino">Inquilino</option>
            <option value="garante">Garante</option>
            <option value="contatto">Contatto</option>
          </select>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Validità da">
            <input className="inp" type="date" value={form.validitaDa || ""} onChange={set("validitaDa")} />
          </Field>
          <Field label="Validità a">
            <input className="inp" type="date" value={form.validitaA || ""} onChange={set("validitaA")} />
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Field label="Quota %" hint="es. 60">
            <input className="inp" type="number" min={0} max={100} step={0.01}
                   value={form.quota} onChange={setNum("quota")} />
          </Field>
          <Field label="Quota affitto %">
            <input className="inp" type="number" min={0} max={100} step={0.01}
                   value={form.quotaAffitto} onChange={setNum("quotaAffitto")} />
          </Field>
          <Field label="Caparra €">
            <input className="inp" type="number" min={0} step={0.01}
                   value={form.caparra} onChange={setNum("caparra")} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

// ── Pannello dettaglio Immobile ────────────────────────────────────────────────
function ImmobileDettaglio({ immobile: initialImmobile, condomini, onEdit, onClose, onRuoliChange, onMoved }) {
  const [immobile,     setImmobile]     = useState(initialImmobile);
  const [ruoli,        setRuoli]        = useState(null);
  const [totali,       setTotali]       = useState(null);
  const [quoteVerifica,setQuoteVerifica]= useState(null);
  const [quadratura,   setQuadratura]   = useState(null);
  const [addRuolo,     setAddRuolo]     = useState(false);
  const [editRuolo,    setEditRuolo]    = useState(null);
  const [delRuoloId,   setDelRuoloId]   = useState(null);
  const [deleting,     setDeleting]     = useState(false);
  const [openSection,  setOpenSection]  = useState("ruoli");
  const [sposta,       setSposta]       = useState(false);
  const [err,          setErr]          = useState(null);

  async function handleSposta(newCondominioId) {
    const updated = await immobiliV2.aggiorna(immobile.id, { condominioId: newCondominioId });
    setImmobile(updated);
    onMoved?.();
  }

  const loadRuoli = useCallback(async () => {
    try {
      const [r, qv] = await Promise.all([
        immobiliV2.ruoli(immobile.id),
        immobiliV2.verificaQuote(immobile.id),
      ]);
      setRuoli(r);
      setQuoteVerifica(qv);
    } catch (e) { setErr(e.message); }
  }, [immobile.id]);

  const loadTotali = useCallback(async () => {
    try { setTotali(await immobiliV2.totali(immobile.id)); }
    catch (e) { setErr(e.message); }
  }, [immobile.id]);

  const loadQuadratura = useCallback(async () => {
    try { setQuadratura(await immobiliV2.quadratura(immobile.id)); }
    catch (e) { setErr(e.message); }
  }, [immobile.id]);

  useEffect(() => { loadRuoli(); }, [loadRuoli]);

  useEffect(() => {
    if (openSection === "totali" && !totali)         loadTotali();
    if (openSection === "quadratura" && !quadratura) loadQuadratura();
  }, [openSection, totali, quadratura, loadTotali, loadQuadratura]);

  async function handleSaveRuolo(form) {
    if (editRuolo) await ruoliV2.aggiorna(editRuolo.id, form);
    else           await ruoliV2.crea(form);
    await loadRuoli();
    onRuoliChange?.();
  }

  async function handleDelRuolo(id) {
    setDeleting(true);
    try { await ruoliV2.rimuovi(id); await loadRuoli(); setDelRuoloId(null); }
    catch (e) { setErr(e.message); }
    finally { setDeleting(false); }
  }

  // --- sezioni collassabili ---
  function Section({ id, title, icon, children }) {
    const isOpen = openSection === id;
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
        <button onClick={() => setOpenSection(isOpen ? null : id)} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "11px 16px", background: "var(--bg3)", border: "none", cursor: "pointer",
          color: "var(--text)", fontSize: 13, fontWeight: 600,
        }}>
          <i className={`ti ${icon}`} style={{ color: "var(--accent)", fontSize: 15 }} />
          <span style={{ flex: 1, textAlign: "left" }}>{title}</span>
          <i className={`ti ti-chevron-${isOpen ? "up" : "down"}`} style={{ color: "var(--text2)" }} />
        </button>
        {isOpen && <div style={{ padding: "14px 16px" }}>{children}</div>}
      </div>
    );
  }

  const oggiStr = oggi();

  return (
    <Modal title={immobile.nome} subtitle={immobile.condominioNome}
           onClose={onClose} width={640}
           footer={<>
             <Btn variant="ghost" onClick={onClose}>Chiudi</Btn>
             <Btn variant="ghost" onClick={() => setSposta(true)} title="Sposta in altro condominio">
               <i className="ti ti-replace" /> Sposta
             </Btn>
             <Btn variant="primary" onClick={onEdit}>
               <i className="ti ti-pencil" /> Modifica
             </Btn>
           </>}>

      {err && (
        <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 12,
                      background: "rgba(239,68,68,0.08)", padding: "8px 12px", borderRadius: 8 }}>
          {err} <button onClick={() => setErr(null)} style={{ background: "none", border: "none",
                  cursor: "pointer", color: "var(--text2)", marginLeft: 8 }}>✕</button>
        </div>
      )}

      {/* Dati immobile */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                    gap: 10, marginBottom: 16 }}>
        {[
          ["Via",     immobile.via],
          ["Città",   immobile.citta],
          ["CAP",     immobile.cap],
          ["Note",    immobile.note],
        ].filter(([, v]) => v).map(([label, val]) => (
          <div key={label}>
            <p style={{ fontSize: 10, color: "var(--text2)", margin: "0 0 2px",
                        textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</p>
            <p style={{ fontSize: 13, margin: 0 }}>{val}</p>
          </div>
        ))}
        <div>
          <p style={{ fontSize: 10, color: "var(--text2)", margin: "0 0 4px",
                      textTransform: "uppercase", letterSpacing: 0.5 }}>Stato</p>
          <Badge label={immobile.attivo ? "Attivo" : "Inattivo"}
                 color={immobile.attivo ? "green" : "gray"} />
        </div>
      </div>

      {/* ── RUOLI ── */}
      <Section id="ruoli" title="Ruoli e persone" icon="ti-users">
        {/* Quote verifica */}
        {quoteVerifica?.map((qv, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
            padding: "7px 12px", borderRadius: 8,
            background: qv.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${qv.ok ? "rgba(34,197,94,0.3)" : "var(--red)"}`,
            fontSize: 12,
          }}>
            <i className={`ti ${qv.ok ? "ti-circle-check" : "ti-alert-triangle"}`}
               style={{ color: qv.ok ? "var(--green)" : "var(--red)" }} />
            <span>
              {qv.ruolo.charAt(0).toUpperCase() + qv.ruolo.slice(1)}:
              {" "}{qv.nRuoli} ruolo{qv.nRuoli !== 1 ? "i" : ""},
              {" "}quota totale {qv.sommaQuota.toFixed(2)}%
              {!qv.ok && " — dovrebbe essere 100%"}
              {!qv.tutteValorizzate && " — alcune quote non valorizzate"}
            </span>
          </div>
        ))}

        {/* Lista ruoli */}
        {!ruoli && <p style={{ color: "var(--text2)", fontSize: 13 }}>
          <i className="ti ti-loader-2 ti-spin" style={{ marginRight: 6 }} />Carico…
        </p>}
        {ruoli?.length === 0 && (
          <p style={{ color: "var(--text2)", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
            Nessun ruolo assegnato.
          </p>
        )}
        {ruoli && ruoli.length > 0 && (
          <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            {ruoli.map(r => {
              const attivo = isAttivoRuolo(r);
              const info   = RUOLO_INFO[r.ruolo] || { label: r.ruolo, color: "gray" };
              return (
                <div key={r.id} style={{
                  display: "grid", gridTemplateColumns: "1fr auto",
                  gap: 10, alignItems: "center", padding: "9px 12px",
                  background: "var(--bg3)", borderRadius: 8,
                  opacity: attivo ? 1 : 0.6,
                  border: `1px solid ${attivo ? "var(--border)" : "rgba(255,255,255,0.05)"}`,
                }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                      <Badge label={info.label} color={info.color} />
                      {!attivo && <Badge label="Scaduto" color="gray" />}
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        {[r.personaCognome, r.personaNome].filter(Boolean).join(" ")}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: "var(--text2)", margin: 0 }}>
                      {r.validitaDa && `dal ${r.validitaDa}`}
                      {r.validitaA  && ` al ${r.validitaA}`}
                      {r.quota != null && ` · quota ${r.quota}%`}
                      {r.caparra && ` · caparra ${fmtEur(r.caparra)}`}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <Btn size="sm" variant="ghost" title="Modifica"
                         onClick={() => setEditRuolo(r)}>
                      <i className="ti ti-pencil" />
                    </Btn>
                    <Btn size="sm" variant="ghost" title="Rimuovi"
                         onClick={() => setDelRuoloId(r.id)}>
                      <i className="ti ti-trash" style={{ color: "var(--red)" }} />
                    </Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <Btn variant="primary" size="sm" onClick={() => setAddRuolo(true)}>
          <i className="ti ti-plus" /> Assegna persona
        </Btn>
      </Section>

      {/* ── TOTALI ── */}
      <Section id="totali" title="Totali economici" icon="ti-coin">
        {!totali ? (
          <p style={{ color: "var(--text2)", fontSize: 13 }}>
            <i className="ti ti-loader-2 ti-spin" style={{ marginRight: 6 }} />Carico totali…
          </p>
        ) : totali.length === 0 ? (
          <p style={{ color: "var(--text2)", fontSize: 13 }}>Nessun dato economico migrato per questo immobile.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "var(--text2)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left",  padding: "4px 8px" }}>Tipo</th>
                <th style={{ textAlign: "left",  padding: "4px 8px" }}>Categoria</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>N.</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Netto</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Lordo</th>
              </tr>
            </thead>
            <tbody>
              {totali.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 8px" }}>
                    <Badge label={r.tipo} color={r.tipo === "entrata" ? "green" : "blue"} />
                  </td>
                  <td style={{ padding: "6px 8px", color: "var(--text2)" }}>
                    {r.tipo_spesa || "—"}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.n_fatti}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>
                    {fmtEur(r.totale_netto)}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: "var(--text2)" }}>
                    {fmtEur(r.totale_lordo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* ── QUADRATURA ── */}
      <Section id="quadratura" title="Quadratura legacy↔v2" icon="ti-checkup-list">
        {!quadratura ? (
          <p style={{ color: "var(--text2)", fontSize: 13 }}>
            <i className="ti ti-loader-2 ti-spin" style={{ marginRight: 6 }} />Carico…
          </p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
                          padding: "8px 12px", borderRadius: 8,
                          background: quadratura.pass ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                          border: `1px solid ${quadratura.pass ? "rgba(34,197,94,0.3)" : "var(--red)"}` }}>
              <i className={`ti ${quadratura.pass ? "ti-circle-check" : "ti-alert-triangle"}`}
                 style={{ color: quadratura.pass ? "var(--green)" : "var(--red)" }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {quadratura.pass ? "✅ Dati allineati" : "❌ Delta rilevato — verificare"}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[
                ["Spese doc. (legacy)", quadratura.leg_spese_doc,  "Spese doc. (v2)", quadratura.v2_spese_doc,  quadratura.delta_spese_doc],
                ["Spese prop.(legacy)", quadratura.leg_spese_prop, "Spese prop.(v2)", quadratura.v2_spese_prop, quadratura.delta_spese_prop],
                ["Versamenti (legacy)", quadratura.leg_versamenti, "Versamenti (v2)", quadratura.v2_versamenti, quadratura.delta_versamenti],
              ].map(([lLab, lVal, vLab, vVal, delta], i) => (
                <div key={i} style={{ background: "var(--bg3)", borderRadius: 8, padding: "10px 12px",
                                      border: `1px solid ${delta < 0.01 ? "var(--border)" : "var(--red)"}` }}>
                  <p style={{ fontSize: 10, color: "var(--text2)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {lLab.split("(")[0].trim()}
                  </p>
                  <p style={{ fontSize: 12, margin: "0 0 2px" }}>
                    Legacy: <strong>{fmtEur(lVal)}</strong>
                  </p>
                  <p style={{ fontSize: 12, margin: "0 0 4px" }}>
                    v2: <strong>{fmtEur(vVal)}</strong>
                  </p>
                  {delta >= 0.01 && (
                    <p style={{ fontSize: 11, color: "var(--red)", margin: 0 }}>
                      Δ {fmtEur(delta)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* Modali ruoli */}
      {(addRuolo || editRuolo) && (
        <RuoloModal
          initial={editRuolo}
          immobileId={immobile.id}
          onSave={handleSaveRuolo}
          onClose={() => { setAddRuolo(false); setEditRuolo(null); }}
        />
      )}
      {delRuoloId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
                      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }}>
          <div style={{ background: "var(--bg2)", border: "1px solid var(--red)", borderRadius: 12,
                        padding: 24, maxWidth: 360, width: "100%" }}>
            <p style={{ marginBottom: 20, fontSize: 14 }}>Rimuovere questo ruolo dall'immobile?</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => setDelRuoloId(null)}>Annulla</Btn>
              <Btn variant="danger" disabled={deleting}
                   onClick={() => handleDelRuolo(delRuoloId)}>
                {deleting ? "Elimino…" : <><i className="ti ti-trash" /> Rimuovi</>}
              </Btn>
            </div>
          </div>
        </div>
      )}
      {sposta && (
        <RiassegnaModal
          immobile={immobile}
          condomini={condomini}
          onSave={handleSposta}
          onClose={() => setSposta(false)}
        />
      )}
    </Modal>
  );
}

// ── Card immobile (usata anche nella sezione condomini) ───────────────────────
function ImmobileCard({ im, condomini, onEdit, onDetail, onDeleted, onMoved, showCondominio = true }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [delErr,     setDelErr]     = useState(null);

  async function handleDelete() {
    setDeleting(true);
    setDelErr(null);
    try {
      await immobiliV2.elimina(im.id);
      setConfirmDel(false);
      onDeleted?.();
    } catch (e) {
      setDelErr(e.message);
      setDeleting(false);
    }
  }

  return (
    <>
      <div onClick={onDetail}
           style={{
             background: "var(--bg2)", border: "1px solid var(--border)",
             borderRadius: 10, padding: "12px 16px", cursor: "pointer",
             display: "grid", gridTemplateColumns: "1fr auto", gap: 12,
             alignItems: "center", transition: "border-color 0.15s",
           }}
           onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent)"}
           onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <i className="ti ti-building" style={{ color: "var(--accent)", fontSize: 15 }} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>{im.nome}</span>
            {!im.attivo && <Badge label="Inattivo" color="gray" />}
          </div>
          <p style={{ fontSize: 12, color: "var(--text2)", margin: 0 }}>
            {showCondominio && im.condominioNome && <>{im.condominioNome}{(im.via || im.citta) && " · "}</>}
            {im.via}{im.citta && `, ${im.citta}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
          <Btn size="sm" variant="ghost" title="Modifica" onClick={onEdit}>
            <i className="ti ti-pencil" />
          </Btn>
          <Btn size="sm" variant="ghost" title="Elimina"
               onClick={() => setConfirmDel(true)}>
            <i className="ti ti-trash" style={{ color: "var(--red)" }} />
          </Btn>
          <Btn size="sm" variant="ghost" title="Dettaglio" onClick={onDetail}>
            <i className="ti ti-chevron-right" />
          </Btn>
        </div>
      </div>

      {confirmDel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
                      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }}>
          <div style={{ background: "var(--bg2)", border: "1px solid var(--red)", borderRadius: 12,
                        padding: 24, maxWidth: 400, width: "100%" }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Eliminare "{im.nome}"?</p>
            <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
              L'operazione è irreversibile. Se l'immobile ha ruoli, movimenti o regole associate
              non potrà essere eliminato.
            </p>
            {delErr && (
              <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 12,
                          padding: "8px 10px", borderRadius: 7, background: "rgba(239,68,68,0.08)" }}>
                {delErr}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => { setConfirmDel(false); setDelErr(null); }}>Annulla</Btn>
              <Btn variant="danger" disabled={deleting} onClick={handleDelete}>
                {deleting ? "Elimino…" : <><i className="ti ti-trash" /> Elimina</>}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Sezione Immobili ───────────────────────────────────────────────────────────
function ImmobiliSection({ condomini }) {
  const [immobili,  setImmobili]  = useState(null);
  const [selected,  setSelected]  = useState(null);
  const [editing,   setEditing]   = useState(null);
  const [showForm,  setShowForm]  = useState(false);
  const [filtCond,  setFiltCond]  = useState("");
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setImmobili(await immobiliV2.lista(filtCond ? { condominioId: filtCond } : {}));
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [filtCond]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form) {
    if (editing?.id) await immobiliV2.aggiorna(editing.id, form);
    else             await immobiliV2.crea(form);
    await load();
  }

  function openEdit(im) {
    setEditing(im);
    setSelected(null);
    setShowForm(true);
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select className="inp" value={filtCond} onChange={e => setFiltCond(e.target.value)}
                style={{ maxWidth: 220 }}>
          <option value="">Tutti i condomini</option>
          {condomini.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        {immobili && (
          <span style={{ fontSize: 12, color: "var(--text2)" }}>
            {loading ? <i className="ti ti-loader-2 ti-spin" /> : `${immobili.length} immobili`}
          </span>
        )}
        <Btn variant="primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          <i className="ti ti-plus" /> Nuovo Immobile
        </Btn>
      </div>

      {err && (
        <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 12,
                      padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)",
                      border: "1px solid var(--red)" }}>{err}</div>
      )}

      {!immobili && !err && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text2)" }}>
          <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 24 }} />
        </div>
      )}

      {immobili?.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: 48, color: "var(--text2)" }}>
          <i className="ti ti-building-off" style={{ fontSize: 36, opacity: 0.35, display: "block", marginBottom: 12 }} />
          Nessun immobile trovato.
        </div>
      )}

      {immobili && immobili.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {immobili.map(im => (
            <ImmobileCard
              key={im.id}
              im={im}
              condomini={condomini}
              showCondominio
              onEdit={() => openEdit(im)}
              onDetail={() => setSelected(im)}
              onDeleted={load}
              onMoved={load}
            />
          ))}
        </div>
      )}

      {selected && (
        <ImmobileDettaglio
          immobile={selected}
          condomini={condomini}
          onEdit={() => openEdit(selected)}
          onClose={() => setSelected(null)}
          onRuoliChange={load}
          onMoved={() => { load(); setSelected(null); }}
        />
      )}

      {showForm && (
        <ImmobileModal
          initial={editing}
          condomini={condomini}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ── Card condominio espandibile ────────────────────────────────────────────────
function CondominioCard({ c, tutti_condomini, onEditCondominio, onReload, onDeleted }) {
  const [open,       setOpen]       = useState(false);
  const [immobili,   setImmobili]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [selected,   setSelected]   = useState(null);
  const [editing,    setEditing]    = useState(null);
  const [showForm,   setShowForm]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [delErr,     setDelErr]     = useState(null);

  async function handleDelete() {
    setDeleting(true);
    setDelErr(null);
    try {
      await condominiV2.elimina(c.id);
      onDeleted?.();
    } catch (e) {
      setDelErr(e.message);
      setDeleting(false);
    }
  }

  const loadImmobili = useCallback(async () => {
    setLoading(true);
    try { setImmobili(await immobiliV2.lista({ condominioId: c.id })); }
    catch (_) {}
    finally { setLoading(false); }
  }, [c.id]);

  useEffect(() => { if (open) loadImmobili(); }, [open, loadImmobili]);

  async function handleSaveImmobile(form) {
    if (editing?.id) await immobiliV2.aggiorna(editing.id, form);
    else             await immobiliV2.crea({ ...form, condominioId: c.id });
    await loadImmobili();
    onReload(); // aggiorna contatori header
  }

  function openEdit(im) {
    setEditing(im);
    setSelected(null);
    setShowForm(true);
  }

  return (
    <div style={{
      background: "var(--bg2)", border: "1px solid var(--border)",
      borderRadius: 10, overflow: "hidden",
    }}>
      {/* Header card condominio */}
      <div style={{
        padding: "13px 16px",
        display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center",
      }}>
        <button onClick={() => setOpen(o => !o)} style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0,
        }}>
          <i className={`ti ti-chevron-${open ? "down" : "right"}`}
             style={{ fontSize: 13, color: "var(--text2)", flexShrink: 0 }} />
          <i className="ti ti-building-estate" style={{ color: "var(--accent)", fontSize: 16, flexShrink: 0 }} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{c.nome}</span>
              {c.virtuale && <Badge label="virtuale" color="gray" />}
            </div>
            <p style={{ fontSize: 12, color: "var(--text2)", margin: 0 }}>
              {c.nImmobili ?? 0} immobile{c.nImmobili !== 1 ? "i" : ""}
              {c.indirizzo && ` · ${c.indirizzo}`}
            </p>
          </div>
        </button>
        <div style={{ display: "flex", gap: 4 }}>
          <Btn size="sm" variant="ghost" title="Aggiungi immobile"
               onClick={() => { setEditing(null); setOpen(true); setShowForm(true); }}>
            <i className="ti ti-plus" />
          </Btn>
          <Btn size="sm" variant="ghost" title="Modifica condominio"
               onClick={() => onEditCondominio(c)}>
            <i className="ti ti-pencil" />
          </Btn>
          <Btn size="sm" variant="ghost" title="Elimina condominio"
               onClick={() => setConfirmDel(true)}>
            <i className="ti ti-trash" style={{ color: "var(--red)" }} />
          </Btn>
        </div>
      </div>

      {/* Lista immobili espansa */}
      {open && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px 14px" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: 20, color: "var(--text2)" }}>
              <i className="ti ti-loader-2 ti-spin" />
            </div>
          )}
          {!loading && immobili?.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text2)", textAlign: "center", padding: "12px 0" }}>
              Nessun immobile. <button onClick={() => setShowForm(true)}
                style={{ background: "none", border: "none", color: "var(--accent)",
                         cursor: "pointer", fontSize: 13, padding: 0 }}>
                Creane uno ›
              </button>
            </p>
          )}
          {immobili && immobili.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              {immobili.map(im => (
                <ImmobileCard
                  key={im.id}
                  im={im}
                  condomini={tutti_condomini}
                  showCondominio={false}
                  onEdit={() => openEdit(im)}
                  onDetail={() => setSelected(im)}
                  onDeleted={() => { loadImmobili(); onReload(); }}
                  onMoved={() => { loadImmobili(); onReload(); }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modali */}
      {selected && (
        <ImmobileDettaglio
          immobile={selected}
          condomini={tutti_condomini}
          onEdit={() => openEdit(selected)}
          onClose={() => setSelected(null)}
          onRuoliChange={loadImmobili}
          onMoved={() => { loadImmobili(); onReload(); setSelected(null); }}
        />
      )}
      {showForm && (
        <ImmobileModal
          initial={editing ?? { condominioId: c.id }}
          condomini={tutti_condomini}
          onSave={handleSaveImmobile}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {confirmDel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
                      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }}>
          <div style={{ background: "var(--bg2)", border: "1px solid var(--red)", borderRadius: 12,
                        padding: 24, maxWidth: 400, width: "100%" }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Eliminare "{c.nome}"?</p>
            <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
              Il condominio deve essere privo di immobili per poter essere eliminato.
            </p>
            {delErr && (
              <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 12,
                          padding: "8px 10px", borderRadius: 7, background: "rgba(239,68,68,0.08)" }}>
                {delErr}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => { setConfirmDel(false); setDelErr(null); }}>Annulla</Btn>
              <Btn variant="danger" disabled={deleting} onClick={handleDelete}>
                {deleting ? "Elimino…" : <><i className="ti ti-trash" /> Elimina</>}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sezione Condomini ─────────────────────────────────────────────────────────
function CondominiSection({ condomini, onReload }) {
  const [editing,  setEditing]  = useState(null);
  const [showForm, setShowForm] = useState(false);

  async function handleSave(form) {
    if (editing?.id) await condominiV2.aggiorna(editing.id, form);
    else             await condominiV2.crea(form);
    await onReload();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <Btn variant="primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          <i className="ti ti-plus" /> Nuovo Condominio
        </Btn>
      </div>

      {condomini.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text2)" }}>
          <i className="ti ti-building-estate" style={{ fontSize: 32, opacity: 0.3, display: "block", marginBottom: 10 }} />
          Nessun condominio. Crea il primo.
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {condomini.map(c => (
          <CondominioCard
            key={c.id}
            c={c}
            tutti_condomini={condomini}
            onEditCondominio={cond => { setEditing(cond); setShowForm(true); }}
            onReload={onReload}
            onDeleted={onReload}
          />
        ))}
      </div>

      {showForm && (
        <CondominioModal
          initial={editing}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ── Tab principale ─────────────────────────────────────────────────────────────
export function PatrimonioV2() {
  const [sezione,   setSezione]  = useState("immobili");
  const [condomini, setCondomini]= useState([]);
  const [loading,   setLoading]  = useState(true);

  const loadCondomini = useCallback(async () => {
    setLoading(true);
    try { setCondomini(await condominiV2.lista()); }
    catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCondomini(); }, [loadCondomini]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Patrimonio</h2>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12,
                       background: "#1e3a5f", color: "#60a5fa", border: "1px solid #3b82f6" }}>v2</span>
        {!loading && (
          <span style={{ fontSize: 12, color: "var(--text2)" }}>
            {condomini.length} condomini · {condomini.reduce((s, c) => s + (c.nImmobili ?? 0), 0)} immobili
          </span>
        )}
      </div>

      <SubTabs active={sezione} onChange={setSezione} />

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text2)" }}>
          <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 24 }} />
        </div>
      )}

      {!loading && sezione === "immobili" && (
        <ImmobiliSection condomini={condomini} />
      )}
      {!loading && sezione === "condomini" && (
        <CondominiSection condomini={condomini} onReload={loadCondomini} />
      )}
    </div>
  );
}
