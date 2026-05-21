import { useState, useEffect, useCallback } from "react";
import { proprietariApi, associazioniApi, appartamentiApi } from "../api.js";
import { Btn, Modal, Field, SectionHeader, Confirm } from "../components/ui.jsx";
import { DocListEntita } from "./Documentale.jsx";

function fmt(d) { return d ? d.slice(0, 10) : "—"; }

// ── Form Proprietario ─────────────────────────────────────────────────────────
function PropModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState({
    nome: "", cognome: "", indirizzo: "", telefono: "", email: "",
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSave() {
    if (!form.nome.trim()) { setErr("Nome obbligatorio"); return; }
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch (e) { setErr(e.message); setSaving(false); }
  }

  return (
    <Modal
      title={initial ? "Modifica Proprietario" : "Nuovo Proprietario"}
      onClose={onClose}
      width={480}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Salvo…" : "Salva"}
        </Btn>
      </>}
    >
      <div style={{ display: "grid", gap: 14 }}>
        {err && <p style={{ color: "var(--red)", fontSize: 13 }}>{err}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Nome *">
            <input className="inp" value={form.nome} onChange={set("nome")} autoFocus />
          </Field>
          <Field label="Cognome">
            <input className="inp" value={form.cognome || ""} onChange={set("cognome")} />
          </Field>
        </div>
        <Field label="Indirizzo">
          <input className="inp" value={form.indirizzo || ""} onChange={set("indirizzo")} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Telefono">
            <input className="inp" value={form.telefono || ""} onChange={set("telefono")} />
          </Field>
          <Field label="Email">
            <input className="inp" type="email" value={form.email || ""} onChange={set("email")} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

// ── Form Associazione ─────────────────────────────────────────────────────────
function AssocModal({ initial, proprietari, appartamentoId, onSave, onClose }) {
  const [form, setForm] = useState({
    proprietario_id: "",
    percentuale_proprieta: 100,
    data_inizio: new Date().toISOString().slice(0, 10),
    data_fine: "",
    proprietario_default: false,
    ...initial,
    appartamento_id: appartamentoId,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setNum = k => e => setForm(f => ({ ...f, [k]: Number(e.target.value) }));
  const setBool = k => e => setForm(f => ({ ...f, [k]: e.target.checked }));

  async function handleSave() {
    if (!form.proprietario_id) { setErr("Seleziona un proprietario"); return; }
    if (!form.data_inizio) { setErr("Data inizio obbligatoria"); return; }
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch (e) { setErr(e.message); setSaving(false); }
  }

  return (
    <Modal
      title={initial ? "Modifica Associazione" : "Nuova Associazione"}
      onClose={onClose}
      width={440}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Salvo…" : "Salva"}
        </Btn>
      </>}
    >
      <div style={{ display: "grid", gap: 14 }}>
        {err && <p style={{ color: "var(--red)", fontSize: 13 }}>{err}</p>}
        <Field label="Proprietario *">
          <select className="inp" value={form.proprietario_id} onChange={set("proprietario_id")}>
            <option value="">— Seleziona —</option>
            {proprietari.map(p => (
              <option key={p.id} value={p.id}>
                {p.nome} {p.cognome || ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="% Proprietà">
          <input className="inp" type="number" min={0} max={100} step={0.01}
            value={form.percentuale_proprieta} onChange={setNum("percentuale_proprieta")} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Data Inizio *">
            <input className="inp" type="date" value={form.data_inizio} onChange={set("data_inizio")} />
          </Field>
          <Field label="Data Fine">
            <input className="inp" type="date" value={form.data_fine || ""} onChange={set("data_fine")} />
          </Field>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={!!form.proprietario_default} onChange={setBool("proprietario_default")} />
          Proprietario di default
        </label>
      </div>
    </Modal>
  );
}

// ── Sezione Associazioni per appartamento ─────────────────────────────────────
function AssocPanel({ appartamento, proprietari }) {
  const [assoc, setAssoc] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [delId, setDelId] = useState(null);

  const load = useCallback(async () => {
    const rows = await associazioniApi.listByAppartamento(appartamento.id);
    setAssoc(rows);
  }, [appartamento.id]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form) {
    if (editing) await associazioniApi.update(editing.id, form);
    else await associazioniApi.create(form);
    await load();
  }

  async function handleDelete() {
    await associazioniApi.delete(delId);
    setDelId(null);
    await load();
  }

  if (!assoc) return <p style={{ fontSize: 12, color: "var(--text2)" }}>Carico…</p>;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <Btn size="sm" variant="primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          <i className="ti ti-plus" /> Aggiungi
        </Btn>
      </div>
      {assoc.length === 0
        ? <p style={{ fontSize: 12, color: "var(--text2)", textAlign: "center", padding: "12px 0" }}>Nessuna associazione</p>
        : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "var(--text2)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Proprietario</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>%</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Inizio</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Fine</th>
                <th style={{ textAlign: "center", padding: "4px 8px" }}>Default</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {assoc.map(a => (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 8px" }}>
                    {a.proprietario_nome} {a.proprietario_cognome || ""}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    {Number(a.percentuale_proprieta).toFixed(2)}%
                  </td>
                  <td style={{ padding: "6px 8px" }}>{fmt(a.data_inizio)}</td>
                  <td style={{ padding: "6px 8px" }}>{fmt(a.data_fine)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                    {a.proprietario_default ? <i className="ti ti-check" style={{ color: "var(--green)" }} /> : ""}
                  </td>
                  <td style={{ padding: "6px 4px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <Btn size="sm" variant="ghost" onClick={() => { setEditing(a); setShowForm(true); }}>
                      <i className="ti ti-pencil" />
                    </Btn>
                    <Btn size="sm" variant="ghost" onClick={() => setDelId(a.id)}>
                      <i className="ti ti-trash" style={{ color: "var(--red)" }} />
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }

      {showForm && (
        <AssocModal
          initial={editing}
          proprietari={proprietari}
          appartamentoId={appartamento.id}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
      {delId && (
        <Confirm
          msg="Eliminare questa associazione?"
          onYes={handleDelete}
          onNo={() => setDelId(null)}
        />
      )}
    </div>
  );
}

// ── Pannello appartamenti con accordion ───────────────────────────────────────
function AppartamentiSection({ proprietari }) {
  const [apps, setApps] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    appartamentiApi.list().then(setApps);
  }, []);

  if (!apps) return <p style={{ color: "var(--text2)", fontSize: 13 }}>Carico appartamenti…</p>;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {apps.map(app => (
        <div key={app.id} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <button
            onClick={() => setOpen(o => o === app.id ? null : app.id)}
            style={{
              width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 16px", background: "var(--bg2)", border: "none", cursor: "pointer",
              color: "var(--text1)", fontSize: 14, fontWeight: 600,
            }}
          >
            <span><i className="ti ti-building" style={{ marginRight: 8, color: "var(--accent)" }} />{app.nome}</span>
            <i className={`ti ti-chevron-${open === app.id ? "up" : "down"}`} style={{ color: "var(--text2)" }} />
          </button>
          {open === app.id && (
            <div style={{ padding: "12px 16px", background: "var(--bg3)" }}>
              <AssocPanel appartamento={app} proprietari={proprietari} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Tab principale ────────────────────────────────────────────────────────────
export function Proprietari() {
  const [proprietari, setProprietari] = useState(null);
  const [showForm, setShowForm]       = useState(false);
  const [editing, setEditing]         = useState(null);
  const [delId, setDelId]             = useState(null);
  const [err, setErr]                 = useState(null);
  const [sezione, setSezione]         = useState("proprietari");

  const load = useCallback(async () => {
    try { setProprietari(await proprietariApi.list()); }
    catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form) {
    if (editing) await proprietariApi.update(editing.id, form);
    else await proprietariApi.create(form);
    await load();
  }

  async function handleDelete() {
    try {
      await proprietariApi.delete(delId);
      setDelId(null);
      await load();
    } catch (e) {
      setDelId(null);
      setErr(e.message);
    }
  }

  return (
    <div>
      <SectionHeader
        title="Proprietari"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Btn
              variant={sezione === "proprietari" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setSezione("proprietari")}
            >
              <i className="ti ti-user-circle" /> Anagrafica
            </Btn>
            <Btn
              variant={sezione === "associazioni" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setSezione("associazioni")}
            >
              <i className="ti ti-link" /> Associazioni
            </Btn>
          </div>
        }
      />

      {err && (
        <div style={{ background: "var(--bg2)", border: "1px solid var(--red)", borderRadius: 8,
                      padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "var(--red)" }}>
          {err}
          <Btn size="sm" variant="ghost" onClick={() => setErr(null)} style={{ marginLeft: 8 }}>
            <i className="ti ti-x" />
          </Btn>
        </div>
      )}

      {sezione === "proprietari" && (
        <>
          <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
            <Btn variant="primary" onClick={() => { setEditing(null); setShowForm(true); }}>
              <i className="ti ti-plus" /> Nuovo Proprietario
            </Btn>
          </div>

          {!proprietari
            ? <p style={{ color: "var(--text2)" }}>Carico…</p>
            : proprietari.length === 0
              ? <p style={{ color: "var(--text2)", textAlign: "center", padding: 40 }}>Nessun proprietario registrato.</p>
              : (
                <div style={{ display: "grid", gap: 12 }}>
                  {proprietari.map(p => (
                    <div key={p.id} style={{
                      background: "var(--bg2)", border: "1px solid var(--border)",
                      borderRadius: 10, padding: "14px 18px",
                      display: "grid", gridTemplateColumns: "1fr auto", alignItems: "start", gap: 12,
                    }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 15, margin: "0 0 4px" }}>
                          {p.nome} {p.cognome || ""}
                        </p>
                        <p style={{ fontSize: 12, color: "var(--text2)", margin: 0 }}>
                          {[p.indirizzo, p.telefono, p.email].filter(Boolean).join(" · ")}
                        </p>
                        {p.associazioni?.length > 0 && (
                          <p style={{ fontSize: 11, color: "var(--accent)", margin: "4px 0 0" }}>
                            {p.associazioni.length} appartamento{p.associazioni.length !== 1 ? "i" : ""}:{" "}
                            {p.associazioni.map(a => a.appartamento_nome).join(", ")}
                          </p>
                        )}
                        <DocListEntita entitaTipo="proprietario" entitaId={p.id} />
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Btn size="sm" variant="ghost" onClick={() => { setEditing(p); setShowForm(true); }}>
                          <i className="ti ti-pencil" />
                        </Btn>
                        <Btn size="sm" variant="ghost" onClick={() => setDelId(p.id)}>
                          <i className="ti ti-trash" style={{ color: "var(--red)" }} />
                        </Btn>
                      </div>
                    </div>
                  ))}
                </div>
              )
          }
        </>
      )}

      {sezione === "associazioni" && proprietari && (
        <AppartamentiSection proprietari={proprietari} />
      )}

      {showForm && (
        <PropModal
          initial={editing}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
      {delId && (
        <Confirm
          msg="Eliminare questo proprietario? L'operazione non è consentita se è già associato a pagamenti o versamenti."
          onYes={handleDelete}
          onNo={() => setDelId(null)}
        />
      )}
    </div>
  );
}
