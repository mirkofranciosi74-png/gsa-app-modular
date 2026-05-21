import { useState, useEffect, useCallback } from "react";
import { appartamentiApi } from "../api.js";
import { Btn, Badge, Modal, Confirm, Field, SectionHeader } from "../components/ui.jsx";
import { euro, toISO, toITdate, uid } from "../utils/formatters.js";
import { DocListEntita } from "./Documentale.jsx";

// ─────────────────────────────────────────────────────────────────────────────
// Tab principale
// ─────────────────────────────────────────────────────────────────────────────
export default function Appartamenti() {
  const [list,  setList]  = useState([]);
  const [modal, setModal] = useState(null);
  const [conf,  setConf]  = useState(null);

  const load = useCallback(() => appartamentiApi.list().then(setList), []);
  useEffect(() => { load(); }, [load]);

  const oggi = new Date().toISOString().slice(0, 10);

  async function save(form) {
    try {
      if (form.id) {
        await appartamentiApi.update(form.id, form);
        const fresh = await appartamentiApi.get(form.id);
        const dbIds   = (fresh.componenti || []).map(c => c.id);
        const formIds = (form.componenti || []).filter(c => !c._new).map(c => c.id);
        for (const dbId of dbIds) {
          if (!formIds.includes(dbId)) await appartamentiApi.deleteComponente(form.id, dbId);
        }
        for (const c of (form.componenti || [])) {
          if (c._new) {
            const { id: _, _new: __, _appId: ___, ...rest } = c;
            await appartamentiApi.addComponente(form.id, rest);
          } else {
            await appartamentiApi.updateComponente(form.id, c.id, c);
          }
        }
      } else {
        await appartamentiApi.create({
          ...form,
          componenti: (form.componenti || []).map(({ id: _, _new: __, _appId: ___, ...r }) => r),
        });
      }
      setModal(null);
      load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  return (
    <div>
      <SectionHeader
        title="Appartamenti"
        action={
          <Btn variant="primary" onClick={() =>
            setModal({ nome: "", via: "", citta: "", cap: "", note: "", componenti: [] })
          }>
            <i className="ti ti-plus" /> Nuovo Appartamento
          </Btn>
        }
      />

      {list.length === 0 && (
        <div className="alert alert-info">
          <i className="ti ti-info-circle" /> Nessun appartamento.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {list.map(a => {
          const attiviOggi = (a.componenti || []).filter(c => {
            if (c.attivo === false) return false;
            const vDa = toISO(c.validita_da) || null;
            const vA  = toISO(c.validita_a)  || null;
            if (vDa && vDa > oggi) return false;
            if (vA  && vA  < oggi) return false;
            return true;
          });
          const totP = attiviOggi.reduce((s, c) => s + parseFloat(c.percentuale || 0), 0);
          const pw   = attiviOggi.length > 0 && Math.abs(totP - 100) > 0.1;

          return (
            <div key={a.id} className="card">
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 10, background: "var(--accent)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 18, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                    {(a.nome || "?")[0]}
                  </div>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>{a.nome}</p>
                    <p style={{ color: "var(--text2)", fontSize: 13, margin: 0 }}>
                      {[a.via, a.citta, a.cap].filter(Boolean).join(" · ") || "Indirizzo non inserito"}
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <Btn variant="secondary" size="sm"
                       onClick={() => setModal({ ...a, componenti: [...(a.componenti || [])] })}>
                    <i className="ti ti-edit" /> Modifica
                  </Btn>
                  <Btn variant="danger" size="sm"
                       onClick={() => setConf({
                         msg: `Eliminare "${a.nome}"?`,
                         onYes: async () => {
                           await appartamentiApi.delete(a.id);
                           setConf(null); load();
                         },
                       })}>
                    <i className="ti ti-trash" /> Elimina
                  </Btn>
                </div>
              </div>
              {pw && (
                <div className="alert alert-warn" style={{ marginTop: 8 }}>
                  <i className="ti ti-alert-triangle" /> Somma % attivi oggi = {totP.toFixed(1)}%
                </div>
              )}
              {attiviOggi.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {attiviOggi.map(c => (
                    <span key={c.id} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20,
                                              background: "var(--bg3)", border: "1px solid var(--border)",
                                              color: "var(--text2)" }}>
                      {c.nome} {c.cognome} · {c.percentuale}% · {euro(c.quota_affitto)}/mese
                    </span>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text2)" }}>{attiviOggi.length} componenti attivi</span>
                <span style={{ fontWeight: 700 }}>{euro(a.totale_spese || 0)}</span>
              </div>
              <DocListEntita entitaTipo="appartamento" entitaId={a.id} />
            </div>
          );
        })}
      </div>

      {modal && <AppModal app={modal} onSave={save} onClose={() => setModal(null)} />}
      {conf  && <Confirm msg={conf.msg} onYes={conf.onYes} onNo={() => setConf(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal appartamento
// ─────────────────────────────────────────────────────────────────────────────
function AppModal({ app, onSave, onClose }) {
  const [f,  setF]  = useState(app);
  const [cm, setCm] = useState(null);

  const sf   = (k, v) => setF(p => ({ ...p, [k]: v }));
  const oggi = new Date().toISOString().slice(0, 10);

  const attiviOggi = (f.componenti || []).filter(c => {
    if (c.attivo === false) return false;
    const vDa = toISO(c.validita_da) || null;
    const vA  = toISO(c.validita_a)  || null;
    if (vDa && vDa > oggi) return false;
    if (vA  && vA  < oggi) return false;
    return true;
  });
  const totP = attiviOggi.reduce((s, c) => s + parseFloat(c.percentuale || 0), 0);
  const pw   = Math.abs(totP - 100) > 0.1 && attiviOggi.length > 0;

  function saveComp(c) {
    const arr = f.componenti || [];
    setF(p => ({
      ...p,
      componenti: arr.find(x => x.id === c.id)
        ? arr.map(x => x.id === c.id ? c : x)
        : [...arr, c],
    }));
    setCm(null);
  }

  return (
    <Modal
      title={f.id ? "Modifica Appartamento" : "Nuovo Appartamento"}
      onClose={onClose} width={600}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
          <Btn variant="success" onClick={() => onSave(f)}>
            <i className="ti ti-check" /> Salva
          </Btn>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="grid-2">
          <Field label="Nome *" warn={!f.nome}>
            <input value={f.nome} onChange={e => sf("nome", e.target.value)}
                   placeholder="App. Via Roma 1"
                   style={{ borderColor: !f.nome ? "var(--yellow)" : "" }} />
          </Field>
          <Field label="Via">
            <input value={f.via || ""} onChange={e => sf("via", e.target.value)} placeholder="Via Roma 1" />
          </Field>
          <Field label="Città">
            <input value={f.citta || ""} onChange={e => sf("citta", e.target.value)} placeholder="Modena" />
          </Field>
          <Field label="CAP">
            <input value={f.cap || ""} onChange={e => sf("cap", e.target.value)} placeholder="41121" />
          </Field>
        </div>
        <Field label="Note">
          <input value={f.note || ""} onChange={e => sf("note", e.target.value)} placeholder="Note opzionali" />
        </Field>

        <hr className="divider" />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 600 }}>
            Componenti{" "}
            {pw && (
              <span style={{ color: "var(--yellow)", fontWeight: 400, fontSize: 12 }}>
                ⚠ Somma attivi oggi = {totP.toFixed(1)}%
              </span>
            )}
          </span>
          <Btn variant="primary" size="sm" onClick={() => setCm({
            id: uid(), _new: true, _appId: f.id || null,
            nome: "", cognome: "", email: "", telefono: "",
            percentuale: "", quota_affitto: "", validita_da: "", validita_a: "", attivo: true,
          })}>
            <i className="ti ti-plus" /> Aggiungi
          </Btn>
        </div>

        {(f.componenti || []).length === 0 && (
          <p style={{ color: "var(--text2)", fontSize: 13 }}>Nessun componente.</p>
        )}

        {(f.componenti || []).map(c => {
          const vDa = toISO(c.validita_da);
          const vA  = toISO(c.validita_a);
          return (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between",
                                     alignItems: "center", padding: "8px 12px",
                                     background: "var(--bg3)", borderRadius: 8,
                                     opacity: c.attivo === false ? 0.5 : 1 }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, margin: 0 }}>{c.nome} {c.cognome}</p>
                <p style={{ fontSize: 11, color: "var(--text2)", margin: 0 }}>
                  {c.percentuale}% · {euro(c.quota_affitto)}/mese
                  {vDa ? ` · dal ${toITdate(vDa)}` : ""}
                  {vA  ? ` al ${toITdate(vA)}` : " · aperto"}
                </p>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <Btn variant="secondary" size="sm" onClick={() => setCm({ ...c, _appId: f.id || null })}>
                  <i className="ti ti-edit" />
                </Btn>
                <Btn variant="danger" size="sm"
                     onClick={() => setF(p => ({ ...p, componenti: (p.componenti || []).filter(x => x.id !== c.id) }))}>
                  <i className="ti ti-trash" />
                </Btn>
              </div>
            </div>
          );
        })}
      </div>
      {cm && <CompModal comp={cm} appId={f.id || null} onSave={saveComp} onClose={() => setCm(null)} />}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal componente (condiviso con tab Componenti)
// ─────────────────────────────────────────────────────────────────────────────
export function CompModal({ comp, appId, onSave, onClose }) {
  const [f,        setF]    = useState({ ...comp, validita_da: toISO(comp.validita_da) || "", validita_a: toISO(comp.validita_a) || "" });
  const [propModal, setProp] = useState(null);
  const [saving,   setSaving] = useState(false);

  const sf = (k, v) => setF(p => ({ ...p, [k]: v }));

  const dateErrate = f.validita_da && f.validita_a && f.validita_da > f.validita_a;
  const origDa     = toISO(comp.validita_da) || "";
  const origA      = toISO(comp.validita_a)  || "";
  const dateChanged = !comp._new && (f.validita_da !== origDa || f.validita_a !== origA);

  async function handleSave() {
    if (dateErrate) { alert("La data fine non può essere precedente alla data inizio."); return; }
    if (dateChanged && appId && comp.id && !comp._new) {
      setSaving(true);
      try {
        const res = await appartamentiApi.updateComponenteConPropagazioneDate(appId, comp.id, {
          ...f, validita_da: f.validita_da || null, validita_a: f.validita_a || null,
        });
        if (res?.richiedeConferma && res.anteprima?.length > 0) {
          setProp({ anteprima: res.anteprima });
          setSaving(false);
          return;
        }
      } catch (e) { console.warn("Propagazione:", e.message); }
      finally { setSaving(false); }
    }
    onSave(f);
  }

  async function confermaProp() {
    setSaving(true);
    try {
      await appartamentiApi.confermaPropagazione(appId, comp.id, {
        ...f, validita_da: f.validita_da || null, validita_a: f.validita_a || null,
      });
      setProp(null);
      onSave(f);
    } catch (e) { alert("Errore: " + e.message); }
    finally { setSaving(false); }
  }

  return (
    <>
      <Modal
        title={comp._new ? "Nuovo Componente" : "Modifica Componente"}
        subtitle={comp._new ? "" : `${comp.nome} ${comp.cognome || ""}`}
        onClose={onClose} width={520}
        footer={
          <>
            <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
            <Btn variant="success" onClick={handleSave} disabled={saving || dateErrate}>
              <i className="ti ti-check" />
              {saving ? "Salvataggio…" : dateChanged ? "Salva e verifica versamenti" : "Salva"}
            </Btn>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Anagrafica */}
          <div>
            <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text2)", margin: "0 0 10px" }}>
              <i className="ti ti-user" style={{ marginRight: 6 }} /> Anagrafica
            </p>
            <div className="grid-2">
              <Field label="Nome *" warn={!f.nome}>
                <input value={f.nome} onChange={e => sf("nome", e.target.value)} placeholder="Mario"
                       style={{ borderColor: !f.nome ? "var(--yellow)" : "" }} />
              </Field>
              <Field label="Cognome">
                <input value={f.cognome || ""} onChange={e => sf("cognome", e.target.value)} placeholder="Rossi" />
              </Field>
              <Field label="Email">
                <input value={f.email || ""} onChange={e => sf("email", e.target.value)} placeholder="mario@email.com" />
              </Field>
              <Field label="Telefono">
                <input value={f.telefono || ""} onChange={e => sf("telefono", e.target.value)} placeholder="+39…" />
              </Field>
            </div>
          </div>

          <hr className="divider" />

          {/* Periodo */}
          <div>
            <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text2)", margin: "0 0 10px" }}>
              <i className="ti ti-calendar-event" style={{ marginRight: 6 }} /> Periodo di validità
            </p>
            <div className="grid-2">
              <Field label="Valido dal *" warn={!f.validita_da} hint="Data inizio contratto/locazione">
                <input type="date" value={f.validita_da} onChange={e => sf("validita_da", e.target.value)}
                       style={{ borderColor: !f.validita_da ? "var(--yellow)" : "" }} />
              </Field>
              <Field label="Valido fino al" warn={dateErrate} hint={dateErrate ? "⚠ Deve essere ≥ data inizio" : "Vuoto = ancora attivo"}>
                <input type="date" value={f.validita_a} onChange={e => sf("validita_a", e.target.value)}
                       style={{ borderColor: dateErrate ? "var(--red)" : "" }} />
              </Field>
            </div>
            {dateErrate && (
              <div className="alert alert-danger" style={{ marginTop: 8 }}>
                <i className="ti ti-alert-circle" /> La data fine non può essere precedente alla data inizio.
              </div>
            )}
            {dateChanged && !dateErrate && (
              <div className="alert alert-warn" style={{ marginTop: 8 }}>
                <i className="ti ti-alert-triangle" /> Le date sono cambiate. Verranno verificati i versamenti associati.
              </div>
            )}
          </div>

          <hr className="divider" />

          {/* Quote */}
          <div>
            <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text2)", margin: "0 0 10px" }}>
              <i className="ti ti-percent" style={{ marginRight: 6 }} /> Quote
            </p>
            <div className="grid-2">
              <Field label="% spesa" hint="Somma componenti attivi oggi = 100%">
                <input type="number" min="0" max="100" step="0.01"
                       value={f.percentuale || ""} onChange={e => sf("percentuale", e.target.value)}
                       placeholder="50" />
              </Field>
              <Field label="Quota affitto €" hint="Importo mensile affitto">
                <input type="number" min="0" step="0.01"
                       value={f.quota_affitto || ""} onChange={e => sf("quota_affitto", e.target.value)}
                       placeholder="200" />
              </Field>
              <Field label="Caparra €" hint="Deposito cauzionale">
                <input type="number" min="0" step="0.01"
                       value={f.caparra || ""} onChange={e => sf("caparra", e.target.value)}
                       placeholder="0" />
              </Field>
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "var(--text)" }}>
            <input type="checkbox" checked={f.attivo !== false} onChange={e => sf("attivo", e.target.checked)} />
            Componente attivo
          </label>
        </div>
      </Modal>

      {/* Modal propagazione date */}
      {propModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex",
                      alignItems: "center", justifyContent: "center", zIndex: 500, padding: 16 }}>
          <div style={{ background: "var(--bg2)", border: "2px solid var(--yellow)", borderRadius: 12,
                        padding: 24, maxWidth: 580, width: "100%" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 28, color: "var(--yellow)", flexShrink: 0, marginTop: 2 }} />
              <div>
                <p style={{ fontWeight: 700, fontSize: 16, margin: "0 0 4px" }}>Propagazione date</p>
                <p style={{ fontSize: 13, color: "var(--text2)", margin: 0 }}>
                  Le nuove date impattano su <strong>{propModal.anteprima.length}</strong> versamenti.
                </p>
              </div>
            </div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden",
                          marginBottom: 16, maxHeight: 240, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--bg3)" }}>
                    <th style={{ padding: "7px 10px", textAlign: "left" }}>Tipo</th>
                    <th style={{ padding: "7px 10px", textAlign: "right" }}>Importo</th>
                    <th style={{ padding: "7px 10px", textAlign: "center" }}>Attuale</th>
                    <th style={{ padding: "7px 10px", textAlign: "center", color: "var(--yellow)" }}>→ Nuova</th>
                  </tr>
                </thead>
                <tbody>
                  {propModal.anteprima.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--bg3)" }}>
                      <td style={{ padding: "6px 10px", fontWeight: 600 }}>{r.mov_tipo}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right" }}>{euro(r.mov_importo)}</td>
                      <td style={{ padding: "6px 10px", textAlign: "center", color: "var(--text2)", fontSize: 11 }}>
                        {r.mov_val_da ? toITdate(r.mov_val_da) : "—"} → {r.mov_val_a ? toITdate(r.mov_val_a) : "aperta"}
                      </td>
                      <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 600, fontSize: 11, color: "var(--yellow)" }}>
                        {r.new_val_da ? toITdate(r.new_val_da) : "—"} → {r.new_val_a ? toITdate(r.new_val_a) : "aperta"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <Btn variant="ghost" onClick={() => setProp(null)}>Annulla</Btn>
              <Btn variant="secondary" onClick={() => { setProp(null); onSave(f); }} disabled={saving}>
                Solo componente
              </Btn>
              <Btn variant="success" onClick={confermaProp} disabled={saving}>
                <i className="ti ti-check" />
                {saving ? "…" : `Propaga su ${propModal.anteprima.length} versamenti`}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
