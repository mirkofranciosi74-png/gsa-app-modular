/**
 * ImportaCartellaModal
 *
 * Flusso in 4 fasi:
 *   0 – Selezione file (cartella o file multipli)
 *   1 – Tag di base  (tipo, note, associazioni comuni a tutti i file)
 *   2 – Revisione    (tabella per file con tag ereditati, editabili inline)
 *   3 – Completato   (riepilogo con errori)
 */

import { useState, useEffect, useRef } from "react";
import { archivioApi, appartamentiApi } from "../api.js";
import { Modal, Btn, Field } from "./ui.jsx";

// ── costanti ──────────────────────────────────────────────────────────────────

const ENTITA_LABELS = {
  appartamento: "Appartamento",
  inquilino:    "Inquilino",
  proprietario: "Proprietario",
};
const ENTITA_COLORS = {
  appartamento: "#3b82f6",
  inquilino:    "#22c55e",
  proprietario: "#a855f7",
};

function mimeIcon(file) {
  const m = file?.type || "";
  const n = (file?.name || "").toLowerCase();
  if (m.includes("pdf") || n.endsWith(".pdf")) return "ti-file-type-pdf";
  if (m.includes("image"))                     return "ti-photo";
  if (m.includes("word") || n.endsWith(".docx") || n.endsWith(".doc")) return "ti-file-type-doc";
  if (m.includes("sheet") || n.endsWith(".xlsx") || n.endsWith(".xls")) return "ti-file-type-xls";
  return "ti-file";
}

function fmt(n) { return n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(0)} KB` : `${(n/1048576).toFixed(1)} MB`; }

// ── componente chip associazione ──────────────────────────────────────────────

function AssocChip({ label, color, onRemove }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 12, fontSize: 11,
      background: `${color}22`, color, border: `1px solid ${color}44`,
      fontWeight: 600,
    }}>
      {label}
      {onRemove && (
        <button onClick={onRemove} style={{
          background: "none", border: "none", cursor: "pointer",
          padding: 0, lineHeight: 1, color, fontSize: 12, fontWeight: 700,
        }}>×</button>
      )}
    </span>
  );
}

// ── editor inline associazioni ─────────────────────────────────────────────────

function AssocEditor({ associazioni, entitaOptions, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Object.entries(ENTITA_LABELS).map(([tipo, label]) => {
        const opts = entitaOptions[tipo] || [];
        if (!opts.length) return null;
        return (
          <div key={tipo}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em",
                          color: "var(--text2)", marginBottom: 5 }}>
              {label}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, maxHeight: 80, overflowY: "auto" }}>
              {opts.map(x => {
                const sel = associazioni.some(a => a.entita_tipo === tipo && a.entita_id === x.id);
                return (
                  <button key={x.id} onClick={() => {
                    const next = sel
                      ? associazioni.filter(a => !(a.entita_tipo === tipo && a.entita_id === x.id))
                      : [...associazioni, { entita_tipo: tipo, entita_id: x.id }];
                    onChange(next);
                  }} style={{
                    padding: "3px 9px", borderRadius: 16, fontSize: 11, cursor: "pointer",
                    border: sel ? `1px solid ${ENTITA_COLORS[tipo]}` : "1px solid var(--border)",
                    background: sel ? `${ENTITA_COLORS[tipo]}22` : "var(--bg3)",
                    color: sel ? ENTITA_COLORS[tipo] : "var(--text2)",
                    fontWeight: sel ? 700 : 400,
                  }}>
                    {x.nome}{x.app ? ` (${x.app})` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── riga della tabella di revisione ──────────────────────────────────────────

function RigaFile({ riga, idx, tipi, entitaOptions, baseAssoc, onUpdate }) {
  const [expanded, setExpanded] = useState(false);

  const tipoNome  = tipi.find(t => t.id === riga.tipDocId)?.nome || "";
  const color     = ENTITA_COLORS;

  function setField(k, v) { onUpdate(idx, { [k]: v }); }

  function resetToBase() {
    onUpdate(idx, {
      tipDocId:     riga._baseTipDocId,
      note:         riga._baseNote,
      associazioni: riga._baseAssoc.map(a => ({ ...a })),
    });
  }

  const assocLabels = riga.associazioni.map(a => {
    const opts = entitaOptions[a.entita_tipo] || [];
    const found = opts.find(x => x.id === a.entita_id);
    return found
      ? { label: `${ENTITA_LABELS[a.entita_tipo]}: ${found.nome}`, color: color[a.entita_tipo] || "#666", key: `${a.entita_tipo}-${a.entita_id}` }
      : null;
  }).filter(Boolean);

  const isModified =
    riga.tipDocId !== riga._baseTipDocId ||
    riga.note     !== riga._baseNote     ||
    JSON.stringify(riga.associazioni) !== JSON.stringify(riga._baseAssoc);

  return (
    <>
      <tr style={{
        background: !riga.includi ? "rgba(107,114,128,0.05)" : expanded ? "rgba(59,130,246,0.05)" : "",
        opacity: riga.includi ? 1 : 0.5,
        borderBottom: expanded ? "none" : "1px solid var(--border)",
      }}>
        {/* Includi */}
        <td style={{ textAlign: "center", padding: "6px 6px", width: 32 }}>
          <input type="checkbox" checked={!!riga.includi}
            onChange={e => setField("includi", e.target.checked)} />
        </td>

        {/* Icona + nome file */}
        <td style={{ padding: "6px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <i className={`ti ${mimeIcon(riga.file)}`}
              style={{ fontSize: 16, color: "var(--text2)", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, wordBreak: "break-all" }}>
                {riga.file.name}
              </div>
              <div style={{ fontSize: 10, color: "var(--text2)" }}>{fmt(riga.file.size)}</div>
            </div>
          </div>
        </td>

        {/* Tipo */}
        <td style={{ padding: "6px 8px", width: 140 }}>
          {tipoNome
            ? <span style={{
                display: "inline-block", padding: "2px 8px", borderRadius: 10,
                fontSize: 11, fontWeight: 600,
                background: "rgba(107,114,128,0.15)", color: "var(--text2)",
              }}>{tipoNome}</span>
            : <span style={{ fontSize: 11, color: "var(--text2)", opacity: 0.5 }}>—</span>}
        </td>

        {/* Associazioni */}
        <td style={{ padding: "6px 8px" }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {assocLabels.length
              ? assocLabels.map(a => <AssocChip key={a.key} label={a.label} color={a.color} />)
              : <span style={{ fontSize: 11, color: "var(--text2)", opacity: 0.5 }}>—</span>}
          </div>
        </td>

        {/* Note */}
        <td style={{ padding: "6px 8px", fontSize: 11, color: "var(--text2)", maxWidth: 120 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
            title={riga.note}>{riga.note || "—"}</span>
        </td>

        {/* Azioni */}
        <td style={{ padding: "6px 6px", textAlign: "right", width: 80, whiteSpace: "nowrap" }}>
          {isModified && (
            <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 8,
              background: "rgba(234,179,8,0.2)", color: "#ca8a04", marginRight: 4 }}>
              mod.
            </span>
          )}
          <button onClick={() => setExpanded(e => !e)} style={{
            background: expanded ? "rgba(59,130,246,0.1)" : "none",
            border: "1px solid var(--border)", borderRadius: 5,
            cursor: "pointer", padding: "3px 7px", fontSize: 12,
            color: expanded ? "var(--accent)" : "var(--text2)",
          }} title="Modifica tag per questo file">
            <i className={`ti ${expanded ? "ti-chevron-up" : "ti-pencil"}`} />
          </button>
        </td>
      </tr>

      {/* Riga espansa */}
      {expanded && (
        <tr style={{ borderBottom: "1px solid var(--border)" }}>
          <td />
          <td colSpan={5} style={{ padding: "0 8px 12px 8px" }}>
            <div style={{
              background: "var(--bg2)", borderRadius: 8,
              border: "1px solid rgba(59,130,246,0.2)",
              padding: 12, display: "grid", gap: 12,
            }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 160px" }}>
                  <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Tipo documento</label>
                  <select value={riga.tipDocId}
                    onChange={e => setField("tipDocId", e.target.value)}
                    style={{ width: "100%", fontSize: 12 }}>
                    <option value="">— nessuno —</option>
                    {tipi.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </div>
                <div style={{ flex: "1 1 200px" }}>
                  <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Note</label>
                  <input value={riga.note}
                    onChange={e => setField("note", e.target.value)}
                    style={{ width: "100%", fontSize: 12 }}
                    placeholder="Note specifiche per questo file…" />
                </div>
                {isModified && (
                  <button onClick={resetToBase} style={{
                    background: "none", border: "1px solid var(--border)",
                    borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                    fontSize: 11, color: "var(--text2)",
                  }} title="Ripristina i tag di base per questo file">
                    <i className="ti ti-refresh" style={{ marginRight: 4 }} />
                    Ripristina base
                  </button>
                )}
              </div>

              <AssocEditor
                associazioni={riga.associazioni}
                entitaOptions={entitaOptions}
                onChange={v => setField("associazioni", v)}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── componente principale ─────────────────────────────────────────────────────

export default function ImportaCartellaModal({ tipi, apps, props: proprietari, onSaved, onClose }) {
  const [fase,     setFase]     = useState(0);
  const [files,    setFiles]    = useState([]);
  const [base,     setBase]     = useState({ tipDocId: "", note: "", associazioni: [] });
  const [righe,    setRighe]    = useState([]);
  const [progress, setProgress] = useState({ done: 0, total: 0, errori: [] });
  const [importing, setImporting] = useState(false);
  const [inquilini, setInquilini] = useState([]);

  const fileRef   = useRef();
  const folderRef = useRef();

  // Carica inquilini al mount
  useEffect(() => {
    Promise.all(apps.map(a => appartamentiApi.get(a.id)))
      .then(lista => setInquilini(
        lista.flatMap(a => (a.componenti || []).map(c => ({
          id:   c.id,
          nome: `${c.cognome || ""} ${c.nome || ""}`.trim(),
          app:  a.nome,
        })))
      ))
      .catch(() => {});
  }, [apps]);

  const entitaOptions = {
    appartamento: apps.map(a      => ({ id: a.id, nome: a.nome })),
    inquilino:    inquilini,
    proprietario: (proprietari||[]).map(p => ({ id: p.id, nome: `${p.nome} ${p.cognome || ""}`.trim() })),
  };

  function onFilesSelected(fileList) {
    const arr = Array.from(fileList).filter(f => f.size > 0 && !f.name.startsWith("."));
    if (!arr.length) return;
    setFiles(arr);
    setFase(1);
  }

  function buildRighe() {
    setRighe(files.map(f => ({
      file:         f,
      includi:      true,
      tipDocId:     base.tipDocId,
      note:         base.note,
      associazioni: base.associazioni.map(a => ({ ...a })),
      // snapshot dei valori base (per "ripristina")
      _baseTipDocId: base.tipDocId,
      _baseNote:     base.note,
      _baseAssoc:    base.associazioni.map(a => ({ ...a })),
    })));
    setFase(2);
  }

  function updateRiga(idx, patch) {
    setRighe(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  // Aggiorna tutti i tag con quelli di base (solo le righe non ancora modificate)
  function applicaBaseATutti() {
    setRighe(prev => prev.map(r => ({
      ...r,
      tipDocId:      base.tipDocId,
      note:          base.note,
      associazioni:  base.associazioni.map(a => ({ ...a })),
      _baseTipDocId: base.tipDocId,
      _baseNote:     base.note,
      _baseAssoc:    base.associazioni.map(a => ({ ...a })),
    })));
  }

  async function doImport() {
    const toImport = righe.filter(r => r.includi);
    setProgress({ done: 0, total: toImport.length, errori: [] });
    setImporting(true);
    const errori = [];
    for (let i = 0; i < toImport.length; i++) {
      const r = toImport[i];
      try {
        await archivioApi.upload(r.file, {
          tipDocId:     r.tipDocId     || undefined,
          note:         r.note         || undefined,
          associazioni: r.associazioni,
        });
      } catch (e) {
        errori.push({ nome: r.file.name, errore: e.message });
      }
      setProgress({ done: i + 1, total: toImport.length, errori: [...errori] });
    }
    setImporting(false);
    setFase(3);
    onSaved();
  }

  // ── render fase 0: selezione ──────────────────────────────────────────────

  const renderSelezione = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="alert alert-info" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <i className="ti ti-info-circle" style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 13 }}>
          Seleziona una <strong>cartella</strong> per caricare tutti i file in essa contenuti,
          oppure scegli <strong>più file</strong> singolarmente.
          Potrai poi assegnare tag comuni e personalizzarne alcuni per file.
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexDirection: "column" }}>
        <button onClick={() => folderRef.current.click()} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "14px 18px",
          border: "2px dashed var(--border)", borderRadius: 10, cursor: "pointer",
          background: "var(--bg2)", fontSize: 14, color: "var(--text)",
          transition: "border-color 0.15s",
        }}>
          <i className="ti ti-folder-open" style={{ fontSize: 28, color: "var(--accent)" }} />
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 700 }}>Seleziona cartella</div>
            <div style={{ fontSize: 12, color: "var(--text2)" }}>
              Carica tutti i file di una cartella (incluse sottocartelle)
            </div>
          </div>
        </button>
        <input ref={folderRef} type="file" style={{ display: "none" }}
          // @ts-ignore
          webkitdirectory="true" multiple
          onChange={e => { if (e.target.files?.length) onFilesSelected(e.target.files); e.target.value = ""; }} />

        <button onClick={() => fileRef.current.click()} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "14px 18px",
          border: "2px dashed var(--border)", borderRadius: 10, cursor: "pointer",
          background: "var(--bg2)", fontSize: 14, color: "var(--text)",
        }}>
          <i className="ti ti-files" style={{ fontSize: 28, color: "var(--accent)" }} />
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 700 }}>Seleziona file multipli</div>
            <div style={{ fontSize: 12, color: "var(--text2)" }}>
              Scegli manualmente i file da importare
            </div>
          </div>
        </button>
        <input ref={fileRef} type="file" multiple style={{ display: "none" }}
          onChange={e => { if (e.target.files?.length) onFilesSelected(e.target.files); e.target.value = ""; }} />
      </div>
    </div>
  );

  // ── render fase 1: tag di base ─────────────────────────────────────────────

  const renderBase = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--border)",
        borderRadius: 8, padding: "8px 14px", fontSize: 12,
        display: "flex", gap: 8, alignItems: "center",
      }}>
        <i className="ti ti-files" style={{ color: "var(--accent)", fontSize: 16 }} />
        <span><strong>{files.length}</strong> file selezionat{files.length === 1 ? "o" : "i"}</span>
        <span style={{ color: "var(--text2)" }}>·</span>
        <span style={{ color: "var(--text2)" }}>
          {files.slice(0, 3).map(f => f.name).join(", ")}
          {files.length > 3 ? ` … +${files.length - 3} altri` : ""}
        </span>
      </div>

      <div style={{
        background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)",
        borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "var(--text2)",
      }}>
        <i className="ti ti-tag" style={{ marginRight: 6, color: "var(--accent)" }} />
        Imposta i <strong style={{ color: "var(--text)" }}>tag comuni</strong> che verranno applicati
        a tutti i file. Nella fase successiva potrai modificarli singolarmente.
      </div>

      <Field label="Tipo documento">
        <select value={base.tipDocId}
          onChange={e => setBase(b => ({ ...b, tipDocId: e.target.value }))}>
          <option value="">— nessuno —</option>
          {tipi.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
      </Field>

      <Field label="Note comuni" hint="Opzionale — verranno aggiunte a tutti i documenti">
        <input value={base.note}
          onChange={e => setBase(b => ({ ...b, note: e.target.value }))}
          placeholder="Nota da aggiungere a tutti i file…" />
      </Field>

      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)",
                        display: "block", marginBottom: 10 }}>
          Associazioni comuni
        </label>
        <AssocEditor
          associazioni={base.associazioni}
          entitaOptions={entitaOptions}
          onChange={v => setBase(b => ({ ...b, associazioni: v }))}
        />
      </div>
    </div>
  );

  // ── render fase 2: revisione ───────────────────────────────────────────────

  const renderRevisione = () => {
    const incluse  = righe.filter(r => r.includi).length;
    const modified = righe.filter(r =>
      r.tipDocId !== r._baseTipDocId ||
      r.note     !== r._baseNote     ||
      JSON.stringify(r.associazioni) !== JSON.stringify(r._baseAssoc)
    ).length;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Sommario */}
        <div style={{
          display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center",
          background: "var(--bg2)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "8px 14px", fontSize: 12,
        }}>
          <span><strong>{righe.length}</strong> file totali</span>
          <span style={{ color: "var(--text2)" }}>·</span>
          <span><strong style={{ color: "var(--accent)" }}>{incluse}</strong> selezionati</span>
          {modified > 0 && (
            <>
              <span style={{ color: "var(--text2)" }}>·</span>
              <span style={{ color: "#ca8a04" }}>
                <strong>{modified}</strong> con tag personalizzati
              </span>
            </>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={() => setRighe(r => r.map(x => ({ ...x, includi: true })))}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--accent)" }}>
            Seleziona tutto
          </button>
          <button onClick={() => setRighe(r => r.map(x => ({ ...x, includi: false })))}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text2)" }}>
            Deseleziona tutto
          </button>
          <button onClick={applicaBaseATutti}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#ca8a04" }}
            title="Sovrascrive tutti i tag personalizzati con quelli di base">
            <i className="ti ti-refresh" style={{ marginRight: 3 }} />Reimposta tutti
          </button>
        </div>

        {/* Tabella */}
        <div style={{ overflowY: "auto", maxHeight: "55vh", border: "1px solid var(--border)", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, background: "var(--bg2)", zIndex: 10 }}>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                <th style={{ width: 32, padding: "6px 6px", textAlign: "center" }}>
                  <input type="checkbox"
                    checked={righe.every(r => r.includi)}
                    onChange={e => setRighe(r => r.map(x => ({ ...x, includi: e.target.checked })))} />
                </th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>File</th>
                <th style={{ textAlign: "left", padding: "6px 8px", width: 140 }}>Tipo</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Associazioni</th>
                <th style={{ textAlign: "left", padding: "6px 8px", width: 120 }}>Note</th>
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {righe.map((r, i) => (
                <RigaFile
                  key={i}
                  riga={r}
                  idx={i}
                  tipi={tipi}
                  entitaOptions={entitaOptions}
                  baseAssoc={base.associazioni}
                  onUpdate={updateRiga}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── render fase 3: completato ──────────────────────────────────────────────

  const renderDone = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", padding: "20px 0" }}>
      <i className="ti ti-circle-check" style={{ fontSize: 48, color: "var(--green)" }} />
      <h3 style={{ margin: 0 }}>Importazione completata</h3>
      <div style={{ display: "flex", gap: 24, fontSize: 14 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: "var(--green)" }}>
            {progress.total - progress.errori.length}
          </div>
          <div style={{ color: "var(--text2)" }}>File caricati</div>
        </div>
        {progress.errori.length > 0 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, fontWeight: 700, color: "var(--red)" }}>{progress.errori.length}</div>
            <div style={{ color: "var(--text2)" }}>Errori</div>
          </div>
        )}
      </div>
      {progress.errori.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--red)", maxHeight: 80, overflowY: "auto",
                      width: "100%", padding: "0 8px" }}>
          {progress.errori.map((e, i) => <div key={i}><strong>{e.nome}</strong>: {e.errore}</div>)}
        </div>
      )}
      <Btn variant="primary" onClick={onClose}><i className="ti ti-check" /> Chiudi</Btn>
    </div>
  );

  // ── titolo e footer dinamici ───────────────────────────────────────────────

  const titles = ["Importa da cartella", "Tag di base", "Revisione documenti", "Completato"];
  const title  = importing
    ? `Caricamento… ${progress.done}/${progress.total}`
    : titles[fase] || "Importa da cartella";

  const footer = fase < 3 && !importing ? (
    <>
      {fase === 0 ? (
        <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
      ) : (
        <Btn variant="ghost" onClick={() => setFase(f => f - 1)}>
          <i className="ti ti-arrow-left" /> Indietro
        </Btn>
      )}
      <div style={{ flex: 1 }} />
      {fase === 1 && (
        <Btn variant="primary" onClick={buildRighe} disabled={!files.length}>
          Avanti <i className="ti ti-arrow-right" />
        </Btn>
      )}
      {fase === 2 && (
        <Btn variant="primary" onClick={doImport}
          disabled={!righe.some(r => r.includi)}>
          <i className="ti ti-cloud-upload" />
          Carica {righe.filter(r => r.includi).length} file
        </Btn>
      )}
    </>
  ) : null;

  return (
    <Modal
      title={title}
      onClose={fase === 3 ? onClose : (!importing ? onClose : undefined)}
      width={fase === 2 ? 900 : 580}
      resizable={fase === 2}
      footer={footer}
    >
      {/* Barra di progresso durante l'import */}
      {importing && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12,
                        color: "var(--text2)", marginBottom: 6 }}>
            <span>Caricamento in corso…</span>
            <span>{progress.done} / {progress.total}</span>
          </div>
          <div style={{ background: "var(--bg3)", borderRadius: 6, height: 8, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 6,
              background: "var(--accent)",
              width: `${progress.total ? (progress.done / progress.total * 100) : 0}%`,
              transition: "width 0.3s",
            }} />
          </div>
        </div>
      )}

      {/* Indicatore passi */}
      {fase < 3 && !importing && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center" }}>
          {["Selezione", "Tag base", "Revisione"].map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
                background: i < fase ? "var(--green)" : i === fase ? "var(--accent)" : "var(--bg3)",
                color: i <= fase ? "#fff" : "var(--text2)",
              }}>
                {i < fase ? <i className="ti ti-check" style={{ fontSize: 11 }} /> : i + 1}
              </div>
              <span style={{ fontSize: 12, color: i === fase ? "var(--text)" : "var(--text2)",
                             fontWeight: i === fase ? 600 : 400 }}>
                {s}
              </span>
              {i < 2 && <i className="ti ti-chevron-right" style={{ color: "var(--border)", fontSize: 12 }} />}
            </div>
          ))}
        </div>
      )}

      {fase === 0 && renderSelezione()}
      {fase === 1 && renderBase()}
      {fase === 2 && !importing && renderRevisione()}
      {fase === 3 && renderDone()}
    </Modal>
  );
}
