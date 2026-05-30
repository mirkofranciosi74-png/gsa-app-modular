import { useState, useEffect, useCallback, useMemo } from "react";
import { condominiV2, immobiliV2, ruoliV2, personeV2 } from "../api/apiV2.js";
import { Btn, Badge, Modal, Field } from "../components/ui.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtEur = v =>
  v == null ? "—" : Number(v).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

const RUOLO_INFO = {
  proprietario: { label: "Proprietario", color: "blue"   },
  inquilino:    { label: "Inquilino",    color: "green"  },
  garante:      { label: "Garante",      color: "yellow" },
  contatto:     { label: "Contatto",     color: "gray"   },
};

const RUOLO_PC_INFO = {
  condomino:      { label: "Condomino",      color: "blue"   },
  amministratore: { label: "Amministratore", color: "purple" },
  delegato:       { label: "Delegato",       color: "yellow" },
  altro:          { label: "Altro",          color: "gray"   },
};

const TIPOLOGIE = [
  { value: "appartamento",        label: "Appartamento" },
  { value: "villa",               label: "Villa" },
  { value: "villetta",            label: "Villetta" },
  { value: "box",                 label: "Box / Garage" },
  { value: "posto_auto",          label: "Posto auto" },
  { value: "ufficio",             label: "Ufficio" },
  { value: "locale_commerciale",  label: "Locale commerciale" },
  { value: "magazzino",           label: "Magazzino" },
  { value: "terreno",             label: "Terreno" },
  { value: "cantina",             label: "Cantina" },
  { value: "altro",               label: "Altro" },
];
const TIPOLOGIA_LABEL = Object.fromEntries(TIPOLOGIE.map(t => [t.value, t.label]));

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
  const [form, setForm] = useState({
    nome: "", codice: "", indirizzo: "", citta: "", cap: "",
    millesimitotali: 1000, note: "", validitaDa: "", validitaA: "",
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSave() {
    if (!form.nome?.trim()) { setErr("Nome obbligatorio"); return; }
    if (form.validitaA && form.validitaDa && form.validitaA < form.validitaDa) {
      setErr("Data fine deve essere >= data inizio"); return;
    }
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch (e) { setErr(e.message); setSaving(false); }
  }

  return (
    <Modal title={initial?.id ? "Modifica Condominio" : "Nuovo Condominio"}
           onClose={onClose} width={500}
           footer={<>
             <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
             <Btn variant="primary" onClick={handleSave} disabled={saving}>
               {saving ? "Salvo…" : "Salva"}
             </Btn>
           </>}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <p style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{err}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <Field label="Nome *">
            <input className="inp" value={form.nome} onChange={set("nome")} autoFocus />
          </Field>
          <Field label="Codice">
            <input className="inp" value={form.codice || ""} onChange={set("codice")} style={{ width: 100 }} />
          </Field>
        </div>
        <Field label="Indirizzo">
          <input className="inp" value={form.indirizzo || ""} onChange={set("indirizzo")} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <Field label="Città">
            <input className="inp" value={form.citta || ""} onChange={set("citta")} />
          </Field>
          <Field label="CAP">
            <input className="inp" value={form.cap || ""} onChange={set("cap")} style={{ width: 80 }} />
          </Field>
        </div>
        <Field label="Millesimi totali" hint="default 1000">
          <input className="inp" type="number" min={1} step={0.001}
                 value={form.millesimitotali || 1000} onChange={set("millesimitotali")} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Validità da">
            <input className="inp" type="date" value={form.validitaDa || ""} onChange={set("validitaDa")} />
          </Field>
          <Field label="Validità a">
            <input className="inp" type="date" value={form.validitaA || ""} onChange={set("validitaA")} />
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
    nome: "", codice: "", via: "", citta: "", cap: "",
    superficie: "", percentualeCondominio: "", millesimiCondominio: "",
    tipologia: "", note: "", validitaDa: "", validitaA: "",
    ...initial,
    condominioId: initial?.condominioId || "",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSave() {
    if (!form.nome?.trim()) { setErr("Nome obbligatorio"); return; }
    if (!form.condominioId) { setErr("Condominio obbligatorio"); return; }
    if (form.validitaA && form.validitaDa && form.validitaA < form.validitaDa) {
      setErr("Data fine deve essere >= data inizio"); return;
    }
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch (e) { setErr(e.message); setSaving(false); }
  }

  return (
    <Modal title={initial?.id ? "Modifica Immobile" : "Nuovo Immobile"}
           onClose={onClose} width={540}
           footer={<>
             <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
             <Btn variant="primary" onClick={handleSave} disabled={saving}>
               {saving ? "Salvo…" : "Salva"}
             </Btn>
           </>}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <p style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{err}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <Field label="Nome *">
            <input className="inp" value={form.nome} onChange={set("nome")} autoFocus />
          </Field>
          <Field label="Codice">
            <input className="inp" value={form.codice || ""} onChange={set("codice")} style={{ width: 100 }} />
          </Field>
        </div>
        <Field label="Condominio *">
          <select className="inp" value={form.condominioId} onChange={set("condominioId")}>
            <option value="">— Seleziona —</option>
            {condomini.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
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
            <input className="inp" value={form.cap || ""} onChange={set("cap")} style={{ width: 90 }} />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <Field label="Superficie (m²)">
            <input className="inp" type="number" min={0} step={0.01}
                   value={form.superficie || ""} onChange={set("superficie")} />
          </Field>
          <Field label="% Condominio">
            <input className="inp" type="number" min={0} max={100} step={0.0001}
                   value={form.percentualeCondominio || ""} onChange={set("percentualeCondominio")}
                   placeholder="es. 12.5" />
          </Field>
          <Field label="Millesimi">
            <input className="inp" type="number" min={0} step={0.001}
                   value={form.millesimiCondominio || ""} onChange={set("millesimiCondominio")}
                   placeholder="es. 125" />
          </Field>
        </div>
        <Field label="Tipologia">
          <select className="inp" value={form.tipologia || ""} onChange={set("tipologia")}>
            <option value="">— Nessuna —</option>
            {TIPOLOGIE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Validità da">
            <input className="inp" type="date" value={form.validitaDa || ""} onChange={set("validitaDa")} />
          </Field>
          <Field label="Validità a">
            <input className="inp" type="date" value={form.validitaA || ""} onChange={set("validitaA")} />
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
    personaId:         initial?.personaId         || "",
    ruolo:             initial?.ruolo             || "inquilino",
    validitaDa:        initial?.validitaDa        || "",
    validitaA:         initial?.validitaA         || "",
    quota:             initial?.quota             ?? "",
    quotaAffitto:      initial?.quotaAffitto      ?? "",
    caparra:           initial?.caparra           ?? "",
    defaultPagante:    initial?.defaultPagante    ?? false,
    defaultIncassante: initial?.defaultIncassante ?? false,
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
      await onSave({ ...form, immobileId,
                     validitaDa:        form.validitaDa        || null,
                     validitaA:         form.validitaA         || null,
                     quota:             form.quota        !== "" ? form.quota        : null,
                     quotaAffitto:      form.quotaAffitto !== "" ? form.quotaAffitto : null,
                     caparra:           form.caparra      !== "" ? form.caparra      : null,
                     defaultPagante:    form.defaultPagante,
                     defaultIncassante: form.defaultIncassante });
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
          <Field label="Quota" hint="quota millesimale">
            <input className="inp" type="number" min={0} max={100} step={0.01}
                   value={form.quota} onChange={setNum("quota")} />
          </Field>
          <Field label="Quota affitto €" hint="canone mensile">
            <input className="inp" type="number" min={0} step={0.01}
                   value={form.quotaAffitto} onChange={setNum("quotaAffitto")} />
          </Field>
          <Field label="Caparra €">
            <input className="inp" type="number" min={0} step={0.01}
                   value={form.caparra} onChange={setNum("caparra")} />
          </Field>
        </div>

        {/* Flag default pagante / incassante */}
        <div style={{ background: "var(--bg3)", borderRadius: 8, padding: "10px 14px",
                      display: "grid", gap: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 600, margin: 0, color: "var(--text2)",
                      textTransform: "uppercase", letterSpacing: 0.4 }}>
            Ruolo di default per i movimenti
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox"
                   checked={!!form.defaultPagante}
                   onChange={e => setForm(f => ({ ...f, defaultPagante: e.target.checked }))}
                   style={{ accentColor: "var(--accent)", width: 15, height: 15 }} />
            <span>
              <strong>Soggetto pagante default</strong>
              <span style={{ color: "var(--text2)", marginLeft: 6 }}>
                — paga le spese per l'immobile prima del riparto
              </span>
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox"
                   checked={!!form.defaultIncassante}
                   onChange={e => setForm(f => ({ ...f, defaultIncassante: e.target.checked }))}
                   style={{ accentColor: "var(--accent)", width: 15, height: 15 }} />
            <span>
              <strong>Soggetto incassante default</strong>
              <span style={{ color: "var(--text2)", marginLeft: 6 }}>
                — incassa le entrate per l'immobile prima del riparto
              </span>
            </span>
          </label>
        </div>
      </div>
    </Modal>
  );
}

// ── Modale associazione Persona ↔ Condominio ─────────────────────────────────
function PersonaCondominioModal({ initial, condominioId, onSave, onClose }) {
  const [persone, setPersone] = useState([]);
  const [queryP,  setQueryP]  = useState(
    initial ? [initial.personaCognome, initial.personaNome].filter(Boolean).join(" ") : ""
  );
  const [form, setForm] = useState({
    personaId:  initial?.personaId  || "",
    ruolo:      initial?.ruolo      || "condomino",
    validitaDa: initial?.validitaDa || "",
    validitaA:  initial?.validitaA  || "",
    note:       initial?.note       || "",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      personeV2.lista(queryP || undefined).then(setPersone).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [queryP]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSave() {
    if (!form.personaId) { setErr("Seleziona una persona"); return; }
    if (!form.validitaDa) { setErr("Data inizio obbligatoria"); return; }
    setSaving(true);
    try { await onSave({ ...form, condominioId }); onClose(); }
    catch (e) { setErr(e.message); setSaving(false); }
  }

  const nomeSelezionata = queryP;

  return (
    <Modal title={initial ? "Modifica associazione" : "Associa persona al condominio"}
           onClose={onClose} width={480}
           footer={<>
             <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
             <Btn variant="primary" onClick={handleSave} disabled={saving}>
               {saving ? "Salvo…" : "Salva"}
             </Btn>
           </>}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <p style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{err}</p>}

        <Field label="Persona *">
          <input className="inp" placeholder="Cerca per nome…" value={queryP}
                 onChange={e => { setQueryP(e.target.value); setForm(f => ({ ...f, personaId: "" })); }} />
          {persone.length > 0 && !form.personaId && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, marginTop: 4,
                          maxHeight: 160, overflowY: "auto", background: "var(--bg2)" }}>
              {persone.map(p => {
                const nome = p.ragioneSociale || [p.cognome, p.nome].filter(Boolean).join(" ");
                return (
                  <button key={p.id}
                          onClick={() => { setForm(f => ({ ...f, personaId: p.id })); setQueryP(nome); }}
                          style={{ width: "100%", padding: "8px 12px", border: "none", background: "none",
                                   cursor: "pointer", color: "var(--text)", fontSize: 13, textAlign: "left",
                                   borderBottom: "1px solid var(--border)" }}>
                    {nome}
                  </button>
                );
              })}
            </div>
          )}
          {form.personaId && (
            <p style={{ fontSize: 12, color: "var(--green)", margin: "4px 0 0" }}>
              <i className="ti ti-circle-check" style={{ marginRight: 4 }} />
              {nomeSelezionata} selezionata
            </p>
          )}
        </Field>

        <Field label="Ruolo *">
          <select className="inp" value={form.ruolo} onChange={set("ruolo")}>
            <option value="condomino">Condomino</option>
            <option value="amministratore">Amministratore</option>
            <option value="delegato">Delegato</option>
            <option value="altro">Altro</option>
          </select>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Validità da *">
            <input className="inp" type="date" value={form.validitaDa} onChange={set("validitaDa")} />
          </Field>
          <Field label="Validità a">
            <input className="inp" type="date" value={form.validitaA} onChange={set("validitaA")} />
          </Field>
        </div>

        <Field label="Note">
          <textarea className="inp" rows={2} value={form.note} onChange={set("note")}
                    style={{ resize: "vertical" }} />
        </Field>
      </div>
    </Modal>
  );
}

// ── Pannello dettaglio Immobile ────────────────────────────────────────────────
function ImmobileDettaglio({ immobile: initialImmobile, condomini, onEdit, onClose, onRuoliChange, onMoved }) {
  const [immobile,     setImmobile]     = useState(initialImmobile);
  const [ruoli,        setRuoli]        = useState(null);
  const [quoteVerifica,setQuoteVerifica]= useState(null);
  const [addRuolo,     setAddRuolo]     = useState(false);
  const [editRuolo,    setEditRuolo]    = useState(null);
  const [delRuoloId,   setDelRuoloId]   = useState(null);
  const [deleting,     setDeleting]     = useState(false);
  const [sposta,       setSposta]       = useState(false);
  const [mostraScaduti,setMostraScaduti]= useState(false);
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

  useEffect(() => { loadRuoli(); }, [loadRuoli]);

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

  // --- sezione collassabile ---
  function Section({ title, icon, children }) {
    const [open, setOpen] = useState(true);
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
        <button onClick={() => setOpen(o => !o)} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "11px 16px", background: "var(--bg3)", border: "none", cursor: "pointer",
          color: "var(--text)", fontSize: 13, fontWeight: 600,
        }}>
          <i className={`ti ${icon}`} style={{ color: "var(--accent)", fontSize: 15 }} />
          <span style={{ flex: 1, textAlign: "left" }}>{title}</span>
          <i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ color: "var(--text2)" }} />
        </button>
        {open && <div style={{ padding: "14px 16px" }}>{children}</div>}
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
      <Section title="Ruoli e persone" icon="ti-users">
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
              {qv.ruolo.charAt(0).toUpperCase() + qv.ruolo.slice(1)}:{" "}
              {qv.nRuoliAttivi} attiv{qv.nRuoliAttivi !== 1 ? "i" : "o"}
              {qv.nRuoliTotale > qv.nRuoliAttivi && ` (${qv.nRuoliTotale} totali)`},
              {" "}quota totale attivi {qv.sommaQuota.toFixed(2)}%
              {!qv.ok && " — dovrebbe essere 100%"}
              {!qv.tutteValorizzate && " — alcune quote non valorizzate"}
            </span>
          </div>
        ))}

        {/* Toggle mostra scaduti */}
        {ruoli && ruoli.some(r => !isAttivoRuolo(r)) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <button onClick={() => setMostraScaduti(v => !v)} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "none", border: "1px solid var(--border)", borderRadius: 6,
              padding: "4px 10px", cursor: "pointer", fontSize: 12, color: "var(--text2)",
            }}>
              <i className={`ti ${mostraScaduti ? "ti-eye-off" : "ti-eye"}`} style={{ fontSize: 14 }} />
              {mostraScaduti
                ? `Nascondi scaduti (${ruoli.filter(r => !isAttivoRuolo(r)).length})`
                : `Mostra scaduti (${ruoli.filter(r => !isAttivoRuolo(r)).length})`}
            </button>
          </div>
        )}

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
            {ruoli.filter(r => mostraScaduti || isAttivoRuolo(r)).map(r => {
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
                      {r.defaultPagante    && <Badge label="★ Paga spese"   color="blue"   />}
                      {r.defaultIncassante && <Badge label="★ Incassa"      color="green"  />}
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        {[r.personaCognome, r.personaNome].filter(Boolean).join(" ")}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: "var(--text2)", margin: 0 }}>
                      {r.validitaDa && `dal ${r.validitaDa}`}
                      {r.validitaA  && ` al ${r.validitaA}`}
                      {r.quota != null && ` · quota ${r.quota}`}
                      {r.quotaAffitto && ` · affitto ${fmtEur(r.quotaAffitto)}/mese`}
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

// ── Intestazione colonna ordinabile ──────────────────────────────────────────
function SortTh({ label, k, sortKey, sortDir, onSort, style }) {
  const active = sortKey === k;
  return (
    <th onClick={() => onSort(k)}
        style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600,
                 fontSize: 11, color: active ? "var(--accent)" : "var(--text2)",
                 cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                 borderBottom: "1px solid var(--border)", ...style }}>
      {label}
      {active
        ? <i className={`ti ti-chevron-${sortDir === "asc" ? "up" : "down"}`}
             style={{ marginLeft: 4, fontSize: 10 }} />
        : <i className="ti ti-selector" style={{ marginLeft: 4, fontSize: 10, opacity: 0.35 }} />}
    </th>
  );
}

// ── Sezione Immobili ───────────────────────────────────────────────────────────
function ImmobiliSection({ condomini }) {
  const [immobili,     setImmobili]     = useState(null);
  const [selected,     setSelected]     = useState(null);
  const [editing,      setEditing]      = useState(null);
  const [showForm,     setShowForm]     = useState(false);
  const [filtCond,     setFiltCond]     = useState("");
  const [filtText,     setFiltText]     = useState("");
  const [soggettoIn,   setSoggettoIn]   = useState("");
  const [filtSoggetto, setFiltSoggetto] = useState("");
  const [sortKey,      setSortKey]      = useState("nome");
  const [sortDir,      setSortDir]      = useState("asc");
  const [loading,      setLoading]      = useState(false);
  const [err,          setErr]          = useState(null);

  // Debounce soggetto search (triggers API reload)
  useEffect(() => {
    const t = setTimeout(() => setFiltSoggetto(soggettoIn.trim()), 450);
    return () => clearTimeout(t);
  }, [soggettoIn]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = {};
      if (filtCond)      params.condominioId = filtCond;
      if (filtSoggetto)  params.soggetto     = filtSoggetto;
      setImmobili(await immobiliV2.lista(params));
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [filtCond, filtSoggetto]);

  useEffect(() => { load(); }, [load]);

  // Client-side text filter + sort
  const displayed = useMemo(() => {
    if (!immobili) return [];
    let list = immobili;
    if (filtText.trim()) {
      const q = filtText.trim().toLowerCase();
      list = list.filter(im =>
        [im.nome, im.codice, im.via, im.citta, im.condominioNome,
         im.tipologia ? TIPOLOGIA_LABEL[im.tipologia] : ""]
          .some(f => f?.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => {
      let va = a[sortKey] ?? "";
      let vb = b[sortKey] ?? "";
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [immobili, filtText, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

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

  const thProps = { sortKey, sortDir, onSort: toggleSort };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select className="inp" value={filtCond} onChange={e => setFiltCond(e.target.value)}
                style={{ maxWidth: 200 }}>
          <option value="">Tutti i condomini</option>
          {condomini.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <input className="inp" placeholder="Cerca testo…" value={filtText}
               onChange={e => setFiltText(e.target.value)}
               style={{ maxWidth: 180 }} />
        <input className="inp" placeholder="Cerca soggetto…" value={soggettoIn}
               onChange={e => setSoggettoIn(e.target.value)}
               title="Filtra per nome / cognome del soggetto associato"
               style={{ maxWidth: 180 }} />
        <span style={{ flex: 1 }} />
        {immobili && (
          <span style={{ fontSize: 12, color: "var(--text2)" }}>
            {loading
              ? <i className="ti ti-loader-2 ti-spin" />
              : `${displayed.length}${displayed.length !== immobili.length ? ` / ${immobili.length}` : ""} immobili`}
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

      {immobili && displayed.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: 48, color: "var(--text2)" }}>
          <i className="ti ti-building-off" style={{ fontSize: 36, opacity: 0.35, display: "block", marginBottom: 12 }} />
          Nessun immobile trovato.
        </div>
      )}

      {immobili && displayed.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <SortTh label="Nome"       k="nome"           {...thProps} />
                <SortTh label="Tipologia"  k="tipologia"      {...thProps} />
                <SortTh label="Condominio" k="condominioNome" {...thProps} />
                <SortTh label="Via / Città" k="citta"         {...thProps} />
                <SortTh label="Sup. m²"   k="superficie"     {...thProps} style={{ textAlign: "right" }} />
                <SortTh label="Stato"      k="attivo"         {...thProps} style={{ textAlign: "center" }} />
                <th style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {displayed.map(im => (
                <tr key={im.id}
                    onClick={() => setSelected(im)}
                    style={{ cursor: "pointer", borderBottom: "1px solid var(--border)",
                             transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--bg3)"}
                    onMouseLeave={e => e.currentTarget.style.background = ""}>
                  <td style={{ padding: "9px 10px", fontWeight: 600 }}>
                    {im.nome}
                    {im.codice && <span style={{ fontSize: 11, color: "var(--text2)", marginLeft: 6 }}>{im.codice}</span>}
                  </td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)" }}>
                    {im.tipologia ? TIPOLOGIA_LABEL[im.tipologia] ?? im.tipologia : "—"}
                  </td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)" }}>
                    {im.condominioNome || "—"}
                  </td>
                  <td style={{ padding: "9px 10px", color: "var(--text2)" }}>
                    {[im.via, im.citta].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td style={{ padding: "9px 10px", textAlign: "right", color: "var(--text2)" }}>
                    {im.superficie != null ? im.superficie.toLocaleString("it-IT") : "—"}
                  </td>
                  <td style={{ padding: "9px 10px", textAlign: "center" }}>
                    {im.attivo
                      ? <Badge label="Attivo"   color="green" />
                      : <Badge label="Inattivo" color="gray"  />}
                  </td>
                  <td style={{ padding: "9px 10px" }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <Btn size="sm" variant="ghost" title="Modifica" onClick={() => openEdit(im)}>
                        <i className="ti ti-pencil" />
                      </Btn>
                      <ImmobileDeleteBtn im={im} onDeleted={load} />
                      <Btn size="sm" variant="ghost" title="Dettaglio" onClick={() => setSelected(im)}>
                        <i className="ti ti-chevron-right" />
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

// ── Pulsante elimina inline per la riga tabella ───────────────────────────────
function ImmobileDeleteBtn({ im, onDeleted }) {
  const [confirm,  setConfirm]  = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delErr,   setDelErr]   = useState(null);

  async function handleDelete() {
    setDeleting(true);
    setDelErr(null);
    try {
      await immobiliV2.elimina(im.id);
      setConfirm(false);
      onDeleted?.();
    } catch (e) {
      setDelErr(e.message);
      setDeleting(false);
    }
  }

  return (
    <>
      <Btn size="sm" variant="ghost" title="Elimina" onClick={() => setConfirm(true)}>
        <i className="ti ti-trash" style={{ color: "var(--red)" }} />
      </Btn>
      {confirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
                      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }}>
          <div style={{ background: "var(--bg2)", border: "1px solid var(--red)", borderRadius: 12,
                        padding: 24, maxWidth: 400, width: "100%" }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Eliminare "{im.nome}"?</p>
            <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
              Operazione irreversibile. Se l'immobile ha ruoli, movimenti o regole associate
              non potrà essere eliminato.
            </p>
            {delErr && (
              <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 12,
                          padding: "8px 10px", borderRadius: 7, background: "rgba(239,68,68,0.08)" }}>
                {delErr}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => { setConfirm(false); setDelErr(null); }}>Annulla</Btn>
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

// ── Card condominio espandibile ────────────────────────────────────────────────
function CondominioCard({ c, tutti_condomini, onEditCondominio, onReload, onDeleted }) {
  const [open,        setOpen]        = useState(false);
  const [subTab,      setSubTab]      = useState("immobili"); // "immobili" | "persone"
  // immobili
  const [immobili,    setImmobili]    = useState(null);
  const [loadingImm,  setLoadingImm]  = useState(false);
  const [selected,    setSelected]    = useState(null);
  const [editing,     setEditing]     = useState(null);
  const [showForm,    setShowForm]    = useState(false);
  // persone-condominio
  const [personePC,   setPersonePC]   = useState(null);
  const [loadingPC,   setLoadingPC]   = useState(false);
  const [editPC,      setEditPC]      = useState(null);  // null | false (new) | object (edit)
  const [delPCId,     setDelPCId]     = useState(null);
  const [deletingPC,  setDeletingPC]  = useState(false);
  // condominio delete
  const [confirmDel,  setConfirmDel]  = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [delErr,      setDelErr]      = useState(null);

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
    setLoadingImm(true);
    try { setImmobili(await immobiliV2.lista({ condominioId: c.id })); }
    catch (_) {}
    finally { setLoadingImm(false); }
  }, [c.id]);

  const loadPersonePC = useCallback(async () => {
    setLoadingPC(true);
    try { setPersonePC(await condominiV2.persone(c.id)); }
    catch (_) {}
    finally { setLoadingPC(false); }
  }, [c.id]);

  useEffect(() => {
    if (!open) return;
    if (subTab === "immobili" && !immobili) loadImmobili();
    if (subTab === "persone"  && !personePC) loadPersonePC();
  }, [open, subTab, immobili, personePC, loadImmobili, loadPersonePC]);

  async function handleSaveImmobile(form) {
    if (editing?.id) await immobiliV2.aggiorna(editing.id, form);
    else             await immobiliV2.crea({ ...form, condominioId: c.id });
    await loadImmobili();
    onReload();
  }

  async function handleSavePC(form) {
    if (editPC?.id) await condominiV2.aggiornaAssociazione(c.id, editPC.id, form);
    else            await condominiV2.associaPersona(c.id, form);
    await loadPersonePC();
  }

  async function handleDelPC(id) {
    setDeletingPC(true);
    try { await condominiV2.rimuoviAssociazione(c.id, id); await loadPersonePC(); setDelPCId(null); }
    catch (_) {}
    finally { setDeletingPC(false); }
  }

  function openEdit(im) {
    setEditing(im);
    setSelected(null);
    setShowForm(true);
  }

  const oggiStr = oggi();
  function isAttivoPC(pc) {
    return (!pc.validitaDa || pc.validitaDa <= oggiStr) && (!pc.validitaA || pc.validitaA >= oggiStr);
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
              {c.codice && <span style={{ fontSize: 11, color: "var(--text2)" }}>[{c.codice}]</span>}
            </div>
            <p style={{ fontSize: 12, color: "var(--text2)", margin: 0 }}>
              {c.nImmobili ?? 0} immobile{c.nImmobili !== 1 ? "i" : ""}
              {c.indirizzo && ` · ${c.indirizzo}`}
              {c.millesimitotali && c.millesimitotali !== 1000 && ` · ‰ tot: ${c.millesimitotali}`}
            </p>
          </div>
        </button>
        <div style={{ display: "flex", gap: 4 }}>
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

      {/* Sezione espansa — sub-tab Immobili / Persone */}
      {open && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          {/* Mini sub-tab */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)" }}>
            {[
              { id: "immobili", icon: "ti-building",      label: "Immobili" },
              { id: "persone",  icon: "ti-users",          label: "Persone"  },
            ].map(t => (
              <button key={t.id} onClick={() => setSubTab(t.id)} style={{
                padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
                fontSize: 12, display: "flex", alignItems: "center", gap: 6,
                color: subTab === t.id ? "var(--accent)" : "var(--text2)",
                fontWeight: subTab === t.id ? 700 : 400,
                borderBottom: subTab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: -1,
              }}>
                <i className={`ti ${t.icon}`} style={{ fontSize: 13 }} />
                {t.label}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            {subTab === "immobili" && (
              <Btn size="sm" variant="ghost" style={{ margin: "4px 8px" }}
                   onClick={() => { setEditing(null); setShowForm(true); }}>
                <i className="ti ti-plus" /> Immobile
              </Btn>
            )}
            {subTab === "persone" && (
              <Btn size="sm" variant="ghost" style={{ margin: "4px 8px" }}
                   onClick={() => setEditPC(false)}>
                <i className="ti ti-plus" /> Persona
              </Btn>
            )}
          </div>

          <div style={{ padding: "10px 16px 14px" }}>
            {/* ── IMMOBILI ── */}
            {subTab === "immobili" && (
              <>
                {loadingImm && (
                  <div style={{ textAlign: "center", padding: 20, color: "var(--text2)" }}>
                    <i className="ti ti-loader-2 ti-spin" />
                  </div>
                )}
                {!loadingImm && immobili?.length === 0 && (
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
              </>
            )}

            {/* ── PERSONE ── */}
            {subTab === "persone" && (
              <>
                {loadingPC && (
                  <div style={{ textAlign: "center", padding: 20, color: "var(--text2)" }}>
                    <i className="ti ti-loader-2 ti-spin" />
                  </div>
                )}
                {!loadingPC && personePC?.length === 0 && (
                  <p style={{ fontSize: 13, color: "var(--text2)", textAlign: "center", padding: "12px 0" }}>
                    Nessuna persona associata. <button onClick={() => setEditPC(false)}
                      style={{ background: "none", border: "none", color: "var(--accent)",
                               cursor: "pointer", fontSize: 13, padding: 0 }}>
                      Associane una ›
                    </button>
                  </p>
                )}
                {personePC && personePC.length > 0 && (
                  <div style={{ display: "grid", gap: 6, marginBottom: 4 }}>
                    {personePC.map(pc => {
                      const attivo = isAttivoPC(pc);
                      const info   = RUOLO_PC_INFO[pc.ruolo] || { label: pc.ruolo, color: "gray" };
                      const nome   = [pc.personaCognome, pc.personaNome].filter(Boolean).join(" ") || pc.personaId;
                      return (
                        <div key={pc.id} style={{
                          display: "grid", gridTemplateColumns: "1fr auto",
                          gap: 10, alignItems: "center", padding: "9px 12px",
                          background: "var(--bg3)", borderRadius: 8,
                          opacity: attivo ? 1 : 0.55,
                          border: `1px solid ${attivo ? "var(--border)" : "rgba(255,255,255,0.05)"}`,
                        }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                              <Badge label={info.label} color={info.color} />
                              {!attivo && <Badge label="Scaduto" color="gray" />}
                              <span style={{ fontSize: 13, fontWeight: 600 }}>{nome}</span>
                            </div>
                            <p style={{ fontSize: 11, color: "var(--text2)", margin: 0 }}>
                              {pc.validitaDa && `dal ${pc.validitaDa}`}
                              {pc.validitaA  && ` al ${pc.validitaA}`}
                              {pc.note && ` · ${pc.note}`}
                            </p>
                          </div>
                          <div style={{ display: "flex", gap: 4 }}>
                            <Btn size="sm" variant="ghost" title="Modifica"
                                 onClick={() => setEditPC(pc)}>
                              <i className="ti ti-pencil" />
                            </Btn>
                            <Btn size="sm" variant="ghost" title="Rimuovi"
                                 onClick={() => setDelPCId(pc.id)}>
                              <i className="ti ti-trash" style={{ color: "var(--red)" }} />
                            </Btn>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Modali immobili */}
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

      {/* Modali persona-condominio */}
      {editPC !== null && (
        <PersonaCondominioModal
          initial={editPC || undefined}
          condominioId={c.id}
          onSave={handleSavePC}
          onClose={() => setEditPC(null)}
        />
      )}
      {delPCId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
                      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }}>
          <div style={{ background: "var(--bg2)", border: "1px solid var(--red)", borderRadius: 12,
                        padding: 24, maxWidth: 360, width: "100%" }}>
            <p style={{ marginBottom: 20, fontSize: 14 }}>Rimuovere questa persona dal condominio?</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => setDelPCId(null)}>Annulla</Btn>
              <Btn variant="danger" disabled={deletingPC}
                   onClick={() => handleDelPC(delPCId)}>
                {deletingPC ? "Rimuovo…" : <><i className="ti ti-trash" /> Rimuovi</>}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Modale conferma elimina condominio */}
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
