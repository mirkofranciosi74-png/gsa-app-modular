/**
 * ImportazioneV2Modal — importa estratto conto (PDF / Excel / CSV) in Economia v2.
 *
 * Fasi:
 *  0  upload file
 *  1  revisione tabella (includi / associa immobile+persona+tipologia)
 *  2  verifica duplicati
 *  3  riepilogo completamento
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { importazioneV2, fattiV2, tipologieV2 } from "../api/apiV2.js";
import { Modal, Btn, Field } from "./ui.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtEur = v => (v == null ? "—" : Number(v).toLocaleString("it-IT", { style: "currency", currency: "EUR" }));
const fmtData = iso => {
  if (!iso) return "—";
  try { return new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { dateStyle: "short" }); }
  catch { return iso; }
};
const fmtImp = (v, segno) => `${segno < 0 ? "-" : "+"}${fmtEur(Math.abs(v))}`;

function defaultPersone(imm, tipo) {
  const persone = imm?.persone || [];
  const props   = persone.filter(p => p.ruolo === "proprietario");
  const inq     = persone.filter(p => p.ruolo === "inquilino");

  // default_incassante: proprietario marcato come incassante di default, altrimenti primo prop
  const defIncassante = (props.find(p => p.default_incassante) || props[0])?.id || "";

  if (tipo === "entrata") {
    // chi paga: primo inquilino (per nome/cognome); chi incassa: proprietario default_incassante
    return {
      personaId:           inq[0]?.id    || "",
      personaIncassanteId: defIncassante,
    };
  }
  // spesa: chi paga = proprietario con default_pagante, altrimenti primo prop
  return {
    personaId:           (props.find(p => p.default_pagante) || props[0])?.id || "",
    personaIncassanteId: "",
  };
}

function badgeConf(c) {
  if (c >= 90) return { bg: "rgba(34,197,94,0.18)",   color: "var(--green)"  };
  if (c >= 70) return { bg: "rgba(59,130,246,0.18)",  color: "var(--accent)" };
  if (c >= 50) return { bg: "rgba(234,179,8,0.18)",   color: "#ca8a04"       };
  if (c >   0) return { bg: "rgba(249,115,22,0.18)",  color: "#ea580c"       };
  return              { bg: "rgba(107,114,128,0.15)", color: "var(--text2)"  };
}

// ── Riga tabella revisione ────────────────────────────────────────────────────
function RigaRevisione({ riga, idx, immobili, tipologie, regola, onUpdate, onToggleRegola }) {
  const immSel = immobili.find(i => i.id === riga.immobileId);
  const persone = immSel?.persone || [];
  const bc = badgeConf(riga.confidenza);

  const tipoAuto = (parseInt(riga.segno) || 1) < 0 ? "spesa" : "entrata";
  const rowBg = !riga.includi
    ? "rgba(107,114,128,0.05)"
    : riga.isDuplicate ? "rgba(239,68,68,0.07)" : "";

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
        {fmtData(riga.data)}
      </td>

      {/* Descrizione */}
      <td style={{ padding: "6px 8px" }}>
        <div style={{
          fontSize: 12, lineHeight: 1.4, maxWidth: 240,
          display: "-webkit-box", WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word",
        }} title={riga.descrizione_raw}>
          {riga.descrizione_raw || "—"}
        </div>
        {riga.motivo && <div style={{ fontSize: 10, color: "var(--text2)", marginTop: 2 }}>{riga.motivo}</div>}
        {riga.isDuplicate && <div style={{ fontSize: 10, color: "var(--red)", fontWeight: 600, marginTop: 2 }}>⚠ possibile duplicato</div>}
      </td>

      {/* Importo + tipo */}
      <td style={{
        textAlign: "right", fontWeight: 700, fontSize: 13, padding: "6px 8px", width: 100,
        color: tipoAuto === "spesa" ? "var(--red)" : "var(--green)", whiteSpace: "nowrap",
      }}>
        {fmtImp(riga.importo, parseInt(riga.segno) || 1)}
        <div style={{ fontSize: 10, fontWeight: 400, color: "var(--text2)" }}>{tipoAuto}</div>
      </td>

      {/* Appartamento */}
      <td style={{ padding: "4px 6px", width: 140 }}>
        <select value={riga.immobileId || ""} style={{ width: "100%", fontSize: 12, padding: "3px 4px" }}
                onChange={e => onUpdate(idx, { immobileId: e.target.value, personaId: "" })}>
          <option value="">— Nessuno —</option>
          {immobili.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
        </select>
      </td>

      {/* Persona pagante / incassante */}
      <td style={{ padding: "4px 6px", width: 155 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div>
            <div style={{ fontSize: 9, color: "var(--text2)", marginBottom: 1 }}>
              {tipoAuto === "entrata" ? "Chi ha pagato" : "Chi ha pagato"}
            </div>
            <select value={riga.personaId || ""} style={{ width: "100%", fontSize: 11, padding: "2px 3px" }}
                    disabled={!riga.immobileId}
                    onChange={e => onUpdate(idx, { personaId: e.target.value })}>
              <option value="">— Nessuno —</option>
              {persone.map(p => (
                <option key={p.id} value={p.id}>
                  {p.cognome || ""} {p.nome || ""}{!p.cognome && !p.nome ? (p.ragione_sociale || "") : ""}
                </option>
              ))}
            </select>
          </div>
          {tipoAuto === "entrata" && (
            <div>
              <div style={{ fontSize: 9, color: "var(--green)", marginBottom: 1 }}>Chi incassa</div>
              <select value={riga.personaIncassanteId || ""} style={{ width: "100%", fontSize: 11, padding: "2px 3px" }}
                      disabled={!riga.immobileId}
                      onChange={e => onUpdate(idx, { personaIncassanteId: e.target.value })}>
                <option value="">— Nessuno —</option>
                {persone.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.cognome || ""} {p.nome || ""}{!p.cognome && !p.nome ? (p.ragione_sociale || "") : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </td>

      {/* Periodo (mese riferimento) */}
      <td style={{ padding: "4px 6px", width: 108 }}>
        <input type="month" value={riga.periodoDa || ""}
               style={{ width: "100%", fontSize: 12, padding: "3px 4px" }}
               onChange={e => onUpdate(idx, { periodoDa: e.target.value })} />
      </td>

      {/* Tipologia */}
      <td style={{ padding: "4px 6px", width: 140 }}>
        <select value={riga.tipoSpesaId || ""} style={{ width: "100%", fontSize: 12, padding: "3px 4px" }}
                onChange={e => onUpdate(idx, { tipoSpesaId: e.target.value })}>
          <option value="">— Tipo —</option>
          {tipologie
            .filter(t => t.tipo === tipoAuto || !t.tipo || t.tipo === "spesa")
            .map(t => <option key={t.id} value={t.id}>{t.descrizione}</option>)
          }
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
      <td style={{ textAlign: "center", width: 44, padding: "6px 4px" }}>
        <input type="checkbox" checked={!!regola}
               onChange={e => onToggleRegola(idx, e.target.checked)}
               title="Crea regola di associazione automatica" />
      </td>
    </tr>
  );
}

// ── Pannello regole da creare ─────────────────────────────────────────────────
function RegolePanel({ righe, righeRegola, onChangeStringa }) {
  const entries = Object.entries(righeRegola);
  if (!entries.length) return null;
  return (
    <div style={{ border: "1px solid rgba(59,130,246,0.4)", borderRadius: 8,
                  background: "rgba(59,130,246,0.05)", padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 8 }}>
        <i className="ti ti-list-check" style={{ marginRight: 5 }} />
        Regole da creare ({entries.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {entries.map(([idx, stringa]) => {
          const r = righe[parseInt(idx)];
          if (!r) return null;
          return (
            <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={stringa} onChange={e => onChangeStringa(parseInt(idx), e.target.value)}
                     style={{ flex: 1, fontSize: 11, padding: "3px 6px", fontFamily: "monospace" }}
                     placeholder="stringa da cercare…" />
              <span style={{ fontSize: 11, color: "var(--text2)", whiteSpace: "nowrap" }}>
                → {r._personaLabel || r._immNome || "—"}
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
  const [sel, setSel] = useState(() => duplicatiInfo.map(d => !d.duplicati?.length));

  const nDup     = duplicatiInfo.filter(d => d.duplicati?.length).length;
  const toImport = selezionate.filter((_, i) => sel[i]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Sommario */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center",
                    background: "var(--bg2)", border: "1px solid var(--border)",
                    borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
        <span><strong>{selezionate.length}</strong> righe totali</span>
        <span style={{ color: "var(--green)" }}>
          <i className="ti ti-circle-check" style={{ marginRight: 4 }} />
          <strong>{selezionate.length - nDup}</strong> senza problemi
        </span>
        {nDup > 0 && (
          <span style={{ color: "var(--red)" }}>
            <i className="ti ti-alert-triangle" style={{ marginRight: 4 }} />
            <strong>{nDup}</strong> possibili duplicati
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setSel(duplicatiInfo.map(() => true))}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--accent)" }}>
          Seleziona tutto
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
                <input type="checkbox" checked={sel.every(Boolean)}
                       onChange={e => setSel(duplicatiInfo.map(() => e.target.checked))} />
              </th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Data</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Descrizione</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Importo</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Appartamento</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Persona</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Periodo</th>
              <th style={{ padding: "6px 8px", textAlign: "center" }}>Stato</th>
            </tr>
          </thead>
          <tbody>
            {selezionate.map((r, i) => {
              const hasDup = duplicatiInfo[i]?.duplicati?.length > 0;
              const dups   = duplicatiInfo[i]?.duplicati || [];
              const tipoA  = (parseInt(r.segno) || 1) < 0 ? "spesa" : "entrata";
              return [
                <tr key={`r-${i}`} style={{
                  background: hasDup ? "rgba(239,68,68,0.06)" : "rgba(34,197,94,0.04)",
                  borderTop: "1px solid var(--border)", opacity: sel[i] ? 1 : 0.45,
                }}>
                  <td style={{ textAlign: "center", padding: "6px 8px" }}>
                    <input type="checkbox" checked={!!sel[i]}
                           onChange={e => setSel(prev => prev.map((v, j) => j === i ? e.target.checked : v))} />
                  </td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{fmtData(r.data)}</td>
                  <td style={{ padding: "6px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={r.descrizione_raw}>{r.descrizione_raw || "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700,
                               color: tipoA === "spesa" ? "var(--red)" : "var(--green)", whiteSpace: "nowrap" }}>
                    {fmtImp(r.importo, parseInt(r.segno) || 1)}
                  </td>
                  <td style={{ padding: "6px 8px" }}>{r._immNome || "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{r._personaLabel || "—"}</td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{r.periodoDa || "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                    {hasDup ? (
                      <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                                     background: "rgba(239,68,68,0.18)", color: "var(--red)" }}>⚠ duplicato</span>
                    ) : (
                      <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                                     background: "rgba(34,197,94,0.18)", color: "var(--green)" }}>✓ ok</span>
                    )}
                  </td>
                </tr>,
                hasDup && (
                  <tr key={`d-${i}`} style={{ background: "rgba(239,68,68,0.04)" }}>
                    <td /><td colSpan={7} style={{ padding: "4px 8px 8px" }}>
                      <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 3 }}>Già presente:</div>
                      {dups.map(ex => (
                        <div key={ex.id} style={{
                          display: "flex", gap: 10, background: "var(--bg2)", borderRadius: 5,
                          padding: "4px 10px", marginBottom: 3, fontSize: 11,
                          borderLeft: "3px solid rgba(239,68,68,0.5)",
                        }}>
                          <span style={{ color: "var(--text2)" }}>{fmtData(ex.rif_da)}</span>
                          <span style={{ fontWeight: 700 }}>{fmtEur(ex.importo)}</span>
                          <span>{ex.immobile_nome || "—"}</span>
                          {ex.persona_nome && <span style={{ color: "var(--text2)" }}>{ex.persona_nome}</span>}
                          {ex.periodo_da && <span style={{ color: "var(--text2)" }}>{ex.periodo_da}</span>}
                          {ex.nome && <span style={{ color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{ex.nome}</span>}
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
          <i className={`ti ${importing ? "ti-loader-2 ti-spin" : "ti-cloud-upload"}`} />
          {importing ? "Importazione…" : `Importa ${toImport.length} righe`}
        </Btn>
      </div>
    </div>
  );
}

// ── Tab Regole salvate ────────────────────────────────────────────────────────
function RegoleTab({ immobili: immobiliProp, tipologie }) {
  const [regole,    setRegole]    = useState([]);
  const [immobili,  setImmobili]  = useState(immobiliProp);
  const [loading,   setLoading]   = useState(false);
  const [form,      setForm]      = useState({ stringa: "", immobileId: "", personaId: "", tipoSpesaId: "", tipoRiga: "", note: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm,  setEditForm]  = useState({ ...form });

  const load = useCallback(async () => {
    setLoading(true);
    try { setRegole(await importazioneV2.listRegole()); }
    catch (e) { alert("Errore: " + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    // Carica sempre immobili con persone, indipendente dal parse
    importazioneV2.immobili().then(setImmobili).catch(() => {});
  }, [load]);

  const immFormSel = immobili.find(i => i.id === form.immobileId);
  const immEditSel = immobili.find(i => i.id === editForm.immobileId);

  async function handleSave() {
    if (!form.stringa.trim()) return;
    try {
      await importazioneV2.saveRegola({
        stringa:     form.stringa.trim(),
        immobileId:  form.immobileId  || null,
        personaId:   form.personaId   || null,
        tipoSpesaId: form.tipoSpesaId || null,
        tipoRiga:    form.tipoRiga    || null,
        note:        form.note        || null,
      });
      setForm({ stringa: "", immobileId: "", personaId: "", tipoSpesaId: "", tipoRiga: "", note: "" });
      load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  async function handleUpdate() {
    if (!editForm.stringa.trim()) return;
    try {
      await importazioneV2.updateRegola(editingId, {
        stringa:     editForm.stringa.trim(),
        immobileId:  editForm.immobileId  || null,
        personaId:   editForm.personaId   || null,
        tipoSpesaId: editForm.tipoSpesaId || null,
        tipoRiga:    editForm.tipoRiga    || null,
        note:        editForm.note        || null,
      });
      setEditingId(null); load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  async function handleDelete(id) {
    if (!confirm("Eliminare questa regola?")) return;
    try { await importazioneV2.deleteRegola(id); load(); }
    catch (e) { alert("Errore: " + e.message); }
  }

  const PersoneSelect = ({ immobileId, value, onChange, style = {} }) => {
    const imm = immobili.find(i => i.id === immobileId);
    return (
      <select value={value} onChange={e => onChange(e.target.value)}
              disabled={!immobileId} style={{ width: "100%", ...style }}>
        <option value="">— Nessuno —</option>
        {(imm?.persone || []).map(p => (
          <option key={p.id} value={p.id}>
            {p.cognome || ""} {p.nome || ""}{!p.cognome && !p.nome ? (p.ragione_sociale || "") : ""}
          </option>
        ))}
      </select>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Form nuova regola */}
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text2)", marginBottom: 8,
                      textTransform: "uppercase", letterSpacing: "0.04em" }}>Aggiungi nuova regola</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 180px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Stringa da cercare</label>
            <input value={form.stringa} onChange={e => setForm(f => ({ ...f, stringa: e.target.value }))}
                   placeholder='es. "Mario Rossi" o "AFFITTO LUGO"' style={{ width: "100%" }} />
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Appartamento</label>
            <select value={form.immobileId}
                    onChange={e => setForm(f => ({ ...f, immobileId: e.target.value, personaId: "" }))}
                    style={{ width: "100%" }}>
              <option value="">— Nessuno —</option>
              {immobili.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Persona</label>
            <PersoneSelect immobileId={form.immobileId} value={form.personaId}
                           onChange={v => setForm(f => ({ ...f, personaId: v }))} />
          </div>
          <div style={{ flex: "0 1 140px" }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 3 }}>Tipologia</label>
            <select value={form.tipoSpesaId} onChange={e => setForm(f => ({ ...f, tipoSpesaId: e.target.value }))}
                    style={{ width: "100%", fontSize: 12 }}>
              <option value="">— Nessuna —</option>
              <optgroup label="Entrate">
                {tipologie.filter(t => t.tipo === "entrata").map(t => <option key={t.id} value={t.id}>{t.descrizione}</option>)}
              </optgroup>
              <optgroup label="Spese">
                {tipologie.filter(t => t.tipo !== "entrata").map(t => <option key={t.id} value={t.id}>{t.descrizione}</option>)}
              </optgroup>
              <option value="__ignora__">— Ignora questa riga —</option>
            </select>
          </div>
          <Btn variant="primary" onClick={handleSave} disabled={!form.stringa.trim()}>
            <i className="ti ti-plus" /> Aggiungi
          </Btn>
        </div>
      </div>

      {/* Tabella regole */}
      {loading ? (
        <div style={{ textAlign: "center", color: "var(--text2)", padding: 20 }}>Caricamento…</div>
      ) : !regole.length ? (
        <div style={{ textAlign: "center", color: "var(--text2)", padding: 20 }}>Nessuna regola salvata.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Stringa</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Appartamento</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Persona</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Tipologia</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>Usi</th>
                <th style={{ width: 72 }} />
              </tr>
            </thead>
            <tbody>
              {regole.map(r => (
                editingId === r.id ? (
                  <tr key={r.id} style={{ background: "rgba(59,130,246,0.06)", borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "4px 6px" }}>
                      <input value={editForm.stringa} onChange={e => setEditForm(f => ({ ...f, stringa: e.target.value }))}
                             style={{ width: "100%", fontFamily: "monospace", fontSize: 11 }} />
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      <select value={editForm.immobileId}
                              onChange={e => setEditForm(f => ({ ...f, immobileId: e.target.value, personaId: "" }))}
                              style={{ width: "100%", fontSize: 11 }}>
                        <option value="">— Nessuno —</option>
                        {immobili.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      <PersoneSelect immobileId={editForm.immobileId} value={editForm.personaId}
                                     onChange={v => setEditForm(f => ({ ...f, personaId: v }))}
                                     style={{ fontSize: 11 }} />
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      <select value={editForm.tipoSpesaId} onChange={e => setEditForm(f => ({ ...f, tipoSpesaId: e.target.value }))}
                              style={{ width: "100%", fontSize: 11 }}>
                        <option value="">— Nessuna —</option>
                        {tipologie.map(t => <option key={t.id} value={t.id}>{t.descrizione}</option>)}
                      </select>
                    </td>
                    <td />
                    <td style={{ padding: "4px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={handleUpdate} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--green)", fontSize: 14, marginRight: 6 }}>
                        <i className="ti ti-check" />
                      </button>
                      <button onClick={() => setEditingId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text2)", fontSize: 14 }}>
                        <i className="ti ti-x" />
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 8px", fontFamily: "monospace", fontSize: 11 }}>{r.stringa}</td>
                    <td style={{ padding: "6px 8px" }}>{r.immobile_nome || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{r.persona_nome || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{r.tipo_spesa_desc || "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: "var(--text2)" }}>{r.uso_count > 0 ? r.uso_count : "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => { setEditingId(r.id); setEditForm({ stringa: r.stringa || "", immobileId: r.immobile_id || "", personaId: r.persona_id || "", tipoSpesaId: r.tipo_spesa_id || "", tipoRiga: r.tipo_riga || "", note: r.note || "" }); }}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: 14, marginRight: 6 }}>
                        <i className="ti ti-pencil" />
                      </button>
                      <button onClick={() => handleDelete(r.id)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", fontSize: 14 }}>
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

// ── Componente principale ─────────────────────────────────────────────────────
export default function ImportazioneV2Modal({ immobili: immobiliProp = [], onSaved, onClose }) {
  const [tab,                   setTab]                   = useState("import");
  const [fase,                  setFase]                  = useState(0);
  const [righe,                 setRighe]                 = useState([]);
  const [immobili,              setImmobili]              = useState(immobiliProp);
  const [tipologie,             setTipologie]             = useState([]);
  const [righeRegola,           setRigheRegola]           = useState({});
  const [loading,               setLoading]               = useState(false);
  const [importing,             setImporting]             = useState(false);
  const [duplicatiInfo,         setDuplicatiInfo]         = useState([]);
  const [selezionatePerDup,     setSelezionatePerDup]     = useState([]);
  const [risultato,             setRisultato]             = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    tipologieV2.lista().then(setTipologie).catch(() => {});
  }, []);

  // ── helpers ────────────────────────────────────────────────────────────────
  const updateRiga = useCallback((idx, patch) => {
    setRighe(prev => {
      const next = prev.map((r, i) => {
        if (i !== idx) return r;
        const merged = { ...r, ...patch };
        // Se cambia immobile, aggiorna label e imposta default persone
        if (patch.immobileId !== undefined) {
          const imm  = immobili.find(im => im.id === patch.immobileId);
          merged._immNome = imm?.nome || "";
          const tipo = (parseInt(merged.segno) || 1) < 0 ? "spesa" : "entrata";
          const def  = imm ? defaultPersone(imm, tipo) : { personaId: "", personaIncassanteId: "" };
          merged.personaId               = def.personaId;
          merged.personaIncassanteId     = def.personaIncassanteId;
          merged._personaLabel           = "";
          merged._personaIncassanteLabel = "";
        }
        // Se cambia persona, aggiorna label
        if (patch.personaId !== undefined && merged.immobileId) {
          const imm = immobili.find(im => im.id === merged.immobileId);
          const p   = (imm?.persone || []).find(p => p.id === patch.personaId);
          merged._personaLabel = p ? `${p.cognome || ""} ${p.nome || ""}`.trim() || p.ragione_sociale || "" : "";
        }
        if (patch.personaIncassanteId !== undefined && merged.immobileId) {
          const imm = immobili.find(im => im.id === merged.immobileId);
          const p   = (imm?.persone || []).find(p => p.id === patch.personaIncassanteId);
          merged._personaIncassanteLabel = p ? `${p.cognome || ""} ${p.nome || ""}`.trim() || p.ragione_sociale || "" : "";
        }
        return merged;
      });
      return next;
    });
  }, [immobili]);

  function toggleRegola(idx, checked) {
    setRigheRegola(prev => {
      const next = { ...prev };
      if (checked) next[idx] = righe[idx]?.descrizione_raw || "";
      else delete next[idx];
      return next;
    });
  }

  function changeStringa(idx, val) {
    setRigheRegola(prev => ({ ...prev, [idx]: val }));
  }

  const righeConLabel = righe.map(r => {
    const imm = immobili.find(i => i.id === r.immobileId);
    const p   = (imm?.persone || []).find(p => p.id === r.personaId);
    return {
      ...r,
      _immNome:      imm?.nome || r._immNome || "",
      _personaLabel: p
        ? (`${p.cognome || ""} ${p.nome || ""}`.trim() || p.ragione_sociale || "")
        : (r._personaLabel || ""),
    };
  });

  // ── upload ─────────────────────────────────────────────────────────────────
  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const { righe: r, immobili: imm } = await importazioneV2.parse(file);
      if (!r?.length) { alert("Nessuna riga valida trovata nel file."); return; }
      if (imm?.length) setImmobili(imm);
      setRighe(r.map(row => {
        const immObj = (imm || []).find(i => i.id === row.immobileId);
        const tipo   = (parseInt(row.segno) || 1) < 0 ? "spesa" : "entrata";
        const def    = immObj ? defaultPersone(immObj, tipo) : { personaId: "", personaIncassanteId: "" };
        return {
          ...row,
          isDuplicate:             false,
          personaId:               row.personaId || def.personaId,
          personaIncassanteId:     def.personaIncassanteId,
          _immNome:                immObj?.nome || "",
          _personaLabel:           "",
          _personaIncassanteLabel: "",
        };
      }));
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
        await importazioneV2.saveRegola({
          stringa:     stringa.trim(),
          immobileId:  r.immobileId  || null,
          personaId:   r.personaId   || null,
          tipoSpesaId: r.tipoSpesaId || null,
          tipoRiga:    (parseInt(r.segno) || 1) < 0 ? "spesa" : "entrata",
        });
      } catch { /* ignora errori singoli */ }
    }
  }

  // ── import effettivo ───────────────────────────────────────────────────────
  async function doImport(listaRighe) {
    let salvati = 0;
    const errori = [];

    for (const r of listaRighe) {
      try {
        const segno = parseInt(r.segno) || 1;
        const tipo  = segno < 0 ? "spesa" : "entrata";
        await fattiV2.crea({
          tipo,
          immobileId:           r.immobileId           || null,
          tipoSpesaId:          r.tipoSpesaId          || null,
          importo:              r.importo,
          dataPagamento:        r.data                 || null,
          rifDa:                r.data                 || null,
          periodoDa:            r.periodoDa            || null,
          nome:                 (r.descrizione_raw || "").slice(0, 120),
          descrizione:          r.descrizione_raw      || null,
          soggettoPaganteId:    r.personaId            || null,
          soggettoIncassanteId: tipo === "entrata"
                                  ? (r.personaIncassanteId || null)
                                  : null,
        });
        salvati++;
      } catch (e) {
        errori.push({ riga: r.descrizione_raw, errore: e.message });
      }
    }

    setRisultato({ salvati, errori });
    setFase(3);
    onSaved();
  }

  const selezionate = righe.filter(r => r.includi);

  async function handleImportaClick() {
    if (!selezionate.length) { alert("Nessuna riga selezionata."); return; }
    setImporting(true);
    try {
      if (Object.keys(righeRegola).length > 0) await salvaRegole();

      const snap = righeConLabel.filter(r => r.includi);
      const info = await importazioneV2.checkDuplicati(snap);
      const hasDup = info.some(d => d.duplicati?.length > 0);

      if (hasDup) {
        setSelezionatePerDup(snap); setDuplicatiInfo(info); setFase(2);
      } else {
        await doImport(snap);
      }
    } catch (e) {
      alert("Errore: " + e.message);
    } finally {
      setImporting(false);
    }
  }

  async function handleImportaConfermati(listaRighe) {
    setImporting(true);
    try { await doImport(listaRighe); }
    catch (e) { alert("Errore: " + e.message); }
    finally { setImporting(false); }
  }

  // ── sommario upload ────────────────────────────────────────────────────────
  const renderUpload = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start",
                    background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)",
                    borderRadius: 8, padding: "12px 14px", fontSize: 13 }}>
        <i className="ti ti-info-circle" style={{ fontSize: 18, color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
        <div>
          <strong>Formati supportati:</strong> PDF estratto conto, Excel (.xlsx / .xls), CSV / TXT<br />
          <span style={{ fontSize: 12, color: "var(--text2)" }}>
            Il sistema rileva date, importi e associa ogni riga all'appartamento e alla persona più
            probabile usando le regole salvate e la corrispondenza dei nomi.
            Le righe positive diventano <strong>Entrate</strong>, le negative <strong>Spese</strong>.
          </span>
        </div>
      </div>
      <Field label="Seleziona file estratto conto">
        <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv,.txt"
               onChange={handleFile} disabled={loading} />
      </Field>
      {loading && (
        <div style={{ textAlign: "center", color: "var(--text2)", padding: 20 }}>
          <i className="ti ti-loader-2 ti-spin" style={{ marginRight: 6 }} />Analisi in corso…
        </div>
      )}
    </div>
  );

  // ── revisione ──────────────────────────────────────────────────────────────
  const renderRevisione = () => {
    const incluse  = righe.filter(r => r.includi).length;
    const matchate = righe.filter(r => r.confidenza > 0).length;
    const totEnt   = righe.filter(r => r.includi && (parseInt(r.segno) || 1) > 0).reduce((s, r) => s + parseFloat(r.importo || 0), 0);
    const totSpe   = righe.filter(r => r.includi && (parseInt(r.segno) || 1) < 0).reduce((s, r) => s + parseFloat(r.importo || 0), 0);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Sommario */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center",
                      background: "var(--bg2)", borderRadius: 8, padding: "8px 14px",
                      border: "1px solid var(--border)", fontSize: 12 }}>
          <span><strong>{righe.length}</strong> righe</span>
          <span style={{ color: "var(--text2)" }}>·</span>
          <span><strong style={{ color: "var(--accent)" }}>{matchate}</strong> con match</span>
          <span style={{ color: "var(--text2)" }}>·</span>
          <span><strong>{incluse}</strong> selezionate</span>
          <span style={{ color: "var(--text2)" }}>·</span>
          <span>Ent: <strong style={{ color: "var(--green)" }}>{fmtEur(totEnt)}</strong></span>
          <span style={{ color: "var(--text2)" }}>·</span>
          <span>Spe: <strong style={{ color: "var(--red)" }}>{fmtEur(totSpe)}</strong></span>
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
        <div style={{ overflowX: "auto", maxHeight: "52vh", overflowY: "auto",
                      border: "1px solid var(--border)", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, background: "var(--bg2)", zIndex: 10 }}>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                <th style={{ width: 32, padding: "6px 4px", textAlign: "center" }}>
                  <input type="checkbox" checked={righe.length > 0 && righe.every(r => r.includi)}
                         onChange={e => setRighe(r => r.map(x => ({ ...x, includi: e.target.checked })))} />
                </th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Data</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Descrizione / Match</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>Importo</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Appartamento</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Chi paga / incassa</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Periodo</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Tipologia</th>
                <th style={{ textAlign: "center", padding: "6px 4px", width: 52 }}>Match</th>
                <th style={{ textAlign: "center", padding: "6px 4px", width: 44 }}
                    title="Crea regola di associazione automatica">Regola</th>
              </tr>
            </thead>
            <tbody>
              {righeConLabel.map((r, i) => (
                <RigaRevisione
                  key={i} riga={r} idx={i}
                  immobili={immobili} tipologie={tipologie}
                  regola={Object.prototype.hasOwnProperty.call(righeRegola, i)}
                  onUpdate={updateRiga}
                  onToggleRegola={toggleRegola}
                />
              ))}
            </tbody>
          </table>
        </div>

        {Object.keys(righeRegola).length > 0 && (
          <RegolePanel righe={righeConLabel} righeRegola={righeRegola} onChangeStringa={changeStringa} />
        )}
      </div>
    );
  };

  // ── completato ─────────────────────────────────────────────────────────────
  const renderDone = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", padding: "24px 0" }}>
      <i className="ti ti-circle-check" style={{ fontSize: 52, color: "var(--green)" }} />
      <h3 style={{ margin: 0 }}>Importazione completata</h3>
      <div style={{ display: "flex", gap: 32, fontSize: 14 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: "var(--green)" }}>{risultato?.salvati ?? 0}</div>
          <div style={{ color: "var(--text2)" }}>Fatti creati</div>
        </div>
        {risultato?.errori?.length > 0 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, fontWeight: 700, color: "var(--red)" }}>{risultato.errori.length}</div>
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

  // ── render ─────────────────────────────────────────────────────────────────
  const tabStyle = active => ({
    padding: "8px 18px", cursor: "pointer", fontSize: 13,
    fontWeight: active ? 700 : 400,
    color: active ? "var(--accent)" : "var(--text2)",
    background: "none", border: "none",
    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
  });

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
            <i className={`ti ${importing ? "ti-loader-2 ti-spin" : "ti-cloud-upload"}`} />
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
    <Modal title={title} onClose={onClose} width={fase === 1 ? 1140 : 700} resizable footer={footer}>
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
        <RegoleTab immobili={immobili} tipologie={tipologie} />
      )}
    </Modal>
  );
}
