import { useState, useEffect, useCallback, useRef } from "react";
import { archivioTipiApi, archivioApi, appartamentiApi, proprietariApi, documentiApi } from "../api.js";
import { Btn, Badge, Modal, Field, SectionHeader, Confirm } from "../components/ui.jsx";
import { toITdate } from "../utils/formatters.js";

// Mappa tipi MIME → icona
function mimeIcon(mime) {
  if (!mime) return "ti-file";
  if (mime.includes("pdf"))   return "ti-file-type-pdf";
  if (mime.includes("image")) return "ti-photo";
  if (mime.includes("word") || mime.includes("document")) return "ti-file-type-doc";
  if (mime.includes("sheet") || mime.includes("excel"))   return "ti-file-type-xls";
  return "ti-file";
}

const ENTITA_LABELS = {
  appartamento: "Appartamento",
  inquilino:    "Inquilino",
  proprietario: "Proprietario",
  spesa:        "Spesa (documento)",
};
const ENTITA_COLORS = {
  appartamento: "blue",
  inquilino:    "green",
  proprietario: "purple",
  spesa:        "yellow",
};

// ── Modal rinomina ─────────────────────────────────────────────────────────────
function RenameModal({ nomeCorrente, onSave, onClose }) {
  const [nome, setNome] = useState(nomeCorrente);
  return (
    <Modal title="Rinomina file" onClose={onClose} width={420}
           footer={<>
             <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
             <Btn variant="primary" onClick={() => nome.trim() && onSave(nome.trim())}
                  disabled={!nome.trim()}>
               <i className="ti ti-check" /> Rinomina
             </Btn>
           </>}>
      <Field label="Nuovo nome file">
        <input autoFocus value={nome} onChange={e => setNome(e.target.value)}
               onKeyDown={e => e.key === "Enter" && nome.trim() && onSave(nome.trim())}
               placeholder="Nome file" />
      </Field>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gestione Tipi Documento
// ─────────────────────────────────────────────────────────────────────────────
function TipiDocumento() {
  const [tipi,   setTipi]   = useState([]);
  const [modal,  setModal]  = useState(null);
  const [conf,   setConf]   = useState(null);

  const load = useCallback(() => archivioTipiApi.list().then(setTipi), []);
  useEffect(() => { load(); }, [load]);

  async function save(form) {
    try {
      if (form.id) await archivioTipiApi.update(form.id, form);
      else         await archivioTipiApi.create(form);
      setModal(null); load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  async function del(id) {
    try { await archivioTipiApi.delete(id); setConf(null); load(); }
    catch (e) { alert("Errore: " + e.message); }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <Btn variant="primary" onClick={() => setModal({ nome: "", descrizione: "", entita: [] })}>
          <i className="ti ti-plus" /> Nuovo tipo
        </Btn>
      </div>

      {tipi.length === 0
        ? <div className="alert alert-info"><i className="ti ti-info-circle" /> Nessun tipo definito.</div>
        : (
          <table>
            <thead>
              <tr>
                <th>Nome</th><th>Descrizione</th><th>Entità associate</th>
                <th style={{ textAlign: "right" }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {tipi.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.nome}</td>
                  <td style={{ color: "var(--text2)", fontSize: 13 }}>{t.descrizione || "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(t.entita || []).map(e =>
                        <Badge key={e} label={ENTITA_LABELS[e] || e} color={ENTITA_COLORS[e] || "gray"} />
                      )}
                      {!(t.entita?.length) && <span style={{ color: "var(--text2)", fontSize: 12 }}>—</span>}
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <Btn variant="secondary" size="sm" onClick={() => setModal({ ...t })}>
                        <i className="ti ti-edit" />
                      </Btn>
                      <Btn variant="danger" size="sm"
                           onClick={() => setConf({ msg: `Eliminare il tipo "${t.nome}"?`, onYes: () => del(t.id) })}>
                        <i className="ti ti-trash" />
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }

      {modal && <TipoModal initial={modal} onSave={save} onClose={() => setModal(null)} />}
      {conf  && <Confirm msg={conf.msg} onYes={conf.onYes} onNo={() => setConf(null)} />}
    </div>
  );
}

function TipoModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState({ nome: "", descrizione: "", entita: [], ...initial });

  const toggleEnt = e => setForm(f => ({
    ...f,
    entita: f.entita.includes(e) ? f.entita.filter(x => x !== e) : [...f.entita, e],
  }));

  async function save() {
    if (!form.nome.trim()) { alert("Nome obbligatorio"); return; }
    await onSave(form);
  }

  return (
    <Modal
      title={initial.id ? "Modifica tipo" : "Nuovo tipo documento"}
      onClose={onClose} width={480}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
        <Btn variant="primary" onClick={save}>Salva</Btn>
      </>}
    >
      <div style={{ display: "grid", gap: 14 }}>
        <Field label="Nome *">
          <input className="inp" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} autoFocus />
        </Field>
        <Field label="Descrizione">
          <input className="inp" value={form.descrizione || ""} onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))} />
        </Field>
        <Field label="Applicabile a">
          <div style={{ display: "flex", gap: 16, marginTop: 4, flexWrap: "wrap" }}>
            {Object.entries(ENTITA_LABELS).map(([k, lbl]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={form.entita.includes(k)} onChange={() => toggleEnt(k)} />
                {lbl}
              </label>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Archivio documenti
// ─────────────────────────────────────────────────────────────────────────────
function Archivio() {
  const [docs,     setDocs]    = useState([]);
  const [tipi,     setTipi]    = useState([]);
  const [apps,     setApps]    = useState([]);
  const [props,    setProps]   = useState([]);
  const [filtro,   setFilt]    = useState({ tipoId: "", entitaTipo: "", entitaId: "" });
  const [modal,    setModal]   = useState(null);
  const [rename,   setRename]  = useState(null);  // { id, nomeCorrente }
  const [conf,     setConf]    = useState(null);
  const [errFile,  setErrFile] = useState(null);  // id del file non trovato
  // bulk upload queue: array di { file, done }
  const [bulkQueue,  setBulkQueue]  = useState([]);
  const [bulkIndex,  setBulkIndex]  = useState(0);
  const fileRef     = useRef();
  const bulkFileRef = useRef();

  const load = useCallback(() =>
    archivioApi.list({
      tipoId:     filtro.tipoId     || undefined,
      entitaTipo: (filtro.entitaTipo && filtro.entitaId) ? filtro.entitaTipo : undefined,
      entitaId:   (filtro.entitaTipo && filtro.entitaId) ? filtro.entitaId   : undefined,
    }).then(setDocs),
  [filtro]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    Promise.all([
      archivioTipiApi.list(),
      appartamentiApi.list(),
      proprietariApi.list(),
    ]).then(([t, a, p]) => { setTipi(t); setApps(a); setProps(p); });
  }, []);

  const [inquilini, setInquilini] = useState([]);
  useEffect(() => {
    if (filtro.entitaTipo !== "inquilino") { setInquilini([]); return; }
    Promise.all(apps.map(a => appartamentiApi.get(a.id)))
      .then(lista => {
        const all = lista.flatMap(a => (a.componenti || []).map(c => ({
          id: c.id,
          nome: `${c.nome} ${c.cognome || ""}`.trim(),
          app: a.nome,
        })));
        setInquilini(all);
      })
      .catch(() => {});
  }, [filtro.entitaTipo, apps]);

  async function handleUpload(file) {
    setModal({ mode: "upload", file, tipDocId: "", note: "", associazioni: [] });
  }

  async function handleBulkUpload(files) {
    if (!files.length) return;
    setBulkQueue(Array.from(files).map(f => ({ file: f, done: false })));
    setBulkIndex(0);
  }

  // Quando bulkQueue è pronto, apri il modal per il file corrente
  useEffect(() => {
    if (!bulkQueue.length) return;
    const current = bulkQueue[bulkIndex];
    if (!current || current.done) return;
    setModal({ mode: "upload", file: current.file, tipDocId: "", note: "", associazioni: [], _bulk: true });
  }, [bulkQueue, bulkIndex]);

  async function doUpload(form) {
    try {
      await archivioApi.upload(form.file, {
        tipDocId: form.tipDocId || undefined,
        note: form.note || undefined,
        associazioni: form.associazioni,
      });
      setModal(null);
      if (form._bulk) {
        setBulkQueue(q => q.map((item, i) => i === bulkIndex ? { ...item, done: true } : item));
        const nextIndex = bulkIndex + 1;
        if (nextIndex < bulkQueue.length) {
          setBulkIndex(nextIndex);
        } else {
          setBulkQueue([]); setBulkIndex(0);
        }
      }
      load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  async function doUpdate(form) {
    try {
      await archivioApi.update(form.id, {
        tipo_documento_id: form.tipDocId || null,
        note: form.note || null,
        associazioni: form.associazioni,
      });
      setModal(null); load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  async function doRename(id, nomeFile) {
    try {
      await archivioApi.update(id, { nome_file: nomeFile });
      setRename(null); load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  async function del(id) {
    try { await archivioApi.delete(id); setConf(null); load(); }
    catch (e) { alert("Errore: " + e.message); }
  }

  async function openFile(doc) {
    setErrFile(null);
    try {
      const res = await fetch(archivioApi.fileUrl(doc.id), { method: "HEAD" });
      if (!res.ok) { setErrFile(doc.id); return; }
      window.open(archivioApi.fileUrl(doc.id), "_blank");
    } catch {
      setErrFile(doc.id);
    }
  }

  const entitaOptions = {
    appartamento: apps.map(a => ({ id: a.id, nome: a.nome })),
    inquilino:    inquilini,
    proprietario: props.map(p => ({ id: p.id, nome: `${p.nome} ${p.cognome || ""}`.trim() })),
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 14 }}>
        <Btn variant="ghost" onClick={() => bulkFileRef.current.click()}>
          <i className="ti ti-layers-union" /> Carica multiple
        </Btn>
        <input ref={bulkFileRef} type="file" multiple style={{ display: "none" }}
               onChange={e => { if (e.target.files.length) handleBulkUpload(e.target.files); e.target.value = ""; }} />
        <Btn variant="secondary" onClick={() => fileRef.current.click()}>
          <i className="ti ti-upload" /> Carica documento
        </Btn>
        <input ref={fileRef} type="file" style={{ display: "none" }} multiple={false}
               onChange={e => { if (e.target.files[0]) handleUpload(e.target.files[0]); e.target.value = ""; }} />
      </div>

      {/* Indicatore bulk upload */}
      {bulkQueue.length > 0 && (
        <div className="alert alert-info" style={{ marginBottom: 14 }}>
          <i className="ti ti-layers-union" />
          <div>
            <strong>Caricamento multiplo</strong>
            <p style={{ margin: "2px 0 0", fontSize: 13 }}>
              File {bulkIndex + 1} di {bulkQueue.length}: <em>{bulkQueue[bulkIndex]?.file?.name}</em>
            </p>
          </div>
          <Btn variant="ghost" size="sm"
               onClick={() => { setBulkQueue([]); setBulkIndex(0); setModal(null); }}
               style={{ marginLeft: "auto" }}>
            Annulla
          </Btn>
        </div>
      )}

      {/* Filtri */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14,
                    padding: "12px 14px", background: "var(--bg2)", borderRadius: 8, border: "1px solid var(--border)" }}>
        <div>
          <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Tipo documento</label>
          <select value={filtro.tipoId} onChange={e => setFilt(f => ({ ...f, tipoId: e.target.value }))}
                  style={{ width: 160 }}>
            <option value="">Tutti</option>
            {tipi.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Entità</label>
          <select value={filtro.entitaTipo}
                  onChange={e => setFilt(f => ({ ...f, entitaTipo: e.target.value, entitaId: "" }))}
                  style={{ width: 140 }}>
            <option value="">Tutte</option>
            {Object.entries(ENTITA_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {filtro.entitaTipo && (
          <div>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>
              {ENTITA_LABELS[filtro.entitaTipo]}
            </label>
            <select value={filtro.entitaId}
                    onChange={e => setFilt(f => ({ ...f, entitaId: e.target.value }))}
                    style={{ width: 180 }}>
              <option value="">Tutti</option>
              {(entitaOptions[filtro.entitaTipo] || []).map(x =>
                <option key={x.id} value={x.id}>
                  {x.nome}{x.app ? ` (${x.app})` : ""}
                </option>
              )}
            </select>
          </div>
        )}
        {(filtro.tipoId || filtro.entitaTipo) && (
          <Btn variant="ghost" size="sm"
               onClick={() => setFilt({ tipoId: "", entitaTipo: "", entitaId: "" })}>
            ✕ Reset
          </Btn>
        )}
      </div>

      {/* Tabella */}
      {docs.length === 0
        ? <div className="alert alert-info"><i className="ti ti-info-circle" /> Nessun documento.</div>
        : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}></th>
                <th>Nome file</th><th>Tipo</th><th>Associato a</th>
                <th>Note</th><th>Data</th>
                <th style={{ textAlign: "right" }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id}>
                  <td style={{ textAlign: "center" }}>
                    <i className={`ti ${mimeIcon(d.mime_type)}`}
                       style={{ fontSize: 18, color: "var(--text2)" }} />
                  </td>
                  <td>
                    <button onClick={() => openFile(d)}
                            style={{ background: "none", border: "none", cursor: "pointer",
                                     color: "var(--accent)", fontWeight: 600, fontSize: 13,
                                     padding: 0, textAlign: "left" }}>
                      {d.nome_file}
                    </button>
                    {errFile === d.id && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: "var(--red)" }}>
                        <i className="ti ti-file-off" /> File non trovato sul server
                      </span>
                    )}
                  </td>
                  <td>{d.tipo_nome
                    ? <Badge label={d.tipo_nome} color="gray" />
                    : <span style={{ color: "var(--text2)", fontSize: 12 }}>—</span>}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(d.associazioni || []).map(a => (
                        <Badge key={a.id}
                               label={`${ENTITA_LABELS[a.entita_tipo] || a.entita_tipo}: ${a.entita_nome || a.entita_id}`}
                               color={ENTITA_COLORS[a.entita_tipo] || "gray"} />
                      ))}
                      {!(d.associazioni?.length) &&
                        <span style={{ color: "var(--text2)", fontSize: 12 }}>—</span>}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--text2)" }}>{d.note || "—"}</td>
                  <td style={{ fontSize: 12, color: "var(--text2)", whiteSpace: "nowrap" }}>
                    {toITdate(d.created_at)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <Btn variant="ghost" size="sm" title="Apri" onClick={() => openFile(d)}>
                        <i className="ti ti-eye" />
                      </Btn>
                      <Btn variant="ghost" size="sm" title="Rinomina"
                           onClick={() => setRename({ id: d.id, nomeCorrente: d.nome_file })}>
                        <i className="ti ti-pencil" />
                      </Btn>
                      <Btn variant="secondary" size="sm" title="Modifica"
                           onClick={() => setModal({
                             mode: "edit", id: d.id,
                             tipDocId: d.tipo_documento_id || "",
                             note: d.note || "",
                             associazioni: (d.associazioni || []).map(a => ({
                               entita_tipo: a.entita_tipo, entita_id: a.entita_id,
                             })),
                           })}>
                        <i className="ti ti-edit" />
                      </Btn>
                      <Btn variant="danger" size="sm" title="Elimina"
                           onClick={() => setConf({ msg: `Eliminare "${d.nome_file}"?`, onYes: () => del(d.id) })}>
                        <i className="ti ti-trash" />
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }

      {modal && (
        <DocModal
          mode={modal.mode}
          initial={modal}
          tipi={tipi}
          apps={apps}
          props={props}
          bulkInfo={modal._bulk ? { current: bulkIndex + 1, total: bulkQueue.length } : null}
          onSave={modal.mode === "upload" ? doUpload : doUpdate}
          onClose={() => {
            setModal(null);
            if (modal._bulk) { setBulkQueue([]); setBulkIndex(0); }
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal caricamento / modifica documento
// ─────────────────────────────────────────────────────────────────────────────
function DocModal({ mode, initial, tipi, apps, props, bulkInfo, onSave, onClose }) {
  const [form, setForm] = useState({ ...initial });
  const [inquilini, setInquilini] = useState([]);
  const [spese,     setSpese]     = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all(apps.map(a => appartamentiApi.get(a.id)))
      .then(lista => setInquilini(
        lista.flatMap(a => (a.componenti || []).map(c => ({
          id: c.id,
          nome: `${c.nome} ${c.cognome || ""}`.trim(),
          app: a.nome,
        })))
      ))
      .catch(() => {});
  }, [apps]);

  // Carica spese per associazione tipo "spesa"
  useEffect(() => {
    const needsSpese = (form.tipDocId === "" || !form.tipDocId)
      ? true
      : (tipi.find(t => t.id === form.tipDocId)?.entita || []).includes("spesa");
    if (needsSpese) {
      documentiApi.list({}).then(setSpese).catch(() => {});
    }
  }, [form.tipDocId, tipi]);

  const tipoSel = tipi.find(t => t.id === form.tipDocId);
  const entitaDisponibili = tipoSel?.entita || Object.keys(ENTITA_LABELS);

  const entitaOptions = {
    appartamento: apps.map(a => ({ id: a.id, nome: a.nome })),
    inquilino:    inquilini,
    proprietario: props.map(p => ({ id: p.id, nome: `${p.nome} ${p.cognome || ""}`.trim() })),
    spesa:        spese.map(s => ({
      id: s.id,
      nome: s.nome_file || `Spesa ${s.id.slice(0, 6)}`,
      app: s.appartamento_nome || "",
    })),
  };

  function toggleAssoc(tipo, id) {
    setForm(f => {
      const has = f.associazioni.some(a => a.entita_tipo === tipo && a.entita_id === id);
      return {
        ...f,
        associazioni: has
          ? f.associazioni.filter(a => !(a.entita_tipo === tipo && a.entita_id === id))
          : [...f.associazioni, { entita_tipo: tipo, entita_id: id }],
      };
    });
  }

  async function save() {
    setSaving(true);
    try { await onSave(form); }
    catch (e) { alert("Errore: " + e.message); setSaving(false); }
  }

  return (
    <Modal
      title={mode === "upload"
        ? `Carica: ${form.file?.name}${bulkInfo ? ` (${bulkInfo.current}/${bulkInfo.total})` : ""}`
        : "Modifica documento"}
      onClose={onClose} width={560}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>
          {bulkInfo ? "Salta" : "Annulla"}
        </Btn>
        <Btn variant="primary" onClick={save} disabled={saving}>
          {saving ? "Salvo…" : mode === "upload" ? (bulkInfo ? "Carica e prossimo" : "Carica") : "Salva"}
        </Btn>
      </>}
    >
      <div style={{ display: "grid", gap: 16 }}>
        {bulkInfo && (
          <div style={{ display: "flex", gap: 6, alignItems: "center",
                        padding: "6px 12px", background: "rgba(59,130,246,0.1)",
                        borderRadius: 6, border: "1px solid rgba(59,130,246,0.3)" }}>
            <i className="ti ti-layers-union" style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
              Caricamento multiplo — file {bulkInfo.current} di {bulkInfo.total}
            </span>
          </div>
        )}
        <Field label="Tipo documento">
          <select className="inp" value={form.tipDocId}
                  onChange={e => setForm(f => ({ ...f, tipDocId: e.target.value }))}>
            <option value="">— nessuno —</option>
            {tipi.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </Field>

        <Field label="Note">
          <input className="inp" value={form.note}
                 onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
        </Field>

        {entitaDisponibili.length > 0 && (
          <div>
            <label style={{ fontSize: 12, color: "var(--text2)", fontWeight: 600,
                            display: "block", marginBottom: 10 }}>
              Associa a
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {entitaDisponibili.map(tipo => (
                <div key={tipo}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em",
                                color: "var(--text2)", marginBottom: 6 }}>
                    {ENTITA_LABELS[tipo] || tipo}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 120, overflowY: "auto" }}>
                    {(entitaOptions[tipo] || []).map(x => {
                      const sel = form.associazioni.some(a => a.entita_tipo === tipo && a.entita_id === x.id);
                      return (
                        <button key={x.id} onClick={() => toggleAssoc(tipo, x.id)}
                                style={{
                                  padding: "4px 10px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                                  border: sel ? "1px solid var(--accent)" : "1px solid var(--border)",
                                  background: sel ? "rgba(59,130,246,0.15)" : "var(--bg3)",
                                  color: sel ? "var(--accent)" : "var(--text2)",
                                  fontWeight: sel ? 600 : 400,
                                }}>
                          {x.nome}{x.app ? ` (${x.app})` : ""}
                        </button>
                      );
                    })}
                    {!(entitaOptions[tipo]?.length) &&
                      <span style={{ fontSize: 12, color: "var(--text2)" }}>
                        Nessun elemento disponibile
                      </span>
                    }
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

// ─────────────────────────────────────────────────────────────────────────────
// Tab principale Documentale
// ─────────────────────────────────────────────────────────────────────────────
export function Documentale() {
  const [subTab, setSubTab] = useState("archivio");

  const SUB = [
    { id: "archivio", label: "Archivio", icon: "ti-folder-open" },
    { id: "tipi",     label: "Tipi documento", icon: "ti-tag" },
  ];

  return (
    <div>
      <SectionHeader title="Documentale" />

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)",
                    paddingBottom: 8 }}>
        {SUB.map(s => (
          <button key={s.id} onClick={() => setSubTab(s.id)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
            borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontSize: 13,
            background: subTab === s.id ? "var(--bg2)" : "transparent",
            color:      subTab === s.id ? "var(--text1)" : "var(--text2)",
            fontWeight: subTab === s.id ? 600 : 400,
            borderBottom: subTab === s.id ? "2px solid var(--accent)" : "2px solid transparent",
          }}>
            <i className={`ti ${s.icon}`} /> {s.label}
          </button>
        ))}
      </div>

      {subTab === "archivio" && <Archivio />}
      {subTab === "tipi"     && <TipiDocumento />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente riutilizzabile per mostrare documenti di un'entità (embed)
// ─────────────────────────────────────────────────────────────────────────────
export function DocListEntita({ entitaTipo, entitaId, label }) {
  const [docs,  setDocs]  = useState([]);
  const [open,  setOpen]  = useState(false);
  const [modal, setModal] = useState(null);
  const [tipi,  setTipi]  = useState([]);
  const [apps,  setApps]  = useState([]);
  const [props, setProps] = useState([]);
  const [conf,  setConf]  = useState(null);
  const [errFile, setErrFile] = useState(null);
  const fileRef = useRef();

  const load = useCallback(() => {
    archivioApi.list({ entitaTipo, entitaId }).then(setDocs);
  }, [entitaTipo, entitaId]);

  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => {
    Promise.all([
      archivioTipiApi.list(),
      appartamentiApi.list(),
      proprietariApi.list(),
    ]).then(([t, a, p]) => { setTipi(t); setApps(a); setProps(p); });
  }, []);

  async function handleUpload(file) {
    setModal({
      mode: "upload", file, tipDocId: "", note: "",
      associazioni: [{ entita_tipo: entitaTipo, entita_id: entitaId }],
    });
  }

  async function doUpload(form) {
    await archivioApi.upload(form.file, {
      tipDocId: form.tipDocId || undefined,
      note:     form.note || undefined,
      associazioni: form.associazioni,
    });
    setModal(null); load();
  }

  async function doUpdate(form) {
    await archivioApi.update(form.id, {
      tipo_documento_id: form.tipDocId || null,
      note:              form.note     || null,
      associazioni:      form.associazioni,
    });
    setModal(null); load();
  }

  async function del(id) {
    try { await archivioApi.delete(id); setConf(null); load(); }
    catch (e) { alert("Errore: " + e.message); }
  }

  async function openFile(doc) {
    setErrFile(null);
    try {
      const res = await fetch(archivioApi.fileUrl(doc.id), { method: "HEAD" });
      if (!res.ok) { setErrFile(doc.id); return; }
      window.open(archivioApi.fileUrl(doc.id), "_blank");
    } catch { setErrFile(doc.id); }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                 background: "var(--bg2)", borderRadius: 8, cursor: "pointer",
                 border: "1px solid var(--border)", userSelect: "none" }}
      >
        <i className="ti ti-folder" style={{ color: "var(--accent)", fontSize: 16 }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          Documenti{docs.length > 0 && open ? ` (${docs.length})` : ""}
        </span>
        {!open && docs.length > 0 && (
          <span style={{ fontSize: 11, background: "var(--accent)", color: "#fff",
                         borderRadius: 20, padding: "1px 7px", marginLeft: 2 }}>
            {docs.length}
          </span>
        )}
        <i className={`ti ${open ? "ti-chevron-up" : "ti-chevron-down"}`}
           style={{ marginLeft: "auto", color: "var(--text2)", fontSize: 14 }} />
      </div>

      {open && (
        <div style={{ border: "1px solid var(--border)", borderTop: "none",
                      borderRadius: "0 0 8px 8px", padding: "10px 12px",
                      background: "var(--bg3)" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <Btn variant="secondary" size="sm" onClick={() => fileRef.current.click()}>
              <i className="ti ti-upload" /> Carica
            </Btn>
            <input ref={fileRef} type="file" style={{ display: "none" }}
                   onChange={e => { if (e.target.files[0]) handleUpload(e.target.files[0]); e.target.value = ""; }} />
          </div>

          {docs.length === 0
            ? <p style={{ fontSize: 12, color: "var(--text2)", margin: 0 }}>Nessun documento.</p>
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {docs.map(d => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8,
                                           padding: "6px 8px", background: "var(--bg2)",
                                           borderRadius: 6, border: "1px solid var(--border)" }}>
                    <i className={`ti ${mimeIcon(d.mime_type)}`}
                       style={{ fontSize: 16, color: "var(--text2)", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 500,
                                     overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                     display: "block" }}>
                        {d.nome_file}
                      </span>
                      {errFile === d.id && (
                        <span style={{ fontSize: 11, color: "var(--red)" }}>
                          <i className="ti ti-file-off" /> File non trovato sul server
                        </span>
                      )}
                    </div>
                    {d.tipo_nome && <Badge label={d.tipo_nome} color="gray" />}
                    {d.note && (
                      <span style={{ fontSize: 11, color: "var(--text2)", maxWidth: 120,
                                     overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {d.note}
                      </span>
                    )}
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <Btn variant="ghost" size="sm" title="Apri"
                           onClick={() => openFile(d)}>
                        <i className="ti ti-eye" />
                      </Btn>
                      <Btn variant="secondary" size="sm" title="Modifica"
                           onClick={() => setModal({
                             mode: "edit", id: d.id,
                             tipDocId: d.tipo_documento_id || "",
                             note: d.note || "",
                             associazioni: (d.associazioni || []).map(a => ({
                               entita_tipo: a.entita_tipo, entita_id: a.entita_id,
                             })),
                           })}>
                        <i className="ti ti-edit" />
                      </Btn>
                      <Btn variant="danger" size="sm" title="Elimina"
                           onClick={() => setConf({ msg: `Eliminare "${d.nome_file}"?`, onYes: () => del(d.id) })}>
                        <i className="ti ti-trash" />
                      </Btn>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      )}

      {modal && (
        <DocModal
          mode={modal.mode}
          initial={modal}
          tipi={tipi}
          apps={apps}
          props={props}
          onSave={modal.mode === "upload" ? doUpload : doUpdate}
          onClose={() => setModal(null)}
        />
      )}
      {conf && <Confirm msg={conf.msg} onYes={conf.onYes} onNo={() => setConf(null)} />}
    </div>
  );
}
