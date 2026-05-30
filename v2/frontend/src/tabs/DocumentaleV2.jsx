import { useState, useEffect, useCallback, useRef } from "react";
import { immobiliV2, personeV2, ruoliV2, archivioV2, archivioTipiV2 } from "../api/apiV2.js";
import { Btn, Badge, Modal, Field, Confirm } from "../components/ui.jsx";
import DocPreview             from "../components/DocPreview.jsx";
import ImportaCartellaV2Modal from "../components/ImportaCartellaV2Modal.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtData = iso => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("it-IT", { dateStyle: "short" }); }
  catch { return iso; }
};

function mimeIcon(mime) {
  if (!mime) return "ti-file";
  if (mime.includes("pdf"))   return "ti-file-type-pdf";
  if (mime.includes("image")) return "ti-photo";
  if (mime.includes("word") || mime.includes("document")) return "ti-file-type-doc";
  if (mime.includes("sheet") || mime.includes("excel"))   return "ti-file-type-xls";
  return "ti-file";
}

const ENTITA_LABELS = {
  immobile: "Immobile",
  persona:  "Persona",
};
const ENTITA_COLORS = {
  immobile: "blue",
  persona:  "purple",
};
const ENTITA_HEX = {
  immobile: "#3b82f6",
  persona:  "#a855f7",
};

// ── Modal intercetta duplicati hash ──────────────────────────────────────────
function HashDupModal({ file, duplicati, onProceed, onCancel }) {
  return (
    <Modal title="" onClose={onCancel} width={560}
           footer={<>
             <Btn variant="ghost" onClick={onCancel}>Annulla</Btn>
             <div style={{ flex: 1 }} />
             <Btn variant="danger" onClick={onProceed}>
               <i className="ti ti-alert-triangle" /> Procedi comunque
             </Btn>
           </>}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(239,68,68,0.12)",
                      display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
          <i className="ti ti-fingerprint" style={{ fontSize: 28, color: "var(--red)" }} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 17, color: "var(--red)", marginBottom: 4 }}>
          File già presente nell&apos;archivio
        </div>
        <div style={{ fontSize: 13, color: "var(--text2)" }}>
          <strong>{file?.name}</strong> è identico{" "}
          {duplicati.length === 1 ? "a un documento" : `a ${duplicati.length} documenti`}{" "}
          già archiviato{duplicati.length !== 1 ? "i" : ""}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {duplicati.map(d => (
          <div key={d.id} style={{ padding: "12px 14px", borderRadius: 8,
                                    border: "1px solid rgba(239,68,68,0.3)",
                                    background: "rgba(239,68,68,0.04)" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: d.associazioni?.length ? 8 : 0 }}>
              <i className="ti ti-file" style={{ color: "var(--text2)", fontSize: 14 }} />
              <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{d.nome_file}</span>
              {d.tipo_nome && <Badge label={d.tipo_nome} color="gray" />}
              <span style={{ fontSize: 11, color: "var(--text2)", whiteSpace: "nowrap" }}>{fmtData(d.created_at)}</span>
            </div>
            {d.associazioni?.length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {d.associazioni.map((a, i) => (
                  <Badge key={i}
                         label={`${ENTITA_LABELS[a.entita_tipo] || a.entita_tipo}: ${a.entita_nome || a.entita_id}`}
                         color={ENTITA_COLORS[a.entita_tipo] || "gray"} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── Modal rinomina ────────────────────────────────────────────────────────────
function RenameModal({ nomeCorrente, onSave, onClose }) {
  const [nome, setNome] = useState(nomeCorrente);
  return (
    <Modal title="Rinomina file" onClose={onClose} width={420}
           footer={<>
             <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
             <Btn variant="primary" onClick={() => nome.trim() && onSave(nome.trim())} disabled={!nome.trim()}>
               <i className="ti ti-check" /> Rinomina
             </Btn>
           </>}>
      <Field label="Nuovo nome file">
        <input autoFocus value={nome} onChange={e => setNome(e.target.value)}
               onKeyDown={e => e.key === "Enter" && nome.trim() && onSave(nome.trim())}
               className="inp" placeholder="Nome file" />
      </Field>
    </Modal>
  );
}

// ── Helpers per AssocEditor ───────────────────────────────────────────────────
function buildRuoliPerImmobile(immobili = [], ruoli = []) {
  const map = {};
  for (const im of immobili)
    map[im.id] = { immobileId: im.id, immobileNome: im.nome, proprietari: [], inquilini: [], _visti: new Set() };
  for (const r of ruoli) {
    const grp = map[r.immobileId];
    if (!grp || grp._visti.has(r.personaId)) continue;
    grp._visti.add(r.personaId);
    const nome = [r.personaCognome, r.personaNome].filter(Boolean).join(" ") || r.personaId;
    if (r.ruolo === "proprietario") grp.proprietari.push({ id: r.personaId, nome });
    else if (r.ruolo === "inquilino") grp.inquilini.push({ id: r.personaId, nome });
  }
  return Object.values(map)
    .filter(g => g.proprietari.length || g.inquilini.length)
    .map(({ _visti, ...rest }) => rest);
}

// ── AssocEditor ───────────────────────────────────────────────────────────────
function AssocEditor({ associazioni, entitaOptions, onChange }) {
  const immobili        = entitaOptions.immobile        || [];
  const ruoliPerImmobile = entitaOptions.ruoliPerImmobile || [];

  function toggle(tipo, id) {
    const sel = associazioni.some(a => a.entita_tipo === tipo && a.entita_id === id);
    onChange(sel
      ? associazioni.filter(a => !(a.entita_tipo === tipo && a.entita_id === id))
      : [...associazioni, { entita_tipo: tipo, entita_id: id }]);
  }

  function Chip({ tipo, id, nome, color }) {
    const sel = associazioni.some(a => a.entita_tipo === tipo && a.entita_id === id);
    return (
      <button onClick={() => toggle(tipo, id)} style={{
        padding: "4px 10px", borderRadius: 20, fontSize: 12, cursor: "pointer",
        border: `1px solid ${sel ? color : "var(--border)"}`,
        background: sel ? `${color}22` : "var(--bg3)",
        color: sel ? color : "var(--text2)",
        fontWeight: sel ? 600 : 400,
        transition: "all 0.12s",
      }}>
        {nome}
      </button>
    );
  }

  function RoleLabel({ text, color }) {
    return (
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.07em", color, marginBottom: 5 }}>{text}</div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Immobili */}
      {immobili.length > 0 && (
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em",
                        color: "var(--text2)", fontWeight: 600, marginBottom: 6 }}>Immobili</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {immobili.map(x => (
              <Chip key={x.id} tipo="immobile" id={x.id} nome={x.nome} color={ENTITA_HEX.immobile} />
            ))}
          </div>
        </div>
      )}

      {/* Persone per immobile, suddivise per ruolo */}
      {ruoliPerImmobile.map(grp => (
        <div key={grp.immobileId} style={{
          padding: "10px 12px", borderRadius: 8,
          border: "1px solid var(--border)", background: "var(--bg)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10,
                        fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
            <i className="ti ti-building-community" style={{ color: ENTITA_HEX.immobile, fontSize: 13 }} />
            {grp.immobileNome}
          </div>
          {grp.proprietari.length > 0 && (
            <div style={{ marginBottom: grp.inquilini.length ? 10 : 0 }}>
              <RoleLabel text="Proprietari" color="#a855f7" />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {grp.proprietari.map(p => (
                  <Chip key={p.id} tipo="persona" id={p.id} nome={p.nome} color="#a855f7" />
                ))}
              </div>
            </div>
          )}
          {grp.inquilini.length > 0 && (
            <div>
              <RoleLabel text="Inquilini" color="#f59e0b" />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {grp.inquilini.map(p => (
                  <Chip key={p.id} tipo="persona" id={p.id} nome={p.nome} color="#f59e0b" />
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      {immobili.length === 0 && ruoliPerImmobile.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--text2)", padding: "6px 0" }}>
          Nessuna entità disponibile.
        </div>
      )}
    </div>
  );
}

// ── Modal caricamento / modifica documento ────────────────────────────────────
function DocModal({ mode, initial, tipi, entitaOptions, bulkInfo, onSave, onClose }) {
  const [form,   setForm]   = useState({ validita_da: "", validita_a: "", ...initial });
  const [saving, setSaving] = useState(false);

  const tipoSel          = tipi.find(t => t.id === form.tipDocId);
  const entitaDisponibili = tipoSel?.entita?.filter(e => ENTITA_LABELS[e]) || Object.keys(ENTITA_LABELS);

  async function save() {
    setSaving(true);
    try { await onSave(form); }
    catch (e) { alert("Errore: " + e.message); setSaving(false); }
  }

  const previewFile = mode === "upload" ? form.file : null;
  const previewUrl  = mode === "edit"   ? archivioV2.fileUrl(form.id) : null;
  const previewMime = form.mimeType || form.file?.type || "";
  const previewNome = form.nomeFile || form.file?.name || "";

  return (
    <Modal
      title={mode === "upload"
        ? `Carica: ${form.file?.name}${bulkInfo ? ` (${bulkInfo.current}/${bulkInfo.total})` : ""}`
        : `Modifica: ${form.nomeFile || "documento"}`}
      onClose={onClose} width={1020} resizable
      footer={<>
        <Btn variant="ghost" onClick={onClose}>{bulkInfo ? "Salta" : "Annulla"}</Btn>
        <Btn variant="primary" onClick={save} disabled={saving}>
          {saving ? "Salvo…" : mode === "upload" ? (bulkInfo ? "Carica e prossimo" : "Carica") : "Salva"}
        </Btn>
      </>}
    >
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
        {/* Form */}
        <div style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Valido dal">
              <input type="date" className="inp" value={form.validita_da || ""}
                     onChange={e => setForm(f => ({ ...f, validita_da: e.target.value }))} />
            </Field>
            <Field label="Valido al">
              <input type="date" className="inp" value={form.validita_a || ""}
                     onChange={e => setForm(f => ({ ...f, validita_a: e.target.value }))} />
            </Field>
          </div>

          {entitaDisponibili.length > 0 && (
            <div>
              <label style={{ fontSize: 12, color: "var(--text2)", fontWeight: 600,
                              display: "block", marginBottom: 10 }}>
                Associa a
              </label>
              <AssocEditor
                associazioni={form.associazioni}
                entitaOptions={entitaOptions}
                onChange={v => setForm(f => ({ ...f, associazioni: v }))}
              />
            </div>
          )}
        </div>

        {/* Preview */}
        <div style={{ flex: 1, minWidth: 360 }}>
          <DocPreview file={previewFile} url={previewUrl}
                      mime={previewMime} nome={previewNome} height={540} />
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gestione Tipi Documento
// ─────────────────────────────────────────────────────────────────────────────
function TipiDocumento() {
  const [tipi,  setTipi]  = useState([]);
  const [modal, setModal] = useState(null);
  const [conf,  setConf]  = useState(null);

  const load = useCallback(() => archivioTipiV2.list().then(setTipi), []);
  useEffect(() => { load(); }, [load]);

  async function save(form) {
    try {
      if (form.id) await archivioTipiV2.update(form.id, form);
      else         await archivioTipiV2.create(form);
      setModal(null); load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  async function del(id) {
    try { await archivioTipiV2.delete(id); setConf(null); load(); }
    catch (e) { alert("Errore: " + e.message); }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <Btn variant="primary" onClick={() => setModal({ nome: "", descrizione: "", entita: [] })}>
          <i className="ti ti-plus" /> Nuovo tipo
        </Btn>
      </div>

      {tipi.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text2)" }}>
          <i className="ti ti-tag-off" style={{ fontSize: 36, opacity: 0.3, display: "block", marginBottom: 10 }} />
          Nessun tipo definito.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descrizione</th>
              <th>Applicabile a</th>
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
                    {(t.entita || []).map(e => (
                      <Badge key={e} label={ENTITA_LABELS[e] || e} color={ENTITA_COLORS[e] || "gray"} />
                    ))}
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
      )}

      {modal && <TipoModal initial={modal} onSave={save} onClose={() => setModal(null)} />}
      {conf  && <Confirm msg={conf.msg} onYes={conf.onYes} onNo={() => setConf(null)} />}
    </div>
  );
}

function TipoModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState({ nome: "", descrizione: "", entita: [], ...initial });

  const ENTITA_ALL = {
    immobile: "Immobile",
    persona:  "Persona",
  };

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
          <input className="inp" value={form.nome}
                 onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} autoFocus />
        </Field>
        <Field label="Descrizione">
          <input className="inp" value={form.descrizione || ""}
                 onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))} />
        </Field>
        <Field label="Applicabile a">
          <div style={{ display: "flex", gap: 16, marginTop: 4, flexWrap: "wrap" }}>
            {Object.entries(ENTITA_ALL).map(([k, lbl]) => (
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
// Archivio
// ─────────────────────────────────────────────────────────────────────────────
function Archivio({ immobili, persone, ruoli }) {
  const [docs,          setDocs]          = useState([]);
  const [tipi,          setTipi]          = useState([]);
  const [filtro,        setFiltro]        = useState({ tipoId: "", entitaTipo: "", entitaId: "" });
  const [modal,         setModal]         = useState(null);
  const [rename,        setRename]        = useState(null);
  const [conf,          setConf]          = useState(null);
  const [errFile,       setErrFile]       = useState(null);
  const [cartellaMdl,   setCartellaMdl]   = useState(false);
  const [hashIntercept, setHashIntercept] = useState(null);
  const [bulkQueue,     setBulkQueue]     = useState([]);
  const [bulkIndex,     setBulkIndex]     = useState(0);

  const fileRef     = useRef();
  const bulkFileRef = useRef();

  const entitaOptions = {
    immobile: (immobili || []).map(i => ({ id: i.id, nome: i.nome })),
    persona:  (persone  || []).map(p => ({
      id:   p.id,
      nome: [p.cognome, p.nome].filter(Boolean).join(" ") || p.ragioneSociale || p.id,
    })),
    ruoliPerImmobile: buildRuoliPerImmobile(immobili, ruoli),
  };

  const load = useCallback(() =>
    archivioV2.list({
      tipoId:     filtro.tipoId     || undefined,
      entitaTipo: (filtro.entitaTipo && filtro.entitaId) ? filtro.entitaTipo : undefined,
      entitaId:   (filtro.entitaTipo && filtro.entitaId) ? filtro.entitaId   : undefined,
    }).then(setDocs),
  [filtro]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { archivioTipiV2.list().then(setTipi); }, []);

  async function handleUpload(file) {
    try {
      const { hash, duplicati } = await archivioV2.checkHash(file);
      if (duplicati?.length) {
        setHashIntercept({
          file, duplicati,
          onProceed: () => {
            setHashIntercept(null);
            setModal({ mode: "upload", file, tipDocId: "", note: "", associazioni: [], _uid: Date.now() });
          },
        });
        return;
      }
    } catch { /* ignora errori check-hash */ }
    setModal({ mode: "upload", file, tipDocId: "", note: "", associazioni: [], _uid: Date.now() });
  }

  async function handleBulkUpload(files) {
    if (!files.length) return;
    setBulkQueue(Array.from(files).map(f => ({ file: f, done: false })));
    setBulkIndex(0);
  }

  useEffect(() => {
    if (!bulkQueue.length) return;
    const current = bulkQueue[bulkIndex];
    if (!current || current.done) return;
    let cancelled = false;
    (async () => {
      try {
        const { hash, duplicati } = await archivioV2.checkHash(current.file);
        if (cancelled) return;
        if (duplicati?.length) {
          setHashIntercept({
            file: current.file, duplicati,
            onProceed: () => {
              setHashIntercept(null);
              setModal({ mode: "upload", file: current.file, tipDocId: "", note: "", associazioni: [], _bulk: true, _uid: Date.now() });
            },
          });
          return;
        }
      } catch {}
      if (!cancelled)
        setModal({ mode: "upload", file: current.file, tipDocId: "", note: "", associazioni: [], _bulk: true, _uid: Date.now() });
    })();
    return () => { cancelled = true; };
  }, [bulkQueue, bulkIndex]);

  function advanceBulk() {
    setBulkQueue(q => q.map((item, i) => i === bulkIndex ? { ...item, done: true } : item));
    const next = bulkIndex + 1;
    if (next < bulkQueue.length) setBulkIndex(next);
    else { setBulkQueue([]); setBulkIndex(0); }
  }

  async function doUpload(form) {
    try {
      await archivioV2.upload(form.file, {
        tipDocId:    form.tipDocId    || undefined,
        note:        form.note        || undefined,
        validita_da: form.validita_da || undefined,
        validita_a:  form.validita_a  || undefined,
        associazioni: form.associazioni,
      });
      setModal(null);
      if (form._bulk) advanceBulk();
      load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  async function doUpdate(form) {
    try {
      await archivioV2.update(form.id, {
        tipo_documento_id: form.tipDocId    || null,
        note:              form.note        || null,
        validita_da:       form.validita_da || null,
        validita_a:        form.validita_a  || null,
        associazioni:      form.associazioni,
      });
      setModal(null); load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  async function doRename(id, nomeFile) {
    try { await archivioV2.update(id, { nome_file: nomeFile }); setRename(null); load(); }
    catch (e) { alert("Errore: " + e.message); }
  }

  async function del(id) {
    try { await archivioV2.delete(id); setConf(null); load(); }
    catch (e) { alert("Errore: " + e.message); }
  }

  async function openFile(doc) {
    setErrFile(null);
    try {
      const token = localStorage.getItem("gsa_token");
      const res = await fetch(archivioV2.fileUrl(doc.id), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) { setErrFile(doc.id); return; }
      const blob    = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href   = blobUrl;
      a.target = "_blank";
      a.rel    = "noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch { setErrFile(doc.id); }
  }

  const entitaSelectOptions = filtro.entitaTipo === "immobile"
    ? immobili
    : filtro.entitaTipo === "persona"
      ? (persone || []).map(p => ({ id: p.id, nome: [p.cognome, p.nome].filter(Boolean).join(" ") || p.ragioneSociale || "" }))
      : [];

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 14 }}>
        <Btn variant="ghost" onClick={() => setCartellaMdl(true)}>
          <i className="ti ti-folder-up" /> Importa cartella
        </Btn>
        <Btn variant="ghost" onClick={() => bulkFileRef.current.click()}>
          <i className="ti ti-layers-union" /> Carica multiple
        </Btn>
        <input ref={bulkFileRef} type="file" multiple style={{ display: "none" }}
               onChange={e => { if (e.target.files.length) handleBulkUpload(e.target.files); e.target.value = ""; }} />
        <Btn variant="secondary" onClick={() => fileRef.current.click()}>
          <i className="ti ti-upload" /> Carica documento
        </Btn>
        <input ref={fileRef} type="file" style={{ display: "none" }}
               onChange={e => { if (e.target.files[0]) handleUpload(e.target.files[0]); e.target.value = ""; }} />
      </div>

      {/* Indicatore bulk upload */}
      {bulkQueue.length > 0 && (
        <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 8,
                      background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)",
                      display: "flex", gap: 10, alignItems: "center" }}>
          <i className="ti ti-layers-union" style={{ color: "var(--accent)" }} />
          <div style={{ flex: 1 }}>
            <strong>Caricamento multiplo</strong>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--text2)" }}>
              File {bulkIndex + 1} di {bulkQueue.length}: <em>{bulkQueue[bulkIndex]?.file?.name}</em>
            </p>
          </div>
          <Btn variant="ghost" size="sm"
               onClick={() => { setBulkQueue([]); setBulkIndex(0); setModal(null); }}>
            Annulla
          </Btn>
        </div>
      )}

      {/* Filtri */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14,
                    padding: "12px 14px", background: "var(--bg2)", borderRadius: 8, border: "1px solid var(--border)" }}>
        <div>
          <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Tipo documento</label>
          <select className="inp" value={filtro.tipoId}
                  onChange={e => setFiltro(f => ({ ...f, tipoId: e.target.value }))} style={{ width: 170 }}>
            <option value="">Tutti</option>
            {tipi.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Entità</label>
          <select className="inp" value={filtro.entitaTipo}
                  onChange={e => setFiltro(f => ({ ...f, entitaTipo: e.target.value, entitaId: "" }))}
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
            <select className="inp" value={filtro.entitaId}
                    onChange={e => setFiltro(f => ({ ...f, entitaId: e.target.value }))}
                    style={{ width: 190 }}>
              <option value="">Tutti</option>
              {entitaSelectOptions.map(x => (
                <option key={x.id} value={x.id}>{x.nome}</option>
              ))}
            </select>
          </div>
        )}
        {(filtro.tipoId || filtro.entitaTipo) && (
          <Btn variant="ghost" size="sm"
               onClick={() => setFiltro({ tipoId: "", entitaTipo: "", entitaId: "" })}>
            ✕ Reset
          </Btn>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--text2)" }}>{docs.length} documenti</span>
      </div>

      {/* Tabella */}
      {docs.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: "var(--text2)" }}>
          <i className="ti ti-archive-off" style={{ fontSize: 40, opacity: 0.3, display: "block", marginBottom: 12 }} />
          Nessun documento.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th>Nome file</th>
              <th>Tipo</th>
              <th>Associato a</th>
              <th>Note</th>
              <th>Data</th>
              <th style={{ textAlign: "right" }}>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {docs.map(d => (
              <tr key={d.id}>
                <td style={{ textAlign: "center" }}>
                  <i className={`ti ${mimeIcon(d.mime_type)}`} style={{ fontSize: 18, color: "var(--text2)" }} />
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
                      <i className="ti ti-file-off" /> File non trovato
                    </span>
                  )}
                </td>
                <td>
                  {d.tipo_nome
                    ? <Badge label={d.tipo_nome} color="gray" />
                    : <span style={{ color: "var(--text2)", fontSize: 12 }}>—</span>}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(d.associazioni || []).map(a => (
                      <Badge key={a.id || `${a.entita_tipo}-${a.entita_id}`}
                             label={`${ENTITA_LABELS[a.entita_tipo] || a.entita_tipo}: ${a.entita_nome || a.entita_id}`}
                             color={ENTITA_COLORS[a.entita_tipo] || "gray"} />
                    ))}
                    {!(d.associazioni?.length) && <span style={{ color: "var(--text2)", fontSize: 12 }}>—</span>}
                  </div>
                </td>
                <td style={{ fontSize: 12, color: "var(--text2)" }}>{d.note || "—"}</td>
                <td style={{ fontSize: 12, color: "var(--text2)", whiteSpace: "nowrap" }}>
                  <div>{fmtData(d.created_at)}</div>
                  {(d.validita_da || d.validita_a) && (
                    <div style={{ fontSize: 11, marginTop: 2, color: "var(--accent)" }}>
                      {d.validita_da ? fmtData(d.validita_da) : "…"} → {d.validita_a ? fmtData(d.validita_a) : "∞"}
                    </div>
                  )}
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
                           mode: "edit", id: d.id, _uid: d.id,
                           tipDocId:    d.tipo_documento_id || "",
                           note:        d.note        || "",
                           mimeType:    d.mime_type   || "",
                           nomeFile:    d.nome_file   || "",
                           validita_da: d.validita_da ? d.validita_da.slice(0, 10) : "",
                           validita_a:  d.validita_a  ? d.validita_a.slice(0,  10) : "",
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
      )}

      {/* Modali */}
      {modal && (
        <DocModal
          key={modal._uid || modal.id || "modal"}
          mode={modal.mode}
          initial={modal}
          tipi={tipi}
          entitaOptions={entitaOptions}
          bulkInfo={modal._bulk ? { current: bulkIndex + 1, total: bulkQueue.length } : null}
          onSave={modal.mode === "upload" ? doUpload : doUpdate}
          onClose={() => {
            setModal(null);
            if (modal._bulk) { setBulkQueue([]); setBulkIndex(0); }
          }}
        />
      )}

      {rename && (
        <RenameModal nomeCorrente={rename.nomeCorrente}
                     onSave={nome => doRename(rename.id, nome)}
                     onClose={() => setRename(null)} />
      )}

      {conf && <Confirm msg={conf.msg} onYes={conf.onYes} onNo={() => setConf(null)} />}

      {hashIntercept && (
        <HashDupModal
          file={hashIntercept.file}
          duplicati={hashIntercept.duplicati}
          onProceed={hashIntercept.onProceed}
          onCancel={() => setHashIntercept(null)}
        />
      )}

      {cartellaMdl && (
        <ImportaCartellaV2Modal
          tipi={tipi}
          immobili={immobili}
          persone={persone}
          onSaved={load}
          onClose={() => setCartellaMdl(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab principale
// ─────────────────────────────────────────────────────────────────────────────
export function DocumentaleV2() {
  const [subTab,   setSubTab]   = useState("archivio");
  const [immobili, setImmobili] = useState([]);
  const [persone,  setPersone]  = useState([]);
  const [ruoli,    setRuoli]    = useState([]);

  useEffect(() => {
    Promise.all([immobiliV2.lista(), personeV2.lista(), ruoliV2.tutti()])
      .then(([imm, per, r]) => { setImmobili(imm); setPersone(per); setRuoli(r); })
      .catch(() => {});
  }, []);

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Documentale</h2>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12,
                       background: "#1e3a5f", color: "#60a5fa", border: "1px solid #3b82f6" }}>v2</span>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 20,
                    borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
        {[
          { id: "archivio", icon: "ti-folder-open", label: "Archivio" },
          { id: "tipi",     icon: "ti-tag",          label: "Tipi documento" },
        ].map(s => (
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

      {subTab === "archivio" && <Archivio immobili={immobili} persone={persone} ruoli={ruoli} />}
      {subTab === "tipi"     && <TipiDocumento />}
    </div>
  );
}
