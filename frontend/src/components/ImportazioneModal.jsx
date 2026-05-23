/**
 * ImportazioneModal — smart import da estratto conto (PDF / Excel / CSV)
 *
 * Fasi:
 *  0  upload file
 *  1  revisione tabella (includi / associa / segna regola)
 *  2  verifica duplicati
 *  3  riepilogo completamento
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { importazioneApi, associazioniApi, tipiVersamentoApi, tipiSpesaApi } from "../api.js";
import { Modal, Btn, Field } from "./ui.jsx";
import { euro, toITdate, mesL } from "../utils/formatters.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function badgeColor(c) {
  if (c >= 90) return { bg: "rgba(34,197,94,0.18)",  color: "var(--green)" };
  if (c >= 70) return { bg: "rgba(59,130,246,0.18)", color: "var(--accent)" };
  if (c >= 50) return { bg: "rgba(234,179,8,0.18)",  color: "#ca8a04" };
  if (c >   0) return { bg: "rgba(249,115,22,0.18)", color: "#ea580c" };
  return               { bg: "rgba(107,114,128,0.15)", color: "var(--text2)" };
}

function fmt(d)    { return d ? toITdate(d) : "—"; }
function fmtI(v,s) { return `${s < 0 ? "-" : "+"}${euro(Math.abs(v))}`; }

// Select tipo unificato: tipi versamento + tipi spesa + "ignora"
function TipoRigaSelect({ value, onChange, tipiVersamento, tipiSpesa, includeIgnora = true, style = {} }) {
  return (
    <select value={value || ""} onChange={e => onChange(e.target.value)}
      style={{ width: "100%", fontSize: 12, padding: "3px 4px", ...style }}>
      <option value="">— Nessuno —</option>
      {tipiVersamento?.length > 0 && (
        <optgroup label="Entrate (versamenti)">
          {tipiVersamento.map(t => (
            <option key={t.id} value={t.nome}>{t.nome}</option>
          ))}
        </optgroup>
      )}
      {tipiSpesa?.length > 0 && (
        <optgroup label="Uscite (spese)">
          {tipiSpesa.map(t => (
            <option key={t.id} value={t.nome}>{t.nome}</option>
          ))}
        </optgroup>
      )}
      {includeIgnora && <option value="ignora">— Ignora questa riga —</option>}
    </select>
  );
}

// ── Riga tabella revisione ─────────────────────────────────────────────────────

function RigaRevisione({ riga, idx, appartamenti, tipiVersamento, regola, onUpdate, onToggleRegola }) {
  const appSel = appartamenti.find(a => String(a.id) === String(riga.appartamento_id));
  const comps  = appSel?.componenti || [];
  const bc     = badgeColor(riga.confidenza);

  function handleApp(appId) {
    onUpdate(idx, { appartamento_id: appId, componente_id: "" });
  }

  function handleComp(compId) {
    onUpdate(idx, { componente_id: compId });
    if (riga.appartamento_id && riga.data && compId) {
      associazioniApi.defaultPerData(riga.appartamento_id, riga.data)
        .then(r => { if (r?.proprietario_id) onUpdate(idx, { incassato_da_proprietario_id: r.proprietario_id }); })
        .catch(() => {});
    }
  }

  const rowBg = !riga.includi
    ? "rgba(107,114,128,0.05)"
    : riga.isDuplicate
      ? "rgba(239,68,68,0.07)"
      : "";

  return (
    <tr style={{ background: rowBg, opacity: riga.includi ? 1 : 0.5,
      borderBottom: "1px solid var(--border)" }}>

      {/* Includi */}
      <td style={{ textAlign: "center", width: 32, padding: "6px 4px" }}>
        <input type="checkbox" checked={!!riga.includi}
          onChange={e => onUpdate(idx, { includi: e.target.checked })} />
      </td>

      {/* Data */}
      <td style={{ whiteSpace: "nowrap", fontSize: 12, padding: "6px 8px", width: 78 }}>
        {fmt(riga.data)}
      </td>

      {/* Descrizione */}
      <td style={{ padding: "6px 8px" }}>
        <div style={{
          fontSize: 12, lineHeight: 1.4,
          display: "-webkit-box", WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical", overflow: "hidden",
          wordBreak: "break-word", maxWidth: 280,
        }} title={riga.descrizione_raw}>
          {riga.descrizione_raw || "—"}
        </div>
        {riga.motivo && (
          <div style={{ fontSize: 10, color: "var(--text2)", marginTop: 2 }}>
            {riga.motivo}
          </div>
        )}
        {riga.isDuplicate && (
          <div style={{ fontSize: 10, color: "var(--red)", marginTop: 2, fontWeight: 600 }}>
            ⚠ possibile duplicato
          </div>
        )}
      </td>

      {/* Importo */}
      <td style={{
        textAlign: "right", fontWeight: 700, fontSize: 13, padding: "6px 8px", width: 88,
        color: (parseInt(riga.segno) || 1) < 0 ? "var(--red)" : "var(--green)",
        whiteSpace: "nowrap",
      }}>
        {fmtI(riga.importo, parseInt(riga.segno) || 1)}
      </td>

      {/* Appartamento */}
      <td style={{ padding: "4px 6px", width: 138 }}>
        <select value={riga.appartamento_id || ""} onChange={e => handleApp(e.target.value)}
          style={{ width: "100%", fontSize: 12, padding: "3px 4px" }}>
          <option value="">— Nessuno —</option>
          {appartamenti.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
      </td>

      {/* Inquilino */}
      <td style={{ padding: "4px 6px", width: 130 }}>
        <select value={riga.componente_id || ""} onChange={e => handleComp(e.target.value)}
          style={{ width: "100%", fontSize: 12, padding: "3px 4px" }}
          disabled={!riga.appartamento_id}>
          <option value="">— Nessuno —</option>
          {comps.map(c => <option key={c.id} value={c.id}>{c.cognome || ""} {c.nome || ""}</option>)}
        </select>
      </td>

      {/* Mese rif */}
      <td style={{ padding: "4px 6px", width: 98 }}>
        <input type="month" value={riga.mese_riferimento || ""}
          onChange={e => onUpdate(idx, { mese_riferimento: e.target.value })}
          style={{ width: "100%", fontSize: 12, padding: "3px 4px" }} />
      </td>

      {/* Tipo versamento */}
      <td style={{ padding: "4px 6px", width: 110 }}>
        <select value={riga.tipo_versamento || ""}
          onChange={e => onUpdate(idx, { tipo_versamento: e.target.value })}
          style={{ width: "100%", fontSize: 12, padding: "3px 4px" }}>
          <option value="">— Tipo —</option>
          {(tipiVersamento || []).map(t => (
            <option key={t.id} value={t.nome}>{t.nome}</option>
          ))}
        </select>
      </td>

      {/* Confidenza */}
      <td style={{ textAlign: "center", width: 52, padding: "6px 4px" }}>
        <span style={{
          display: "inline-block", padding: "2px 6px", borderRadius: 10,
          fontSize: 10, fontWeight: 700, background: bc.bg, color: bc.color,
        }} title={riga.motivo || "Nessun match"}>
          {riga.confidenza}%
        </span>
      </td>

      {/* Regola */}
      <td style={{ textAlign: "center", width: 52, padding: "6px 4px" }}>
        <input type="checkbox" checked={!!regola}
          onChange={e => onToggleRegola(idx, e.target.checked)}
          title="Crea regola di associazione per questa riga" />
      </td>
    </tr>
  );
}

// ── Pannello regole da creare ─────────────────────────────────────────────────

function RegolaPanel({ righe, righeRegola, onChangeStringa }) {
  const entries = Object.entries(righeRegola);
  if (!entries.length) return null;

  return (
    <div style={{
      border: "1px solid rgba(59,130,246,0.4)", borderRadius: 8,
      background: "rgba(59,130,246,0.05)", padding: 12,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 8 }}>
        <i className="ti ti-list-check" style={{ marginRight: 5 }} />
        Regole da creare ({entries.length}) — modifica la stringa se necessario
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {entries.map(([idx, stringa]) => {
          const r = righe[parseInt(idx)];
          if (!r) return null;
          const appNome = r._appNome || "—";
          return (
            <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={stringa}
                onChange={e => onChangeStringa(parseInt(idx), e.target.value)}
                style={{ flex: 1, fontSize: 11, padding: "3px 6px", fontFamily: "monospace" }}
                placeholder="stringa da cercare…"
              />
              <span style={{ fontSize: 11, color: "var(--text2)", whiteSpace: "nowrap" }}>
                → {r.componente_id
                  ? `${r._compLabel || "inquilino"} (${appNome})`
                  : appNome}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Fase duplicati ────────────────────────────────────────────────────────────

function DuplicatiPanel({ selezionate, duplicatiInfo, onImporta, onBack, importing }) {
  const [sel, setSel] = useState(() =>
    duplicatiInfo.map(d => !d.duplicati?.length)
  );

  const nDup     = duplicatiInfo.filter(d => d.duplicati?.length).length;
  const nOk      = selezionate.length - nDup;
  const toImport = selezionate.filter((_, i) => sel[i]);

  function toggleAll(v) { setSel(prev => prev.map(() => v)); }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Sommario */}
      <div style={{
        display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center",
        background: "var(--bg2)", border: "1px solid var(--border)",
        borderRadius: 8, padding: "10px 14px", fontSize: 12,
      }}>
        <span><strong>{selezionate.length}</strong> righe totali</span>
        <span style={{ color: "var(--green)" }}>
          <i className="ti ti-circle-check" style={{ marginRight: 4 }} />
          <strong>{nOk}</strong> senza problemi
        </span>
        {nDup > 0 && (
          <span style={{ color: "var(--red)" }}>
            <i className="ti ti-alert-triangle" style={{ marginRight: 4 }} />
            <strong>{nDup}</strong> possibili duplicati
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => toggleAll(true)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--accent)" }}>
          Seleziona tutto
        </button>
        <button onClick={() => toggleAll(false)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text2)" }}>
          Deseleziona tutto
        </button>
        <button onClick={() => setSel(duplicatiInfo.map(d => !d.duplicati?.length))}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#ca8a04" }}>
          Solo non duplicati
        </button>
      </div>

      {/* Tabella */}
      <div style={{ overflowY: "auto", maxHeight: "55vh", border: "1px solid var(--border)", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead style={{ position: "sticky", top: 0, background: "var(--bg2)", zIndex: 10 }}>
            <tr style={{ borderBottom: "2px solid var(--border)" }}>
              <th style={{ width: 36, padding: "6px 8px", textAlign: "center" }}>
                <input type="checkbox" checked={sel.every(Boolean)} onChange={e => toggleAll(e.target.checked)} />
              </th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Data</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Descrizione</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Importo</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Appartamento</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Inquilino</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Mese</th>
              <th style={{ padding: "6px 8px", textAlign: "center" }}>Stato</th>
            </tr>
          </thead>
          <tbody>
            {selezionate.map((r, i) => {
              const hasDup = duplicatiInfo[i]?.duplicati?.length > 0;
              const dups   = duplicatiInfo[i]?.duplicati || [];
              const rowBg  = hasDup ? "rgba(239,68,68,0.06)" : "rgba(34,197,94,0.04)";
              return [
                <tr key={`r-${i}`} style={{ background: rowBg, borderTop: "1px solid var(--border)", opacity: sel[i] ? 1 : 0.45 }}>
                  <td style={{ textAlign: "center", padding: "6px 8px" }}>
                    <input type="checkbox" checked={!!sel[i]}
                      onChange={e => setSel(prev => prev.map((v, j) => j === i ? e.target.checked : v))} />
                  </td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{fmt(r.data)}</td>
                  <td style={{ padding: "6px 8px", maxWidth: 260 }}>
                    <div style={{
                      display: "-webkit-box", WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical", overflow: "hidden",
                      wordBreak: "break-word", lineHeight: 1.4,
                    }} title={r.descrizione_raw}>{r.descrizione_raw || "—"}</div>
                  </td>
                  <td style={{
                    padding: "6px 8px", textAlign: "right", fontWeight: 700,
                    color: (parseInt(r.segno) || 1) < 0 ? "var(--red)" : "var(--green)", whiteSpace: "nowrap",
                  }}>
                    {fmtI(r.importo, parseInt(r.segno) || 1)}
                  </td>
                  <td style={{ padding: "6px 8px" }}>{r._appNome || r.appartamento_id || "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{r._compLabel || "—"}</td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                    {r.mese_riferimento ? mesL(r.mese_riferimento) : "—"}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                    {hasDup ? (
                      <span style={{
                        display: "inline-block", padding: "2px 8px", borderRadius: 10,
                        fontSize: 10, fontWeight: 700,
                        background: "rgba(239,68,68,0.18)", color: "var(--red)",
                      }}>⚠ duplicato</span>
                    ) : (
                      <span style={{
                        display: "inline-block", padding: "2px 8px", borderRadius: 10,
                        fontSize: 10, fontWeight: 700,
                        background: "rgba(34,197,94,0.18)", color: "var(--green)",
                      }}>✓ ok</span>
                    )}
                  </td>
                </tr>,
                hasDup && (
                  <tr key={`d-${i}`} style={{ background: "rgba(239,68,68,0.04)" }}>
                    <td />
                    <td colSpan={7} style={{ padding: "4px 8px 8px 8px" }}>
                      <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 3 }}>Già presente in archivio:</div>
                      {dups.map(ex => (
                        <div key={ex.id} style={{
                          display: "flex", gap: 10, flexWrap: "wrap",
                          background: "var(--bg2)", borderRadius: 5,
                          padding: "4px 10px", marginBottom: 3, fontSize: 11,
                          borderLeft: "3px solid rgba(239,68,68,0.5)",
                        }}>
                          <span style={{ color: "var(--text2)" }}>{fmt(ex.data_versamento)}</span>
                          <span style={{ fontWeight: 700 }}>{fmtI(parseFloat(ex.importo), parseInt(ex.segno) || 1)}</span>
                          <span>{ex.app_nome || "—"}</span>
                          {ex.comp_nome && <span style={{ color: "var(--text2)" }}>{ex.comp_nome}</span>}
                          {ex.mese_riferimento && <span style={{ color: "var(--text2)" }}>{mesL(ex.mese_riferimento)}</span>}
                          {ex.descrizione && (
                            <span style={{
                              color: "var(--text2)", overflow: "hidden",
                              textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240,
                            }}>{ex.descrizione}</span>
                          )}
                        </div>
                      ))}
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Btn variant="ghost" onClick={onBack} disabled={importing}>
          <i className="ti ti-arrow-left" /> Torna alla revisione
        </Btn>
        <div style={{ flex: 1, fontSize: 12, color: "var(--text2)" }}>
          {toImport.length} di {selezionate.length} righe saranno importate
        </div>
        <Btn variant="primary" onClick={() => onImporta(toImport)} disabled={importing || !toImport.length}>
          <i className={`ti ${importing ? "ti-loader" : "ti-cloud-upload"}`} />
          {importing ? "Importazione…" : `Importa ${toImport.length} righe`}
        </Btn>
      </div>
    </div>
  );
}

// ── Tab Regole salvate ─────────────────────────────────────────────────────────

const EMPTY_FORM = { stringa: "", appartamento_id: "", componente_id: "", tipo_riga: "", note: "" };

function RegoleTab({ appartamenti, tipiVersamento: tipiVProp, tipiSpesa: tipiSProp }) {
  const [regole,          setRegole]         = useState([]);
  const [loading,         setLoading]        = useState(false);
  const [form,            setForm]           = useState(EMPTY_FORM);
  const [editingId,       setEditingId]      = useState(null);
  const [editForm,        setEditForm]       = useState(EMPTY_FORM);
  const [tipiVersamento,  setTipiVersamento] = useState(tipiVProp || []);
  const [tipiSpesa,       setTipiSpesa]      = useState(tipiSProp || []);

  async function load() {
    setLoading(true);
    try { setRegole(await importazioneApi.listRegole()); }
    catch (e) { alert("Errore: " + e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    // carica sempre in autonomia — le props del parent potrebbero arrivare in ritardo
    tipiVersamentoApi.list().then(tv => setTipiVersamento(tv || [])).catch(() => {});
    tipiSpesaApi.list()
      .then(ts => setTipiSpesa((ts || []).map(t => ({ ...t, nome: t.descrizione || t.nome }))))
      .catch(() => {});
  }, []);

  async function handleSave() {
    if (!form.stringa.trim()) return;
    try {
      await importazioneApi.saveRegola({
        stringa:        form.stringa.trim(),
        appartamento_id: form.appartamento_id || null,
        componente_id:  form.componente_id   || null,
        tipo_riga:      form.tipo_riga       || null,
        note:           form.note            || null,
      });
      setForm(EMPTY_FORM);
      load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  function startEdit(r) {
    setEditingId(r.id);
    setEditForm({
      stringa:         r.stringa         || "",
      appartamento_id: r.appartamento_id || "",
      componente_id:   r.componente_id   || "",
      tipo_riga:       r.tipo_riga       || "",
      note:            r.note            || "",
    });
  }

  async function handleUpdate() {
    if (!editForm.stringa.trim()) return;
    try {
      await importazioneApi.updateRegola(editingId, {
        stringa:         editForm.stringa.trim(),
        appartamento_id: editForm.appartamento_id || null,
        componente_id:   editForm.componente_id   || null,
        tipo_riga:       editForm.tipo_riga       || null,
        note:            editForm.note            || null,
      });
      setEditingId(null);
      load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  async function handleDelete(id) {
    if (!confirm("Eliminare questa regola?")) return;
    try { await importazioneApi.deleteRegola(id); load(); }
    catch (e) { alert("Errore: " + e.message); }
  }

  const appSelForm = appartamenti.find(a => String(a.id) === form.appartamento_id);
  const compsForm  = appSelForm?.componenti || [];

  const appSelEdit = appartamenti.find(a => String(a.id) === editForm.appartamento_id);
  const compsEdit  = appSelEdit?.componenti || [];

  const labelTipo = (val) => {
    if (!val) return "—";
    if (val === "ignora") return "Ignora";
    return val;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Form nuova regola */}
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--border)",
        borderRadius: 8, padding: 12,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Aggiungi nuova regola
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Stringa da cercare</label>
            <input value={form.stringa}
              onChange={e => setForm(f => ({ ...f, stringa: e.target.value }))}
              placeholder='es. "Mario Rossi" o "AFFITTO LUGO"'
              style={{ width: "100%" }} />
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Appartamento</label>
            <select value={form.appartamento_id}
              onChange={e => setForm(f => ({ ...f, appartamento_id: e.target.value, componente_id: "" }))}
              style={{ width: "100%" }}>
              <option value="">— Nessuno —</option>
              {appartamenti.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Inquilino</label>
            <select value={form.componente_id}
              onChange={e => setForm(f => ({ ...f, componente_id: e.target.value }))}
              style={{ width: "100%" }} disabled={!form.appartamento_id}>
              <option value="">— Nessuno —</option>
              {compsForm.map(c => <option key={c.id} value={c.id}>{c.cognome || ""} {c.nome || ""}</option>)}
            </select>
          </div>
          <div style={{ flex: "0 1 140px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>
              Categoria
              <span style={{ fontWeight: 400, color: "var(--text2)", marginLeft: 4 }}>(versamento/spesa)</span>
            </label>
            <TipoRigaSelect
              value={form.tipo_riga}
              onChange={v => setForm(f => ({ ...f, tipo_riga: v }))}
              tipiVersamento={tipiVersamento}
              tipiSpesa={tipiSpesa}
            />
          </div>
          <Btn variant="primary" onClick={handleSave} disabled={!form.stringa.trim()}>
            <i className="ti ti-plus" /> Aggiungi
          </Btn>
        </div>
      </div>

      {/* Tabella regole esistenti */}
      {loading ? (
        <div style={{ textAlign: "center", color: "var(--text2)", padding: 20 }}>Caricamento…</div>
      ) : !regole.length ? (
        <div style={{ textAlign: "center", color: "var(--text2)", padding: 20 }}>Nessuna regola salvata.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Stringa da cercare</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Appartamento</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Inquilino</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Categoria</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}
                  title="Quante volte questa regola ha trovato una corrispondenza automatica durante l'importazione">
                  Applicazioni <i className="ti ti-info-circle" style={{ fontSize: 10, opacity: 0.6 }} />
                </th>
                <th style={{ width: 72 }} />
              </tr>
            </thead>
            <tbody>
              {regole.map(r => (
                editingId === r.id ? (
                  /* ── Riga in modifica ── */
                  <tr key={r.id} style={{ background: "rgba(59,130,246,0.06)", borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "4px 6px" }}>
                      <input value={editForm.stringa}
                        onChange={e => setEditForm(f => ({ ...f, stringa: e.target.value }))}
                        style={{ width: "100%", fontFamily: "monospace", fontSize: 11 }} />
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      <select value={editForm.appartamento_id}
                        onChange={e => setEditForm(f => ({ ...f, appartamento_id: e.target.value, componente_id: "" }))}
                        style={{ width: "100%", fontSize: 11 }}>
                        <option value="">— Nessuno —</option>
                        {appartamenti.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      <select value={editForm.componente_id}
                        onChange={e => setEditForm(f => ({ ...f, componente_id: e.target.value }))}
                        style={{ width: "100%", fontSize: 11 }}
                        disabled={!editForm.appartamento_id}>
                        <option value="">— Nessuno —</option>
                        {compsEdit.map(c => <option key={c.id} value={c.id}>{c.cognome || ""} {c.nome || ""}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      <TipoRigaSelect
                        value={editForm.tipo_riga}
                        onChange={v => setEditForm(f => ({ ...f, tipo_riga: v }))}
                        tipiVersamento={tipiVersamento}
                        tipiSpesa={tipiSpesa}
                        style={{ fontSize: 11 }}
                      />
                    </td>
                    <td />
                    <td style={{ padding: "4px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={handleUpdate}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--green)", fontSize: 14, marginRight: 6 }}
                        title="Salva modifiche">
                        <i className="ti ti-check" />
                      </button>
                      <button onClick={() => setEditingId(null)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text2)", fontSize: 14 }}
                        title="Annulla">
                        <i className="ti ti-x" />
                      </button>
                    </td>
                  </tr>
                ) : (
                  /* ── Riga normale ── */
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 8px", fontFamily: "monospace", fontSize: 11 }}>{r.stringa}</td>
                    <td style={{ padding: "6px 8px" }}>{r.app_nome || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>
                      {r.comp_cognome || r.comp_nome
                        ? `${r.comp_cognome || ""} ${r.comp_nome || ""}`.trim()
                        : "—"}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      {r.tipo_riga === "ignora" ? (
                        <span style={{ color: "var(--text2)", fontStyle: "italic" }}>Ignora</span>
                      ) : (
                        labelTipo(r.tipo_riga)
                      )}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: "var(--text2)" }}>
                      {r.uso_count > 0 ? r.uso_count : "—"}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => startEdit(r)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: 14, marginRight: 6 }}
                        title="Modifica regola">
                        <i className="ti ti-pencil" />
                      </button>
                      <button onClick={() => handleDelete(r.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", fontSize: 14 }}
                        title="Elimina regola">
                        <i className="ti ti-trash" />
                      </button>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Componente principale ──────────────────────────────────────────────────────

export default function ImportazioneModal({ appartamenti, onSaved, onClose }) {
  const [tab, setTab]                 = useState("import");
  const [fase, setFase]               = useState(0);
  const [righe, setRighe]             = useState([]);
  const [righeRegola, setRigheRegola] = useState({});
  const [loading, setLoading]         = useState(false);
  const [importing, setImporting]     = useState(false);
  const [duplicatiInfo, setDuplicatiInfo]         = useState([]);
  const [selezionatePerDup, setSelezionatePerDup] = useState([]);
  const [risultato, setRisultato]     = useState(null);
  const [tipiVersamento, setTipiVersamento] = useState([]);
  const [tipiSpesa, setTipiSpesa]           = useState([]);
  const fileRef = useRef();

  useEffect(() => {
    tipiVersamentoApi.list().then(tv => setTipiVersamento(tv || [])).catch(() => {});
    tipiSpesaApi.list()
      .then(ts => setTipiSpesa((ts || []).map(t => ({ ...t, nome: t.descrizione || t.nome }))))
      .catch(() => {});
  }, []);

  // ── helpers ────────────────────────────────────────────────────────────────

  const updateRiga = useCallback((idx, patch) => {
    setRighe(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }, []);

  function toggleRegola(idx, checked) {
    setRigheRegola(prev => {
      const next = { ...prev };
      if (checked) next[idx] = righe[idx]?.descrizione_raw || "";
      else         delete next[idx];
      return next;
    });
  }

  function changeStringa(idx, val) {
    setRigheRegola(prev => ({ ...prev, [idx]: val }));
  }

  const righeConLabel = righe.map(r => {
    const app  = appartamenti.find(a => String(a.id) === String(r.appartamento_id));
    const comp = app?.componenti?.find(c => String(c.id) === String(r.componente_id));
    return {
      ...r,
      _appNome:   app?.nome || "",
      _compLabel: comp ? `${comp.cognome || ""} ${comp.nome || ""}`.trim() : "",
    };
  });

  // ── upload ─────────────────────────────────────────────────────────────────

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const { righe: r } = await importazioneApi.parse(file);
      if (!r || !r.length) { alert("Nessuna riga valida trovata nel file."); return; }
      setRighe(r.map(row => ({
        ...row,
        tipo_versamento: row.tipo_versamento || "",
        isDuplicate: false,
      })));
      setRigheRegola({});
      setFase(1);
    } catch (e) {
      alert("Errore nell'analisi del file: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setFase(0); setRighe([]); setRigheRegola({}); setRisultato(null);
    setDuplicatiInfo([]); setSelezionatePerDup([]);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── salva regole ───────────────────────────────────────────────────────────

  async function salvaRegole() {
    for (const [idxStr, stringa] of Object.entries(righeRegola)) {
      if (!stringa.trim()) continue;
      const r = righe[parseInt(idxStr)];
      if (!r) continue;
      try {
        await importazioneApi.saveRegola({
          stringa:         stringa.trim(),
          appartamento_id: r.appartamento_id || null,
          componente_id:   r.componente_id   || null,
          tipo_riga:       r.tipo_versamento || null,
          note:            null,
        });
      } catch { /* ignora errori singoli */ }
    }
  }

  // ── check duplicati e avvio import ─────────────────────────────────────────

  const selezionate = righe.filter(r => r.includi);

  async function handleImportaClick() {
    if (!selezionate.length) { alert("Nessuna riga selezionata."); return; }

    setImporting(true);
    try {
      if (Object.keys(righeRegola).length > 0) await salvaRegole();

      const snap = selezionate.map(r => {
        const app  = appartamenti.find(a => String(a.id) === String(r.appartamento_id));
        const comp = app?.componenti?.find(c => String(c.id) === String(r.componente_id));
        return {
          ...r,
          _appNome:   app?.nome || "",
          _compLabel: comp ? `${comp.cognome || ""} ${comp.nome || ""}`.trim() : "",
        };
      });

      const info   = await importazioneApi.checkDuplicati(snap);
      const hasDup = info.some(d => d.duplicati?.length > 0);

      if (hasDup) {
        setSelezionatePerDup(snap);
        setDuplicatiInfo(info);
        setFase(2);
      } else {
        await doImport(snap);
      }
    } catch (e) {
      alert("Errore: " + e.message);
    } finally {
      setImporting(false);
    }
  }

  async function doImport(listaRighe) {
    const res = await importazioneApi.import(listaRighe);
    setRisultato(res);
    setFase(3);
    onSaved();
  }

  async function handleImportaConfermati(listaRighe) {
    setImporting(true);
    try { await doImport(listaRighe); }
    catch (e) { alert("Errore: " + e.message); }
    finally { setImporting(false); }
  }

  // ── render upload ──────────────────────────────────────────────────────────

  const renderUpload = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="alert alert-info" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <i className="ti ti-info-circle" style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong>Formati supportati:</strong> PDF estratto conto, Excel (.xlsx/.xls), CSV/TXT<br />
          <span style={{ fontSize: 12 }}>
            Il sistema rileva date, importi e associa ogni riga all'appartamento/inquilino
            più probabile usando le regole salvate e la corrispondenza dei nomi.
          </span>
        </div>
      </div>
      <Field label="Seleziona file estratto conto">
        <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv,.txt"
          onChange={handleFile} disabled={loading} />
      </Field>
      {loading && (
        <div style={{ textAlign: "center", color: "var(--text2)", padding: 20 }}>
          <i className="ti ti-loader" style={{ marginRight: 6 }} />
          Analisi in corso…
        </div>
      )}
    </div>
  );

  // ── render revisione ───────────────────────────────────────────────────────

  const renderRevisione = () => {
    const incluse  = righe.filter(r => r.includi).length;
    const matchate = righe.filter(r => r.confidenza > 0).length;
    const totImp   = righe
      .filter(r => r.includi && (parseInt(r.segno) || 1) > 0)
      .reduce((s, r) => s + parseFloat(r.importo || 0), 0);
    const nRegole  = Object.keys(righeRegola).length;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Sommario */}
        <div style={{
          display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center",
          background: "var(--bg2)", borderRadius: 8, padding: "8px 14px",
          border: "1px solid var(--border)", fontSize: 12,
        }}>
          <span><strong>{righe.length}</strong> righe</span>
          <span style={{ color: "var(--text2)" }}>·</span>
          <span><strong style={{ color: "var(--green)" }}>{matchate}</strong> con match</span>
          <span style={{ color: "var(--text2)" }}>·</span>
          <span><strong style={{ color: "var(--accent)" }}>{incluse}</strong> selezionate</span>
          <span style={{ color: "var(--text2)" }}>·</span>
          <span>Entrate: <strong style={{ color: "var(--green)" }}>{euro(totImp)}</strong></span>
          <div style={{ flex: 1 }} />
          <button onClick={() => setRighe(r => r.map(x => ({ ...x, includi: true })))}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--accent)" }}>
            Seleziona tutto
          </button>
          <button onClick={() => setRighe(r => r.map(x => ({ ...x, includi: false })))}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text2)" }}>
            Deseleziona tutto
          </button>
        </div>

        {/* Tabella */}
        <div style={{ overflowX: "auto", maxHeight: "52vh", overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, background: "var(--bg2)", zIndex: 10 }}>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                <th style={{ width: 32, padding: "6px 4px", textAlign: "center" }}>
                  <input type="checkbox"
                    checked={righe.length > 0 && righe.every(r => r.includi)}
                    onChange={e => setRighe(r => r.map(x => ({ ...x, includi: e.target.checked })))} />
                </th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Data</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Descrizione / Match</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>Importo</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Appartamento</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Inquilino</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Mese</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Tipo</th>
                <th style={{ textAlign: "center", padding: "6px 4px", width: 52 }}>Match</th>
                <th style={{ textAlign: "center", padding: "6px 4px", width: 52 }}
                  title="Crea regola di associazione per questa riga">Regola</th>
              </tr>
            </thead>
            <tbody>
              {righeConLabel.map((r, i) => (
                <RigaRevisione
                  key={i} riga={r} idx={i}
                  appartamenti={appartamenti}
                  tipiVersamento={tipiVersamento}
                  regola={righeRegola.hasOwnProperty(i)}
                  onUpdate={updateRiga}
                  onToggleRegola={toggleRegola}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Pannello regole */}
        {nRegole > 0 && (
          <RegolaPanel
            righe={righeConLabel}
            righeRegola={righeRegola}
            onChangeStringa={changeStringa}
          />
        )}
      </div>
    );
  };

  // ── render completato ──────────────────────────────────────────────────────

  const renderDone = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", padding: "20px 0" }}>
      <i className="ti ti-circle-check" style={{ fontSize: 48, color: "var(--green)" }} />
      <h3 style={{ margin: 0 }}>Importazione completata</h3>
      <div style={{ display: "flex", gap: 24, fontSize: 14 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: "var(--green)" }}>{risultato?.salvati ?? 0}</div>
          <div style={{ color: "var(--text2)" }}>Movimenti creati</div>
        </div>
        {risultato?.errori?.length > 0 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, fontWeight: 700, color: "var(--red)" }}>{risultato.errori.length}</div>
            <div style={{ color: "var(--text2)" }}>Errori</div>
          </div>
        )}
      </div>
      {risultato?.errori?.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--red)", maxHeight: 80, overflowY: "auto", width: "100%", padding: "0 8px" }}>
          {risultato.errori.map((e, i) => <div key={i}>{e.riga}: {e.errore}</div>)}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <Btn variant="secondary" onClick={reset}><i className="ti ti-upload" /> Importa altro</Btn>
        <Btn variant="primary" onClick={onClose}><i className="ti ti-check" /> Chiudi</Btn>
      </div>
    </div>
  );

  // ── tabs ───────────────────────────────────────────────────────────────────

  const tabStyle = active => ({
    padding: "8px 18px", cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 400,
    color: active ? "var(--accent)" : "var(--text2)", background: "none", border: "none",
    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
  });

  // ── footer ─────────────────────────────────────────────────────────────────

  const footer = (fase === 0 || fase === 1) ? (
    <>
      <Btn variant="ghost" onClick={onClose} disabled={importing}>Annulla</Btn>
      <div style={{ flex: 1 }} />
      {fase === 1 && (
        <>
          <Btn variant="secondary" onClick={reset} disabled={importing}>
            <i className="ti ti-arrow-left" /> Altro file
          </Btn>
          <Btn variant="primary" onClick={handleImportaClick}
            disabled={importing || !selezionate.length}>
            <i className={`ti ${importing ? "ti-loader" : "ti-cloud-upload"}`} />
            {importing ? "Verifica…" : `Importa ${selezionate.length} righe`}
          </Btn>
        </>
      )}
    </>
  ) : null;

  const nDupTrovati = duplicatiInfo.filter(d => d.duplicati?.length).length;
  const title = fase === 2
    ? `Verifica duplicati — ${nDupTrovati} su ${selezionatePerDup.length} righe`
    : "Importa da estratto conto";

  return (
    <Modal title={title} onClose={onClose} width={fase === 1 ? 1120 : 680} resizable footer={footer}>

      {fase < 2 && (
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 14 }}>
          <button style={tabStyle(tab === "import")} onClick={() => setTab("import")}>
            <i className="ti ti-file-import" style={{ marginRight: 5 }} />Importa
          </button>
          <button style={tabStyle(tab === "regole")} onClick={() => setTab("regole")}>
            <i className="ti ti-list-check" style={{ marginRight: 5 }} />Regole di associazione
          </button>
        </div>
      )}

      {tab === "import" && fase === 0 && renderUpload()}
      {tab === "import" && fase === 1 && renderRevisione()}
      {tab === "import" && fase === 2 && (
        <DuplicatiPanel
          selezionate={selezionatePerDup}
          duplicatiInfo={duplicatiInfo}
          onImporta={handleImportaConfermati}
          onBack={() => setFase(1)}
          importing={importing}
        />
      )}
      {tab === "import" && fase === 3 && renderDone()}
      {tab === "regole" && (
        <RegoleTab
          appartamenti={appartamenti}
          tipiVersamento={tipiVersamento}
          tipiSpesa={tipiSpesa}
        />
      )}
    </Modal>
  );
}
