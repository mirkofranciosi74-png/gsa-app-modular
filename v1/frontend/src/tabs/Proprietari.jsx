import { useState, useEffect, useCallback } from "react";
import { proprietariApi, associazioniApi, appartamentiApi } from "../api.js";
import { Btn, Modal, Field, SectionHeader, Confirm } from "../components/ui.jsx";
import { DocListEntita } from "./Documentale.jsx";

function fmt(d) { return d ? d.slice(0, 10) : "—"; }
function fmtE(d) { return d ? new Date(d).toLocaleDateString("it-IT") : "—"; }

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

// ── Modal aggiornamento registrazioni dopo cambio default ─────────────────────
function DefaultUpdateModal({ data, onClose }) {
  const [updMovimenti, setUpdMovimenti] = useState(true);
  const [updDocumenti, setUpdDocumenti] = useState(true);
  const [saving, setSaving]             = useState(false);
  const [result, setResult]             = useState(null);

  async function apply() {
    setSaving(true);
    try {
      let cntM = 0, cntD = 0;
      if (updMovimenti) {
        const r = await associazioniApi.bulkUpdateIncassatore({
          appartamentoId: data.appartamentoId,
          proprietarioId: data.proprietarioId,
          dataFrom:       data.dataFrom,
        });
        cntM = r?.count ?? 0;
      }
      if (updDocumenti) {
        const r = await associazioniApi.bulkUpdatePagatore({
          appartamentoId: data.appartamentoId,
          proprietarioId: data.proprietarioId,
          dataFrom:       data.dataFrom,
        });
        cntD = r?.count ?? 0;
      }
      setResult({ cntM, cntD });
    } catch (e) {
      alert("Errore aggiornamento: " + e.message);
      setSaving(false);
    }
  }

  if (result) {
    return (
      <Modal
        title="Aggiornamento completato"
        onClose={onClose}
        width={400}
        footer={<Btn variant="primary" onClick={onClose}>Chiudi</Btn>}
      >
        <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
          <p style={{ margin: 0 }}>
            <i className="ti ti-circle-check" style={{ color: "var(--green)", marginRight: 8 }} />
            Entrate aggiornate: <strong>{result.cntM}</strong>
          </p>
          <p style={{ margin: 0 }}>
            <i className="ti ti-circle-check" style={{ color: "var(--green)", marginRight: 8 }} />
            Spese aggiornate: <strong>{result.cntD}</strong>
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Aggiorna registrazioni esistenti?"
      onClose={onClose}
      width={460}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Salta</Btn>
        <Btn variant="primary" onClick={apply} disabled={saving || (!updMovimenti && !updDocumenti)}>
          {saving ? "Aggiorno…" : "Aggiorna"}
        </Btn>
      </>}
    >
      <div style={{ display: "grid", gap: 14, fontSize: 13 }}>
        <p style={{ margin: 0, color: "var(--text2)" }}>
          Vuoi aggiornare le registrazioni già presenti per questo appartamento
          a partire dal <strong>{fmt(data.dataFrom)}</strong>?
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={updMovimenti} onChange={e => setUpdMovimenti(e.target.checked)} />
          Entrate (chi incassa)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={updDocumenti} onChange={e => setUpdDocumenti(e.target.checked)} />
          Spese (chi paga)
        </label>
      </div>
    </Modal>
  );
}

// ── Modal anomalie validità proprietari ───────────────────────────────────────
function AnomalieModal({ onClose }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    associazioniApi.verificaAnomalie()
      .then(setData)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const totale = (data?.movimenti?.length ?? 0) + (data?.documenti?.length ?? 0);

  return (
    <Modal
      title="Verifica anomalie proprietari"
      onClose={onClose}
      width={700}
      footer={<Btn variant="ghost" onClick={onClose}>Chiudi</Btn>}
    >
      {loading && <p style={{ color: "var(--text2)", fontSize: 13 }}>Analisi in corso…</p>}
      {err && <p style={{ color: "var(--red)", fontSize: 13 }}>{err}</p>}
      {data && (
        <div style={{ display: "grid", gap: 16 }}>
          {totale === 0 ? (
            <p style={{ color: "var(--green)", fontSize: 14 }}>
              <i className="ti ti-circle-check" style={{ marginRight: 6 }} />
              Nessuna anomalia rilevata.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "var(--text2)", margin: 0 }}>
                {totale} registrazione{totale !== 1 ? "i" : ""} fuori dal periodo di validità del proprietario.
              </p>
              {data.movimenti.length > 0 && (
                <div>
                  <p style={{ fontWeight: 600, fontSize: 13, margin: "0 0 8px", color: "var(--accent)" }}>
                    Entrate ({data.movimenti.length})
                  </p>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: "var(--text2)", borderBottom: "1px solid var(--border)" }}>
                        <th style={{ textAlign: "left", padding: "3px 8px" }}>Data</th>
                        <th style={{ textAlign: "left", padding: "3px 8px" }}>Appartamento</th>
                        <th style={{ textAlign: "left", padding: "3px 8px" }}>Proprietario</th>
                        <th style={{ textAlign: "right", padding: "3px 8px" }}>Importo</th>
                        <th style={{ textAlign: "left", padding: "3px 8px" }}>Periodo rif.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.movimenti.map(m => (
                        <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "5px 8px" }}>{fmtE(m.data_riferimento)}</td>
                          <td style={{ padding: "5px 8px" }}>{m.appartamento_nome}</td>
                          <td style={{ padding: "5px 8px" }}>{m.proprietario_nome}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right" }}>
                            {Number(m.importo).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                          </td>
                          <td style={{ padding: "5px 8px" }}>{m.mese_riferimento || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data.documenti.length > 0 && (
                <div>
                  <p style={{ fontWeight: 600, fontSize: 13, margin: "0 0 8px", color: "var(--accent)" }}>
                    Spese ({data.documenti.length})
                  </p>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: "var(--text2)", borderBottom: "1px solid var(--border)" }}>
                        <th style={{ textAlign: "left", padding: "3px 8px" }}>Data</th>
                        <th style={{ textAlign: "left", padding: "3px 8px" }}>Appartamento</th>
                        <th style={{ textAlign: "left", padding: "3px 8px" }}>Proprietario</th>
                        <th style={{ textAlign: "right", padding: "3px 8px" }}>Importo</th>
                        <th style={{ textAlign: "left", padding: "3px 8px" }}>Descrizione</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.documenti.map(d => (
                        <tr key={d.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "5px 8px" }}>{fmtE(d.data_caricamento)}</td>
                          <td style={{ padding: "5px 8px" }}>{d.appartamento_nome}</td>
                          <td style={{ padding: "5px 8px" }}>{d.proprietario_nome}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right" }}>
                            {Number(d.importo).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                          </td>
                          <td style={{ padding: "5px 8px" }}>{d.descrizione || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

// ── Modal elimina associazione con verifica dipendenze ────────────────────────
function EliminaAssocModal({ assocId, onClose, onDone }) {
  const [deps,    setDeps]    = useState(null);
  const [nuovoId, setNuovoId] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    associazioniApi.dipendenze(assocId)
      .then(setDeps)
      .catch(e => setErr(e.message));
  }, [assocId]);

  const totM    = deps?.movimenti?.length ?? 0;
  const totD    = deps?.documenti?.length ?? 0;
  const totDeps = totM + totD;
  const nomeP   = deps ? `${deps.assoc.proprietario_nome} ${deps.assoc.proprietario_cognome || ""}`.trim() : "…";

  async function conferma() {
    setSaving(true);
    try {
      if (totDeps > 0) {
        await associazioniApi.elimina(assocId, nuovoId || null);
      } else {
        await associazioniApi.delete(assocId);
      }
      onDone();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  }

  const cellStyle = { padding: "5px 8px", fontSize: 12 };
  const headStyle = { ...cellStyle, color: "var(--text2)", fontWeight: 600, borderBottom: "1px solid var(--border)", textAlign: "left" };

  return (
    <Modal
      title={`Elimina associazione — ${nomeP}`}
      onClose={onClose}
      width={580}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
        <Btn variant="danger" onClick={conferma} disabled={saving || !deps}>
          {saving ? "Elimino…" : "Elimina"}
        </Btn>
      </>}
    >
      <div style={{ display: "grid", gap: 16, fontSize: 13 }}>
        {err && <p style={{ color: "var(--red)", margin: 0 }}>{err}</p>}
        {!deps && !err && <p style={{ color: "var(--text2)" }}>Controllo dipendenze…</p>}

        {deps && totDeps === 0 && (
          <p style={{ margin: 0 }}>
            <i className="ti ti-circle-check" style={{ color: "var(--green)", marginRight: 6 }} />
            Nessuna entrata o spesa collegata. L'associazione verrà eliminata.
          </p>
        )}

        {deps && totM > 0 && (
          <div>
            <p style={{ margin: "0 0 6px", fontWeight: 600, color: "var(--accent)" }}>
              <i className="ti ti-arrow-down-circle" style={{ marginRight: 6 }} />
              Entrate collegate ({totM})
            </p>
            <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, background: "var(--bg2)" }}>
                  <tr>
                    <th style={headStyle}>Data</th>
                    <th style={headStyle}>Periodo rif.</th>
                    <th style={{ ...headStyle, textAlign: "right" }}>Importo</th>
                    <th style={headStyle}>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {deps.movimenti.map(m => (
                    <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={cellStyle}>{fmtE(m.data_riferimento) || "—"}</td>
                      <td style={cellStyle}>{m.mese_riferimento || "—"}</td>
                      <td style={{ ...cellStyle, textAlign: "right", fontWeight: 600 }}>
                        {Number(m.importo).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                      </td>
                      <td style={{ ...cellStyle, color: "var(--text2)" }}>{m.tipo_versamento || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {deps && totD > 0 && (
          <div>
            <p style={{ margin: "0 0 6px", fontWeight: 600, color: "var(--accent)" }}>
              <i className="ti ti-file-invoice" style={{ marginRight: 6 }} />
              Spese collegate ({totD})
            </p>
            <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, background: "var(--bg2)" }}>
                  <tr>
                    <th style={headStyle}>Data</th>
                    <th style={headStyle}>Descrizione</th>
                    <th style={{ ...headStyle, textAlign: "right" }}>Importo</th>
                    <th style={headStyle}>Periodo</th>
                  </tr>
                </thead>
                <tbody>
                  {deps.documenti.map(d => (
                    <tr key={d.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={cellStyle}>{fmtE(d.data_riferimento) || "—"}</td>
                      <td style={{ ...cellStyle, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {d.descrizione || "—"}
                      </td>
                      <td style={{ ...cellStyle, textAlign: "right", fontWeight: 600 }}>
                        {Number(d.importo).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                      </td>
                      <td style={{ ...cellStyle, color: "var(--text2)" }}>
                        {d.periodo_da || "—"}{d.periodo_a && d.periodo_a !== d.periodo_da ? ` → ${d.periodo_a}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {deps && totDeps > 0 && (
          <Field label="Trasferisci entrate/spese a:">
            <select className="inp" value={nuovoId} onChange={e => setNuovoId(e.target.value)}>
              <option value="">— Lascia senza proprietario —</option>
              {deps.alternativi.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nome} {p.cognome || ""}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

// ── Modal anomalie di validità dopo modifica associazione ─────────────────────
function AnomalieValiditaModal({ assocId, onClose, onDone }) {
  const [data,    setData]    = useState(null);
  const [nuovoId, setNuovoId] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    associazioniApi.anomalieValidita(assocId)
      .then(setData)
      .catch(e => setErr(e.message));
  }, [assocId]);

  const totM   = data?.movimenti?.length ?? 0;
  const totD   = data?.documenti?.length ?? 0;
  const totale = totM + totD;
  const nomeP  = data ? `${data.assoc.proprietario_nome} ${data.assoc.proprietario_cognome || ""}`.trim() : "…";

  async function applica() {
    setSaving(true);
    try {
      await associazioniApi.riassegnaAnomalie(assocId, nuovoId || null);
      onDone();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Anomalie di validità — ${nomeP}`}
      onClose={onClose}
      width={520}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Ignora</Btn>
        {totale > 0 && (
          <Btn variant="primary" onClick={applica} disabled={saving || !data}>
            {saving ? "Aggiorno…" : "Riassegna"}
          </Btn>
        )}
      </>}
    >
      <div style={{ display: "grid", gap: 14, fontSize: 13 }}>
        {err && <p style={{ color: "var(--red)", margin: 0 }}>{err}</p>}
        {!data && !err && <p style={{ color: "var(--text2)" }}>Verifica in corso…</p>}

        {data && totale === 0 && (
          <p style={{ margin: 0 }}>
            <i className="ti ti-circle-check" style={{ color: "var(--green)", marginRight: 6 }} />
            Nessuna anomalia: tutte le registrazioni rientrano nel periodo di validità.
          </p>
        )}

        {data && totale > 0 && (
          <>
            <div style={{ background: "var(--bg3)", borderRadius: 8, padding: "10px 14px", display: "grid", gap: 6 }}>
              <p style={{ margin: 0, fontWeight: 600, color: "var(--red)" }}>
                <i className="ti ti-alert-triangle" style={{ marginRight: 6 }} />
                {totale} registrazione{totale !== 1 ? "i" : ""} fuori dal periodo di validità:
              </p>
              {totM > 0 && (
                <div>
                  <p style={{ margin: "4px 0 4px", fontWeight: 600 }}>Entrate ({totM}):</p>
                  {data.movimenti.map(m => (
                    <p key={m.id} style={{ margin: "2px 0", paddingLeft: 12 }}>
                      • {fmtE(m.data_riferimento)} — {Number(m.importo).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                      {m.mese_riferimento ? ` — ${m.mese_riferimento}` : ""}
                    </p>
                  ))}
                </div>
              )}
              {totD > 0 && (
                <div>
                  <p style={{ margin: "4px 0 4px", fontWeight: 600 }}>Spese ({totD}):</p>
                  {data.documenti.map(d => (
                    <p key={d.id} style={{ margin: "2px 0", paddingLeft: 12 }}>
                      • {fmtE(d.data_riferimento)} — {Number(d.importo).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                      {d.descrizione ? ` — ${d.descrizione}` : ""}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <Field label="Riassegna a:">
              <select className="inp" value={nuovoId} onChange={e => setNuovoId(e.target.value)}>
                <option value="">— Lascia senza proprietario —</option>
                {data.alternativi.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nome} {p.cognome || ""}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
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
  const [assoc,                setAssoc]                = useState(null);
  const [showForm,             setShowForm]             = useState(false);
  const [editing,              setEditing]              = useState(null);
  const [delAssocId,           setDelAssocId]           = useState(null);
  const [pendingBulkUpdate,    setPendingBulkUpdate]    = useState(null);
  const [pendingAnomalieAssocId, setPendingAnomalieAssocId] = useState(null);

  const load = useCallback(async () => {
    const rows = await associazioniApi.listByAppartamento(appartamento.id);
    setAssoc(rows);
  }, [appartamento.id]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form) {
    let savedId = null;
    if (editing) {
      await associazioniApi.update(editing.id, form);
      savedId = editing.id;
    } else {
      const created = await associazioniApi.create(form);
      savedId = created?.id;
    }
    await load();

    if (form.proprietario_default) {
      setPendingBulkUpdate({
        appartamentoId: appartamento.id,
        proprietarioId: form.proprietario_id,
        dataFrom:       form.data_inizio,
      });
    } else if (savedId && (form.data_fine || form.data_inizio)) {
      // Verifica anomalie se sono stati toccati i limiti di validità
      setPendingAnomalieAssocId(savedId);
    }
  }

  if (!assoc) return <p style={{ fontSize: 12, color: "var(--text2)" }}>Carico…</p>;

  const oggi = new Date().toISOString().slice(0, 10);
  const assocAttive = assoc.filter(a =>
    a.data_inizio <= oggi && (a.data_fine == null || a.data_fine >= oggi)
  );
  const totalePct = assocAttive.reduce((s, a) => s + Number(a.percentuale_proprieta), 0);
  const pctOk = Math.abs(totalePct - 100) < 0.01;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        {assocAttive.length > 0 && (
          <span style={{
            fontSize: 12, padding: "3px 10px", borderRadius: 20, fontWeight: 600,
            background: pctOk ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
            color: pctOk ? "var(--green)" : "var(--red)",
            border: `1px solid ${pctOk ? "var(--green)" : "var(--red)"}`,
          }}>
            <i className={`ti ti-percentage`} style={{ marginRight: 4 }} />
            Totale attuale: {totalePct.toFixed(2)}%
            {!pctOk && " — dovrebbe essere 100%"}
          </span>
        )}
        {assocAttive.length === 0 && <span />}
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
                    <Btn size="sm" variant="ghost" onClick={() => setDelAssocId(a.id)}>
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
      {delAssocId && (
        <EliminaAssocModal
          assocId={delAssocId}
          onClose={() => setDelAssocId(null)}
          onDone={() => { setDelAssocId(null); load(); }}
        />
      )}
      {pendingBulkUpdate && (
        <DefaultUpdateModal
          data={pendingBulkUpdate}
          onClose={() => setPendingBulkUpdate(null)}
        />
      )}
      {pendingAnomalieAssocId && (
        <AnomalieValiditaModal
          assocId={pendingAnomalieAssocId}
          onClose={() => setPendingAnomalieAssocId(null)}
          onDone={() => { setPendingAnomalieAssocId(null); load(); }}
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

// ── Modal elimina con riassegnazione ──────────────────────────────────────────
function EliminaProprietarioModal({ proprietario, onClose, onDone }) {
  const [deps,   setDeps]   = useState(null);
  const [nuovoId, setNuovoId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);

  useEffect(() => {
    proprietariApi.dipendenze(proprietario.id)
      .then(d => { setDeps(d); if (!d.alternativi?.length) setNuovoId(""); })
      .catch(e => setErr(e.message));
  }, [proprietario.id]);

  const totDeps = deps ? deps.movimenti + deps.documenti + deps.regole : 0;

  async function conferma() {
    setSaving(true);
    try {
      if (totDeps > 0) {
        await proprietariApi.elimina(proprietario.id, nuovoId || null);
      } else {
        await proprietariApi.delete(proprietario.id);
      }
      onDone();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  }

  const nomeP = `${proprietario.nome} ${proprietario.cognome || ""}`.trim();

  return (
    <Modal
      title={`Elimina ${nomeP}`}
      onClose={onClose}
      width={480}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
        <Btn
          variant="danger"
          onClick={conferma}
          disabled={saving || !deps || (totDeps > 0 && nuovoId === "" && deps.movimenti + deps.documenti > 0)}
        >
          {saving ? "Elimino…" : "Elimina"}
        </Btn>
      </>}
    >
      <div style={{ display: "grid", gap: 14, fontSize: 13 }}>
        {err && <p style={{ color: "var(--red)", margin: 0 }}>{err}</p>}
        {!deps && !err && <p style={{ color: "var(--text2)" }}>Controllo dipendenze…</p>}

        {deps && totDeps === 0 && (
          <p style={{ margin: 0 }}>
            <i className="ti ti-circle-check" style={{ color: "var(--green)", marginRight: 6 }} />
            Nessuna dipendenza. Il proprietario verrà eliminato.
          </p>
        )}

        {deps && totDeps > 0 && (
          <>
            <div style={{ background: "var(--bg3)", borderRadius: 8, padding: "10px 14px", display: "grid", gap: 6 }}>
              <p style={{ margin: 0, fontWeight: 600, color: "var(--red)" }}>
                <i className="ti ti-alert-triangle" style={{ marginRight: 6 }} />
                Dipendenze trovate:
              </p>
              {deps.movimenti > 0 && <p style={{ margin: 0 }}>• {deps.movimenti} entrata{deps.movimenti !== 1 ? "e" : ""} (incassatore)</p>}
              {deps.documenti > 0 && <p style={{ margin: 0 }}>• {deps.documenti} spesa{deps.documenti !== 1 ? "e" : ""} (pagante)</p>}
              {deps.regole    > 0 && <p style={{ margin: 0 }}>• {deps.regole} regola{deps.regole !== 1 ? "e" : ""} di riparto (verrà rimosso)</p>}
            </div>

            {deps.movimenti + deps.documenti > 0 && (
              <Field label="Trasferisci entrate/spese a:">
                <select
                  className="inp"
                  value={nuovoId}
                  onChange={e => setNuovoId(e.target.value)}
                >
                  <option value="">— Lascia senza proprietario —</option>
                  {deps.alternativi.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nome} {p.cognome || ""}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <p style={{ margin: 0, fontSize: 12, color: "var(--text2)" }}>
              Le regole di riparto verranno aggiornate automaticamente.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Tab principale ────────────────────────────────────────────────────────────
export function Proprietari() {
  const [proprietari,    setProprietari]    = useState(null);
  const [showForm,       setShowForm]       = useState(false);
  const [editing,        setEditing]        = useState(null);
  const [delProp,        setDelProp]        = useState(null);
  const [err,            setErr]            = useState(null);
  const [sezione,        setSezione]        = useState("proprietari");
  const [showAnomalie,   setShowAnomalie]   = useState(false);

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

  async function handleDelDone() {
    setDelProp(null);
    await load();
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
            <Btn
              variant="ghost"
              size="sm"
              onClick={() => setShowAnomalie(true)}
            >
              <i className="ti ti-alert-triangle" /> Verifica anomalie
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
                        <Btn size="sm" variant="ghost" onClick={() => setDelProp(p)}>
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
      {delProp && (
        <EliminaProprietarioModal
          proprietario={delProp}
          onClose={() => setDelProp(null)}
          onDone={handleDelDone}
        />
      )}
      {showAnomalie && (
        <AnomalieModal onClose={() => setShowAnomalie(false)} />
      )}
    </div>
  );
}
