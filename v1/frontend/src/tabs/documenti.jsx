import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { appartamentiApi, documentiApi, tipiSpesaApi, proprietariApi, associazioniApi, archivioApi } from "../api.js";
import { Btn, StatoBadge, Confirm, Field, SectionHeader, Modal } from "../components/ui.jsx";
import { euro, mesL, toITdate } from "../utils/formatters.js";
import { usePdfQueue } from "../hooks/usePdfQueue.js";
import { PdfQueuePanel } from "../components/PdfQueuePanel.jsx";

// ── Modal intercetta duplicati hash ───────────────────────────────────────────
const FLBL = { fontSize: 10, color: "var(--text2)", fontWeight: 700,
               textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 };

function HashDupInterceptModal({ items, onProceed, onCancel }) {
  return (
    <Modal title="" onClose={onCancel} width={620}
      footer={<>
        <Btn variant="ghost" onClick={onCancel}>Annulla</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="danger" onClick={onProceed}>
          <i className="ti ti-alert-triangle" /> Procedi comunque
        </Btn>
      </>}
    >
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%",
                      background: "rgba(239,68,68,0.12)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      margin: "0 auto 12px" }}>
          <i className="ti ti-fingerprint" style={{ fontSize: 28, color: "var(--red)" }} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 17, color: "var(--red)", marginBottom: 4 }}>
          {items.length === 1 ? "File già presente" : `${items.length} file già presenti`}
        </div>
        <div style={{ fontSize: 13, color: "var(--text2)" }}>
          {items.length === 1
            ? <><strong>{items[0].file.name}</strong> è identico a un documento già caricato</>
            : "I file seguenti risultano già caricati in precedenza"}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {items.map(({ file, warning }, i) => {
          const dups = [...(warning.duplicati_documenti || []), ...(warning.duplicati_allegati || [])];
          return (
            <div key={i} style={{ borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)",
                                   background: "rgba(239,68,68,0.04)", padding: "12px 14px" }}>
              {items.length > 1 && (
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{file.name}</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dups.map((d, j) => (
                  <div key={j} style={{ fontSize: 12, display: "grid",
                                         gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
                    {d.appartamento_nome && <div><div style={FLBL}>Appartamento</div>{d.appartamento_nome}</div>}
                    {d.tipo_spesa       && <div><div style={FLBL}>Tipo</div>{d.tipo_spesa}</div>}
                    {d.proprietario_nome && <div><div style={FLBL}>Proprietario</div>{d.proprietario_nome} {d.proprietario_cognome || ""}</div>}
                    {d.fornitore        && <div><div style={FLBL}>Fornitore</div>{d.fornitore}</div>}
                    {d.importo != null  && <div><div style={FLBL}>Importo</div>{euro(d.importo)}</div>}
                    {(d.data || d.data_pagamento) && <div><div style={FLBL}>Data</div>{toITdate(d.data || d.data_pagamento)}</div>}
                    {d.nome_file        && <div style={{ gridColumn: "1/-1" }}><div style={FLBL}>File</div>{d.nome_file}</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ── Componente header colonna ordinabile ──────────────────────────────────────
function SortTh({ col, label, sort, setSort, style }) {
  const active = sort.col === col;
  return (
    <th style={{ cursor: "pointer", userSelect: "none", ...style }}
        onClick={() => setSort(s => ({ col, dir: s.col === col && s.dir === "asc" ? "desc" : "asc" }))}>
      {label}
      {active
        ? <i className={`ti ti-arrow-${sort.dir === "asc" ? "up" : "down"}`}
             style={{ marginLeft: 4, fontSize: 10, verticalAlign: "middle" }} />
        : <i className="ti ti-arrows-sort"
             style={{ marginLeft: 4, fontSize: 10, verticalAlign: "middle", opacity: 0.3 }} />}
    </th>
  );
}

// ── Modal rinomina ─────────────────────────────────────────────────────────────
function RenameModal({ nomeCorrente, onSave, onClose }) {
  const [nome, setNome] = useState(nomeCorrente);
  return (
    <Modal title="Rinomina documento" onClose={onClose} width={420}
           footer={<>
             <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
             <Btn variant="primary" onClick={() => nome.trim() && onSave(nome.trim())}
                  disabled={!nome.trim()}>
               <i className="ti ti-check" /> Rinomina
             </Btn>
           </>}>
      <Field label="Nuovo nome">
        <input autoFocus value={nome} onChange={e => setNome(e.target.value)}
               onKeyDown={e => e.key === "Enter" && nome.trim() && onSave(nome.trim())}
               placeholder="Nome documento" />
      </Field>
    </Modal>
  );
}

export function Documenti() {
  const [docs,     setDocs]  = useState([]);
  const [apps,     setApps]  = useState([]);
  const [tipi,     setTipi]  = useState([]);
  const [filtro,   setFilt]  = useState({ stato: "", appartamentoId: "", tipo: "", periodoDA: "", periodoA: "" });
  const [ricerca,  setRicerca] = useState("");
  const [sort,     setSort]  = useState({ col: "periodo_da", dir: "desc" });
  const [sel,      setSel]      = useState(new Set());
  const [conf,     setConf]     = useState(null);
  const [bulkEdit, setBulkEdit] = useState(false);
  const [editItem, setEdit]     = useState(null);
  const [rename,   setRename] = useState(null); // { id, nomeCorrente }
  const [buchi,    setBuchi] = useState([]);
  const [buchiOpen,setBuchiOpen] = useState(true);
  const [bucheIgnorate, setBucheIgnorate] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("gsa_buchi_ignorati") || "[]")); }
    catch { return new Set(); }
  });

  const [hashDupIntercept, setHashDupIntercept] = useState(null); // { items, onProceed }

  const fileRef = useRef();

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

  const { queue, setQueue, addFiles: addDocFiles, removeItem: removeDocItem, clearQueue: clearDocQueue, apriProssimo } = usePdfQueue({
    extractFn: (file) => documentiApi.extract(file),
    onReady: (item) => {
      const doc = item.data;
      let pdfUrl = item.pdfUrl;
      if (doc?.pdf_base64) {
        try {
          pdfUrl = URL.createObjectURL(new Blob(
            [Uint8Array.from(atob(doc.pdf_base64), c => c.charCodeAt(0))],
            { type: "application/pdf" }
          ));
        } catch {}
      }
      setEdit({ doc, pdfUrl, queueId: item.id });
    },
    onAfterBatch: load,
  });

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    documentiApi.buchiUtenze({
      periodoDA: filtro.periodoDA || undefined,
      periodoA:  filtro.periodoA  || undefined,
    }).then(setBuchi).catch(() => {});
  }, [filtro.periodoDA, filtro.periodoA]);

  // ── Filtro + ordinamento client-side ───────────────────────────────────────
  const docsFiltrati = useMemo(() => {
    let list = [...docs];
    if (ricerca.trim()) {
      const q = ricerca.toLowerCase();
      list = list.filter(d =>
        (d.nome_file         || "").toLowerCase().includes(q) ||
        (d.appartamento_nome || "").toLowerCase().includes(q) ||
        (d.tipo_descrizione  || "").toLowerCase().includes(q) ||
        (d.fornitore         || "").toLowerCase().includes(q) ||
        (d.numero_doc        || "").toLowerCase().includes(q)
      );
    }
    const { col, dir } = sort;
    list.sort((a, b) => {
      let va = a[col] ?? "", vb = b[col] ?? "";
      if (col === "importo") { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0; }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [docs, ricerca, sort]);

  // ── Controlla hash duplicato, poi procede ─────────────────────────────────
  async function checkHashAndIntercept(files, onNoDup, onProceed) {
    const duplicati = [], puliti = [];
    for (const f of files) {
      try {
        const r = await documentiApi.checkHashGlobal(f);
        if (r.duplicati_documenti?.length || r.duplicati_allegati?.length || r.duplicati_archivio?.length) {
          duplicati.push({ file: f, warning: r });
        } else {
          puliti.push(f);
        }
      } catch { puliti.push(f); }
    }
    if (puliti.length)    onNoDup(puliti);
    if (duplicati.length) setHashDupIntercept({ items: duplicati, onProceed: () => onProceed(duplicati.map(d => d.file)) });
  }

  // ── Gestione upload file (pulsante Carica PDF principale) ─────────────────
  async function handleFiles(files) {
    if (!files.length) return;
    checkHashAndIntercept(files, addDocFiles, addDocFiles);
  }

  // ── Upload PDF su spesa esistente (pulsante riga tabella) ─────────────────
  async function handleRowPdfUpload(docId, file) {
    const doUpload = async () => {
      try { await documentiApi.uploadPdf(docId, file); load(); }
      catch (err) { alert("Errore upload: " + err.message); }
    };
    checkHashAndIntercept([file], () => doUpload(), () => doUpload());
  }

  // ── Gestione buchi ignorati (localStorage) ───────────────────────────────
  function bucoKey(b) {
    return `${b.appartamento_id}__${b.tipo_spesa_id}__${b.gaps.join(',')}`;
  }

  function ignoraBuco(b) {
    setBucheIgnorate(prev => {
      const next = new Set(prev);
      next.add(bucoKey(b));
      localStorage.setItem("gsa_buchi_ignorati", JSON.stringify([...next]));
      return next;
    });
  }

  function ripristinaBuchi() {
    setBucheIgnorate(new Set());
    localStorage.removeItem("gsa_buchi_ignorati");
  }

  const buchiVisibili = buchi.filter(b => !bucheIgnorate.has(bucoKey(b)));
  const buchiNascosti = buchi.length - buchiVisibili.length;

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
        await documentiApi.update(doc.id, { ...doc, nome_file: doc.nome_file.trim(), stato, validato: true });
        setQueue(prev => {
          const nuova = prev.filter(q => !(q.data && q.data.id === doc.id));
          setTimeout(() => apriProssimo(nuova), 150);
          return nuova;
        });
      } else {
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
      const corrente = prev.find(q => q.data && q.data.id === editItem.doc?.id);
      const senza    = prev.filter(q => !(q.data && q.data.id === editItem.doc?.id));
      const nuova    = corrente ? [...senza, corrente] : senza;
      setTimeout(() => apriProssimo(nuova), 150);
      return nuova;
    });
  }

  // ── Rinomina ───────────────────────────────────────────────────────────────
  async function doRename(id, nomeFile) {
    const d = docs.find(x => x.id === id);
    if (!d) return;
    try {
      await documentiApi.update(id, { ...d, nome_file: nomeFile });
      setRename(null); load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  // ── Selezione multipla ─────────────────────────────────────────────────────
  const toggleSel = id => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel(sel.size === docsFiltrati.length ? new Set() : new Set(docsFiltrati.map(d => d.id)));

  async function bulkStato(stato) {
    if (!sel.size) return;
    try {
      await Promise.all([...sel].map(id => { const d = docs.find(x => x.id === id); return d ? documentiApi.update(id, { ...d, stato }) : null; }));
      setSel(new Set()); load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  async function bulkEditApply(changes) {
    try {
      await Promise.all([...sel].map(id => {
        const d = docs.find(x => x.id === id);
        return d ? documentiApi.update(id, { ...d, ...changes }) : null;
      }));
      setSel(new Set()); setBulkEdit(false); load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  async function bulkDelete() {
    try {
      await Promise.all([...sel].map(id => documentiApi.delete(id)));
      setSel(new Set()); setConf(null); load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  const nCrit = docs.filter(d => d.stato === "da_verificare" || d.stato === "errore").length;

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
      <PdfQueuePanel
        queue={queue}
        onValida={item => setEdit({ doc: item.data, pdfUrl: item.pdfUrl, queueId: item.id })}
        onRemove={removeDocItem}
        onClear={clearDocQueue}
        onProssimo={() => apriProssimo(queue)}
      />

      {nCrit > 0 && (
        <div className="alert alert-warn" style={{ marginBottom: 12 }}>
          <i className="ti ti-alert-triangle" />
          <strong>{nCrit}</strong> document{nCrit > 1 ? "i" : "o"} da verificare.
        </div>
      )}

      {/* Buchi utenze */}
      {(buchiVisibili.length > 0 || buchiNascosti > 0) && (
        <div style={{ marginBottom: 14, border: "1px solid #b45309", borderRadius: 8, overflow: "hidden" }}>
          {buchiVisibili.length > 0 && (<>
            <div
              onClick={() => setBuchiOpen(o => !o)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                       background: "rgba(180,83,9,0.12)", cursor: "pointer", userSelect: "none" }}
            >
              <i className="ti ti-alert-triangle" style={{ color: "#f59e0b", fontSize: 18, flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: "#f59e0b" }}>
                Buchi utenze rilevati — {buchiVisibili.length} combinazion{buchiVisibili.length > 1 ? "i" : "e"} con mesi mancanti
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
                {Object.entries(
                  buchiVisibili.reduce((acc, b) => {
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
                           style={{ display: "flex", alignItems: "center", gap: 8,
                                    padding: "4px 0", borderBottom: "1px solid var(--bg3)", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 50, color: "#f59e0b" }}>
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
                        <button
                          title="Ignora questo avviso"
                          onClick={e => { e.stopPropagation(); ignoraBuco(b); }}
                          style={{ marginLeft: "auto", background: "none", border: "none",
                                   cursor: "pointer", color: "var(--text2)", padding: "2px 6px",
                                   borderRadius: 4, lineHeight: 1, flexShrink: 0 }}
                        >
                          <i className="ti ti-x" style={{ fontSize: 13 }} />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>)}
          {buchiNascosti > 0 && (
            <div style={{ padding: "6px 14px", background: "rgba(180,83,9,0.06)",
                          display: "flex", alignItems: "center", gap: 6,
                          borderTop: buchiVisibili.length > 0 ? "1px solid #b45309" : "none" }}>
              <i className="ti ti-eye-off" style={{ fontSize: 12, color: "var(--text2)" }} />
              <span style={{ fontSize: 11, color: "var(--text2)" }}>
                {buchiNascosti} avviso{buchiNascosti !== 1 ? "i nascosti" : " nascosto"}
              </span>
              <button
                onClick={ripristinaBuchi}
                style={{ background: "none", border: "none", cursor: "pointer",
                         fontSize: 11, color: "var(--accent)", padding: 0, marginLeft: 4 }}
              >
                Ripristina
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filtri + ricerca */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14,
                    padding: "12px 14px", background: "var(--bg2)", borderRadius: 8,
                    border: "1px solid var(--border)" }}>
        <div>
          <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Cerca</label>
          <div style={{ position: "relative" }}>
            <i className="ti ti-search" style={{ position: "absolute", left: 8, top: "50%",
                                                  transform: "translateY(-50%)", color: "var(--text2)", fontSize: 13 }} />
            <input value={ricerca} onChange={e => setRicerca(e.target.value)}
                   placeholder="Nome, tipo, fornitore…"
                   style={{ width: 180, paddingLeft: 28 }} />
          </div>
        </div>
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
        {(filtro.stato || filtro.appartamentoId || filtro.tipo || filtro.periodoDA || filtro.periodoA || ricerca) && (
          <Btn variant="ghost" size="sm"
               onClick={() => { setFilt({ stato: "", appartamentoId: "", tipo: "", periodoDA: "", periodoA: "" }); setRicerca(""); }}>
            ✕ Reset
          </Btn>
        )}
        {sel.size > 0 && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center",
                        background: "rgba(59,130,246,0.12)", padding: "6px 12px",
                        borderRadius: 8, border: "1px solid var(--accent)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>{sel.size} sel.</span>
            <Btn variant="primary" size="sm" onClick={() => setBulkEdit(true)}>
              <i className="ti ti-edit" /> Modifica campi
            </Btn>
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

      {/* Conteggio risultati ricerca */}
      {ricerca && (
        <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8 }}>
          {docsFiltrati.length} risultat{docsFiltrati.length === 1 ? "o" : "i"} per "{ricerca}"
        </div>
      )}

      {/* Tabella */}
      {docsFiltrati.length === 0
        ? <div className="alert alert-info"><i className="ti ti-info-circle" />Nessun documento trovato.</div>
        : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36, textAlign: "center" }}>
                    <input type="checkbox"
                           checked={sel.size > 0 && sel.size === docsFiltrati.length}
                           ref={el => { if (el) el.indeterminate = sel.size > 0 && sel.size < docsFiltrati.length; }}
                           onChange={toggleAll} />
                  </th>
                  <SortTh col="nome_file"         label="File"         sort={sort} setSort={setSort} />
                  <SortTh col="appartamento_nome" label="Appartamento" sort={sort} setSort={setSort} />
                  <SortTh col="tipo_descrizione"  label="Tipo"         sort={sort} setSort={setSort} />
                  <SortTh col="periodo_da"        label="Periodo"      sort={sort} setSort={setSort} />
                  <SortTh col="importo"           label="Importo"      sort={sort} setSort={setSort} style={{ textAlign: "right" }} />
                  <th>Stato</th>
                  <th style={{ textAlign: "right" }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {docsFiltrati.map(d => (
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
                        {/* Visualizza PDF */}
                        {d.pdf_disponibile && (
                          <Btn variant="ghost" size="sm" title="Visualizza PDF"
                               onClick={async () => {
                                 try {
                                   const res = await fetch(documentiApi.pdfUrl(d.id));
                                   if (res.ok) {
                                     const url = URL.createObjectURL(await res.blob());
                                     window.open(url, "_blank");
                                     setTimeout(() => URL.revokeObjectURL(url), 30_000);
                                   }
                                 } catch {}
                               }}>
                            <i className="ti ti-file-type-pdf" style={{ color: "#ef4444" }} />
                          </Btn>
                        )}
                        {/* Upload/Sostituisci PDF */}
                        <label title={d.pdf_disponibile ? "Sostituisci PDF" : "Carica PDF"}
                               style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
                                        padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)",
                                        cursor: "pointer", color: "var(--text2)", background: "transparent",
                                        lineHeight: 1 }}>
                          <i className="ti ti-upload" style={{ fontSize: 13 }} />
                          <input type="file" accept=".pdf" style={{ display: "none" }}
                                 onChange={e => {
                                   const file = e.target.files[0];
                                   if (!file) return;
                                   e.target.value = "";
                                   handleRowPdfUpload(d.id, file);
                                 }} />
                        </label>
                        {/* Visualizza nel documentale se collegato */}
                        {d.archivio_doc_id && (
                          <Btn variant="ghost" size="sm" title="Visualizza nel documentale"
                               onClick={() => window.open(archivioApi.fileUrl(d.archivio_doc_id), "_blank")}>
                            <i className="ti ti-folder-open" />
                          </Btn>
                        )}
                        {/* Rinomina */}
                        <Btn variant="ghost" size="sm" title="Rinomina"
                             onClick={() => setRename({ id: d.id, nomeCorrente: d.nome_file })}>
                          <i className="ti ti-pencil" />
                        </Btn>
                        {/* Modifica */}
                        <Btn variant="secondary" size="sm" onClick={async () => {
                            const full = await documentiApi.get(d.id);
                            let pdfUrl = null;
                            if (full.pdf_disponibile) {
                              try {
                                const res = await fetch(documentiApi.pdfUrl(d.id));
                                if (res.ok) pdfUrl = URL.createObjectURL(await res.blob());
                              } catch {}
                            }
                            setEdit({ doc: { ...full }, pdfUrl });
                          }}>
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
                    Elaborati: {docsFiltrati.filter(d => d.stato === "elaborato").length} / {docsFiltrati.length}
                    {ricerca && docs.length !== docsFiltrati.length
                      ? ` (filtrati da ${docs.length})`
                      : ""}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700, padding: "8px 12px" }}>
                    {euro(docsFiltrati.filter(d => d.stato === "elaborato").reduce((s, d) => s + parseFloat(d.importo || 0), 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )
      }

      {bulkEdit && (
        <BulkEditModal
          count={sel.size}
          apps={apps} tipi={tipi}
          onSave={bulkEditApply}
          onClose={() => setBulkEdit(false)}
        />
      )}
      {editItem && (
        <DocEditModal
          doc={editItem.doc} pdfUrl={editItem.pdfUrl || null}
          apps={apps} tipi={tipi}
          queueLeft={queue.filter(q => q.stato === "pronto").length}
          onSave={saveEdit}
          onSkip={queue.filter(q => q.stato === "pronto").length > 1 ? salta : null}
          onClose={async () => {
            // Se il modal era aperto dalla coda il documento è già stato creato
            // dall'endpoint /extract — va eliminato se l'utente annulla
            if (editItem.queueId && editItem.doc?.id) {
              try { await documentiApi.delete(editItem.doc.id); } catch {}
              removeDocItem(editItem.queueId);
              load();
            }
            setEdit(null);
          }}
        />
      )}
      {rename && (
        <RenameModal
          nomeCorrente={rename.nomeCorrente}
          onSave={nome => doRename(rename.id, nome)}
          onClose={() => setRename(null)}
        />
      )}
      {conf && <Confirm msg={conf.msg} onYes={conf.onYes} onNo={() => setConf(null)} />}
      {hashDupIntercept && (
        <HashDupInterceptModal
          items={hashDupIntercept.items}
          onProceed={() => { setHashDupIntercept(null); hashDupIntercept.onProceed(); }}
          onCancel={() => setHashDupIntercept(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal modifica massiva
// ─────────────────────────────────────────────────────────────────────────────
function BulkEditModal({ count, apps, tipi, onSave, onClose }) {
  const INIT = { enabled: false, value: "" };
  const [f, setF]     = useState({
    tipo_spesa_id:   { ...INIT },
    appartamento_id: { ...INIT },
    periodo_da:      { ...INIT },
    periodo_a:       { ...INIT },
    stato:           { ...INIT },
  });
  const [saving, setSaving] = useState(false);

  const toggle = key => setF(p => ({ ...p, [key]: { ...p[key], enabled: !p[key].enabled } }));
  const set    = (key, value) => setF(p => ({ ...p, [key]: { ...p[key], value } }));

  const hasChanges = Object.values(f).some(x => x.enabled && x.value !== "");

  async function handleSave() {
    const changes = {};
    for (const [key, { enabled, value }] of Object.entries(f)) {
      if (enabled) changes[key] = value || null;
    }
    if (!Object.keys(changes).length) return;
    setSaving(true);
    try { await onSave(changes); }
    finally { setSaving(false); }
  }

  const rowStyle = enabled => ({
    display: "flex", alignItems: "center", gap: 12,
    padding: "10px 0", borderBottom: "1px solid var(--border)",
    opacity: enabled ? 1 : 0.5,
  });

  return (
    <Modal
      title={`Modifica massiva — ${count} document${count > 1 ? "i" : "o"} selezionat${count > 1 ? "i" : "o"}`}
      onClose={onClose}
      width={500}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
        <Btn variant="primary" onClick={handleSave} disabled={!hasChanges || saving}>
          {saving
            ? <><i className="ti ti-loader-2 spin" /> Salvataggio…</>
            : <><i className="ti ti-check" /> Applica a {count} document{count > 1 ? "i" : "o"}</>}
        </Btn>
      </>}
    >
      <p style={{ fontSize: 12, color: "var(--text2)", margin: "0 0 16px" }}>
        Spunta i campi da sovrascrivere. I campi non selezionati restano invariati.
      </p>

      {/* Tipo di spesa */}
      <div style={rowStyle(f.tipo_spesa_id.enabled)}>
        <input type="checkbox" checked={f.tipo_spesa_id.enabled} onChange={() => toggle("tipo_spesa_id")}
               style={{ flexShrink: 0, cursor: "pointer" }} />
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, display: "block", marginBottom: 4, color: "var(--text2)" }}>Tipo di spesa</label>
          <select value={f.tipo_spesa_id.value} disabled={!f.tipo_spesa_id.enabled}
                  onChange={e => set("tipo_spesa_id", e.target.value)} style={{ width: "100%" }}>
            <option value="">— Seleziona —</option>
            {tipi.map(t => <option key={t.id} value={t.id}>{t.descrizione}</option>)}
          </select>
        </div>
      </div>

      {/* Appartamento */}
      <div style={rowStyle(f.appartamento_id.enabled)}>
        <input type="checkbox" checked={f.appartamento_id.enabled} onChange={() => toggle("appartamento_id")}
               style={{ flexShrink: 0, cursor: "pointer" }} />
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, display: "block", marginBottom: 4, color: "var(--text2)" }}>Appartamento</label>
          <select value={f.appartamento_id.value} disabled={!f.appartamento_id.enabled}
                  onChange={e => set("appartamento_id", e.target.value)} style={{ width: "100%" }}>
            <option value="">— Seleziona —</option>
            {apps.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </div>
      </div>

      {/* Periodo da */}
      <div style={rowStyle(f.periodo_da.enabled)}>
        <input type="checkbox" checked={f.periodo_da.enabled} onChange={() => toggle("periodo_da")}
               style={{ flexShrink: 0, cursor: "pointer" }} />
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, display: "block", marginBottom: 4, color: "var(--text2)" }}>Periodo da</label>
          <input type="month" value={f.periodo_da.value} disabled={!f.periodo_da.enabled}
                 onChange={e => set("periodo_da", e.target.value)} style={{ width: "100%" }} />
        </div>
      </div>

      {/* Periodo a */}
      <div style={rowStyle(f.periodo_a.enabled)}>
        <input type="checkbox" checked={f.periodo_a.enabled} onChange={() => toggle("periodo_a")}
               style={{ flexShrink: 0, cursor: "pointer" }} />
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, display: "block", marginBottom: 4, color: "var(--text2)" }}>Periodo a</label>
          <input type="month" value={f.periodo_a.value} disabled={!f.periodo_a.enabled}
                 onChange={e => set("periodo_a", e.target.value)} style={{ width: "100%" }} />
        </div>
      </div>

      {/* Stato */}
      <div style={{ ...rowStyle(f.stato.enabled), borderBottom: "none" }}>
        <input type="checkbox" checked={f.stato.enabled} onChange={() => toggle("stato")}
               style={{ flexShrink: 0, cursor: "pointer" }} />
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, display: "block", marginBottom: 4, color: "var(--text2)" }}>Stato</label>
          <select value={f.stato.value} disabled={!f.stato.enabled}
                  onChange={e => set("stato", e.target.value)} style={{ width: "100%" }}>
            <option value="">— Seleziona —</option>
            {["elaborato", "da_verificare", "duplicato"].map(s =>
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            )}
          </select>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal di validazione documento
// ─────────────────────────────────────────────────────────────────────────────
function DocEditModal({ doc: initDoc, pdfUrl: initPdfUrl, apps, tipi, queueLeft = 0, onSave, onSkip, onClose }) {
  const [doc,          setDoc]       = useState(initDoc);
  const [localPdfUrl,  setLocalPdf]  = useState(initPdfUrl);
  const [showPdf,      setShowPdf]   = useState(!!initPdfUrl);
  const [uploadingPdf, setUploadPdf] = useState(false);
  const [hashDupIntercept, setHashDupIntercept] = useState(null);
  const pdfInputRef                  = useRef();
  const [proprietari,  setProp]      = useState([]);
  const [riparto,      setRiparto]   = useState(null);   // null | { inquilini, totale, regola_descrizione, motivo }
  const [ripartoOpen,  setRipartoOpen] = useState(false);
  const [ripartoLoading, setRipartoLoading] = useState(false);

  useEffect(() => {
    proprietariApi.list().then(setProp).catch(() => {});
  }, []);

  async function doUploadPdf(file) {
    if (!doc.id || !file) return;
    setUploadPdf(true);
    try {
      await documentiApi.uploadPdf(doc.id, file);
      setLocalPdf(URL.createObjectURL(file));
      setShowPdf(true);
    } catch (e) {
      alert("Errore upload PDF: " + e.message);
    } finally {
      setUploadPdf(false);
    }
  }

  async function uploadPdf(file) {
    if (!doc.id || !file) return;
    try {
      const r = await documentiApi.checkHashGlobal(file);
      if (r.duplicati_documenti?.length || r.duplicati_allegati?.length || r.duplicati_archivio?.length) {
        setHashDupIntercept({ items: [{ file, warning: r }], onProceed: () => doUploadPdf(file) });
        return;
      }
    } catch {}
    doUploadPdf(file);
  }

  useEffect(() => {
    if (!doc.appartamento_id || !doc.periodo_da) return;
    if (doc.pagato_da_proprietario_id) return;
    const data = doc.periodo_da + "-01";
    associazioniApi.defaultPerData(doc.appartamento_id, data)
      .then(r => { if (r?.proprietario_id) setDoc(p => ({ ...p, pagato_da_proprietario_id: r.proprietario_id })); })
      .catch(() => {});
  }, [doc.appartamento_id, doc.periodo_da]);

  useEffect(() => { setRiparto(null); setRipartoOpen(false); }, [doc.appartamento_id, doc.tipo_spesa_id, doc.periodo_da, doc.importo]);

  async function caricaRiparto() {
    if (!doc.id) return;
    setRipartoLoading(true);
    try {
      const r = await documentiApi.riparto(doc.id);
      setRiparto(r);
      setRipartoOpen(true);
    } catch (e) { alert("Errore: " + e.message); }
    finally { setRipartoLoading(false); }
  }

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
    <>
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", display: "flex",
                  alignItems: "center", justifyContent: "center", zIndex: 400, padding: 12 }}>
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12,
                    width: "100%", maxWidth: showPdf && localPdfUrl ? 1120 : 580, height: "92vh",
                    display: "flex", flexDirection: "column", transition: "max-width 0.2s" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "12px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>
              {doc.id
                ? (localPdfUrl ? "Valida documento" : "Modifica documento")
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
            {localPdfUrl && (
              <Btn variant={showPdf ? "primary" : "secondary"} size="sm"
                   onClick={() => setShowPdf(s => !s)}>
                <i className={`ti ${showPdf ? "ti-eye-off" : "ti-eye"}`} />
                {showPdf ? "Nascondi PDF" : "Mostra PDF"}
              </Btn>
            )}
            {doc.id && (
              <>
                <input ref={pdfInputRef} type="file" accept=".pdf" style={{ display: "none" }}
                       onChange={e => { const f = e.target.files[0]; e.target.value = ""; if (f) uploadPdf(f); }} />
                <Btn variant="ghost" size="sm" disabled={uploadingPdf}
                     onClick={() => pdfInputRef.current.click()}
                     title={localPdfUrl ? "Sostituisci PDF" : "Carica PDF"}>
                  {uploadingPdf
                    ? <><i className="ti ti-loader" /> Caricamento…</>
                    : <><i className="ti ti-upload" /> {localPdfUrl ? "Sostituisci" : "Carica PDF"}</>}
                </Btn>
                {localPdfUrl && (
                  <Btn variant="ghost" size="sm" title="Elimina PDF"
                       onClick={async () => {
                         if (!confirm("Eliminare il file PDF? L'operazione non è reversibile.")) return;
                         try {
                           await documentiApi.deletePdf(doc.id);
                           setLocalPdf(null);
                           setShowPdf(false);
                         } catch (e) { alert("Errore: " + e.message); }
                       }}>
                    <i className="ti ti-trash" style={{ color: "var(--red)" }} />
                  </Btn>
                )}
              </>
            )}
            {!localPdfUrl && !doc.id && (
              <span style={{ fontSize: 11, color: "var(--text2)", display: "flex", alignItems: "center", gap: 4 }}>
                <i className="ti ti-file-off" /> PDF non disponibile
              </span>
            )}
            <Btn variant="ghost" size="sm" onClick={onClose}><i className="ti ti-x" /></Btn>
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
          <div style={{ width: showPdf && localPdfUrl ? 390 : "100%", flexShrink: 0, overflowY: "auto",
                        padding: 20, borderRight: showPdf && localPdfUrl ? "1px solid var(--border)" : "none" }}>
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

              {/* ── Riparto tra inquilini ── */}
              {doc.id && (
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!ripartoOpen && !riparto) caricaRiparto();
                      else setRipartoOpen(o => !o);
                    }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8,
                             padding: "9px 12px", background: "var(--bg3)", border: "none",
                             cursor: "pointer", color: "var(--text1)", fontSize: 13, fontWeight: 600 }}>
                    <i className="ti ti-calculator" style={{ color: "var(--accent)" }} />
                    Riparto tra inquilini
                    {ripartoLoading && <i className="ti ti-loader" style={{ marginLeft: 4, fontSize: 12, color: "var(--text2)" }} />}
                    <i className={`ti ${ripartoOpen ? "ti-chevron-up" : "ti-chevron-down"}`}
                       style={{ marginLeft: "auto", fontSize: 12, color: "var(--text2)" }} />
                  </button>
                  {ripartoOpen && riparto && (
                    <div style={{ padding: "10px 12px" }}>
                      {riparto.motivo ? (
                        <p style={{ fontSize: 12, color: "var(--text2)", margin: 0 }}>
                          <i className="ti ti-info-circle" style={{ marginRight: 4 }} />{riparto.motivo}
                        </p>
                      ) : (
                        <>
                          {riparto.regola_descrizione && (
                            <p style={{ fontSize: 11, color: "var(--text2)", marginBottom: 8 }}>
                              <i className="ti ti-scale" style={{ marginRight: 4 }} />
                              Regola: <strong>{riparto.regola_descrizione}</strong>
                            </p>
                          )}
                          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ color: "var(--text2)", fontSize: 10, textTransform: "uppercase" }}>
                                <th style={{ textAlign: "left",  padding: "3px 6px" }}>Inquilino</th>
                                <th style={{ textAlign: "right", padding: "3px 6px" }}>%</th>
                                <th style={{ textAlign: "right", padding: "3px 6px" }}>Quota</th>
                              </tr>
                            </thead>
                            <tbody>
                              {riparto.inquilini.map(c => (
                                <tr key={c.id} style={{ borderTop: "1px solid var(--bg3)" }}>
                                  <td style={{ padding: "4px 6px" }}>{c.nome}</td>
                                  <td style={{ textAlign: "right", padding: "4px 6px", color: "var(--text2)" }}>
                                    {c.percentuale.toFixed(1)}%
                                  </td>
                                  <td style={{ textAlign: "right", padding: "4px 6px", fontWeight: 600 }}>
                                    {euro(c.quota)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {showPdf && localPdfUrl && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#111" }}>
              <div style={{ padding: "6px 14px", fontSize: 11, color: "var(--text2)",
                            borderBottom: "1px solid var(--border)", display: "flex",
                            alignItems: "center", justifyContent: "space-between" }}>
                <span><i className="ti ti-file-type-pdf" style={{ color: "#ef4444" }} /> PDF originale</span>
                <a href={localPdfUrl} target="_blank" rel="noreferrer"
                   style={{ color: "var(--accent)", fontSize: 11, textDecoration: "none" }}>
                  <i className="ti ti-external-link" /> Apri
                </a>
              </div>
              <iframe
                src={localPdfUrl}
                style={{ flex: 1, border: "none", width: "100%" }}
                title="Anteprima PDF"
              />
            </div>
          )}
        </div>

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
    {hashDupIntercept && (
      <HashDupInterceptModal
        items={hashDupIntercept.items}
        onProceed={() => { setHashDupIntercept(null); hashDupIntercept.onProceed(); }}
        onCancel={() => setHashDupIntercept(null)}
      />
    )}
    </>
  );
}
