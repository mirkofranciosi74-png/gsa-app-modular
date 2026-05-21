import { useState, useEffect, useCallback, useRef } from "react";
import { appartamentiApi, documentiApi, tipiSpesaApi, proprietariApi, associazioniApi } from "../api.js";
import { Btn, StatoBadge, Confirm, Field, SectionHeader } from "../components/ui.jsx";
import { euro, mesL, uid } from "../utils/formatters.js";

export function Documenti() {
  const [docs,     setDocs]  = useState([]);
  const [apps,     setApps]  = useState([]);
  const [tipi,     setTipi]  = useState([]);
  const [filtro,   setFilt]  = useState({ stato: "", appartamentoId: "", tipo: "", periodoDA: "", periodoA: "" });
  const [sel,      setSel]   = useState(new Set());
  const [conf,     setConf]  = useState(null);
  const [editItem, setEdit]  = useState(null);
  const [queue,    setQueue] = useState([]);
  const [buchi,    setBuchi] = useState([]);
  const [buchiOpen,setBuchiOpen] = useState(true);

  const processingRef = useRef(false);
  const fileRef       = useRef();

  const load = useCallback(() =>
    Promise.all([
      documentiApi.list({
        stato:          filtro.stato          || undefined,
        appartamentoId: filtro.appartamentoId || undefined,
        tipo:           filtro.tipo           || undefined,
        periodoDA:      filtro.periodoDA      || undefined,
        periodoA:       filtro.periodoA       || undefined,
      }),
      appartamentiApi.list(),
      tipiSpesaApi.list(),
    ]).then(([d, a, t]) => { setDocs(d); setApps(a); setTipi(t); }),
  [filtro]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    documentiApi.buchiUtenze({
      periodoDA: filtro.periodoDA || undefined,
      periodoA:  filtro.periodoA  || undefined,
    }).then(setBuchi).catch(() => {});
  }, [filtro.periodoDA, filtro.periodoA]);

  // ── Apertura prossimo documento dalla coda ─────────────────────────────────
  const apriProssimo = useCallback(coda => {
    const next = coda.find(q => q.stato === "pronto");
    if (next) setEdit({ doc: next.doc, pdfUrl: next.pdfUrl, queueId: next.id });
  }, []);

  // ── Gestione upload file ───────────────────────────────────────────────────
  async function handleFiles(files) {
    if (!files.length) return;
    const nuovi = files.map(f => ({ id: uid(), nomeFile: f.name, stato: "attesa", doc: null, pdfUrl: null, _file: f }));
    setQueue(prev => {
      const ag = [...prev, ...nuovi];
      elabora(ag, nuovi.map(n => n.id));
      return ag;
    });
  }

  async function elabora(codaInit, ids) {
    if (processingRef.current) return;
    processingRef.current = true;
    let coda = [...codaInit];
    for (const id of ids) {
      const item = coda.find(q => q.id === id);
      if (!item || item.stato !== "attesa") continue;
      coda = coda.map(q => q.id === id ? { ...q, stato: "caricamento" } : q);
      setQueue([...coda]);
      try {
        const localUrl = URL.createObjectURL(item._file);
        const doc      = await documentiApi.extract(item._file);
        const pdfUrl   = doc.pdf_base64
          ? URL.createObjectURL(new Blob([Uint8Array.from(atob(doc.pdf_base64), c => c.charCodeAt(0))], { type: "application/pdf" }))
          : localUrl;
        coda = coda.map(q => q.id === id ? { ...q, stato: "pronto", doc, pdfUrl, _file: null } : q);
        setQueue([...coda]);
      } catch (e) {
        coda = coda.map(q => q.id === id ? { ...q, stato: "errore", _errore: e.message, _file: null } : q);
        setQueue([...coda]);
      }
    }
    processingRef.current = false;
    load();
    apriProssimo(coda);
  }

  // ── Salva documento validato ───────────────────────────────────────────────
  async function saveEdit(doc) {
    try {
      if (!doc.nome_file?.trim()) {
        alert("Inserisci un nome per il documento.");
        return;
      }
      const campiOk = doc.tipo_spesa_id && doc.periodo_da && doc.importo != null && doc.appartamento_id;
      const stato   = doc.stato === "duplicato" ? "duplicato" : campiOk ? "elaborato" : "da_verificare";

      if (doc.id) {
        // Documento esistente (estratto da PDF o già in DB) → aggiorna
        await documentiApi.update(doc.id, { ...doc, nome_file: doc.nome_file.trim(), stato, validato: true });
        setQueue(prev => {
          const nuova = prev.filter(q => !(q.doc && q.doc.id === doc.id));
          setTimeout(() => apriProssimo(nuova), 150);
          return nuova;
        });
      } else {
        // Documento nuovo inserito manualmente → crea
        await documentiApi.create({ ...doc, stato, validato: true });
      }

      setEdit(null);
      load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  function salta() {
    if (!editItem) return;
    setEdit(null);
    setQueue(prev => {
      const corrente = prev.find(q => q.doc && q.doc.id === editItem.doc?.id);
      const senza    = prev.filter(q => !(q.doc && q.doc.id === editItem.doc?.id));
      const nuova    = corrente ? [...senza, corrente] : senza;
      setTimeout(() => apriProssimo(nuova), 150);
      return nuova;
    });
  }

  // ── Selezione multipla ─────────────────────────────────────────────────────
  const toggleSel = id => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel(sel.size === docs.length ? new Set() : new Set(docs.map(d => d.id)));

  async function bulkStato(stato) {
    if (!sel.size) return;
    try {
      await Promise.all([...sel].map(id => { const d = docs.find(x => x.id === id); return d ? documentiApi.update(id, { ...d, stato }) : null; }));
      setSel(new Set()); load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  async function bulkDelete() {
    try {
      await Promise.all([...sel].map(id => documentiApi.delete(id)));
      setSel(new Set()); setConf(null); load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  const pronti  = queue.filter(q => q.stato === "pronto").length;
  const inAttesa = queue.filter(q => q.stato === "attesa" || q.stato === "caricamento").length;
  const nCrit   = docs.filter(d => d.stato === "da_verificare" || d.stato === "errore").length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <SectionHeader
        title="Elenco Spese"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="secondary" onClick={() => fileRef.current.click()}>
              <i className="ti ti-upload" /> Carica PDF
            </Btn>
            <input ref={fileRef} type="file" accept=".pdf" multiple style={{ display: "none" }}
                   onChange={e => { handleFiles([...e.target.files]); e.target.value = ""; }} />
            <Btn variant="primary"
                 onClick={() => setEdit({ doc: { nome_file: "", stato: "da_verificare" }, pdfUrl: null })}>
              <i className="ti ti-plus" /> Nuovo
            </Btn>
          </div>
        }
      />

      {/* Coda upload */}
      {queue.length > 0 && (
        <div style={{ marginBottom: 12, border: "1px solid var(--accent)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                        background: "rgba(59,130,246,0.08)" }}>
            <i className="ti ti-stack" style={{ color: "var(--accent)", fontSize: 18 }} />
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              Coda — {queue.length} document{queue.length > 1 ? "i" : "o"}
            </span>
            {inAttesa > 0 && (
              <span style={{ fontSize: 12, color: "var(--text2)" }}>
                <i className="ti ti-loader" style={{ marginRight: 4 }} />{inAttesa} in elaborazione…
              </span>
            )}
            {pronti > 0 && (
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20,
                             background: "#713f12", color: "#eab308", border: "1px solid #eab308" }}>
                {pronti} da validare
              </span>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {pronti > 0 && (
                <Btn variant="primary" size="sm" onClick={() => apriProssimo(queue)}>
                  <i className="ti ti-edit" /> Valida prossimo
                </Btn>
              )}
              <Btn variant="ghost" size="sm" onClick={() => setQueue([])}><i className="ti ti-x" /></Btn>
            </div>
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {queue.map(q => (
              <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px",
                                        borderBottom: "1px solid var(--bg3)",
                                        background: q.stato === "pronto" ? "rgba(234,179,8,0.06)"
                                                  : q.stato === "errore" ? "rgba(239,68,68,0.06)" : "transparent" }}>
                <i className={`ti ${q.stato === "caricamento" ? "ti-loader" : q.stato === "pronto" ? "ti-alert-triangle"
                                  : q.stato === "errore" ? "ti-alert-circle" : "ti-clock"}`}
                   style={{ fontSize: 14, flexShrink: 0,
                             color: q.stato === "pronto" ? "var(--yellow)" : q.stato === "errore" ? "var(--red)" : "var(--text2)" }} />
                <span style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis",
                                whiteSpace: "nowrap", fontWeight: 500 }}>{q.nomeFile}</span>
                <span style={{ fontSize: 11, color: "var(--text2)", flexShrink: 0 }}>
                  {q.stato === "attesa" ? "In attesa" : q.stato === "caricamento" ? "Caricamento…"
                    : q.stato === "pronto" ? "Da validare" : q.stato === "errore" ? q._errore : "Elaborato"}
                </span>
                {q.stato === "pronto" && (
                  <Btn variant="secondary" size="sm"
                       onClick={() => setEdit({ doc: q.doc, pdfUrl: q.pdfUrl, queueId: q.id })}>
                    <i className="ti ti-edit" /> Valida
                  </Btn>
                )}
                <Btn variant="ghost" size="sm" onClick={() => setQueue(p => p.filter(x => x.id !== q.id))}>
                  <i className="ti ti-x" />
                </Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      {nCrit > 0 && (
        <div className="alert alert-warn" style={{ marginBottom: 12 }}>
          <i className="ti ti-alert-triangle" />
          <strong>{nCrit}</strong> document{nCrit > 1 ? "i" : "o"} da verificare.
        </div>
      )}

      {/* Buchi utenze */}
      {buchi.length > 0 && (
        <div style={{ marginBottom: 14, border: "1px solid #b45309", borderRadius: 8, overflow: "hidden" }}>
          <div
            onClick={() => setBuchiOpen(o => !o)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                     background: "rgba(180,83,9,0.12)", cursor: "pointer", userSelect: "none" }}
          >
            <i className="ti ti-alert-triangle" style={{ color: "#f59e0b", fontSize: 18, flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: 13, color: "#f59e0b" }}>
              Buchi utenze rilevati — {buchi.length} combinazion{buchi.length > 1 ? "i" : "e"} con mesi mancanti
            </span>
            <span style={{ fontSize: 11, color: "var(--text2)", marginLeft: 4 }}>
              {filtro.periodoDA || filtro.periodoA
                ? `(periodo ${filtro.periodoDA ? mesL(filtro.periodoDA) : "…"} → ${filtro.periodoA ? mesL(filtro.periodoA) : "…"})`
                : "(tutti i periodi)"}
            </span>
            <i className={`ti ${buchiOpen ? "ti-chevron-up" : "ti-chevron-down"}`}
               style={{ marginLeft: "auto", color: "var(--text2)" }} />
          </div>
          {buchiOpen && (
            <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Raggruppa per appartamento */}
              {Object.entries(
                buchi.reduce((acc, b) => {
                  const k = b.appartamento_nome;
                  if (!acc[k]) acc[k] = [];
                  acc[k].push(b);
                  return acc;
                }, {})
              ).map(([appNome, items]) => (
                <div key={appNome}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text1)",
                                marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {appNome}
                  </div>
                  {items.map(b => (
                    <div key={`${b.appartamento_id}_${b.tipo_spesa_id}`}
                         style={{ display: "flex", alignItems: "baseline", gap: 8,
                                  padding: "4px 0", borderBottom: "1px solid var(--bg3)", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 50,
                                     color: "#f59e0b" }}>
                        {b.tipo_descrizione}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text2)" }}>
                        copertura {mesL(b.periodoMin)} → {mesL(b.periodoMax)}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--red)", fontWeight: 600 }}>
                        {b.gaps.length === 1
                          ? `Mancante: ${mesL(b.gaps[0])}`
                          : `Mancanti (${b.gaps.length}): ${b.gaps.map(mesL).join(", ")}`}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filtri */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14,
                    padding: "12px 14px", background: "var(--bg2)", borderRadius: 8,
                    border: "1px solid var(--border)" }}>
        <div>
          <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Stato</label>
          <select value={filtro.stato} onChange={e => setFilt(f => ({ ...f, stato: e.target.value }))}
                  style={{ width: 130 }}>
            <option value="">Tutti</option>
            {["elaborato","da_verificare","errore","duplicato"].map(s =>
              <option key={s} value={s}>{s.replace("_"," ")}</option>
            )}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Appartamento</label>
          <select value={filtro.appartamentoId}
                  onChange={e => setFilt(f => ({ ...f, appartamentoId: e.target.value }))}
                  style={{ width: 150 }}>
            <option value="">Tutti</option>
            {apps.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Tipo spesa</label>
          <select value={filtro.tipo} onChange={e => setFilt(f => ({ ...f, tipo: e.target.value }))}
                  style={{ width: 130 }}>
            <option value="">Tutti</option>
            {tipi.map(t => <option key={t.id} value={t.descrizione}>{t.descrizione}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Periodo da</label>
          <input type="month" value={filtro.periodoDA}
                 onChange={e => setFilt(f => ({ ...f, periodoDA: e.target.value }))} style={{ width: 140 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Periodo a</label>
          <input type="month" value={filtro.periodoA}
                 onChange={e => setFilt(f => ({ ...f, periodoA: e.target.value }))} style={{ width: 140 }} />
        </div>
        {(filtro.stato || filtro.appartamentoId || filtro.tipo || filtro.periodoDA || filtro.periodoA) && (
          <Btn variant="ghost" size="sm"
               onClick={() => setFilt({ stato: "", appartamentoId: "", tipo: "", periodoDA: "", periodoA: "" })}>
            ✕ Reset
          </Btn>
        )}
        {sel.size > 0 && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center",
                        background: "rgba(59,130,246,0.12)", padding: "6px 12px",
                        borderRadius: 8, border: "1px solid var(--accent)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>{sel.size} sel.</span>
            <Btn variant="success" size="sm" onClick={() => bulkStato("elaborato")}><i className="ti ti-check" /> Elaborato</Btn>
            <Btn variant="secondary" size="sm" onClick={() => bulkStato("da_verificare")}><i className="ti ti-clock" /> Da verificare</Btn>
            <Btn variant="danger" size="sm"
                 onClick={() => setConf({ msg: `Eliminare ${sel.size} document${sel.size > 1 ? "i" : "o"}?`, onYes: bulkDelete })}>
              <i className="ti ti-trash" /> Elimina
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setSel(new Set())}>✕</Btn>
          </div>
        )}
      </div>

      {/* Tabella */}
      {docs.length === 0
        ? <div className="alert alert-info"><i className="ti ti-info-circle" />Nessun documento trovato.</div>
        : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36, textAlign: "center" }}>
                    <input type="checkbox"
                           checked={sel.size > 0 && sel.size === docs.length}
                           ref={el => { if (el) el.indeterminate = sel.size > 0 && sel.size < docs.length; }}
                           onChange={toggleAll} />
                  </th>
                  <th>File</th><th>Appartamento</th><th>Tipo</th>
                  <th>Periodo</th><th style={{ textAlign: "right" }}>Importo</th>
                  <th>Stato</th><th style={{ textAlign: "right" }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id} style={{
                    background: sel.has(d.id) ? "rgba(59,130,246,0.10)"
                              : d.stato !== "elaborato" ? "rgba(234,179,8,0.03)" : "",
                  }}>
                    <td style={{ textAlign: "center" }}>
                      <input type="checkbox" checked={sel.has(d.id)} onChange={() => toggleSel(d.id)} />
                    </td>
                    <td style={{ maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis",
                                  whiteSpace: "nowrap", fontWeight: 500 }} title={d.nome_file}>
                      {d.nome_file}
                    </td>
                    <td style={{ color: "var(--text2)", fontSize: 12 }}>
                      {d.appartamento_nome || <span style={{ color: "var(--yellow)" }}>?</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {d.tipo_descrizione || <span style={{ color: "var(--yellow)" }}>?</span>}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text2)" }}>
                      {d.periodo_da ? mesL(d.periodo_da) : <span style={{ color: "var(--yellow)" }}>?</span>}
                      {d.periodo_a && d.periodo_a !== d.periodo_da ? ` → ${mesL(d.periodo_a)}` : ""}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>
                      {d.importo != null ? euro(d.importo) : <span style={{ color: "var(--yellow)" }}>?</span>}
                    </td>
                    <td><StatoBadge stato={d.stato} /></td>
                    <td>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        <Btn variant="secondary" size="sm" onClick={() => setEdit({
                            doc: { ...d },
                            // Usa l'endpoint server se il PDF è stato caricato,
                            // altrimenti null (documenti creati manualmente)
                            pdfUrl: documentiApi.pdfUrl(d.id),
                          })}>
                          <i className="ti ti-edit" /> Modifica
                        </Btn>
                        <Btn variant="danger" size="sm"
                             onClick={() => setConf({
                               msg: `Eliminare "${d.nome_file}"?`,
                               onYes: async () => { await documentiApi.delete(d.id); setConf(null); load(); },
                             })}>
                          <i className="ti ti-trash" />
                        </Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td colSpan={5} style={{ padding: "8px 12px", fontWeight: 600, color: "var(--text2)", fontSize: 12 }}>
                    Elaborati: {docs.filter(d => d.stato === "elaborato").length} / {docs.length}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700, padding: "8px 12px" }}>
                    {euro(docs.filter(d => d.stato === "elaborato").reduce((s, d) => s + parseFloat(d.importo || 0), 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )
      }

      {editItem && (
        <DocEditModal
          doc={editItem.doc} pdfUrl={editItem.pdfUrl || null}
          apps={apps} tipi={tipi}
          queueLeft={queue.filter(q => q.stato === "pronto").length}
          onSave={saveEdit}
          onSkip={queue.filter(q => q.stato === "pronto").length > 1 ? salta : null}
          onClose={() => setEdit(null)}
        />
      )}
      {conf && <Confirm msg={conf.msg} onYes={conf.onYes} onNo={() => setConf(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal di validazione documento
// ─────────────────────────────────────────────────────────────────────────────
function DocEditModal({ doc: initDoc, pdfUrl, apps, tipi, queueLeft = 0, onSave, onSkip, onClose }) {
  const [doc,          setDoc]     = useState(initDoc);
  const [showPdf,      setShowPdf] = useState(!!pdfUrl);
  const [pdfOk,        setPdfOk]   = useState(true);
  const [proprietari,  setProp]    = useState([]);

  useEffect(() => {
    proprietariApi.list().then(setProp).catch(() => {});
  }, []);

  // Auto-imposta il proprietario di default quando cambia appartamento o periodo
  useEffect(() => {
    if (!doc.appartamento_id || !doc.periodo_da) return;
    if (doc.pagato_da_proprietario_id) return; // già impostato
    const data = doc.periodo_da + "-01";
    associazioniApi.defaultPerData(doc.appartamento_id, data)
      .then(r => { if (r?.proprietario_id) setDoc(p => ({ ...p, pagato_da_proprietario_id: r.proprietario_id })); })
      .catch(() => {});
  }, [doc.appartamento_id, doc.periodo_da]);

  // Quando cambia il documento (navigazione coda) resetta lo stato pdf
  useEffect(() => {
    setShowPdf(!!pdfUrl);
    setPdfOk(true);
  }, [pdfUrl]);

  const sd       = v => setDoc(p => ({ ...p, ...v }));
  const appOpts  = apps.map(a => ({ value: a.id, label: a.nome }));
  const tipiOpts = tipi.map(t => ({ value: t.id, label: t.descrizione }));
  const mancanti = [
    !doc.tipo_spesa_id  && "Tipo di spesa",
    !doc.periodo_da     && "Periodo da",
    doc.importo == null && "Importo",
    !doc.appartamento_id && "Appartamento",
  ].filter(Boolean);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", display: "flex",
                  alignItems: "center", justifyContent: "center", zIndex: 400, padding: 12 }}>
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12,
                    width: "100%", maxWidth: showPdf && pdfUrl ? 1120 : 580, height: "92vh",
                    display: "flex", flexDirection: "column", transition: "max-width 0.2s" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "12px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>
              {doc.id
                ? (pdfUrl ? "Valida documento" : "Modifica documento")
                : "Nuovo documento"}
              {queueLeft > 1 && (
                <span style={{ marginLeft: 8, fontSize: 12, color: "var(--yellow)", fontWeight: 400 }}>
                  ({queueLeft} in coda)
                </span>
              )}
            </p>
            <p style={{ fontSize: 11, color: "var(--text2)", margin: 0 }}>{doc.nome_file}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {pdfUrl && pdfOk && (
              <Btn variant={showPdf ? "primary" : "secondary"} size="sm" onClick={() => setShowPdf(s => !s)}>
                <i className={`ti ${showPdf ? "ti-eye-off" : "ti-eye"}`} />
                {showPdf ? "Nascondi" : "Mostra PDF"}
              </Btn>
            )}
            <Btn variant="ghost" size="sm" onClick={onClose}><i className="ti ti-x" /></Btn>
          </div>
        </div>

        {/* Body */}
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {/* Form */}
          <div style={{ width: showPdf && pdfUrl ? 390 : "100%", flexShrink: 0, overflowY: "auto",
                        padding: 20, borderRight: showPdf && pdfUrl ? "1px solid var(--border)" : "none" }}>
            {mancanti.length > 0 && (
              <div className="alert alert-warn" style={{ marginBottom: 14 }}>
                <i className="ti ti-alert-triangle" />
                <div>
                  <strong>Campi obbligatori:</strong>
                  <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                    {mancanti.map(c => <li key={c}>{c}</li>)}
                  </ul>
                </div>
              </div>
            )}
            {doc.confidenza != null && doc.confidenza < 70 && (
              <div className="alert alert-warn" style={{ marginBottom: 14 }}>
                <i className="ti ti-robot" /> Confidenza AI: <strong>{doc.confidenza}%</strong>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Nome file — sempre visibile e modificabile */}
              <Field label="Nome documento *" warn={!doc.nome_file}>
                <input
                  value={doc.nome_file || ""}
                  onChange={e => setDoc(p => ({ ...p, nome_file: e.target.value }))}
                  placeholder="Es. Bolletta acqua marzo 2026"
                  style={{ borderColor: !doc.nome_file ? "var(--yellow)" : "" }}
                  autoFocus={!doc.id}
                />
              </Field>
              <Field label="Tipo di spesa *" warn={!doc.tipo_spesa_id}>
                <select value={doc.tipo_spesa_id || ""}
                        onChange={e => sd({ tipo_spesa_id: e.target.value })}
                        style={{ borderColor: !doc.tipo_spesa_id ? "var(--yellow)" : "" }}>
                  <option value="">-- Seleziona --</option>
                  {tipiOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <div className="grid-2">
                <Field label="Periodo da *" warn={!doc.periodo_da}>
                  <input type="month" value={doc.periodo_da || ""}
                         onChange={e => sd({ periodo_da: e.target.value })}
                         style={{ borderColor: !doc.periodo_da ? "var(--yellow)" : "" }} />
                </Field>
                <Field label="Periodo a">
                  <input type="month" value={doc.periodo_a || ""}
                         onChange={e => sd({ periodo_a: e.target.value })} />
                </Field>
              </div>
              <Field label="Importo € *" warn={doc.importo == null}>
                <input type="number" step="0.01" value={doc.importo ?? ""}
                       placeholder="85.50"
                       onChange={e => sd({ importo: e.target.value === "" ? null : parseFloat(e.target.value) })}
                       style={{ borderColor: doc.importo == null ? "var(--yellow)" : "",
                                fontSize: 17, fontWeight: 700 }} />
              </Field>
              <Field label="Appartamento *" warn={!doc.appartamento_id}>
                <select value={doc.appartamento_id || ""}
                        onChange={e => sd({ appartamento_id: e.target.value })}
                        style={{ borderColor: !doc.appartamento_id ? "var(--yellow)" : "" }}>
                  <option value="">-- Seleziona --</option>
                  {appOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Pagato da (Proprietario)">
                <select value={doc.pagato_da_proprietario_id || ""}
                        onChange={e => sd({ pagato_da_proprietario_id: e.target.value || null })}>
                  <option value="">— Nessuno —</option>
                  {proprietari.map(p => (
                    <option key={p.id} value={p.id}>{p.nome} {p.cognome || ""}</option>
                  ))}
                </select>
              </Field>
              <hr className="divider" />
              <Field label="Fornitore">
                <input value={doc.fornitore || ""} onChange={e => sd({ fornitore: e.target.value })}
                       placeholder="HERA, Enel…" />
              </Field>
              <Field label="N° Fattura">
                <input value={doc.numero_doc || ""} onChange={e => sd({ numero_doc: e.target.value })}
                       placeholder="Es. 2024/00123" />
              </Field>
            </div>
          </div>

          {/* Anteprima PDF */}
          {showPdf && pdfUrl && pdfOk && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#111" }}>
              <div style={{ padding: "6px 14px", fontSize: 11, color: "var(--text2)",
                             borderBottom: "1px solid var(--border)", display: "flex",
                             alignItems: "center", gap: 6 }}>
                <i className="ti ti-file-type-pdf" style={{ color: "#ef4444" }} /> PDF originale
              </div>
              <iframe
                src={pdfUrl}
                style={{ flex: 1, border: "none", width: "100%" }}
                title="Anteprima PDF"
                onError={() => { setPdfOk(false); setShowPdf(false); }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "12px 20px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 12,
                      color: mancanti.length === 0 ? "var(--green)" : "var(--yellow)" }}>
            {mancanti.length === 0 ? "✓ Tutti i campi compilati" : `⚠ ${mancanti.length} campo/i mancante/i`}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            {onSkip && <Btn variant="secondary" onClick={onSkip}><i className="ti ti-player-skip-forward" /> Salta</Btn>}
            <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
            <Btn variant="success" onClick={() => onSave(doc)}>
              <i className="ti ti-check" />
              {doc.id
                ? `Salva e Valida${queueLeft > 1 ? " → Prossimo" : ""}`
                : "Crea documento"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
