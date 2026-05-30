import { useState, useEffect, useCallback } from "react";
import { appartamentiApi } from "../api.js";
import { Btn, Badge, Modal, Field, SectionHeader } from "../components/ui.jsx";
import { euro, toISO, toITdate } from "../utils/formatters.js";
import { CompModal } from "./appartamenti.jsx";
import { DocListEntita } from "./Documentale.jsx";

function DeleteInquilinoDialog({ inquilino, onFisica, onLogica, onCancel }) {
  const [step, setStep] = useState("scelta");

  if (step === "conferma_fisica") {
    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 600, padding: 16,
      }}>
        <div style={{
          background: "var(--bg2)", border: "2px solid var(--red)",
          borderRadius: 12, padding: 28, maxWidth: 460, width: "100%",
        }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 28, color: "var(--red)", flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontWeight: 700, fontSize: 16, margin: "0 0 8px" }}>
                ⚠ Eliminazione fisica — Attenzione!
              </p>
              <p style={{ fontSize: 13, color: "var(--text2)", margin: 0, lineHeight: 1.6 }}>
                Eliminando fisicamente <strong>{inquilino.nome} {inquilino.cognome}</strong> dal database
                verranno eliminate in modo permanente anche tutte le voci collegate:
              </p>
              <ul style={{ fontSize: 13, color: "var(--red)", margin: "10px 0 0 16px", lineHeight: 1.9 }}>
                <li>Tutti i <strong>versamenti</strong> registrati per questo inquilino</li>
                <li>Tutte le <strong>regole di riparto</strong> che lo riguardano</li>
                <li>Tutti i dati storici associati</li>
              </ul>
              <p style={{ fontSize: 12, color: "var(--yellow)", marginTop: 10, fontWeight: 600 }}>
                Questa operazione è irreversibile e non può essere annullata.
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={onCancel}>Annulla</Btn>
            <Btn variant="danger" onClick={onFisica}>
              <i className="ti ti-trash" /> Sì, elimina definitivamente
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 600, padding: 16,
    }}>
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--border)",
        borderRadius: 12, padding: 28, maxWidth: 460, width: "100%",
      }}>
        <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Elimina inquilino</p>
        <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 20 }}>
          Come vuoi eliminare <strong>{inquilino.nome} {inquilino.cognome}</strong>?
        </p>

        <div
          onClick={onLogica}
          style={{
            padding: "14px 16px", borderRadius: 8, cursor: "pointer",
            border: "2px solid var(--border)", marginBottom: 10,
            background: "var(--bg3)", transition: "border-color 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <i className="ti ti-eye-off" style={{ color: "var(--accent)", fontSize: 18 }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Disattiva (eliminazione logica)</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text2)", margin: 0 }}>
            L'inquilino viene marcato come inattivo e nascosto, ma tutti i dati e lo storico vengono conservati.
            Consigliato per mantenere la tracciabilità storica.
          </p>
        </div>

        <div
          onClick={() => setStep("conferma_fisica")}
          style={{
            padding: "14px 16px", borderRadius: 8, cursor: "pointer",
            border: "2px solid var(--border)", marginBottom: 20,
            background: "var(--bg3)", transition: "border-color 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--red)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <i className="ti ti-trash" style={{ color: "var(--red)", fontSize: 18 }} />
            <span style={{ fontWeight: 600, fontSize: 14, color: "var(--red)" }}>
              Elimina dal database (fisico)
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text2)", margin: 0 }}>
            Rimuove definitivamente l'inquilino e{" "}
            <strong style={{ color: "var(--red)" }}>tutte le voci collegate</strong> (versamenti, riparti).
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onCancel}>Annulla</Btn>
        </div>
      </div>
    </div>
  );
}

export function Componenti() {
  const [apps,         setApps]         = useState([]);
  const [modal,        setModal]        = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [soloAttivi,   setSoloAttivi]   = useState(true);
  const [selAppId,     setSelAppId]     = useState("");

  const load = useCallback(() => appartamentiApi.list().then(setApps), []);
  useEffect(() => { load(); }, [load]);

  const oggi = new Date().toISOString().slice(0, 10);

  async function save(comp, appId) {
    try {
      if (comp._new) {
        const { id: _, _new: __, _appId: ___, ...r } = comp;
        await appartamentiApi.addComponente(appId, r);
      } else {
        await appartamentiApi.updateComponente(appId, comp.id, comp);
      }
      setModal(null);
      load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  async function eliminaLogica(comp, appId) {
    try {
      await appartamentiApi.updateComponente(appId, comp.id, { ...comp, attivo: false });
      setDeleteDialog(null);
      load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  async function eliminaFisica(comp, appId) {
    try {
      await appartamentiApi.deleteComponente(appId, comp.id);
      setDeleteDialog(null);
      load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  function isAttivoOggi(c) {
    if (c.attivo === false) return false;
    const vDa = toISO(c.validita_da) || null;
    const vA  = toISO(c.validita_a)  || null;
    if (vDa && vDa > oggi) return false;
    if (vA  && vA  < oggi) return false;
    return true;
  }

  function apriNuovoInquilino(appId) {
    setModal({
      comp: {
        id: Math.random().toString(36).slice(2), _new: true,
        _appId: appId || "",
        nome: "", cognome: "", email: "", telefono: "",
        percentuale: "", quota_affitto: "",
        validita_da: "", validita_a: "", attivo: true,
      },
      appId: appId || "",
    });
  }

  return (
    <div>
      <SectionHeader
        title="Inquilini"
        action={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{
              display: "flex", alignItems: "center", gap: 6,
              cursor: "pointer", fontSize: 13, color: "var(--text2)", userSelect: "none",
            }}>
              <input type="checkbox" checked={soloAttivi}
                onChange={e => setSoloAttivi(e.target.checked)} />
              Solo attivi oggi
            </label>
            <Btn variant="primary" onClick={() => apriNuovoInquilino("")}>
              <i className="ti ti-plus" /> Nuovo Inquilino
            </Btn>
          </div>
        }
      />

      {modal && !modal.appId && (
        <Modal
          title="Nuovo Inquilino — Seleziona appartamento"
          onClose={() => setModal(null)}
          width={420}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setModal(null)}>Annulla</Btn>
              <Btn variant="primary" disabled={!selAppId}
                onClick={() => setModal(m => ({
                  ...m,
                  appId: selAppId,
                  comp: { ...m.comp, _appId: selAppId },
                }))}>
                Continua →
              </Btn>
            </>
          }
        >
          <Field label="Appartamento *" warn={!selAppId}>
            <select value={selAppId} onChange={e => setSelAppId(e.target.value)}
              style={{ borderColor: !selAppId ? "var(--yellow)" : "" }}>
              <option value="">-- Seleziona un appartamento --</option>
              {apps.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </Field>
          {selAppId && (() => {
            const app    = apps.find(a => a.id === selAppId);
            const attivi = (app?.componenti || []).filter(isAttivoOggi);
            const totP   = attivi.reduce((s, c) => s + parseFloat(c.percentuale || 0), 0);
            return (
              <div className="alert alert-info" style={{ marginTop: 12 }}>
                <i className="ti ti-info-circle" />
                <span>
                  {attivi.length === 0
                    ? "Nessun inquilino attivo — perfetto per aggiungere il primo."
                    : `${attivi.length} inquilin${attivi.length > 1 ? "i" : "o"} attiv${attivi.length > 1 ? "i" : "o"} — totale percentuali: ${totP.toFixed(1)}%`}
                </span>
              </div>
            );
          })()}
        </Modal>
      )}

      {apps.length === 0 && (
        <div className="alert alert-info">
          <i className="ti ti-info-circle" /> Nessun appartamento. Prima crea un appartamento.
        </div>
      )}

      {apps.filter(a => (a.componenti || []).length === 0).map(app => (
        <div key={app.id} className="card" style={{
          marginBottom: 8, borderStyle: "dashed",
          borderColor: "var(--border)", opacity: 0.8,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <i className="ti ti-building" style={{ fontSize: 18, color: "var(--text2)" }} />
              <span style={{ fontWeight: 600, color: "var(--text2)" }}>{app.nome}</span>
              <Badge label="Nessun inquilino" color="gray" />
            </div>
            <Btn variant="primary" size="sm" onClick={() => apriNuovoInquilino(app.id)}>
              <i className="ti ti-plus" /> Aggiungi primo inquilino
            </Btn>
          </div>
        </div>
      ))}

      {apps.filter(a => (a.componenti || []).length > 0).map(app => {
        const componentiFiltrati = soloAttivi
          ? (app.componenti || []).filter(isAttivoOggi)
          : (app.componenti || []);

        const attiviOggi = (app.componenti || []).filter(isAttivoOggi);
        const totP = attiviOggi.reduce((s, c) => s + parseFloat(c.percentuale || 0), 0);
        const pw   = Math.abs(totP - 100) > 0.1 && attiviOggi.length > 0;

        if (componentiFiltrati.length === 0) {
          return (
            <div key={app.id} className="card" style={{ marginBottom: 12, opacity: 0.6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <i className="ti ti-building" style={{ fontSize: 18, color: "var(--text2)" }} />
                  <span style={{ fontWeight: 700 }}>{app.nome}</span>
                  <Badge label="Nessun attivo oggi" color="gray" />
                </div>
                <Btn variant="primary" size="sm" onClick={() => apriNuovoInquilino(app.id)}>
                  <i className="ti ti-plus" /> Aggiungi inquilino
                </Btn>
              </div>
            </div>
          );
        }

        return (
          <div key={app.id} className="card" style={{ marginBottom: 12 }}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <i className="ti ti-building" style={{ fontSize: 18, color: "var(--accent)" }} />
                <span style={{ fontWeight: 700, fontSize: 15 }}>{app.nome}</span>
                {pw
                  ? <Badge label={`${totP.toFixed(1)}% ⚠`} color="yellow" />
                  : <Badge label={`${totP.toFixed(0)}% ✓`} color="green" />}
                {(app.componenti || []).length > componentiFiltrati.length && (
                  <span style={{ fontSize: 11, color: "var(--text2)" }}>
                    ({(app.componenti || []).length - componentiFiltrati.length} nascost
                    {(app.componenti || []).length - componentiFiltrati.length === 1 ? "o" : "i"})
                  </span>
                )}
              </div>
              <Btn variant="primary" size="sm" onClick={() => apriNuovoInquilino(app.id)}>
                <i className="ti ti-plus" /> Aggiungi inquilino
              </Btn>
            </div>

            {componentiFiltrati.map(c => {
              const vDa     = toISO(c.validita_da);
              const vA      = toISO(c.validita_a);
              const scaduto = vA  && vA  < oggi;
              const futuro  = vDa && vDa > oggi;
              const inattivo = c.attivo === false;

              return (
                <div key={c.id} style={{ borderBottom: "1px solid var(--bg3)", paddingBottom: 8, marginBottom: 4 }}>
                <div style={{
                  display: "flex", alignItems: "center",
                  padding: "11px 0",
                  opacity: inattivo ? 0.45 : 1,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 8, marginRight: 12,
                    flexShrink: 0, display: "flex", alignItems: "center",
                    justifyContent: "center", fontWeight: 700, fontSize: 13,
                    background: inattivo ? "var(--bg3)"
                      : scaduto ? "rgba(239,68,68,0.18)"
                      : futuro  ? "rgba(234,179,8,0.18)"
                      : "rgba(59,130,246,0.18)",
                    color: inattivo ? "var(--text2)"
                      : scaduto ? "var(--red)"
                      : futuro  ? "var(--yellow)"
                      : "var(--accent)",
                  }}>
                    {(c.nome || "?")[0]}{(c.cognome || "?")[0]}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <p style={{ fontWeight: 600, margin: 0 }}>
                        {c.nome} {c.cognome}
                      </p>
                      {inattivo && <Badge label="Inattivo" color="gray" />}
                      {scaduto  && <Badge label="Scaduto"  color="red" />}
                      {futuro   && <Badge label="Futuro"   color="yellow" />}
                    </div>
                    <p style={{ fontSize: 12, color: "var(--text2)", margin: "2px 0 0" }}>
                      {c.percentuale}% · {euro(c.quota_affitto)}/mese
                    </p>
                    <p style={{
                      fontSize: 11, margin: "2px 0 0",
                      color: inattivo ? "var(--text2)"
                        : scaduto ? "var(--red)"
                        : futuro  ? "var(--yellow)"
                        : "var(--green)",
                    }}>
                      <i className="ti ti-calendar-event" style={{ marginRight: 4 }} />
                      {vDa ? `Dal ${toITdate(vDa)}` : "Inizio non impostato"} →{" "}
                      {vA ? `al ${toITdate(vA)}` : <span style={{ color: "var(--text2)" }}>aperto</span>}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn variant="secondary" size="sm"
                      onClick={() => setModal({ comp: { ...c, _appId: app.id }, appId: app.id })}>
                      <i className="ti ti-edit" /> Modifica
                    </Btn>
                    <Btn variant="danger" size="sm"
                      onClick={() => setDeleteDialog({ comp: c, appId: app.id })}>
                      <i className="ti ti-trash" /> Elimina
                    </Btn>
                  </div>
                </div>
                <DocListEntita entitaTipo="inquilino" entitaId={c.id} />
                </div>
              );
            })}
          </div>
        );
      })}

      {modal && modal.appId && (
        <CompModal
          comp={modal.comp}
          appId={modal.appId}
          onSave={c => save(c, modal.appId)}
          onClose={() => setModal(null)}
        />
      )}

      {deleteDialog && (
        <DeleteInquilinoDialog
          inquilino={deleteDialog.comp}
          onLogica={() => eliminaLogica(deleteDialog.comp, deleteDialog.appId)}
          onFisica={() => eliminaFisica(deleteDialog.comp, deleteDialog.appId)}
          onCancel={() => setDeleteDialog(null)}
        />
      )}
    </div>
  );
}
