import { useState, useEffect, useCallback } from "react";
import { ripartoV2, immobiliV2, condominiV2 } from "../api/apiV2.js";
import { tipiSpesaApi } from "../../api.js";
import { Btn, Badge, Modal, Field } from "../../components/ui.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtEur = v =>
  v == null ? "—" : Number(v).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

const FONTE_LABEL = {
  default_uguale:      { label: "Default (parti uguali)", color: "gray"   },
  regola_uguale:       { label: "Regola (uguale)",        color: "blue"   },
  regola_quote:        { label: "Regola (quote)",         color: "yellow" },
  nessun_ruolo:        { label: "Nessun ruolo attivo",    color: "red"    },
  nessun_partecipante: { label: "Nessun partecipante",    color: "red"    },
};

// ── Sub-tabs ──────────────────────────────────────────────────────────────────
function SubTabs({ active, onChange }) {
  const tabs = [
    { id: "calcola", icon: "ti-calculator",   label: "Calcola riparto" },
    { id: "regole",  icon: "ti-list-details",  label: "Gestione regole" },
  ];
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 24,
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
          <i className={`ti ${t.icon}`} style={{ fontSize: 15 }} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Sezione Calcolatore ────────────────────────────────────────────────────────
function CalcolaSection({ immobili, tipiSpesa }) {
  const [form, setForm] = useState({
    immobileId: "",
    mese:       new Date().toISOString().slice(0, 7),
    importo:    "",
    tipoSpesaId:"",
    target:     "inquilini",
  });
  const [risultato, setRisultato] = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);

  const set    = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function calcola() {
    if (!form.immobileId) { setErr("Seleziona un immobile"); return; }
    if (!form.mese)        { setErr("Mese obbligatorio");    return; }
    if (!form.importo || isNaN(Number(form.importo)) || Number(form.importo) <= 0) {
      setErr("Importo non valido");
      return;
    }
    setLoading(true);
    setErr(null);
    setRisultato(null);
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

  const immobile = immobili.find(i => i.id === form.immobileId);
  const fonteInfo = risultato ? (FONTE_LABEL[risultato.fonte] || { label: risultato.fonte, color: "gray" }) : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20, alignItems: "start" }}>
      {/* Form */}
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--border)",
        borderRadius: 12, padding: "20px 20px",
      }}>
        <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, margin: "0 0 16px" }}>
          Parametri di calcolo
        </p>
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
                   value={form.importo} onChange={set("importo")}
                   placeholder="es. 1250.00" />
          </Field>
          <Field label="Tipo spesa (opzionale)">
            <select className="inp" value={form.tipoSpesaId} onChange={set("tipoSpesaId")}>
              <option value="">— Nessuno / default —</option>
              {tipiSpesa.map(ts => (
                <option key={ts.id} value={ts.id}>{ts.descrizione}</option>
              ))}
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

      {/* Risultato */}
      <div>
        {!risultato && !loading && (
          <div style={{
            background: "var(--bg2)", border: "1px dashed var(--border)", borderRadius: 12,
            padding: 40, textAlign: "center", color: "var(--text2)",
          }}>
            <i className="ti ti-calculator" style={{ fontSize: 36, opacity: 0.3, display: "block", marginBottom: 12 }} />
            Compila i parametri e premi "Calcola riparto"
          </div>
        )}

        {risultato && (
          <div style={{ display: "grid", gap: 14 }}>
            {/* Summary bar */}
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
                  {" · "}
                  Verificato: {fmtEur(risultato.totaleVerificato)}
                </p>
              </div>
              {fonteInfo && (
                <Badge label={fonteInfo.label} color={fonteInfo.color} />
              )}
            </div>

            {/* Nessun partecipante */}
            {(!risultato.quote || risultato.quote.length === 0) && (
              <div style={{
                background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10,
                padding: "20px", textAlign: "center", color: "var(--text2)", fontSize: 13,
              }}>
                <i className="ti ti-users-off" style={{ fontSize: 28, display: "block", marginBottom: 8, opacity: 0.4 }} />
                {risultato.fonte === "nessun_ruolo"
                  ? `Nessun ${form.target === "proprietari" ? "proprietario" : "inquilino"} attivo nel mese selezionato.`
                  : "Nessun partecipante per la regola applicata."
                }
              </div>
            )}

            {/* Tabella quote */}
            {risultato.quote && risultato.quote.length > 0 && (
              <div style={{
                background: "var(--bg2)", border: "1px solid var(--border)",
                borderRadius: 10, overflow: "hidden",
              }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--bg3)", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ textAlign: "left",  padding: "9px 14px", fontWeight: 600, fontSize: 11,
                                   textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text2)" }}>
                        Persona
                      </th>
                      <th style={{ textAlign: "right", padding: "9px 14px", fontWeight: 600, fontSize: 11,
                                   textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text2)" }}>
                        Quota %
                      </th>
                      <th style={{ textAlign: "right", padding: "9px 14px", fontWeight: 600, fontSize: 11,
                                   textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text2)" }}>
                        Importo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {risultato.quote.map((q, i) => {
                      const sommaQuote = risultato.quote.reduce((s, x) => s + Number(x.quota), 0);
                      const pct = sommaQuote > 0 ? (Number(q.quota) / sommaQuote * 100).toFixed(2) : "—";
                      return (
                        <tr key={q.id || i} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 14px", fontWeight: 500 }}>
                            {q.nome || `Persona ${i + 1}`}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text2)" }}>
                            {pct}%
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700,
                                       fontSize: 15, color: "var(--accent)" }}>
                            {fmtEur(q.importo)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "var(--bg3)", borderTop: "2px solid var(--border)" }}>
                      <td style={{ padding: "9px 14px", fontWeight: 700, fontSize: 13 }}>Totale</td>
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

// ── Modale crea regola ─────────────────────────────────────────────────────────
function NuovaRegolaModal({ immobileId, tipiSpesa, onSave, onClose }) {
  const [form, setForm] = useState({
    tipoSpesaId:    "",
    validitaDa:     "",
    validitaA:      "",
    quotaTotalePct: 100,
    splitUguale:    true,
    modalita:       "escludi",
    note:           "",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        immobileId,
        tipoSpesaId:    form.tipoSpesaId    || null,
        validitaDa:     form.validitaDa     || null,
        validitaA:      form.validitaA      || null,
        quotaTotalePct: Number(form.quotaTotalePct) || 100,
        splitUguale:    form.splitUguale === true || form.splitUguale === "true",
        modalita:       form.modalita,
        note:           form.note || null,
      });
      onClose();
    } catch (e) { setErr(e.message); setSaving(false); }
  }

  return (
    <Modal title="Nuova regola di riparto" onClose={onClose} width={460}
           footer={<>
             <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
             <Btn variant="primary" onClick={handleSave} disabled={saving}>
               {saving ? "Salvo…" : "Salva"}
             </Btn>
           </>}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <p style={{ color: "var(--red)", fontSize: 12, margin: 0 }}>{err}</p>}
        <Field label="Tipo spesa (vuoto = default)">
          <select className="inp" value={form.tipoSpesaId} onChange={set("tipoSpesaId")}>
            <option value="">— Default (tutte le spese) —</option>
            {tipiSpesa.map(ts => (
              <option key={ts.id} value={ts.id}>{ts.descrizione}</option>
            ))}
          </select>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Valida da">
            <input className="inp" type="date" value={form.validitaDa} onChange={set("validitaDa")} />
          </Field>
          <Field label="Valida a">
            <input className="inp" type="date" value={form.validitaA} onChange={set("validitaA")} />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="% totale da distribuire">
            <input className="inp" type="number" min={0} max={100} step={0.01}
                   value={form.quotaTotalePct} onChange={set("quotaTotalePct")} />
          </Field>
          <Field label="Modalità esclusioni">
            <select className="inp" value={form.modalita} onChange={set("modalita")}>
              <option value="escludi">Escludi persone</option>
              <option value="includi">Includi solo persone</option>
            </select>
          </Field>
        </div>
        <Field label="Distribuzione">
          <select className="inp" value={String(form.splitUguale)}
                  onChange={e => setForm(f => ({ ...f, splitUguale: e.target.value === "true" }))}>
            <option value="true">Parti uguali</option>
            <option value="false">Quote percentuali (da dettaglio)</option>
          </select>
        </Field>
        <Field label="Note">
          <textarea className="inp" rows={2} value={form.note}
                    onChange={set("note")} style={{ resize: "vertical" }} />
        </Field>
      </div>
    </Modal>
  );
}

// ── Card singola regola ────────────────────────────────────────────────────────
function RegolaCard({ regola, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirm,  setConfirm]  = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try { await onDelete(regola.id); }
    finally { setDeleting(false); }
  }

  const dettagli = regola.dettagli || [];
  const esclusioni = dettagli.filter(d => !d.includi);
  const inclusioni = dettagli.filter(d =>  d.includi);

  return (
    <div style={{
      background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "11px 16px", display: "flex", alignItems: "center", gap: 10,
        background: "var(--bg3)",
      }}>
        <button onClick={() => setExpanded(e => !e)} style={{
          flex: 1, display: "flex", alignItems: "center", gap: 10,
          background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0,
        }}>
          <i className={`ti ti-chevron-${expanded ? "down" : "right"}`}
             style={{ fontSize: 14, color: "var(--text2)" }} />
          <div>
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              {regola.tipo_spesa_desc || "Default (tutte le spese)"}
            </span>
            {(regola.validita_da || regola.validita_a) && (
              <span style={{ fontSize: 11, color: "var(--text2)", marginLeft: 10 }}>
                {regola.validita_da && `dal ${regola.validita_da}`}
                {regola.validita_a  && ` al ${regola.validita_a}`}
              </span>
            )}
          </div>
        </button>
        <Badge
          label={regola.split_uguale ? "Parti uguali" : "Quote %"}
          color={regola.split_uguale ? "blue" : "yellow"}
        />
        <Badge
          label={`${regola.quota_totale_pct ?? 100}%`}
          color="gray"
        />
        <Btn size="sm" variant="ghost" title="Elimina"
             onClick={() => setConfirm(true)}>
          <i className="ti ti-trash" style={{ color: "var(--red)" }} />
        </Btn>
      </div>

      {/* Dettagli */}
      {expanded && (
        <div style={{ padding: "12px 16px" }}>
          {regola.note && (
            <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 10 }}>
              <i className="ti ti-note" style={{ marginRight: 4 }} />{regola.note}
            </p>
          )}
          <div style={{ fontSize: 12 }}>
            <p style={{ fontWeight: 600, marginBottom: 6, color: "var(--text2)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Modalità: {regola.modalita === "includi" ? "includi solo" : "escludi"}
            </p>
            {dettagli.length === 0 ? (
              <p style={{ color: "var(--text2)", fontStyle: "italic" }}>
                Nessun dettaglio — si applica a tutti i ruoli attivi.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 4 }}>
                {dettagli.map((d, i) => (
                  <div key={d.id || i} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 10px", borderRadius: 6, fontSize: 12,
                    background: d.includi ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                  }}>
                    <i className={`ti ${d.includi ? "ti-circle-check" : "ti-circle-minus"}`}
                       style={{ color: d.includi ? "var(--green)" : "var(--red)" }} />
                    <span style={{ color: "var(--text2)" }}>
                      {d.includi ? "Includi" : "Escludi"}: persona {d.personaId?.slice(-8)}
                    </span>
                    {d.percentuale != null && (
                      <span style={{ marginLeft: "auto", fontWeight: 600 }}>{d.percentuale}%</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500,
        }}>
          <div style={{
            background: "var(--bg2)", border: "1px solid var(--red)", borderRadius: 12,
            padding: 24, maxWidth: 340, width: "100%",
          }}>
            <p style={{ marginBottom: 20, fontSize: 14 }}>
              Eliminare questa regola di riparto?
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => setConfirm(false)}>Annulla</Btn>
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

// ── Sezione Regole ─────────────────────────────────────────────────────────────
function RegoleSection({ immobili, tipiSpesa }) {
  const [immobileId, setImmobileId] = useState("");
  const [regole,     setRegole]     = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [showForm,   setShowForm]   = useState(false);
  const [err,        setErr]        = useState(null);

  const load = useCallback(async () => {
    if (!immobileId) return;
    setLoading(true);
    try { setRegole(await immobiliV2.regoleRiparto(immobileId)); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [immobileId]);

  useEffect(() => { setRegole(null); load(); }, [load]);

  async function handleCreate(dati) {
    await ripartoV2.creaRegola(dati);
    await load();
  }

  async function handleDelete(id) {
    await ripartoV2.rimuoviRegola(id);
    await load();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <select className="inp" value={immobileId}
                onChange={e => setImmobileId(e.target.value)}
                style={{ maxWidth: 260 }}>
          <option value="">— Seleziona immobile —</option>
          {immobili.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        {immobileId && (
          <Btn variant="primary" onClick={() => setShowForm(true)}>
            <i className="ti ti-plus" /> Nuova regola
          </Btn>
        )}
      </div>

      {err && (
        <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 12,
                      padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)" }}>
          {err}
        </div>
      )}

      {!immobileId && (
        <div style={{
          background: "var(--bg2)", border: "1px dashed var(--border)", borderRadius: 10,
          padding: 40, textAlign: "center", color: "var(--text2)",
        }}>
          <i className="ti ti-list-details" style={{ fontSize: 32, opacity: 0.3, display: "block", marginBottom: 10 }} />
          Seleziona un immobile per vedere le regole di riparto.
        </div>
      )}

      {immobileId && loading && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text2)" }}>
          <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 24 }} />
        </div>
      )}

      {immobileId && !loading && regole && regole.length === 0 && (
        <div style={{
          background: "var(--bg2)", border: "1px dashed var(--border)", borderRadius: 10,
          padding: 32, textAlign: "center", color: "var(--text2)", fontSize: 13,
        }}>
          <i className="ti ti-adjustments-off" style={{ fontSize: 28, opacity: 0.3, display: "block", marginBottom: 8 }} />
          Nessuna regola configurata.
          <br />
          <span style={{ fontSize: 12 }}>
            Senza regole, il riparto usa parti uguali tra i ruoli attivi.
          </span>
        </div>
      )}

      {regole && regole.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {regole.map(r => (
            <RegolaCard key={r.id} regola={r} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {showForm && (
        <NuovaRegolaModal
          immobileId={immobileId}
          tipiSpesa={tipiSpesa}
          onSave={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// ── Tab principale ─────────────────────────────────────────────────────────────
export function RipartoV2() {
  const [sezione,   setSezione]   = useState("calcola");
  const [immobili,  setImmobili]  = useState([]);
  const [tipiSpesa, setTipiSpesa] = useState([]);

  useEffect(() => {
    condominiV2.lista()
      .then(async condomini => {
        const lists = await Promise.all(condomini.map(c => immobiliV2.lista({ condominioId: c.id })));
        setImmobili(lists.flat().sort((a, b) => a.nome.localeCompare(b.nome)));
      })
      .catch(() => {});
    tipiSpesaApi.list()
      .then(ts => setTipiSpesa(ts.filter(t => !t.eliminato)))
      .catch(() => {});
  }, []);

  return (
    <div style={{ maxWidth: 1050, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          Riparto
          <span style={{
            marginLeft: 10, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12,
            background: "#1e3a5f", color: "#60a5fa", border: "1px solid #3b82f6", verticalAlign: "middle",
          }}>v2</span>
        </h2>
      </div>
      <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 20, marginTop: 4 }}>
        Calcola e gestisce la distribuzione delle spese tra i ruoli attivi
      </p>

      <SubTabs active={sezione} onChange={setSezione} />

      {sezione === "calcola" && (
        <CalcolaSection immobili={immobili} tipiSpesa={tipiSpesa} />
      )}
      {sezione === "regole" && (
        <RegoleSection immobili={immobili} tipiSpesa={tipiSpesa} />
      )}
    </div>
  );
}
