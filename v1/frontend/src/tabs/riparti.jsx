import { useState, useEffect, useCallback } from "react";
import { appartamentiApi, tipiSpesaApi, regoleApi, proprietariApi, tipiVersamentoApi, associazioniApi } from "../api.js";
import { Btn, Badge, Modal, Confirm, Field, SectionHeader } from "../components/ui.jsx";
import { mesL, toITdate } from "../utils/formatters.js";


// ── Tooltip contestuale ───────────────────────────────────────────────────────
function HelpPanel() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Btn variant="secondary" size="sm" onClick={() => setOpen(s => !s)}
        title="Spiegazione regole di riparto">
        <i className="ti ti-help-circle" /> Guida
      </Btn>
      {open && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setOpen(false)}>
          <div style={{
            background: "var(--bg2)", border: "1px solid var(--border)",
            borderRadius: 12, padding: 28, maxWidth: 560, width: "90%",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <p style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>
                <i className="ti ti-help-circle" style={{ marginRight: 8, color: "var(--accent)" }} />
                Come funzionano le regole di riparto
              </p>
              <Btn variant="ghost" size="sm" onClick={() => setOpen(false)}>
                <i className="ti ti-x" />
              </Btn>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ padding: "14px 16px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <p style={{ fontWeight: 700, margin: "0 0 6px", color: "#f87171" }}>
                  <i className="ti ti-file-invoice" style={{ marginRight: 6 }} />Regole Spese
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>
                  Definiscono in che quota ogni <strong>inquilino</strong> contribuisce alle spese
                  (fatture, bollette, ecc.) e in che quota ogni <strong>proprietario</strong>
                  sostiene i costi. Puoi escludere o includere specifici inquilini/proprietari
                  e specificare la percentuale totale coperta dalla regola.
                  Una regola senza tipo specifico è il <em>default</em> per tutte le spese
                  prive di una regola dedicata.
                </p>
              </div>

              <div style={{ padding: "14px 16px", borderRadius: 8, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)" }}>
                <p style={{ fontWeight: 700, margin: "0 0 6px", color: "#4ade80" }}>
                  <i className="ti ti-cash" style={{ marginRight: 6 }} />Regole Entrate
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>
                  Definiscono come le entrate degli inquilini (affitto, rimborsi, ecc.) vengono
                  <strong> attribuite teoricamente ai proprietari</strong>. Puoi scegliere:
                </p>
                <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 13, lineHeight: 1.8 }}>
                  <li><strong>Parti uguali</strong> — l'entrata viene divisa in quote uguali tra i proprietari selezionati.</li>
                  <li><strong>Percentuale personalizzata</strong> — si specifica la % spettante a ciascun proprietario (es. 60% / 40%).</li>
                </ul>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text2)" }}>
                  Se non è presente una regola entrate, la ripartizione avviene in proporzione
                  alle quote di proprietà registrate per l'appartamento.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function Riparti() {
  const [apps,       setApps]      = useState([]);
  const [tipi,       setTipi]      = useState([]);
  const [tipiVers,   setTipiVers]  = useState([]);
  const [props,      setProps]     = useState([]);
  const [assocApp,   setAssocApp]  = useState([]);
  const [selApp,     setSel]       = useState("");
  const [regole,     setReg]       = useState([]);
  const [modal,      setModal]     = useState(null);
  const [conf,       setConf]      = useState(null);
  const [filtroTipo, setFiltroTipo] = useState("pagamenti");

  useEffect(() => {
    Promise.all([appartamentiApi.list(), tipiSpesaApi.list(), proprietariApi.list(), tipiVersamentoApi.list()])
      .then(([a, t, p, tv]) => { setApps(a); setTipi(t); setProps(p); setTipiVers(tv); });
  }, []);

  useEffect(() => {
    if (!selApp) { setAssocApp([]); return; }
    associazioniApi.listByAppartamento(selApp).then(setAssocApp);
  }, [selApp]);

  const tipiVersAttivi = tipiVers.filter(t => t.attivo);

  const loadRegole = useCallback(appId => {
    if (!appId) return;
    regoleApi.listByAppartamento(appId).then(setReg);
  }, []);
  useEffect(() => { loadRegole(selApp); }, [selApp, loadRegole]);

  const app      = apps.find(a => a.id === selApp);
  const comps    = app?.componenti || [];
  const propsApp = selApp
    ? props.filter(p => assocApp.some(a => String(a.proprietario_id) === String(p.id)))
    : props;

  const regoleFiltrate = regole.filter(r =>
    filtroTipo === "versamenti" ? r.tipo_versamento != null : r.tipo_versamento == null
  );

  function nuovaRegola() {
    const isVers = filtroTipo === "versamenti";
    setModal({
      tipo_spesa_id:    "",
      tipo_versamento:  isVers ? "affitto" : null,
      descrizione:      "",
      quota_totale_pct: 100,
      target:           isVers ? "proprietari" : "inquilini",
      modalita:         "includi",
      split_uguale:     isVers ? true : false,
      pct_prop:         {},
      validita_da: "", validita_a: "",
      esclusi: [], inclusi: [], esclusi_prop: [], inclusi_prop: [],
    });
  }

  async function save(f) {
    try {
      const isVers = f.tipo_versamento != null;
      const payload = {
        appartamento_id:  selApp,
        tipo_spesa_id:    isVers ? null : (f.tipo_spesa_id || null),
        tipo_versamento:  isVers ? (f.tipo_versamento || null) : null,
        descrizione:      f.descrizione || null,
        target:           isVers ? "proprietari" : (f.target || "inquilini"),
        modalita:         isVers ? "includi" : (f.modalita || "escludi"),
        quota_totale_pct: isVers ? 100 : (f.quota_totale_pct ?? 100),
        split_uguale:     isVers ? (f.split_uguale ?? true) : false,
        validita_da:      f.validita_da || null,
        validita_a:       f.validita_a  || null,
        esclusi:          isVers ? [] : f.esclusi,
        inclusi:          isVers ? [] : f.inclusi,
        esclusi_prop:     isVers ? [] : f.esclusi_prop,
        inclusi_prop:     isVers ? f.inclusi_prop : f.inclusi_prop,
        inclusi_prop_pct: isVers ? (f.pct_prop || {}) : {},
      };
      f.id ? await regoleApi.update(f.id, payload) : await regoleApi.create(payload);
      setModal(null); loadRegole(selApp);
    } catch (e) { alert("Errore: " + e.message); }
  }

  // Toggle per spese
  function toggleEscluso(compId) {
    setModal(m => { const s = new Set(m.esclusi); s.has(compId) ? s.delete(compId) : s.add(compId); return { ...m, esclusi: [...s] }; });
  }
  function toggleIncluso(compId) {
    setModal(m => { const s = new Set(m.inclusi); s.has(compId) ? s.delete(compId) : s.add(compId); return { ...m, inclusi: [...s] }; });
  }
  function toggleEsclusiProp(propId) {
    setModal(m => { const s = new Set(m.esclusi_prop); s.has(propId) ? s.delete(propId) : s.add(propId); return { ...m, esclusi_prop: [...s] }; });
  }
  // Toggle per entrate (sempre includi)
  function togglePropEntrata(propId) {
    setModal(m => {
      const s = new Set(m.inclusi_prop);
      if (s.has(propId)) {
        s.delete(propId);
        const pct = { ...m.pct_prop };
        delete pct[propId];
        return { ...m, inclusi_prop: [...s], pct_prop: pct };
      }
      s.add(propId);
      return { ...m, inclusi_prop: [...s] };
    });
  }

  const isVers     = modal?.tipo_versamento != null;
  const isIncludi  = modal?.modalita === "includi";
  const selectedIds = modal
    ? (modal.target === "proprietari"
        ? (isIncludi ? modal.inclusi_prop : modal.esclusi_prop)
        : (isIncludi ? modal.inclusi      : modal.esclusi))
    : [];

  function regolaLabel(reg) {
    if (reg.tipo_versamento) return `${tipiVers.find(t => t.nome === reg.tipo_versamento)?.nome || reg.tipo_versamento}`;
    if (reg.tipo_spesa_id)   return reg.tipo_spesa_nome || reg.tipo_spesa_id;
    return "Default (tutte le spese)";
  }

  // Badge riepilogo suddivisione entrate
  function suddivisioneLabel(reg) {
    if (reg.split_uguale) return "Parti uguali";
    const hasPct = (reg.inclusi_prop || []).some(i => parseFloat(i.percentuale || 0) > 0);
    if (hasPct) {
      return (reg.inclusi_prop || [])
        .filter(i => parseFloat(i.percentuale || 0) > 0)
        .map(i => `${i.proprietario_nome}: ${parseFloat(i.percentuale)}%`)
        .join(" · ");
    }
    return "Proporzionale alla proprietà";
  }

  return (
    <div>
      <SectionHeader title="Regole di Riparto" action={<HelpPanel />} />

      <div className="card" style={{ marginBottom: 16 }}>
        <Field label="Seleziona appartamento">
          <select value={selApp} onChange={e => setSel(e.target.value)} style={{ maxWidth: 320 }}>
            <option value="">-- Seleziona --</option>
            {apps.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </Field>
      </div>

      {!selApp && (
        <div className="alert alert-info">
          <i className="ti ti-info-circle" /> Seleziona un appartamento per gestire le regole.
        </div>
      )}

      {selApp && (
        <>
          <SectionHeader
            title={`Regole — ${app?.nome}`}
            action={<Btn variant="primary" onClick={nuovaRegola}><i className="ti ti-plus" /> Nuova Regola</Btn>}
          />

          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[
              { v: "pagamenti",  label: "Spese",   icon: "ti-file-invoice" },
              { v: "versamenti", label: "Entrate", icon: "ti-cash" },
            ].map(t => (
              <Btn key={t.v} variant={filtroTipo === t.v ? "primary" : "secondary"}
                onClick={() => setFiltroTipo(t.v)}>
                <i className={`ti ${t.icon}`} /> {t.label}
                <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700,
                  background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "1px 6px" }}>
                  {regole.filter(r => t.v === "versamenti" ? r.tipo_versamento != null : r.tipo_versamento == null).length}
                </span>
              </Btn>
            ))}
          </div>

          {regoleFiltrate.length === 0 && (
            <div className="alert alert-info">
              <i className="ti ti-info-circle" /> Nessuna regola — riparto standard attivo.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {regoleFiltrate.map(reg => (
              <div key={reg.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                      <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>
                        {regolaLabel(reg)}
                        {reg.descrizione && (
                          <span style={{ fontWeight: 400, fontSize: 13, color: "var(--text2)", marginLeft: 8 }}>
                            — {reg.descrizione}
                          </span>
                        )}
                      </p>
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                        background: reg.target === "proprietari" ? "rgba(168,85,247,0.15)" : "rgba(59,130,246,0.12)",
                        color: reg.target === "proprietari" ? "#a855f7" : "var(--accent)",
                        border: `1px solid ${reg.target === "proprietari" ? "#a855f7" : "var(--accent)"}`,
                      }}>
                        {reg.target === "proprietari" ? "Proprietari" : "Inquilini"}
                      </span>
                    </div>

                    <p style={{ fontSize: 12, color: "var(--text2)", margin: "4px 0 0" }}>
                      <i className="ti ti-calendar-event" style={{ marginRight: 4 }} />
                      {reg.validita_da ? mesL(reg.validita_da + "-01") : "Inizio"} →{" "}
                      {reg.validita_a  ? mesL(reg.validita_a  + "-01") : "Aperta"}
                    </p>

                    {/* Badge per entrate */}
                    {reg.tipo_versamento != null && (
                      <div style={{ marginTop: 8 }}>
                        <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20,
                          background: "rgba(74,222,128,0.10)", border: "1px solid rgba(74,222,128,0.3)",
                          color: "#4ade80" }}>
                          <i className="ti ti-percentage" style={{ marginRight: 4 }} />
                          {suddivisioneLabel(reg)}
                        </span>
                        {(reg.inclusi_prop || []).length > 0 && (
                          <span style={{ marginLeft: 6, fontSize: 12, padding: "3px 10px", borderRadius: 20,
                            background: "rgba(34,197,94,0.10)", border: "1px solid var(--green)", color: "var(--green)" }}>
                            <i className="ti ti-users" style={{ marginRight: 4 }} />
                            {(reg.inclusi_prop || []).map(i => i.proprietario_nome).join(", ")}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Badge per spese */}
                    {reg.tipo_versamento == null && (
                      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20,
                          background: "var(--bg3)", border: "1px solid var(--border)" }}>
                          <i className="ti ti-percentage" style={{ marginRight: 4 }} />
                          {parseFloat(reg.quota_totale_pct ?? 100)}% in regime {reg.modalita === "includi" ? "inclusi" : "equo"}
                        </span>
                        {reg.target !== "proprietari" && (
                          <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20,
                            background: reg.modalita === "includi" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                            border: `1px solid ${reg.modalita === "includi" ? "var(--green)" : "var(--red)"}`,
                            color: reg.modalita === "includi" ? "var(--green)" : "var(--red)" }}>
                            <i className={`ti ${reg.modalita === "includi" ? "ti-user-check" : "ti-user-off"}`} style={{ marginRight: 4 }} />
                            {reg.modalita === "includi"
                              ? `Inclusi: ${(reg.inclusi || []).map(i => i.componente_nome).join(", ") || "nessuno"}`
                              : `Esclusi: ${(reg.esclusi || []).map(e => e.componente_nome).join(", ") || "nessuno"}`}
                          </span>
                        )}
                        {reg.target === "proprietari" && (
                          <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20,
                            background: reg.modalita === "includi" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                            border: `1px solid ${reg.modalita === "includi" ? "var(--green)" : "var(--red)"}`,
                            color: reg.modalita === "includi" ? "var(--green)" : "var(--red)" }}>
                            <i className={`ti ${reg.modalita === "includi" ? "ti-user-check" : "ti-user-off"}`} style={{ marginRight: 4 }} />
                            {reg.modalita === "includi"
                              ? `Inclusi: ${(reg.inclusi_prop || []).map(i => i.proprietario_nome).join(", ") || "nessuno"}`
                              : `Esclusi: ${(reg.esclusi_prop || []).map(e => e.proprietario_nome).join(", ") || "nessuno"}`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <Btn variant="secondary" size="sm"
                      onClick={() => setModal({
                        ...reg,
                        target:       reg.target || "inquilini",
                        split_uguale: reg.split_uguale ?? (reg.tipo_versamento != null),
                        pct_prop:     Object.fromEntries(
                          (reg.inclusi_prop || [])
                            .filter(i => i.percentuale != null)
                            .map(i => [i.proprietario_id, parseFloat(i.percentuale)])
                        ),
                        esclusi:      (reg.esclusi      || []).map(e => e.componente_id),
                        inclusi:      (reg.inclusi      || []).map(i => i.componente_id),
                        esclusi_prop: (reg.esclusi_prop || []).map(e => e.proprietario_id),
                        inclusi_prop: (reg.inclusi_prop || []).map(i => i.proprietario_id),
                      })}>
                      <i className="ti ti-edit" /> Modifica
                    </Btn>
                    <Btn variant="danger" size="sm"
                      onClick={() => setConf({
                        msg: `Eliminare la regola "${regolaLabel(reg)}"?`,
                        onYes: async () => { await regoleApi.delete(reg.id); setConf(null); loadRegole(selApp); },
                      })}>
                      <i className="ti ti-trash" /> Elimina
                    </Btn>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── MODAL ─────────────────────────────────────────────────────────── */}
      {modal && (
        <Modal title={modal.id ? "Modifica Regola" : "Nuova Regola di Riparto"}
          onClose={() => setModal(null)} width={520}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setModal(null)}>Annulla</Btn>
              <Btn variant="success" onClick={() => save(modal)}><i className="ti ti-check" /> Salva</Btn>
            </>
          }>

          {/* Selector Spesa / Entrata */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {[
              { v: false, label: "Spesa",   icon: "ti-file-invoice" },
              { v: true,  label: "Entrata", icon: "ti-cash"          },
            ].map(opt => (
              <label key={String(opt.v)} style={{
                flex: 1, display: "flex", alignItems: "center", gap: 8,
                padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                border: `2px solid ${isVers === opt.v ? "var(--accent)" : "var(--border)"}`,
                background: isVers === opt.v ? "rgba(59,130,246,0.08)" : "var(--bg3)",
              }}>
                <input type="radio" name="tipoRegola" checked={isVers === opt.v}
                  onChange={() => setModal(m => ({
                    ...m,
                    tipo_versamento: opt.v ? "affitto" : null,
                    tipo_spesa_id:   opt.v ? null : (m.tipo_spesa_id || ""),
                    target:          opt.v ? "proprietari" : "inquilini",
                    modalita:        "includi",
                    split_uguale:    opt.v,
                    inclusi_prop: [], pct_prop: {},
                  }))} />
                <i className={`ti ${opt.icon}`} style={{ fontSize: 16 }} />
                <strong style={{ fontSize: 13 }}>{opt.label}</strong>
              </label>
            ))}
          </div>

          {/* ── FORM ENTRATE (semplificato) ────────────────────────────── */}
          {isVers && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="Tipo di entrata">
                <select value={modal.tipo_versamento || "affitto"}
                  onChange={e => setModal(m => ({ ...m, tipo_versamento: e.target.value }))}>
                  {tipiVersAttivi.map(t => <option key={t.nome} value={t.nome}>{t.nome}</option>)}
                </select>
              </Field>

              <div className="grid-2">
                <Field label="Valida dal" hint="Vuoto = sempre">
                  <input type="month" value={modal.validita_da || ""}
                    onChange={e => setModal(m => ({ ...m, validita_da: e.target.value }))} />
                </Field>
                <Field label="Valida fino al" hint="Vuoto = ancora valida">
                  <input type="month" value={modal.validita_a || ""}
                    onChange={e => setModal(m => ({ ...m, validita_a: e.target.value }))} />
                </Field>
              </div>

              {/* Modalità suddivisione */}
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text2)", margin: "0 0 8px" }}>
                  Suddivisione tra proprietari
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { v: true,  label: "Parti uguali",           icon: "ti-equal",       desc: "Quota identica per ogni proprietario selezionato" },
                    { v: false, label: "Percentuale specifica",  icon: "ti-percentage",  desc: "Imposta la % per ciascun proprietario" },
                  ].map(opt => (
                    <label key={String(opt.v)} style={{
                      flex: 1, display: "flex", flexDirection: "column", gap: 4,
                      padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                      border: `2px solid ${modal.split_uguale === opt.v ? "var(--accent)" : "var(--border)"}`,
                      background: modal.split_uguale === opt.v ? "rgba(59,130,246,0.08)" : "var(--bg3)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="radio" name="splitMode" checked={modal.split_uguale === opt.v}
                          onChange={() => setModal(m => ({ ...m, split_uguale: opt.v, pct_prop: {} }))} />
                        <i className={`ti ${opt.icon}`} style={{ fontSize: 15 }} />
                        <strong style={{ fontSize: 13 }}>{opt.label}</strong>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--text2)", paddingLeft: 22 }}>{opt.desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Lista proprietari */}
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text2)", margin: "0 0 8px" }}>
                  <i className="ti ti-user-circle" style={{ marginRight: 6 }} />
                  Proprietari che ricevono questa entrata
                  <span style={{ fontWeight: 400, fontSize: 12, marginLeft: 6 }}>
                    (vuoto = tutti proporzionale alla proprietà)
                  </span>
                </p>
                {propsApp.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--text2)" }}>Nessun proprietario per questo appartamento.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {propsApp.map(p => {
                      const checked = modal.inclusi_prop.includes(p.id);
                      const pct     = modal.pct_prop?.[p.id] ?? "";
                      return (
                        <label key={p.id} style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                          background: checked ? "rgba(34,197,94,0.08)" : "var(--bg3)",
                          border: `1px solid ${checked ? "var(--green)" : "var(--border)"}`,
                        }}>
                          <input type="checkbox" checked={checked}
                            onChange={() => togglePropEntrata(p.id)} />
                          <span style={{ flex: 1, fontWeight: checked ? 600 : 400, fontSize: 13 }}>
                            {p.nome} {p.cognome || ""}
                          </span>
                          {checked && !modal.split_uguale && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <input
                                type="number" min="0" max="100" step="1"
                                value={pct}
                                onChange={e => setModal(m => ({
                                  ...m,
                                  pct_prop: { ...m.pct_prop, [p.id]: e.target.value === "" ? undefined : parseFloat(e.target.value) },
                                }))}
                                placeholder="0"
                                style={{ width: 60, textAlign: "right" }}
                                onClick={e => e.preventDefault()}
                              />
                              <span style={{ fontSize: 12, color: "var(--text2)" }}>%</span>
                            </div>
                          )}
                          {checked && <Badge label="Incluso" color="green" />}
                        </label>
                      );
                    })}
                  </div>
                )}
                {!modal.split_uguale && modal.inclusi_prop.length > 0 && (() => {
                  const tot = modal.inclusi_prop.reduce((s, id) => s + (parseFloat(modal.pct_prop?.[id] || 0)), 0);
                  const ok  = Math.abs(tot - 100) < 0.1;
                  return (
                    <p style={{ marginTop: 8, fontSize: 12,
                      color: ok ? "var(--green)" : (tot === 0 ? "var(--text2)" : "var(--red)") }}>
                      <i className={`ti ${ok ? "ti-circle-check" : "ti-alert-circle"}`} style={{ marginRight: 4 }} />
                      Totale: {tot.toFixed(1)}%
                      {tot === 0 && " — inserisci le percentuali o scegli 'Parti uguali'"}
                      {tot > 0 && !ok && " — il totale deve essere 100%"}
                    </p>
                  );
                })()}
              </div>

              <Field label="Descrizione (opzionale)">
                <input value={modal.descrizione || ""}
                  onChange={e => setModal(m => ({ ...m, descrizione: e.target.value }))}
                  placeholder="Nota libera sulla regola" />
              </Field>
            </div>
          )}

          {/* ── FORM SPESE (invariato) ─────────────────────────────────── */}
          {!isVers && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="Tipo di spesa" hint="Lascia vuoto per regola default (tutte le spese senza regola specifica)">
                <select value={modal.tipo_spesa_id || ""}
                  onChange={e => setModal(m => ({ ...m, tipo_spesa_id: e.target.value || null }))}>
                  <option value="">— Default (tutte le spese) —</option>
                  {tipi.filter(t => t.attivo).map(t => <option key={t.id} value={t.id}>{t.descrizione}</option>)}
                </select>
              </Field>

              <div>
                <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text2)", margin: "0 0 8px" }}>Regola per</p>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { v: "inquilini",   label: "Inquilini",   icon: "ti-users" },
                    { v: "proprietari", label: "Proprietari", icon: "ti-user-circle" },
                  ].map(opt => (
                    <label key={opt.v} style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                      border: `2px solid ${modal.target === opt.v ? "var(--accent)" : "var(--border)"}`,
                      background: modal.target === opt.v ? "rgba(59,130,246,0.08)" : "var(--bg3)",
                    }}>
                      <input type="radio" name="target" value={opt.v}
                        checked={modal.target === opt.v}
                        onChange={() => setModal(m => ({
                          ...m, target: opt.v,
                          esclusi: [], inclusi: [], esclusi_prop: [], inclusi_prop: [],
                        }))} />
                      <i className={`ti ${opt.icon}`} style={{ fontSize: 16 }} />
                      <strong style={{ fontSize: 13 }}>{opt.label}</strong>
                    </label>
                  ))}
                </div>
              </div>

              <Field label="Descrizione (opzionale)">
                <input value={modal.descrizione || ""}
                  onChange={e => setModal(m => ({ ...m, descrizione: e.target.value }))}
                  placeholder="Nota libera sulla regola" />
              </Field>

              <div className="grid-2">
                <Field label="Valida dal" hint="Vuoto = sempre">
                  <input type="month" value={modal.validita_da || ""}
                    onChange={e => setModal(m => ({ ...m, validita_da: e.target.value }))} />
                </Field>
                <Field label="Valida fino al" hint="Vuoto = ancora valida">
                  <input type="month" value={modal.validita_a || ""}
                    onChange={e => setModal(m => ({ ...m, validita_a: e.target.value }))} />
                </Field>
              </div>

              <Field label="% in regime speciale"
                hint="100 = tutta la quota. Valori < 100 lasciano il resto al riparto standard.">
                <input type="number" min="1" max="100" step="1"
                  value={modal.quota_totale_pct ?? 100}
                  onChange={e => setModal(m => ({ ...m, quota_totale_pct: parseFloat(e.target.value) || 100 }))} />
              </Field>

              <hr className="divider" />
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text2)", margin: "0 0 8px" }}>Modalità di selezione</p>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { v: "escludi", label: "Escludi",  icon: "ti-user-off",   desc: "Paga chi NON è in lista" },
                    { v: "includi", label: "Includi",   icon: "ti-user-check", desc: "Paga solo chi è in lista" },
                  ].map(opt => (
                    <label key={opt.v} style={{
                      flex: 1, display: "flex", flexDirection: "column", gap: 4,
                      padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                      border: `2px solid ${modal.modalita === opt.v ? "var(--accent)" : "var(--border)"}`,
                      background: modal.modalita === opt.v ? "rgba(59,130,246,0.08)" : "var(--bg3)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="radio" name="modalita" value={opt.v}
                          checked={modal.modalita === opt.v}
                          onChange={() => setModal(m => ({ ...m, modalita: opt.v }))} />
                        <i className={`ti ${opt.icon}`} style={{ fontSize: 16 }} />
                        <strong style={{ fontSize: 13 }}>{opt.label}</strong>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--text2)", paddingLeft: 22 }}>{opt.desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              <hr className="divider" />
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text2)", margin: "0 0 10px" }}>
                  <i className={`ti ${isIncludi ? "ti-user-check" : "ti-user-off"}`} style={{ marginRight: 6 }} />
                  {modal.target === "proprietari"
                    ? (isIncludi ? "Proprietari inclusi" : "Proprietari esclusi")
                    : (isIncludi ? "Inquilini inclusi" : "Inquilini esclusi")}
                </p>
                {(modal.target === "proprietari" ? propsApp : comps).length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--text2)" }}>
                    {modal.target === "proprietari" ? "Nessun proprietario per questo appartamento." : "Nessun componente per questo appartamento."}
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(modal.target === "proprietari" ? propsApp : comps).map(item => {
                      const itemId = item.id;
                      const attivo = selectedIds.includes(itemId);
                      const colore = isIncludi ? "var(--green)" : "var(--red)";
                      const bgSel  = isIncludi ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)";
                      const nome   = `${item.nome} ${item.cognome || ""}`;
                      const sub    = modal.target === "proprietari"
                        ? ""
                        : `${item.percentuale}% standard${item.validita_da ? ` · dal ${toITdate(item.validita_da)}` : ""}${item.validita_a ? ` al ${toITdate(item.validita_a)}` : " · aperto"}`;
                      const toggle = modal.target === "proprietari"
                        ? (isIncludi ? () => setModal(m => { const s = new Set(m.inclusi_prop); s.has(itemId) ? s.delete(itemId) : s.add(itemId); return { ...m, inclusi_prop: [...s] }; })
                                     : () => toggleEsclusiProp(itemId))
                        : (isIncludi ? () => setModal(m => { const s = new Set(m.inclusi); s.has(itemId) ? s.delete(itemId) : s.add(itemId); return { ...m, inclusi: [...s] }; })
                                     : () => toggleEscluso(itemId));
                      return (
                        <label key={itemId} style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                          background: attivo ? bgSel : "var(--bg3)",
                          border: `1px solid ${attivo ? colore : "var(--border)"}`,
                        }}>
                          <input type="checkbox" checked={attivo} onChange={toggle} />
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 600, margin: 0, fontSize: 13 }}>{nome}</p>
                            {sub && <p style={{ fontSize: 11, color: "var(--text2)", margin: 0 }}>{sub}</p>}
                          </div>
                          {attivo && <Badge label={isIncludi ? "Incluso" : "Escluso"} color={isIncludi ? "green" : "red"} />}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}

      {conf && <Confirm msg={conf.msg} onYes={conf.onYes} onNo={() => setConf(null)} />}
    </div>
  );
}
