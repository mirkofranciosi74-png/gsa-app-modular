import { useState, useEffect, useCallback } from "react";
import { ripartoV2, immobiliV2, condominiV2, tipologieV2 } from "../api/apiV2.js";
import { Btn, Badge, Modal, Field } from "../components/ui.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────
const oggi = () => new Date().toISOString().slice(0, 10);

const fmtEur = v =>
  v == null ? "—" : Number(v).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

const fmtData = iso => {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString("it-IT", { dateStyle: "short" }); }
  catch { return iso; }
};

const FONTE_LABEL = {
  default_quote:       { label: "Default (quote ruoli)",    color: "gray"   },
  regola_uguale:       { label: "Regola (parti uguali)",    color: "blue"   },
  regola_quote:        { label: "Regola (quote custom)",    color: "yellow" },
  nessun_ruolo:        { label: "Nessun ruolo attivo",      color: "red"    },
  nessun_partecipante: { label: "Nessun partecipante",      color: "red"    },
};

// ── Top-level sub-tabs ────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
          fontSize: 13, display: "flex", alignItems: "center", gap: 6,
          color: active === t.id ? "var(--accent)" : "var(--text2)",
          fontWeight: active === t.id ? 700 : 400,
          borderBottom: active === t.id ? "2px solid var(--accent)" : "2px solid transparent",
          marginBottom: -1, transition: "all 0.15s",
        }}>
          <i className={`ti ${t.icon}`} style={{ fontSize: 14 }} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEZIONE CALCOLA
// ═══════════════════════════════════════════════════════════════════════════════
function CalcolaSection({ immobili, tipologie }) {
  const [form, setForm] = useState({
    immobileId: "", mese: new Date().toISOString().slice(0, 7),
    importo: "", tipoSpesaId: "", target: "inquilini",
  });
  const [risultato, setRisultato] = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function calcola() {
    if (!form.immobileId) { setErr("Seleziona un immobile"); return; }
    if (!form.mese)       { setErr("Mese obbligatorio");    return; }
    if (!form.importo || Number(form.importo) <= 0) { setErr("Importo non valido"); return; }
    setLoading(true); setErr(null); setRisultato(null);
    try {
      const res = await ripartoV2.calcola({
        immobileId:  form.immobileId,
        mese:        form.mese,
        importo:     Number(form.importo),
        tipoSpesaId: form.tipoSpesaId || undefined,
        target:      form.target,
      });
      setRisultato(res);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  const fonteInfo = risultato ? (FONTE_LABEL[risultato.fonte] || { label: risultato.fonte, color: "gray" }) : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, alignItems: "start" }}>
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 16px" }}>Parametri</p>
        <div style={{ display: "grid", gap: 14 }}>
          {err && (
            <p style={{ color: "var(--red)", fontSize: 12, margin: 0,
                        padding: "7px 10px", borderRadius: 7, background: "rgba(239,68,68,0.08)" }}>
              {err}
            </p>
          )}
          <Field label="Immobile *">
            <select className="inp" value={form.immobileId} onChange={set("immobileId")}>
              <option value="">— Seleziona —</option>
              {immobili.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
            </select>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Mese *">
              <input className="inp" type="month" value={form.mese} onChange={set("mese")} />
            </Field>
            <Field label="Target">
              <select className="inp" value={form.target} onChange={set("target")}>
                <option value="inquilini">Inquilini</option>
                <option value="proprietari">Proprietari</option>
              </select>
            </Field>
          </div>
          <Field label="Importo * (€)">
            <input className="inp" type="number" min={0.01} step={0.01}
                   value={form.importo} onChange={set("importo")} placeholder="es. 1250.00" />
          </Field>
          <Field label="Tipo spesa (opzionale)">
            <select className="inp" value={form.tipoSpesaId} onChange={set("tipoSpesaId")}>
              <option value="">— Default —</option>
              {tipologie.map(t => <option key={t.id} value={t.id}>{t.descrizione}</option>)}
            </select>
          </Field>
          <Btn variant="primary" onClick={calcola} disabled={loading} style={{ width: "100%" }}>
            {loading
              ? <><i className="ti ti-loader-2 ti-spin" style={{ marginRight: 6 }} />Calcolo…</>
              : <><i className="ti ti-calculator" style={{ marginRight: 6 }} />Calcola riparto</>
            }
          </Btn>
        </div>
      </div>

      <div>
        {!risultato && !loading && (
          <div style={{ background: "var(--bg2)", border: "1px dashed var(--border)", borderRadius: 12,
                        padding: 40, textAlign: "center", color: "var(--text2)" }}>
            <i className="ti ti-calculator" style={{ fontSize: 36, opacity: 0.3, display: "block", marginBottom: 12 }} />
            Compila i parametri e premi "Calcola riparto"
          </div>
        )}
        {risultato && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              background: risultato.bilanciato ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
              border: `1px solid ${risultato.bilanciato ? "rgba(34,197,94,0.3)" : "var(--red)"}`,
              borderRadius: 10, padding: "12px 16px",
            }}>
              <i className={`ti ${risultato.bilanciato ? "ti-circle-check" : "ti-alert-triangle"}`}
                 style={{ color: risultato.bilanciato ? "var(--green)" : "var(--red)", fontSize: 20 }} />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>
                  {risultato.bilanciato ? "Riparto bilanciato" : "Riparto non bilanciato"}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--text2)" }}>
                  Totale: {fmtEur(risultato.importoTotale)}
                  {risultato.quotaTotalePct != null && risultato.quotaTotalePct < 100 && (
                    <> · Quota {form.target}: {risultato.quotaTotalePct}% = {fmtEur(risultato.totaleVerificato)}</>
                  )}
                </p>
              </div>
              {fonteInfo && <Badge label={fonteInfo.label} color={fonteInfo.color} />}
            </div>

            {(!risultato.quote || risultato.quote.length === 0) && (
              <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10,
                            padding: 20, textAlign: "center", color: "var(--text2)", fontSize: 13 }}>
                <i className="ti ti-users-off" style={{ fontSize: 28, display: "block", marginBottom: 8, opacity: 0.4 }} />
                Nessun {form.target === "proprietari" ? "proprietario" : "inquilino"} attivo nel mese selezionato.
              </div>
            )}

            {risultato.quote?.length > 0 && (
              <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--bg3)", borderBottom: "1px solid var(--border)" }}>
                      {["Persona", "Quota %", "Importo"].map((h, i) => (
                        <th key={h} style={{ padding: "9px 14px", fontWeight: 600, fontSize: 11,
                                             textTransform: "uppercase", letterSpacing: 0.5,
                                             color: "var(--text2)", textAlign: i === 0 ? "left" : "right" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {risultato.quote.map((q, i) => {
                      const somma = risultato.quote.reduce((s, x) => s + Number(x.quota), 0);
                      const pct = somma > 0 ? (Number(q.quota) / somma * 100).toFixed(2) : "—";
                      return (
                        <tr key={q.id || i} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 14px", fontWeight: 500 }}>{q.nome || `Persona ${i + 1}`}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text2)" }}>{pct}%</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700,
                                       fontSize: 15, color: "var(--accent)" }}>{fmtEur(q.importo)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "var(--bg3)", borderTop: "2px solid var(--border)" }}>
                      <td style={{ padding: "9px 14px", fontWeight: 700 }}>Totale</td>
                      <td style={{ padding: "9px 14px", textAlign: "right", color: "var(--text2)" }}>100%</td>
                      <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 700, color: "var(--accent)" }}>
                        {fmtEur(risultato.totaleVerificato)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED — selezione multipla tipologie
// ═══════════════════════════════════════════════════════════════════════════════

function TipologieMultiSelect({ tipologie, selected, onChange }) {
  const toggle = id => onChange(
    selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
  );
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 600, margin: "0 0 6px", color: "var(--text2)",
                  textTransform: "uppercase", letterSpacing: 0.4 }}>
        Voci di spesa (nessuna = tutte)
      </p>
      <div style={{ maxHeight: 160, overflowY: "auto", border: "1px solid var(--border)",
                    borderRadius: 8, padding: "6px 8px", background: "var(--bg3)",
                    display: "grid", gap: 3 }}>
        {tipologie.map(t => (
          <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 8,
                                      cursor: "pointer", padding: "3px 4px", borderRadius: 5,
                                      fontSize: 13,
                                      background: selected.includes(t.id) ? "rgba(59,130,246,0.12)" : "transparent" }}>
            <input type="checkbox" checked={selected.includes(t.id)}
                   onChange={() => toggle(t.id)}
                   style={{ accentColor: "var(--accent)", width: 14, height: 14, flexShrink: 0 }} />
            {t.descrizione}
          </label>
        ))}
        {tipologie.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--text2)", margin: 0, padding: "4px 0" }}>
            Nessuna voce di spesa disponibile
          </p>
        )}
      </div>
      {selected.length > 0 && (
        <p style={{ fontSize: 11, color: "var(--accent)", margin: "4px 0 0" }}>
          {selected.length} voce{selected.length > 1 ? "i" : ""} selezionata{selected.length > 1 ? "e" : ""}
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIVELLO 1 — Condominio → Appartamenti
// ═══════════════════════════════════════════════════════════════════════════════

function ModalRegolaCondominio({ condominioId, immobiliCondominio, tipologie, initial, onSave, onClose }) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState({
    metodo:     initial?.metodo      || "millesimi",
    validitaDa: initial?.validita_da?.slice(0, 10) || "",
    validitaA:  initial?.validita_a?.slice(0, 10)  || "",
    note:       initial?.note        || "",
  });
  const [tipoSpesaIds, setTipoSpesaIds] = useState(
    initial?.tipo_spesa_id ? [initial.tipo_spesa_id] : []
  );
  const [quote, setQuote] = useState(() => {
    const base = Object.fromEntries(immobiliCondominio.map(i => [i.id, ""]));
    if (initial?.dettagli) {
      for (const d of initial.dettagli) {
        if (d.immobileId && d.percentuale != null) base[d.immobileId] = String(d.percentuale);
      }
    }
    return base;
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setQ = id => e => setQuote(q => ({ ...q, [id]: e.target.value }));

  const sommaQ = Object.values(quote).reduce((s, v) => s + (Number(v) || 0), 0);

  async function handleSave() {
    if (!form.validitaDa) { setErr("Data di validità obbligatoria"); return; }
    if (form.metodo === "percentuale") {
      const totale = Object.values(quote).reduce((s, v) => s + (Number(v) || 0), 0);
      if (Math.abs(totale - 100) > 0.01) { setErr(`Le percentuali devono sommare a 100% (attuale: ${totale.toFixed(2)}%)`); return; }
    }
    setSaving(true); setErr(null);
    try {
      await onSave({
        condominioId,
        metodo:     form.metodo,
        validitaDa: form.validitaDa,
        validitaA:  form.validitaA || null,
        note:       form.note     || null,
      }, form.metodo === "percentuale" ? quote : null, tipoSpesaIds);
      onClose(true);
    } catch (e) { setErr(e.message); setSaving(false); }
  }

  const modalTitle = isEdit ? "Modifica regola: Condominio → Appartamenti" : "Nuova regola: Condominio → Appartamenti";

  return (
    <Modal title={modalTitle} onClose={() => onClose(null)} width={560}
           footer={<>
             <Btn variant="ghost" onClick={() => onClose(null)}>Annulla</Btn>
             <Btn variant="primary" onClick={handleSave} disabled={saving}>
               {saving ? "Salvo…" : "Salva"}
             </Btn>
           </>}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <p style={{ color: "var(--red)", fontSize: 12, margin: 0,
                            padding: "7px 10px", borderRadius: 7, background: "rgba(239,68,68,0.08)" }}>{err}</p>}

        <div style={{ padding: "10px 14px", background: "rgba(59,130,246,0.08)",
                      border: "1px solid rgba(59,130,246,0.3)", borderRadius: 8, fontSize: 12, color: "var(--text2)" }}>
          <i className="ti ti-info-circle" style={{ marginRight: 6, color: "var(--accent)" }} />
          Definisce come una spesa condominiale viene ripartita tra gli appartamenti.
          Con <strong>millesimi</strong> si usa il valore millesimale di ogni appartamento;
          con <strong>percentuale</strong> si definisce manualmente la quota per ciascuno.
        </div>

        <Field label="Metodo *">
          <select className="inp" value={form.metodo} onChange={set("metodo")}>
            <option value="millesimi">Millesimi</option>
            <option value="percentuale">Percentuale manuale</option>
          </select>
        </Field>

        <TipologieMultiSelect tipologie={tipologie} selected={tipoSpesaIds} onChange={setTipoSpesaIds} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Valida dal *">
            <input className="inp" type="date" value={form.validitaDa} onChange={set("validitaDa")} />
          </Field>
          <Field label="Valida al">
            <input className="inp" type="date" value={form.validitaA} onChange={set("validitaA")} />
          </Field>
        </div>

        <Field label="Note">
          <textarea className="inp" rows={2} value={form.note} onChange={set("note")}
                    style={{ resize: "vertical" }} />
        </Field>

        {/* Tabella appartamenti */}
        {form.metodo === "millesimi" && (
          <div style={{ background: "var(--bg3)", borderRadius: 8, padding: "12px 14px" }}>
            <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px", color: "var(--text2)" }}>
              Appartamenti — riparto per millesimi
            </p>
            {immobiliCondominio.map(im => (
              <div key={im.id} style={{ display: "flex", justifyContent: "space-between",
                                        fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <span>{im.nome}</span>
                <span style={{ color: "var(--text2)" }}>
                  {im.millesimi_condominio ?? "—"} mill.
                </span>
              </div>
            ))}
          </div>
        )}

        {form.metodo === "percentuale" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: "var(--text2)" }}>
                Quote percentuali per appartamento
              </p>
              <span style={{ fontSize: 12, fontWeight: 700,
                              color: Math.abs(sommaQ - 100) < 0.01 ? "var(--green)" : "var(--red)" }}>
                Totale: {sommaQ.toFixed(2)}%
              </span>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {immobiliCondominio.map(im => (
                <div key={im.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px",
                                          gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 13 }}>{im.nome}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input className="inp" type="number" min={0} max={100} step={0.01}
                           value={quote[im.id]} onChange={setQ(im.id)}
                           style={{ width: "100%" }} />
                    <span style={{ fontSize: 12, color: "var(--text2)" }}>%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function RegoleCondominioCard({ regola, onDelete, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const [confirm,  setConfirm]  = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDel() {
    setDeleting(true);
    try { await onDelete(regola.id); } finally { setDeleting(false); }
  }

  const dettagli = regola.dettagli || [];

  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 10,
                    background: "var(--bg3)", cursor: "pointer" }}
           onClick={() => setExpanded(e => !e)}>
        <i className={`ti ti-chevron-${expanded ? "down" : "right"}`}
           style={{ fontSize: 13, color: "var(--text2)" }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>
            {regola.tipo_spesa_desc || "Tutte le spese"}
          </span>
          {(regola.validita_da || regola.validita_a) && (
            <span style={{ fontSize: 11, color: "var(--text2)", marginLeft: 10 }}>
              {regola.validita_da && `dal ${fmtData(regola.validita_da)}`}
              {regola.validita_a  && ` al ${fmtData(regola.validita_a)}`}
            </span>
          )}
        </div>
        <Badge label={regola.metodo === "millesimi" ? "Millesimi" : "Percentuale"}
               color={regola.metodo === "millesimi" ? "blue" : "yellow"} />
        <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 4 }}>
          <Btn size="sm" variant="ghost" title="Modifica" onClick={() => onEdit(regola)}>
            <i className="ti ti-pencil" style={{ color: "var(--accent)" }} />
          </Btn>
          <Btn size="sm" variant="ghost" title="Elimina" onClick={() => setConfirm(true)}>
            <i className="ti ti-trash" style={{ color: "var(--red)" }} />
          </Btn>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "12px 14px" }}>
          {regola.note && (
            <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 10 }}>
              <i className="ti ti-note" style={{ marginRight: 4 }} />{regola.note}
            </p>
          )}
          {regola.metodo === "millesimi" ? (
            <p style={{ fontSize: 12, color: "var(--text2)", fontStyle: "italic" }}>
              Riparto calcolato automaticamente sui millesimi di ogni appartamento.
            </p>
          ) : dettagli.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text2)", fontStyle: "italic" }}>
              Nessuna quota percentuale definita.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 4 }}>
              {dettagli.map((d, i) => (
                <div key={d.id || i} style={{ display: "flex", justifyContent: "space-between",
                                               fontSize: 13, padding: "4px 0",
                                               borderBottom: "1px solid var(--border)" }}>
                  <span>{d.immobileNome || d.immobileId}</span>
                  <span style={{ fontWeight: 600 }}>{d.percentuale}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {confirm && <ConfirmDeleteOverlay onConfirm={handleDel} onCancel={() => setConfirm(false)}
                                        loading={deleting} label="Eliminare questa regola?" />}
    </div>
  );
}

function RegoleCondominioSection({ condomini, tipologie }) {
  const [condominioId, setCondominioId] = useState("");
  const [regole,    setRegole]    = useState(null);
  const [immobili,  setImmobili]  = useState([]);
  const [showForm,  setShowForm]  = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);

  const load = useCallback(async () => {
    if (!condominioId) return;
    setLoading(true);
    try { setRegole(await ripartoV2.listaRegoleCondominio(condominioId)); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [condominioId]);

  useEffect(() => {
    setRegole(null);
    if (!condominioId) { setImmobili([]); return; }
    immobiliV2.lista({ condominioId })
      .then(list => setImmobili(list.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""))))
      .catch(() => {});
    load();
  }, [condominioId, load]);

  async function handleSave(dati, quoteMap, tipoSpesaIds = []) {
    const ids = tipoSpesaIds.length > 0 ? tipoSpesaIds : [null];
    await Promise.all(ids.map(async tipoSpesaId => {
      const id = crypto.randomUUID();
      const dettagli = (dati.metodo === "percentuale" && quoteMap)
        ? Object.entries(quoteMap)
            .filter(([, v]) => Number(v) > 0)
            .map(([immobileId, percentuale]) => ({ immobileId, percentuale: Number(percentuale) }))
        : [];
      await ripartoV2.creaRegolaCondominio({ id, ...dati, tipoSpesaId, dettagli });
    }));
    await load();
  }

  async function handleUpdate(dati, quoteMap, tipoSpesaIds = []) {
    const tipoSpesaId = tipoSpesaIds.length > 0 ? tipoSpesaIds[0] : null;
    const dettagli = (dati.metodo === "percentuale" && quoteMap)
      ? Object.entries(quoteMap)
          .filter(([, v]) => Number(v) > 0)
          .map(([immobileId, percentuale]) => ({ immobileId, percentuale: Number(percentuale) }))
      : [];
    await ripartoV2.aggiornaRegolaCondominio(editing.id, {
      ...dati, tipoSpesaId, dettagli,
    });
    await load();
  }

  async function handleDelete(id) {
    await ripartoV2.rimuoviRegolaCondominio(id);
    await load();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <select className="inp" value={condominioId} onChange={e => setCondominioId(e.target.value)} style={{ maxWidth: 280 }}>
          <option value="">— Seleziona condominio —</option>
          {condomini.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        {condominioId && (
          <Btn variant="primary" onClick={() => setShowForm(true)}>
            <i className="ti ti-plus" /> Nuova regola
          </Btn>
        )}
      </div>

      <EmptyOrList
        condId={condominioId}
        loading={loading}
        err={err}
        items={regole}
        emptyIcon="ti-building"
        emptyPrompt="Seleziona un condominio per gestire le regole di riparto."
        emptyListText="Nessuna regola condominio configurata."
        emptyListSub="Senza regole si usano i millesimi di default di ogni appartamento."
        renderItem={r => (
          <RegoleCondominioCard key={r.id} regola={r}
            onDelete={handleDelete}
            onEdit={setEditing} />
        )}
      />

      {(showForm || editing) && condominioId && (
        <ModalRegolaCondominio
          condominioId={condominioId}
          immobiliCondominio={immobili}
          tipologie={tipologie}
          initial={editing}
          onSave={editing ? handleUpdate : handleSave}
          onClose={ok => { setShowForm(false); setEditing(null); if (ok) load(); }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIVELLO 2 & 3 — Appartamento → Proprietari / Inquilini
// ═══════════════════════════════════════════════════════════════════════════════

function ModalRegolaAppartamento({ immobileId, target, tipologie, initial, onSave, onClose }) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState({
    validitaDa:     initial?.validita_da?.slice(0, 10) || "",
    validitaA:      initial?.validita_a?.slice(0, 10)  || "",
    quotaTotalePct: initial?.quota_totale_pct ?? 100,
    splitUguale:    initial?.split_uguale ?? true,
    modalita:       initial?.modalita ?? "escludi",
    note:           initial?.note ?? "",
  });
  const [tipoSpesaIds, setTipoSpesaIds] = useState(
    initial?.tipo_spesa_id ? [initial.tipo_spesa_id] : []
  );
  const [ruoli,       setRuoli]       = useState([]);
  const [quoteCustom, setQuoteCustom] = useState(
    initial?.dettagli
      ? Object.fromEntries(
          initial.dettagli
            .filter(d => d.includi && d.percentuale != null)
            .map(d => [d.personaId, String(d.percentuale)])
        )
      : {}
  );
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState(null);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  // Ricarica ruoli ogni volta che cambia la data di inizio validità.
  // dataRif: usa validitaDa se impostata, altrimenti oggi — null validita_a = ancora in corso.
  useEffect(() => {
    const ruolo = target === "proprietari" ? "proprietario" : "inquilino";
    const filtri = { ruolo, dataRif: form.validitaDa || oggi() };
    immobiliV2.ruoli(immobileId, filtri)
      .then(list => {
        setRuoli(list);
        setQuoteCustom(prev => {
          const next = Object.fromEntries(list.map(r => [r.personaId, prev[r.personaId] ?? ""]));
          return next;
        });
      })
      .catch(() => {});
  }, [immobileId, target, form.validitaDa]);

  const sommaQuote = Object.values(quoteCustom).reduce((s, v) => s + (Number(v) || 0), 0);
  const splitUguale = form.splitUguale === true || form.splitUguale === "true";

  async function handleSave() {
    if (!splitUguale && sommaQuote <= 0) { setErr("Inserisci le quote percentuali"); return; }
    setSaving(true); setErr(null);
    try {
      await onSave({
        immobileId,
        target,
        validitaDa:     form.validitaDa     || null,
        validitaA:      form.validitaA      || null,
        quotaTotalePct: Number(form.quotaTotalePct),
        splitUguale,
        modalita:       form.modalita,
        note:           form.note           || null,
      }, splitUguale ? null : quoteCustom, tipoSpesaIds);
      onClose(true);
    } catch (e) { setErr(e.message); setSaving(false); }
  }

  const targetLabel = target === "proprietari" ? "Proprietari" : "Inquilini";
  const modalTitle  = isEdit
    ? `Modifica regola: Appartamento → ${targetLabel}`
    : `Nuova regola: Appartamento → ${targetLabel}`;

  return (
    <Modal title={modalTitle} onClose={() => onClose(null)} width={540}
           footer={<>
             <Btn variant="ghost" onClick={() => onClose(null)}>Annulla</Btn>
             <Btn variant="primary" onClick={handleSave} disabled={saving}>
               {saving ? "Salvo…" : "Salva"}
             </Btn>
           </>}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <p style={{ color: "var(--red)", fontSize: 12, margin: 0,
                            padding: "7px 10px", borderRadius: 7, background: "rgba(239,68,68,0.08)" }}>{err}</p>}

        {target === "inquilini" && (
          <div style={{ padding: "10px 14px", background: "rgba(59,130,246,0.08)",
                        border: "1px solid rgba(59,130,246,0.3)", borderRadius: 8, fontSize: 12, color: "var(--text2)" }}>
            <i className="ti ti-info-circle" style={{ marginRight: 6, color: "var(--accent)" }} />
            La <strong>quota inquilini</strong> può essere inferiore al 100%.
            Es. 50% = gli inquilini coprono metà della spesa, l'altra metà è a carico dei proprietari.
            La distribuzione tra inquilini usa la <strong>quota</strong> del ruolo (non la quota affitto,
            che è l'importo mensile da versare).
          </div>
        )}

        <TipologieMultiSelect tipologie={tipologie} selected={tipoSpesaIds} onChange={setTipoSpesaIds} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Valida dal">
            <input className="inp" type="date" value={form.validitaDa} onChange={set("validitaDa")} />
          </Field>
          <Field label="Valida al">
            <input className="inp" type="date" value={form.validitaA} onChange={set("validitaA")} />
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={`Quota ${targetLabel} %`}
                 hint={target === "inquilini" ? "es. 50 = inquilini coprono il 50%" : undefined}>
            <input className="inp" type="number" min={0} max={100} step={0.01}
                   value={form.quotaTotalePct} onChange={set("quotaTotalePct")} />
          </Field>
          <Field label="Distribuzione">
            <select className="inp" value={String(form.splitUguale)}
                    onChange={e => setForm(f => ({ ...f, splitUguale: e.target.value === "true" }))}>
              <option value="true">Parti uguali</option>
              <option value="false">Quote personalizzate</option>
            </select>
          </Field>
        </div>

        {/* Quote personalizzate per persona */}
        {!splitUguale && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: "var(--text2)" }}>
                Quote millesimali per {targetLabel.toLowerCase()}
                {form.validitaDa && (
                  <span style={{ fontWeight: 400, marginLeft: 6 }}>
                    (attivi al {fmtData(form.validitaDa)})
                  </span>
                )}
              </p>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)" }}>
                Totale: {sommaQuote.toFixed(2)}
              </span>
            </div>
            {ruoli.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--red)", fontStyle: "italic" }}>
                Nessun {target === "proprietari" ? "proprietario" : "inquilino"} trovato per questo immobile
                {form.validitaDa ? ` alla data ${fmtData(form.validitaDa)}` : ""}.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {ruoli.map(r => {
                  const nome = [r.personaCognome, r.personaNome].filter(Boolean).join(" ");
                  return (
                    <div key={r.personaId} style={{ display: "grid", gridTemplateColumns: "1fr 100px auto",
                                                    gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 13 }}>
                        {nome}
                        {r.quota != null && (
                          <span style={{ fontSize: 11, color: "var(--text2)", marginLeft: 6 }}>
                            (quota: {r.quota})
                          </span>
                        )}
                      </span>
                      <input className="inp" type="number" min={0} step={0.01}
                             value={quoteCustom[r.personaId] ?? ""}
                             onChange={e => setQuoteCustom(q => ({ ...q, [r.personaId]: e.target.value }))}
                             placeholder={String(r.quota ?? "")} />
                      <span style={{ fontSize: 12, color: "var(--text2)" }}></span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <Field label="Note">
          <textarea className="inp" rows={2} value={form.note} onChange={set("note")}
                    style={{ resize: "vertical" }} />
        </Field>
      </div>
    </Modal>
  );
}

function RegoleAppartamentoCard({ regola, onDelete, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const [confirm,  setConfirm]  = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDel() {
    setDeleting(true);
    try { await onDelete(regola.id); } finally { setDeleting(false); }
  }

  const dettagli = regola.dettagli || [];
  const quota    = Number(regola.quota_totale_pct ?? 100);

  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 10,
                    background: "var(--bg3)", cursor: "pointer" }}
           onClick={() => setExpanded(e => !e)}>
        <i className={`ti ti-chevron-${expanded ? "down" : "right"}`}
           style={{ fontSize: 13, color: "var(--text2)" }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>
            {regola.tipo_spesa_desc || "Tutte le spese"}
          </span>
          {(regola.validita_da || regola.validita_a) && (
            <span style={{ fontSize: 11, color: "var(--text2)", marginLeft: 10 }}>
              {regola.validita_da && `dal ${regola.validita_da}`}
              {regola.validita_a  && ` al ${regola.validita_a}`}
            </span>
          )}
        </div>
        {quota < 100 && (
          <Badge label={`${quota}% a carico`} color="yellow" />
        )}
        <Badge label={regola.split_uguale ? "Parti uguali" : "Quote custom"} color="blue" />
        <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 4 }}>
          <Btn size="sm" variant="ghost" title="Modifica" onClick={() => onEdit(regola)}>
            <i className="ti ti-pencil" style={{ color: "var(--accent)" }} />
          </Btn>
          <Btn size="sm" variant="ghost" title="Elimina" onClick={() => setConfirm(true)}>
            <i className="ti ti-trash" style={{ color: "var(--red)" }} />
          </Btn>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "12px 14px" }}>
          {regola.note && (
            <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 10 }}>
              <i className="ti ti-note" style={{ marginRight: 4 }} />{regola.note}
            </p>
          )}
          {dettagli.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text2)", fontStyle: "italic" }}>
              {regola.split_uguale
                ? "Distribuzione in parti uguali tra tutti i ruoli attivi."
                : "Nessun dettaglio quota — si usa la quota di default dai ruoli."
              }
            </p>
          ) : (
            <div style={{ display: "grid", gap: 4 }}>
              {dettagli.map((d, i) => (
                <div key={d.id || i} style={{
                  display: "flex", justifyContent: "space-between", fontSize: 13,
                  padding: "5px 0", borderBottom: "1px solid var(--border)",
                  opacity: d.includi ? 1 : 0.5,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <i className={`ti ${d.includi ? "ti-circle-check" : "ti-circle-minus"}`}
                       style={{ fontSize: 12, color: d.includi ? "var(--green)" : "var(--red)" }} />
                    <span>
                      {d.personaNome || `Persona ${(d.personaId || "").slice(-6)}`}
                    </span>
                    {d.quotaDefault != null && (
                      <span style={{ fontSize: 11, color: "var(--text2)" }}>
                        quota default: {d.quotaDefault}
                      </span>
                    )}
                  </div>
                  {d.percentuale != null && (
                    <span style={{ fontWeight: 600, color: "var(--accent)" }}>{d.percentuale}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {confirm && <ConfirmDeleteOverlay onConfirm={handleDel} onCancel={() => setConfirm(false)}
                                        loading={deleting} label="Eliminare questa regola?" />}
    </div>
  );
}

function RegoleAppartamentoSection({ immobili, tipologie, target }) {
  const [immobileId, setImmobileId] = useState("");
  const [regole,     setRegole]     = useState(null);
  const [showForm,   setShowForm]   = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState(null);

  const load = useCallback(async () => {
    if (!immobileId) return;
    setLoading(true);
    try { setRegole(await ripartoV2.listaRegole(immobileId, target)); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [immobileId, target]);

  useEffect(() => { setRegole(null); load(); }, [load]);

  async function handleSave(dati, quoteMap, tipoSpesaIds = []) {
    const ids = tipoSpesaIds.length > 0 ? tipoSpesaIds : [null];
    await Promise.all(ids.map(async tipoSpesaId => {
      const id = crypto.randomUUID();
      const dettagli = quoteMap
        ? Object.entries(quoteMap)
            .filter(([, v]) => Number(v) > 0)
            .map(([personaId, percentuale]) => ({ personaId, includi: true, percentuale: Number(percentuale) }))
        : [];
      await ripartoV2.creaRegola({ id, ...dati, tipoSpesaId, dettagli });
    }));
    await load();
  }

  async function handleUpdate(dati, quoteMap, tipoSpesaIds = []) {
    const tipoSpesaId = tipoSpesaIds.length > 0 ? tipoSpesaIds[0] : null;
    const dettagli = quoteMap
      ? Object.entries(quoteMap)
          .filter(([, v]) => Number(v) > 0)
          .map(([personaId, percentuale]) => ({ personaId, includi: true, percentuale: Number(percentuale) }))
      : [];
    await ripartoV2.aggiornaRegola(editing.id, {
      ...dati, tipoSpesaId, dettagli,
    });
    await load();
  }

  async function handleDelete(id) {
    await ripartoV2.rimuoviRegola(id);
    await load();
  }

  const targetLabel = target === "proprietari" ? "Proprietari" : "Inquilini";

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <select className="inp" value={immobileId} onChange={e => setImmobileId(e.target.value)} style={{ maxWidth: 280 }}>
          <option value="">— Seleziona immobile —</option>
          {immobili.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        {immobileId && (
          <Btn variant="primary" onClick={() => setShowForm(true)}>
            <i className="ti ti-plus" /> Nuova regola {targetLabel}
          </Btn>
        )}
      </div>

      <EmptyOrList
        condId={immobileId}
        loading={loading}
        err={err}
        items={regole}
        emptyIcon="ti-home"
        emptyPrompt={`Seleziona un immobile per gestire le regole ${targetLabel.toLowerCase()}.`}
        emptyListText={`Nessuna regola ${targetLabel.toLowerCase()} configurata.`}
        emptyListSub={`Senza regole si usano le quote di default dai ruoli attivi.`}
        renderItem={r => (
          <RegoleAppartamentoCard key={r.id} regola={r}
            onDelete={handleDelete}
            onEdit={setEditing} />
        )}
      />

      {(showForm || editing) && immobileId && (
        <ModalRegolaAppartamento
          immobileId={immobileId}
          target={target}
          tipologie={tipologie}
          initial={editing}
          onSave={editing ? handleUpdate : handleSave}
          onClose={ok => { setShowForm(false); setEditing(null); if (ok) load(); }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function ConfirmDeleteOverlay({ onConfirm, onCancel, loading, label }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
                  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }}>
      <div style={{ background: "var(--bg2)", border: "1px solid var(--red)", borderRadius: 12,
                    padding: 24, maxWidth: 340, width: "100%" }}>
        <p style={{ marginBottom: 20, fontSize: 14 }}>{label}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onCancel}>Annulla</Btn>
          <Btn variant="danger" disabled={loading} onClick={onConfirm}>
            {loading ? "Elimino…" : <><i className="ti ti-trash" /> Elimina</>}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function EmptyOrList({ condId, loading, err, items, emptyIcon, emptyPrompt, emptyListText, emptyListSub, renderItem }) {
  if (err) return (
    <div style={{ color: "var(--red)", fontSize: 12, padding: "8px 12px", borderRadius: 8,
                  background: "rgba(239,68,68,0.08)" }}>{err}</div>
  );
  if (!condId) return (
    <div style={{ background: "var(--bg2)", border: "1px dashed var(--border)", borderRadius: 10,
                  padding: 40, textAlign: "center", color: "var(--text2)" }}>
      <i className={`ti ${emptyIcon}`} style={{ fontSize: 32, opacity: 0.3, display: "block", marginBottom: 10 }} />
      {emptyPrompt}
    </div>
  );
  if (loading) return (
    <div style={{ textAlign: "center", padding: 40, color: "var(--text2)" }}>
      <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 24 }} />
    </div>
  );
  if (items?.length === 0) return (
    <div style={{ background: "var(--bg2)", border: "1px dashed var(--border)", borderRadius: 10,
                  padding: 32, textAlign: "center", color: "var(--text2)", fontSize: 13 }}>
      <i className={`ti ${emptyIcon}`} style={{ fontSize: 28, opacity: 0.3, display: "block", marginBottom: 8 }} />
      {emptyListText}<br />
      <span style={{ fontSize: 12 }}>{emptyListSub}</span>
    </div>
  );
  return <div style={{ display: "grid", gap: 8 }}>{items?.map(renderItem)}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGOLA COPPIA (Livelli 2+3): crea Proprietari + Inquilini in un'unica form
// ═══════════════════════════════════════════════════════════════════════════════

function ModalRegolaCoppia({ immobileId, tipologie, initial, onSave, onClose }) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState({
    validitaDa:       initial?.validitaDa      || "",
    validitaA:        initial?.validitaA       || "",
    quotaProprietari: initial?.quotaProprietari ?? 100,
    quotaInquilini:   initial?.quotaInquilini   ?? 0,
    note:             initial?.note            || "",
  });
  const [tipoSpesaIds, setTipoSpesaIds] = useState(
    initial?.tipoSpesaId ? [initial.tipoSpesaId] : []
  );
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const totale = (Number(form.quotaProprietari) || 0) + (Number(form.quotaInquilini) || 0);

  async function handleSave() {
    setSaving(true); setErr(null);
    try {
      if (isEdit) {
        // aggiorna le due regole esistenti separatamente
        await onSave({ ...form, tipoSpesaIds });
      } else {
        await onSave({ ...form, tipoSpesaIds });
      }
      onClose(true);
    } catch (e) { setErr(e.message); setSaving(false); }
  }

  return (
    <Modal title={isEdit ? "Modifica regola Prop + Inq" : "Nuova regola Prop + Inq"}
           onClose={() => onClose(null)} width={480}
           footer={<>
             <Btn variant="ghost" onClick={() => onClose(null)}>Annulla</Btn>
             <Btn variant="primary" onClick={handleSave} disabled={saving}>
               {saving ? "Salvo…" : "Salva"}
             </Btn>
           </>}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <p style={{ color: "var(--red)", fontSize: 12, margin: 0,
                            padding: "7px 10px", borderRadius: 7, background: "rgba(239,68,68,0.08)" }}>{err}</p>}

        <div style={{ padding: "10px 14px", background: "rgba(59,130,246,0.07)",
                      border: "1px solid rgba(59,130,246,0.25)", borderRadius: 8, fontSize: 12, color: "var(--text2)" }}>
          <i className="ti ti-info-circle" style={{ marginRight: 6, color: "var(--accent)" }} />
          Crea in un colpo una regola per i <strong>proprietari</strong> (livello 2)
          e una per gli <strong>inquilini</strong> (livello 3) con le percentuali totali indicate.
          La distribuzione interna usa le quote di default dei ruoli.
        </div>

        <TipologieMultiSelect tipologie={tipologie} selected={tipoSpesaIds} onChange={setTipoSpesaIds} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Valida dal">
            <input className="inp" type="date" value={form.validitaDa} onChange={set("validitaDa")} />
          </Field>
          <Field label="Valida al">
            <input className="inp" type="date" value={form.validitaA} onChange={set("validitaA")} />
          </Field>
        </div>

        <div style={{ background: "var(--bg3)", border: "1px solid var(--border)",
                      borderRadius: 8, padding: "12px 14px", display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>
            Ripartizione % tra proprietari e inquilini
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="% Proprietari">
              <input className="inp" type="number" min={0} max={100} step={0.01}
                     value={form.quotaProprietari} onChange={set("quotaProprietari")} />
            </Field>
            <Field label="% Inquilini">
              <input className="inp" type="number" min={0} max={100} step={0.01}
                     value={form.quotaInquilini} onChange={set("quotaInquilini")} />
            </Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ color: "var(--text2)" }}>Totale:</span>
            <span style={{ fontWeight: 700, color: totale === 100 ? "var(--green)" : totale > 100 ? "var(--red)" : "var(--text2)" }}>
              {totale.toFixed(2)}%
            </span>
            {totale !== 100 && (
              <span style={{ color: "var(--text2)", fontStyle: "italic" }}>
                ({totale < 100 ? `${(100 - totale).toFixed(2)}% non assegnato` : "supera il 100%"})
              </span>
            )}
          </div>
        </div>

        <Field label="Note">
          <textarea className="inp" rows={2} value={form.note} onChange={set("note")}
                    style={{ resize: "vertical" }} />
        </Field>
      </div>
    </Modal>
  );
}

function RegolaCoppiaCard({ coppia, onDelete, onEdit }) {
  const [confirm,  setConfirm]  = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDel() {
    setDeleting(true);
    try { await onDelete(coppia); } finally { setDeleting(false); }
  }

  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 10,
                    background: "var(--bg3)" }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>
            {coppia.tipoSpesaDesc || "Tutte le spese"}
          </span>
          {(coppia.validitaDa || coppia.validitaA) && (
            <span style={{ fontSize: 11, color: "var(--text2)", marginLeft: 8 }}>
              {fmtData(coppia.validitaDa) || "—"} → {fmtData(coppia.validitaA) || "∞"}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                         background: "rgba(165,180,252,0.15)", color: "#a5b4fc" }}>
            Prop {Number(coppia.quotaProprietari ?? 100)}%
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                         background: "rgba(74,222,128,0.12)", color: "var(--green)" }}>
            Inq {Number(coppia.quotaInquilini ?? 100)}%
          </span>
          <Btn size="sm" variant="ghost" onClick={() => onEdit(coppia)}>
            <i className="ti ti-edit" style={{ fontSize: 13 }} />
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => setConfirm(true)}>
            <i className="ti ti-trash" style={{ fontSize: 13, color: "var(--red)" }} />
          </Btn>
        </div>
      </div>

      {confirm && <ConfirmDeleteOverlay onConfirm={handleDel} onCancel={() => setConfirm(false)}
                                        loading={deleting} label="Eliminare entrambe le regole (prop + inq)?" />}
    </div>
  );
}

function RegoleCoppiaSection({ immobili, tipologie }) {
  const [immobileId, setImmobileId] = useState("");
  const [coppie,     setCoppie]     = useState(null);
  const [showForm,   setShowForm]   = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [loading,    setLoading]    = useState(false);

  // Carica tutte le regole dell'immobile (prop + inq) e raggruppa in coppie
  async function load(id) {
    if (!id) { setCoppie(null); return; }
    setLoading(true);
    try {
      const tutteRegole = await ripartoV2.listaRegole(id);
      // raggruppa per (tipoSpesaId, validitaDa, validitaA)
      const mappa = new Map();
      for (const r of tutteRegole) {
        const chiave = `${r.tipo_spesa_id ?? ""}::${r.validita_da ?? ""}::${r.validita_a ?? ""}`;
        if (!mappa.has(chiave)) mappa.set(chiave, {});
        const entry = mappa.get(chiave);
        if (r.target === "proprietari") entry.prop = r;
        else if (r.target === "inquilini") entry.inq = r;
      }
      // mostra solo le coppie complete (entrambe prop e inq)
      const lista = [];
      for (const [, entry] of mappa) {
        if (entry.prop && entry.inq) {
          lista.push({
            propId:          entry.prop.id,
            inqId:           entry.inq.id,
            tipoSpesaId:     entry.prop.tipo_spesa_id,
            tipoSpesaDesc:   entry.prop.tipo_spesa_desc,
            validitaDa:      entry.prop.validita_da,
            validitaA:       entry.prop.validita_a,
            quotaProprietari: Number(entry.prop.quota_totale_pct ?? 100),
            quotaInquilini:   Number(entry.inq.quota_totale_pct  ?? 100),
            note:             entry.prop.note || entry.inq.note || "",
          });
        }
      }
      setCoppie(lista.sort((a, b) => (a.tipoSpesaDesc || "").localeCompare(b.tipoSpesaDesc || "")));
    } catch { setCoppie([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(immobileId); }, [immobileId]);

  async function handleSave(form) {
    if (editing) {
      // aggiorna le due regole esistenti
      await ripartoV2.aggiornaRegola(editing.propId, { quotaTotalePct: Number(form.quotaProprietari), validitaDa: form.validitaDa || null, validitaA: form.validitaA || null, note: form.note || null });
      await ripartoV2.aggiornaRegola(editing.inqId,  { quotaTotalePct: Number(form.quotaInquilini),   validitaDa: form.validitaDa || null, validitaA: form.validitaA || null, note: form.note || null });
    } else {
      await ripartoV2.creaRegolaCoppia({ immobileId, tipoSpesaIds: form.tipoSpesaIds, validitaDa: form.validitaDa || null, validitaA: form.validitaA || null, quotaProprietari: Number(form.quotaProprietari), quotaInquilini: Number(form.quotaInquilini), note: form.note || null });
    }
    setEditing(null); setShowForm(false);
    load(immobileId);
  }

  async function handleDelete(coppia) {
    await ripartoV2.rimuoviRegola(coppia.propId);
    await ripartoV2.rimuoviRegola(coppia.inqId);
    load(immobileId);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <select className="inp" value={immobileId} onChange={e => { setImmobileId(e.target.value); setShowForm(false); setEditing(null); }}
                style={{ maxWidth: 280 }}>
          <option value="">— Seleziona appartamento —</option>
          {immobili.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
        </select>
        {immobileId && (
          <Btn variant="primary" onClick={() => { setEditing(null); setShowForm(true); }}>
            <i className="ti ti-plus" /> Nuova regola coppia
          </Btn>
        )}
      </div>

      {loading && <p style={{ fontSize: 13, color: "var(--text2)" }}>Carico…</p>}

      {!immobileId && !loading && (
        <div style={{ background: "var(--bg2)", border: "1px dashed var(--border)", borderRadius: 10,
                      padding: 32, textAlign: "center", color: "var(--text2)", fontSize: 13 }}>
          <i className="ti ti-adjustments" style={{ fontSize: 28, opacity: 0.3, display: "block", marginBottom: 8 }} />
          Seleziona un appartamento per gestire le regole coppia.
        </div>
      )}

      {coppie !== null && coppie.length === 0 && !loading && immobileId && (
        <div style={{ background: "var(--bg2)", border: "1px dashed var(--border)", borderRadius: 10,
                      padding: 28, textAlign: "center", color: "var(--text2)", fontSize: 13 }}>
          <i className="ti ti-adjustments" style={{ fontSize: 26, opacity: 0.3, display: "block", marginBottom: 8 }} />
          Nessuna regola coppia (Prop + Inq) trovata per questo appartamento.<br />
          <span style={{ fontSize: 12 }}>Crea una regola coppia per definire la % di riparto tra proprietari e inquilini in un'unica operazione.</span>
        </div>
      )}

      {coppie?.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {coppie.map((c, i) => (
            <RegolaCoppiaCard key={i} coppia={c}
              onDelete={handleDelete}
              onEdit={cop => { setEditing(cop); setShowForm(true); }} />
          ))}
        </div>
      )}

      {(showForm || editing) && immobileId && (
        <ModalRegolaCoppia
          immobileId={immobileId}
          tipologie={tipologie}
          initial={editing}
          onSave={handleSave}
          onClose={v => { setShowForm(false); setEditing(null); if (v) load(immobileId); }} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GESTIONE REGOLE — 3 livelli con sub-tab
// ═══════════════════════════════════════════════════════════════════════════════
function RegoleSection({ condomini, immobili, tipologie }) {
  const [livello, setLivello] = useState("condominio");

  const livelli = [
    { id: "condominio",   icon: "ti-building",        label: "Cond. → Appartamenti"   },
    { id: "proprietari",  icon: "ti-home",             label: "App. → Proprietari"     },
    { id: "inquilini",    icon: "ti-users",            label: "App. → Inquilini"       },
    { id: "coppia",       icon: "ti-adjustments-alt",  label: "Prop + Inq (unificata)" },
  ];

  return (
    <div>
      {/* Spiegazione struttura */}
      <div style={{ padding: "12px 16px", background: "var(--bg3)",
                    border: "1px solid var(--border)", borderRadius: 10, marginBottom: 20, fontSize: 12,
                    color: "var(--text2)", display: "grid", gap: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", marginBottom: 4 }}>
          <i className="ti ti-sitemap" style={{ marginRight: 6, color: "var(--accent)" }} />
          Struttura delle regole di riparto (3 livelli + regola unificata)
        </div>
        <div>
          <Badge label="1" color="blue" /> <strong>Condominio → Appartamenti</strong>: come una spesa condominiale si divide tra gli appartamenti (millesimi o % manuali)
        </div>
        <div>
          <Badge label="2" color="green" /> <strong>Appartamento → Proprietari</strong>: come la quota dell'appartamento si divide tra i proprietari attivi
        </div>
        <div>
          <Badge label="3" color="yellow" /> <strong>Appartamento → Inquilini</strong>: come si divide la quota degli inquilini (può essere &lt;100%, es. 50% = il restante 50% è a carico dei proprietari)
        </div>
        <div style={{ marginTop: 4 }}>
          Senza regole si usano i <strong>valori di default dai ruoli</strong> (quota e quota_affitto).
          Le regole seguono sempre le <strong>regole temporali</strong> (validità da/a).
        </div>
      </div>

      {/* Sub-tab livelli */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        {livelli.map(l => (
          <button key={l.id} onClick={() => setLivello(l.id)} style={{
            padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
            fontSize: 12, display: "flex", alignItems: "center", gap: 6,
            color: livello === l.id ? "var(--accent)" : "var(--text2)",
            fontWeight: livello === l.id ? 700 : 400,
            borderBottom: livello === l.id ? "2px solid var(--accent)" : "2px solid transparent",
            marginBottom: -1,
          }}>
            <i className={`ti ${l.icon}`} style={{ fontSize: 13 }} />
            {l.label}
          </button>
        ))}
      </div>

      {livello === "condominio"  && <RegoleCondominioSection  condomini={condomini} tipologie={tipologie} />}
      {livello === "proprietari" && <RegoleAppartamentoSection immobili={immobili} tipologie={tipologie} target="proprietari" />}
      {livello === "inquilini"   && <RegoleAppartamentoSection immobili={immobili} tipologie={tipologie} target="inquilini" />}
      {livello === "coppia"      && <RegoleCoppiaSection immobili={immobili} tipologie={tipologie} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════════════
export function RipartoV2() {
  const [sezione,   setSezione]   = useState("regole");
  const [immobili,  setImmobili]  = useState([]);
  const [condomini, setCondomini] = useState([]);
  const [tipologie, setTipologie] = useState([]);

  useEffect(() => {
    condominiV2.lista()
      .then(async conds => {
        setCondomini(conds);
        const lists = await Promise.all(conds.map(c => immobiliV2.lista({ condominioId: c.id })));
        setImmobili(lists.flat().sort((a, b) => (a.nome || "").localeCompare(b.nome || "")));
      })
      .catch(() => {});
    tipologieV2.lista()
      .then(t => setTipologie(t))
      .catch(() => {});
  }, []);

  const TABS = [
    { id: "regole",   icon: "ti-list-details",  label: "Gestione regole" },
    { id: "calcola",  icon: "ti-calculator",    label: "Calcola riparto" },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Riparto</h2>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12,
                       background: "#1e3a5f", color: "#60a5fa", border: "1px solid #3b82f6" }}>v2</span>
      </div>
      <p style={{ fontSize: 13, color: "var(--text2)", margin: "4px 0 16px" }}>
        Regole straordinarie di riparto a 3 livelli + calcolatore di conguaglio
      </p>

      <TabBar tabs={TABS} active={sezione} onChange={setSezione} />

      {sezione === "regole"  && <RegoleSection condomini={condomini} immobili={immobili} tipologie={tipologie} />}
      {sezione === "calcola" && <CalcolaSection immobili={immobili} tipologie={tipologie} />}
    </div>
  );
}
