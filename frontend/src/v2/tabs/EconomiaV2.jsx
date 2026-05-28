import { useState, useEffect, useCallback, useRef } from "react";
import { fattiV2, immobiliV2, condominiV2, tipologieV2 } from "../api/apiV2.js";
import { Btn, Badge, Modal, Field } from "../../components/ui.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtEur = v =>
  v == null ? "—" : Number(v).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

const fmtData = iso => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("it-IT", { dateStyle: "short" }); }
  catch { return iso; }
};

const TIPO_COLOR     = { spesa: "blue",  entrata: "green" };
const TIPO_LABEL     = { spesa: "Spesa", entrata: "Entrata" };
const LEGACY_LABEL   = { documento: "Doc. inq.", spesa_proprietario: "Spesa prop.", movimento: "Entrata" };
const STATO_COLOR    = { normale: "gray", da_verificare: "yellow", duplicato: "red", verificato: "green" };
const PERIODICITA_OPTS = [
  { value: "una_tantum",   label: "Una tantum" },
  { value: "mensile",      label: "Mensile" },
  { value: "bimestrale",   label: "Bimestrale" },
  { value: "trimestrale",  label: "Trimestrale" },
  { value: "semestrale",   label: "Semestrale" },
  { value: "annuale",      label: "Annuale" },
];
const MESI_STEP = { mensile: 1, bimestrale: 2, trimestrale: 3, semestrale: 6, annuale: 12 };

function calcolaRate(periodicita, rifDa, rifA, importo) {
  if (periodicita === "una_tantum" || !rifDa || !rifA) return [];
  const step = MESI_STEP[periodicita] || 1;
  const [ya, ma] = rifDa.split("-").map(Number);
  const [yb, mb] = rifA.split("-").map(Number);
  const nRate = Math.max(1, Math.floor(((yb - ya) * 12 + (mb - ma) + 1) / step));
  const importoRate = importo ? Math.round((Number(importo) / nRate) * 100) / 100 : null;
  return Array.from({ length: nRate }, (_, i) => {
    const mesi = ya * 12 + ma - 1 + i * step;
    const m = (mesi % 12) + 1;
    const y = Math.floor(mesi / 12);
    return { periodo: `${y}-${String(m).padStart(2, "0")}`, importo: importoRate };
  });
}

// ── Sub-tabs ──────────────────────────────────────────────────────────────────
function SubTabs({ active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
      {[
        { id: "movimenti",  icon: "ti-coin",    label: "Movimenti" },
        { id: "tipologie",  icon: "ti-tags",    label: "Tipologie" },
      ].map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          padding: "8px 18px", border: "none", background: "none", cursor: "pointer",
          fontSize: 13, display: "flex", alignItems: "center", gap: 6,
          color: active === t.id ? "var(--accent)" : "var(--text2)",
          fontWeight: active === t.id ? 700 : 400,
          borderBottom: active === t.id ? "2px solid var(--accent)" : "2px solid transparent",
          marginBottom: -1, transition: "all 0.15s",
        }}>
          <i className={`ti ${t.icon}`} style={{ fontSize: 14 }} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Modale Duplicati File ─────────────────────────────────────────────────────
function DuplicatiModal({ hash, duplicati, onProcedi, onAnnulla }) {
  return (
    <Modal title="File già presente" onClose={onAnnulla} width={560}
           footer={<>
             <Btn variant="ghost" onClick={onAnnulla}>Annulla</Btn>
             <Btn variant="danger" onClick={onProcedi}>Procedi comunque</Btn>
           </>}>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)",
                      border: "1px solid var(--red)", borderRadius: 8, fontSize: 12 }}>
          <i className="ti ti-alert-triangle" style={{ color: "var(--red)", marginRight: 6 }} />
          Questo file è già presente in {duplicati.length} registro/i. Potrebbe essere un duplicato.
        </div>
        {duplicati.map((d, i) => (
          <div key={i} style={{ padding: "10px 14px", background: "var(--bg3)",
                                border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}>
            <div style={{ fontWeight: 600 }}>{d.nome || d.descrizione || "Fatto"}</div>
            <p style={{ color: "var(--text2)", fontSize: 12, margin: "4px 0 0" }}>
              {d.immobileNome || d.condominioNome} · {fmtEur(d.importo)} · {d.fornitore || "—"}
            </p>
          </div>
        ))}
        <p style={{ fontSize: 11, color: "var(--text2)", margin: 0 }}>
          Hash: <code style={{ fontSize: 10 }}>{hash?.slice(0, 20)}…</code>
        </p>
      </div>
    </Modal>
  );
}

// ── Modale Duplicati Dati ──────────────────────────────────────────────────────
function DuplicatiDatiAlert({ duplicati, onIgnora }) {
  if (!duplicati?.length) return null;
  return (
    <div style={{ padding: "10px 14px", background: "rgba(251,191,36,0.1)",
                  border: "1px solid rgba(251,191,36,0.5)", borderRadius: 8, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <i className="ti ti-alert-circle" style={{ color: "#f59e0b" }} />
        <strong style={{ fontSize: 13 }}>Possibili duplicati per dati ({duplicati.length}):</strong>
        <button onClick={onIgnora} style={{ marginLeft: "auto", background: "none", border: "none",
                                            cursor: "pointer", color: "var(--text2)", fontSize: 11 }}>
          Ignora ✕
        </button>
      </div>
      {duplicati.map((d, i) => (
        <div key={i} style={{ fontSize: 12, color: "var(--text2)", marginBottom: 3 }}>
          · {d.immobileNome || d.condominioNome} — {fmtEur(d.importo)} — {d.fornitore || d.numeroFattura}
          {d.periodoDa && ` — ${d.periodoDa}`}
        </div>
      ))}
    </div>
  );
}

// ── Pannello PDF preview + upload inline ────────────────────────────────────
function PdfPanel({ fattoId, pdfBase64, nomeFile, onPdfSaved }) {
  const [uploading, setUploading] = useState(false);
  const [err,       setErr]       = useState(null);
  const inputRef = useRef();

  async function handleUpload(file) {
    setUploading(true);
    setErr(null);
    try {
      await fattiV2.uploadPdf(fattoId, file);
      onPdfSaved?.();
    } catch (e) { setErr(e.message); }
    finally { setUploading(false); }
  }

  const pdfUrl = pdfBase64
    ? `data:application/pdf;base64,${pdfBase64}`
    : fattiV2.getPdfUrl(fattoId);

  return (
    <div>
      {pdfUrl && (
        <iframe
          src={pdfUrl}
          style={{ width: "100%", height: 320, border: "1px solid var(--border)", borderRadius: 8 }}
          title="PDF allegato"
        />
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--text2)", flex: 1 }}>
          {nomeFile || "Nessun file caricato"}
        </span>
        <Btn size="sm" variant="ghost" onClick={() => inputRef.current?.click()} disabled={uploading}>
          <i className="ti ti-upload" /> {uploading ? "Carico…" : "Cambia PDF"}
        </Btn>
        <input ref={inputRef} type="file" accept="application/pdf" style={{ display: "none" }}
               onChange={e => e.target.files[0] && handleUpload(e.target.files[0])} />
      </div>
      {err && <p style={{ fontSize: 12, color: "var(--red)", marginTop: 4 }}>{err}</p>}
    </div>
  );
}

// ── Modale Form Fatto Economico ───────────────────────────────────────────────
function FattoModal({
  initial,        // undefined = nuovo, object = modifica, con pdfBase64 per pre-fill da PDF
  onSave, onClose,
  immobili, condomini, tipologie,
}) {
  const isEdit = !!initial?.id;

  const [form, setForm] = useState({
    tipo:            "spesa",
    immobileId:      "",
    condominioId:    "",
    soggettoPaganteId: "",
    tipoSpesaId:     "",
    nome:            "",
    descrizione:     "",
    importo:         "",
    segno:           1,
    fornitore:       "",
    numeroFattura:   "",
    periodicita:     "una_tantum",
    dataPagamento:   "",
    periodoDa:       "",
    periodoA:        "",
    rifDa:           "",
    rifA:            "",
    note:            "",
    stato:           "normale",
    ...initial,
  });
  const [saving,       setSaving]       = useState(false);
  const [err,          setErr]          = useState(null);
  const [dupDati,      setDupDati]      = useState(null);
  const [pdfBase64,    setPdfBase64]    = useState(initial?.pdf_base64 || null);
  const [nomeFile,     setNomeFile]     = useState(initial?.nomeFile   || null);
  const [confidenza,   setConfidenza]   = useState(initial?.confidenza || null);

  const set    = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setNum = k => e => setForm(f => ({ ...f, [k]: e.target.value === "" ? "" : Number(e.target.value) }));

  // Calcola rate logiche per la periodicità
  const rate = form.periodicita !== "una_tantum"
    ? calcolaRate(form.periodicita, form.rifDa, form.rifA, form.importo)
    : [];

  // Controlla duplicati dati al cambio di fornitore/importo/fattura
  useEffect(() => {
    if (!form.fornitore && !form.numeroFattura) { setDupDati(null); return; }
    const t = setTimeout(async () => {
      try {
        const dups = await fattiV2.duplicatiDati({
          fornitore:      form.fornitore || undefined,
          importo:        form.importo   || undefined,
          numeroFattura:  form.numeroFattura || undefined,
          periodoDa:      form.periodoDa || undefined,
          immobileId:     form.immobileId || undefined,
          condominioId:   form.condominioId || undefined,
          excludeId:      initial?.id || undefined,
        });
        setDupDati(dups.length ? dups : null);
      } catch { /* silenzioso */ }
    }, 600);
    return () => clearTimeout(t);
  }, [form.fornitore, form.importo, form.numeroFattura, form.periodoDa,
      form.immobileId, form.condominioId, initial?.id]);

  async function handleSave() {
    if (!form.tipo)    { setErr("Tipo obbligatorio"); return; }
    if (!form.importo) { setErr("Importo obbligatorio"); return; }
    if (!form.immobileId && !form.condominioId) { setErr("Seleziona immobile o condominio"); return; }
    setSaving(true);
    setErr(null);
    try {
      const saved = await onSave(form);
      // Se c'è un pdfBase64 in-memory da estrazione, non lo salviamo qui
      // (viene salvato dall'utente tramite /pdf upload separato)
      onClose(saved);
    } catch (e) { setErr(e.message); setSaving(false); }
  }

  const tipoFiltrate = tipologie.filter(t => !t.tipo || t.tipo === form.tipo || t.tipo === "spesa");

  return (
    <Modal
      title={isEdit ? "Modifica movimento" : `Nuovo ${form.tipo === "entrata" ? "Entrata" : "Spesa"}`}
      onClose={() => onClose(null)}
      width={620}
      footer={<>
        <Btn variant="ghost" onClick={() => onClose(null)}>Annulla</Btn>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Salvo…" : "Salva"}
        </Btn>
      </>}
    >
      <div style={{ display: "grid", gap: 14 }}>
        {err && <p style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{err}</p>}
        {confidenza != null && (
          <div style={{ fontSize: 12, color: "var(--text2)", padding: "6px 10px",
                        background: "var(--bg3)", borderRadius: 6, display: "flex", gap: 8 }}>
            <i className="ti ti-robot" style={{ color: "var(--accent)" }} />
            Dati estratti dal PDF — confidenza {confidenza}%
          </div>
        )}

        <DuplicatiDatiAlert duplicati={dupDati} onIgnora={() => setDupDati(null)} />

        {/* Tipo */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Tipo *">
            <select className="inp" value={form.tipo} onChange={set("tipo")}>
              <option value="spesa">Spesa</option>
              <option value="entrata">Entrata</option>
            </select>
          </Field>
          <Field label="Stato">
            <select className="inp" value={form.stato} onChange={set("stato")}>
              <option value="normale">Normale</option>
              <option value="da_verificare">Da verificare</option>
              <option value="verificato">Verificato</option>
              <option value="duplicato">Duplicato</option>
            </select>
          </Field>
        </div>

        {/* Riferimento */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Immobile">
            <select className="inp" value={form.immobileId} onChange={set("immobileId")}>
              <option value="">— Seleziona —</option>
              {immobili.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
            </select>
          </Field>
          <Field label="Condominio">
            <select className="inp" value={form.condominioId} onChange={set("condominioId")}>
              <option value="">— Seleziona —</option>
              {condomini.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
        </div>

        {/* Tipologia + importo */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12 }}>
          <Field label="Tipologia">
            <select className="inp" value={form.tipoSpesaId} onChange={set("tipoSpesaId")}>
              <option value="">— Nessuna —</option>
              {tipoFiltrate.map(t => <option key={t.id} value={t.id}>{t.descrizione}</option>)}
            </select>
          </Field>
          <Field label="Importo *" hint="€">
            <input className="inp" type="number" min={0.01} step={0.01} style={{ width: 110 }}
                   value={form.importo} onChange={setNum("importo")} autoFocus={!isEdit} />
          </Field>
          {form.tipo === "entrata" && (
            <Field label="Segno">
              <select className="inp" value={form.segno} onChange={setNum("segno")} style={{ width: 80 }}>
                <option value={1}>+</option>
                <option value={-1}>−</option>
              </select>
            </Field>
          )}
        </div>

        {/* Nome + fornitore */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Nome / titolo">
            <input className="inp" value={form.nome} onChange={set("nome")}
                   placeholder="es. Bolletta gas dic-25" />
          </Field>
          <Field label="Fornitore">
            <input className="inp" value={form.fornitore} onChange={set("fornitore")} />
          </Field>
        </div>

        {/* Numero fattura + data pagamento */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Numero fattura / doc.">
            <input className="inp" value={form.numeroFattura} onChange={set("numeroFattura")} />
          </Field>
          <Field label="Data pagamento">
            <input className="inp" type="date" value={form.dataPagamento} onChange={set("dataPagamento")} />
          </Field>
        </div>

        {/* Periodo competenza + periodicità */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Field label="Periodo da (YYYY-MM)">
            <input className="inp" value={form.periodoDa} onChange={set("periodoDa")}
                   placeholder="es. 2025-01" maxLength={7} />
          </Field>
          <Field label="Periodo a (YYYY-MM)">
            <input className="inp" value={form.periodoA} onChange={set("periodoA")}
                   placeholder="es. 2025-12" maxLength={7} />
          </Field>
          <Field label="Periodicità">
            <select className="inp" value={form.periodicita} onChange={set("periodicita")}>
              {PERIODICITA_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </div>

        {/* Periodo riferimento preciso (DATE) per spese periodiche */}
        {form.periodicita !== "una_tantum" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Rif. da (data precisa)" hint="periodo rate">
              <input className="inp" type="date" value={form.rifDa} onChange={set("rifDa")} />
            </Field>
            <Field label="Rif. a (data precisa)">
              <input className="inp" type="date" value={form.rifA} onChange={set("rifA")} />
            </Field>
          </div>
        )}

        {/* Preview rate logiche */}
        {rate.length > 1 && (
          <div style={{ padding: "10px 14px", background: "var(--bg3)",
                        border: "1px solid var(--border)", borderRadius: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px" }}>
              <i className="ti ti-calendar-repeat" style={{ marginRight: 6, color: "var(--accent)" }} />
              {rate.length} rate logiche ({PERIODICITA_OPTS.find(o => o.value === form.periodicita)?.label})
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {rate.slice(0, 12).map((r, i) => (
                <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12,
                                       background: "var(--bg2)", border: "1px solid var(--border)" }}>
                  {r.periodo} · {fmtEur(r.importo)}
                </span>
              ))}
              {rate.length > 12 && <span style={{ fontSize: 11, color: "var(--text2)" }}>+{rate.length - 12}…</span>}
            </div>
          </div>
        )}

        {/* Note */}
        <Field label="Note">
          <textarea className="inp" rows={2} value={form.note} onChange={set("note")}
                    style={{ resize: "vertical" }} />
        </Field>

        {/* PDF preview se caricato da estrazione */}
        {pdfBase64 && (
          <Field label="PDF estratto">
            <PdfPanel
              fattoId={initial?.id}
              pdfBase64={pdfBase64}
              nomeFile={nomeFile}
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}

// ── Modale dettaglio Fatto ────────────────────────────────────────────────────
function FattoDettaglio({ fatto, onClose, onEdit, onDeleted, onPdfChange }) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [delErr,   setDelErr]   = useState(null);
  const [hasPdf,   setHasPdf]   = useState(fatto.hasPdf);

  async function handleDelete() {
    setDeleting(true);
    try {
      await fattiV2.elimina(fatto.id);
      onDeleted?.();
      onClose();
    } catch (e) { setDelErr(e.message); setDeleting(false); }
  }

  return (
    <Modal title={fatto.nome || fatto.descrizione || `${TIPO_LABEL[fatto.tipo]} — ${fmtEur(fatto.importo)}`}
           subtitle={fatto.immobileNome || fatto.condominioNome}
           onClose={onClose} width={600}
           footer={<>
             <Btn variant="ghost" onClick={onClose}>Chiudi</Btn>
             {confirmDel
               ? <>
                   <span style={{ fontSize: 12, color: "var(--red)", marginRight: 8 }}>Sicuro?</span>
                   <Btn variant="ghost" onClick={() => setConfirmDel(false)}>No</Btn>
                   <Btn variant="danger" disabled={deleting}
                        onClick={handleDelete}>
                     {deleting ? "…" : <><i className="ti ti-trash" /> Sì, elimina</>}
                   </Btn>
                 </>
               : <>
                   <Btn variant="ghost" onClick={() => setConfirmDel(true)}>
                     <i className="ti ti-trash" style={{ color: "var(--red)" }} />
                   </Btn>
                   <Btn variant="primary" onClick={onEdit}>
                     <i className="ti ti-pencil" /> Modifica
                   </Btn>
                 </>
             }
           </>}>
      <div style={{ display: "grid", gap: 16 }}>
        {delErr && <p style={{ color: "var(--red)", fontSize: 12 }}>{delErr}</p>}

        {/* Dati principali */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: 10 }}>
          {[
            ["Tipo",         <Badge label={TIPO_LABEL[fatto.tipo]} color={TIPO_COLOR[fatto.tipo]} />],
            ["Stato",        <Badge label={fatto.stato || "normale"} color={STATO_COLOR[fatto.stato] || "gray"} />],
            ["Importo",      fmtEur(fatto.importo)],
            ["Netto",        fmtEur(fatto.importoNetto)],
            ["Data pagam.",  fmtData(fatto.dataPagamento || fatto.dataEvento)],
            ["Periodo",      fatto.periodoDa && (fatto.periodoDa + (fatto.periodoA ? ` → ${fatto.periodoA}` : ""))],
            ["Fornitore",    fatto.fornitore],
            ["N. Fattura",   fatto.numeroFattura || fatto.numeroDoc],
            ["Tipologia",    fatto.tipoSpesaDesc],
            ["Periodicità",  fatto.periodicita !== "una_tantum" && PERIODICITA_OPTS.find(o => o.value === fatto.periodicita)?.label],
            ["Immobile",     fatto.immobileNome],
            ["Condominio",   fatto.condominioNome],
            ["Note",         fatto.note],
          ].filter(([, v]) => v).map(([label, val]) => (
            <div key={label}>
              <p style={{ fontSize: 10, color: "var(--text2)", margin: "0 0 2px",
                          textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</p>
              {typeof val === "string"
                ? <p style={{ fontSize: 13, margin: 0 }}>{val}</p>
                : val}
            </div>
          ))}
          {fatto.legacyTipo && (
            <div>
              <p style={{ fontSize: 10, color: "var(--text2)", margin: "0 0 4px",
                          textTransform: "uppercase", letterSpacing: 0.5 }}>Origine</p>
              <Badge label={LEGACY_LABEL[fatto.legacyTipo] || fatto.legacyTipo} color="gray" />
            </div>
          )}
        </div>

        {/* PDF allegato */}
        <div>
          <p style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase",
                      letterSpacing: 0.8, margin: "0 0 8px", fontWeight: 700 }}>
            Documento PDF
          </p>
          {hasPdf
            ? <PdfPanel fattoId={fatto.id} nomeFile={fatto.nomeFile}
                        onPdfSaved={() => { setHasPdf(true); onPdfChange?.(); }} />
            : <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "var(--text2)" }}>Nessun PDF allegato</span>
                <label style={{ cursor: "pointer" }}>
                  <Btn size="sm" variant="ghost" as="span">
                    <i className="ti ti-upload" /> Allega PDF
                  </Btn>
                  <input type="file" accept="application/pdf" style={{ display: "none" }}
                         onChange={async e => {
                           const file = e.target.files[0];
                           if (!file) return;
                           try {
                             await fattiV2.uploadPdf(fatto.id, file);
                             setHasPdf(true);
                             onPdfChange?.();
                           } catch {}
                         }} />
                </label>
              </div>
          }
        </div>
      </div>
    </Modal>
  );
}

// ── Card singolo fatto ─────────────────────────────────────────────────────────
function FattoCard({ fatto, onSelect, onEdit }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={() => onSelect(fatto)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "var(--bg2)",
        border: `1px solid ${hover ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 10, padding: "11px 16px",
        display: "grid", gridTemplateColumns: "1fr auto",
        gap: 12, alignItems: "center", cursor: "pointer",
        transition: "border-color 0.15s",
      }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
          <Badge label={TIPO_LABEL[fatto.tipo]} color={TIPO_COLOR[fatto.tipo]} />
          {fatto.stato && fatto.stato !== "normale" && (
            <Badge label={fatto.stato} color={STATO_COLOR[fatto.stato] || "gray"} />
          )}
          {fatto.hasPdf && <i className="ti ti-paperclip" style={{ fontSize: 11, color: "var(--text2)" }} title="PDF allegato" />}
          <span style={{ fontWeight: 700, fontSize: 14 }}>
            {fmtEur(fatto.importoNetto ?? fatto.importo)}
          </span>
          {fatto.nome && <span style={{ fontSize: 13, color: "var(--text)" }}>{fatto.nome}</span>}
        </div>
        <p style={{ fontSize: 12, color: "var(--text2)", margin: 0,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[
            fatto.immobileNome || fatto.condominioNome,
            fatto.tipoSpesaDesc,
            fatto.fornitore,
            fatto.periodoDa,
            fatto.dataPagamento && fmtData(fatto.dataPagamento),
          ].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
        <Btn size="sm" variant="ghost" title="Modifica" onClick={() => onEdit(fatto)}>
          <i className="ti ti-pencil" />
        </Btn>
        <Btn size="sm" variant="ghost" title="Dettaglio" onClick={() => onSelect(fatto)}>
          <i className="ti ti-chevron-right" />
        </Btn>
      </div>
    </div>
  );
}

// ── Upload PDF con hash check + estrazione ────────────────────────────────────
function usePdfUpload({ immobili, tipologie, onExtracted }) {
  const [state,       setState]   = useState("idle"); // idle|checking|duplicate|extracting
  const [dupInfo,     setDupInfo] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const inputRef = useRef();

  async function handleFile(file) {
    setState("checking");
    setPendingFile(file);
    try {
      const { hash, duplicati } = await fattiV2.checkHash(file);
      if (duplicati.length > 0) {
        setDupInfo({ hash, duplicati });
        setState("duplicate");
        return;
      }
      await doExtract(file);
    } catch (e) {
      setState("idle");
      alert("Errore: " + e.message);
    }
  }

  async function doExtract(file) {
    setState("extracting");
    try {
      const data = await fattiV2.estraiPdf(file, { immobili, tipologie });
      onExtracted({ ...data, nomeFile: file.name });
    } catch (e) {
      alert("Errore estrazione PDF: " + e.message);
    } finally {
      setState("idle");
      setPendingFile(null);
    }
  }

  function procediDuplicato() {
    setDupInfo(null);
    doExtract(pendingFile);
  }

  function annullaDuplicato() {
    setDupInfo(null);
    setPendingFile(null);
    setState("idle");
  }

  return {
    state, dupInfo, inputRef,
    triggerUpload: () => inputRef.current?.click(),
    onFileChange:  e  => e.target.files[0] && handleFile(e.target.files[0]),
    procediDuplicato,
    annullaDuplicato,
  };
}

// ── Sezione Movimenti ─────────────────────────────────────────────────────────
function MovimentiSection({ immobili, condomini, tipologie }) {
  const [fatti,    setFatti]   = useState(null);
  const [loading,  setLoading] = useState(false);
  const [filtri, setFiltri]    = useState({
    immobileId: "", condominioId: "", tipo: "",
    tipoSpesaId: "", periodoDa: "", periodoA: "",
  });
  const [selected, setSelected] = useState(null);
  const [editing,  setEditing]  = useState(null); // null=no modal, false=new, obj=edit
  const [err,      setErr]      = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setFatti(await fattiV2.lista(filtri)); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [JSON.stringify(filtri)]);

  useEffect(() => { load(); }, [load]);

  // PDF upload hook
  const pdf = usePdfUpload({
    immobili,
    tipologie,
    onExtracted: (data) => {
      // Apre il form pre-compilato con i dati estratti
      setEditing({
        tipo:         "spesa",
        immobileId:   data.immobileId   || "",
        tipoSpesaId:  data.tipoSpesaId  || "",
        importo:      data.importo      || "",
        fornitore:    data.fornitore    || "",
        numeroFattura: data.numeroDoc   || "",
        periodoDa:    data.periodoDa    || "",
        periodoA:     data.periodoA     || "",
        pdf_base64:   data.pdf_base64,
        nomeFile:     data.nomeFile,
        fileHash:     data.fileHash,
        confidenza:   data.confidenza,
      });
    },
  });

  async function handleSave(form) {
    const fatto = editing?.id
      ? await fattiV2.aggiorna(editing.id, form)
      : await fattiV2.crea(form);
    await load();
    return fatto;
  }

  const setFiltro = k => e => setFiltri(f => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select className="inp" value={filtri.tipo} onChange={setFiltro("tipo")} style={{ width: 130 }}>
          <option value="">Tutti i tipi</option>
          <option value="spesa">Spese</option>
          <option value="entrata">Entrate</option>
        </select>
        <select className="inp" value={filtri.condominioId} onChange={setFiltro("condominioId")} style={{ width: 180 }}>
          <option value="">Tutti i condomini</option>
          {condomini.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className="inp" value={filtri.immobileId} onChange={setFiltro("immobileId")} style={{ width: 180 }}>
          <option value="">Tutti gli immobili</option>
          {immobili.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
        </select>
        <input className="inp" type="month" value={filtri.periodoDa}
               onChange={setFiltro("periodoDa")} style={{ width: 130 }}
               placeholder="Da periodo" title="Periodo da" />
        <input className="inp" type="month" value={filtri.periodoA}
               onChange={setFiltro("periodoA")} style={{ width: 130 }}
               placeholder="A periodo" title="Periodo a" />
        <span style={{ flex: 1 }} />
        {fatti && (
          <span style={{ fontSize: 12, color: "var(--text2)" }}>
            {loading ? <i className="ti ti-loader-2 ti-spin" /> : `${fatti.length} mov.`}
          </span>
        )}
        {/* PDF upload */}
        <Btn variant="ghost" onClick={pdf.triggerUpload} disabled={pdf.state !== "idle"}>
          {pdf.state === "checking"   && <><i className="ti ti-loader-2 ti-spin" /> Verifico hash…</>}
          {pdf.state === "extracting" && <><i className="ti ti-loader-2 ti-spin" /> Estraggo…</>}
          {pdf.state === "idle"       && <><i className="ti ti-file-upload" /> Carica PDF</>}
          {pdf.state === "duplicate"  && <><i className="ti ti-alert-triangle" style={{color:"var(--red)"}} /> Duplicato</>}
        </Btn>
        <input ref={pdf.inputRef} type="file" accept="application/pdf"
               style={{ display: "none" }} onChange={pdf.onFileChange} />
        <Btn variant="ghost" onClick={() => setEditing({ tipo: "entrata" })}>
          <i className="ti ti-plus" /> Entrata
        </Btn>
        <Btn variant="primary" onClick={() => setEditing({ tipo: "spesa" })}>
          <i className="ti ti-plus" /> Spesa
        </Btn>
      </div>

      {err && (
        <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 12,
                      padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)",
                      border: "1px solid var(--red)" }}>{err}</div>
      )}

      {!fatti && !err && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text2)" }}>
          <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 24 }} />
        </div>
      )}

      {fatti?.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: 48, color: "var(--text2)" }}>
          <i className="ti ti-coin-off" style={{ fontSize: 36, opacity: 0.35, display: "block", marginBottom: 12 }} />
          Nessun movimento trovato.
        </div>
      )}

      {fatti && fatti.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {fatti.map(f => (
            <FattoCard
              key={f.id}
              fatto={f}
              onSelect={setSelected}
              onEdit={fatto => { setEditing(fatto); setSelected(null); }}
            />
          ))}
        </div>
      )}

      {/* Modale duplicato file */}
      {pdf.dupInfo && (
        <DuplicatiModal
          hash={pdf.dupInfo.hash}
          duplicati={pdf.dupInfo.duplicati}
          onProcedi={pdf.procediDuplicato}
          onAnnulla={pdf.annullaDuplicato}
        />
      )}

      {/* Modale form fatto */}
      {editing !== null && (
        <FattoModal
          initial={editing || undefined}
          onSave={handleSave}
          onClose={saved => { setEditing(null); if (saved) load(); }}
          immobili={immobili}
          condomini={condomini}
          tipologie={tipologie}
        />
      )}

      {/* Modale dettaglio */}
      {selected && (
        <FattoDettaglio
          fatto={selected}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selected); setSelected(null); }}
          onDeleted={load}
          onPdfChange={load}
        />
      )}
    </div>
  );
}

// ── Modale Tipologia ──────────────────────────────────────────────────────────
function TipologiaModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState({
    descrizione: "", tipo: "spesa", categoria: "",
    metodo_riparto: "", codice: "",
    validita_da: "", validita_a: "",
    note: "", attivo: true,
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSave() {
    if (!form.descrizione?.trim()) { setErr("Descrizione obbligatoria"); return; }
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch (e) { setErr(e.message); setSaving(false); }
  }

  return (
    <Modal title={initial?.id ? "Modifica tipologia" : "Nuova tipologia"}
           onClose={onClose} width={480}
           footer={<>
             <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
             <Btn variant="primary" onClick={handleSave} disabled={saving}>
               {saving ? "Salvo…" : "Salva"}
             </Btn>
           </>}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <p style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{err}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <Field label="Descrizione *">
            <input className="inp" value={form.descrizione} onChange={set("descrizione")} autoFocus />
          </Field>
          <Field label="Codice">
            <input className="inp" value={form.codice || ""} onChange={set("codice")} style={{ width: 90 }} />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Tipo">
            <select className="inp" value={form.tipo} onChange={set("tipo")}>
              <option value="spesa">Spesa</option>
              <option value="entrata">Entrata</option>
            </select>
          </Field>
          <Field label="Categoria">
            <input className="inp" value={form.categoria || ""} onChange={set("categoria")} />
          </Field>
        </div>
        <Field label="Metodo riparto">
          <select className="inp" value={form.metodo_riparto || ""} onChange={set("metodo_riparto")}>
            <option value="">— Nessuno —</option>
            <option value="Percentuale">Percentuale</option>
            <option value="Parti uguali">Parti uguali</option>
            <option value="Manuale">Manuale</option>
          </select>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Validità da">
            <input className="inp" type="date" value={form.validita_da || ""} onChange={set("validita_da")} />
          </Field>
          <Field label="Validità a">
            <input className="inp" type="date" value={form.validita_a || ""} onChange={set("validita_a")} />
          </Field>
        </div>
        <Field label="Note interne">
          <textarea className="inp" rows={2} value={form.note || ""} onChange={set("note")}
                    style={{ resize: "vertical" }} />
        </Field>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={form.attivo !== false}
                 onChange={e => setForm(f => ({ ...f, attivo: e.target.checked }))} />
          Attiva
        </label>
      </div>
    </Modal>
  );
}

// ── Sezione Tipologie ─────────────────────────────────────────────────────────
function TipologieSection() {
  const [tipologie,  setTipologie]  = useState(null);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [loading,    setLoading]    = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting,   setDeleting]   = useState(false);
  const [delErr,     setDelErr]     = useState(null);
  const [err,        setErr]        = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setTipologie(await tipologieV2.lista({ tipo: filtroTipo || undefined })); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [filtroTipo]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form) {
    if (editing?.id) await tipologieV2.aggiorna(editing.id, form);
    else             await tipologieV2.crea(form);
    await load();
  }

  async function handleDelete(id) {
    setDeleting(true);
    setDelErr(null);
    try { await tipologieV2.elimina(id); await load(); setConfirmDel(null); }
    catch (e) { setDelErr(e.message); }
    finally { setDeleting(false); }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <select className="inp" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
                style={{ width: 150 }}>
          <option value="">Tutti i tipi</option>
          <option value="spesa">Solo Spesa</option>
          <option value="entrata">Solo Entrata</option>
        </select>
        <span style={{ flex: 1 }} />
        {tipologie && <span style={{ fontSize: 12, color: "var(--text2)" }}>{tipologie.length} tipologie</span>}
        <Btn variant="primary" onClick={() => setEditing({})}>
          <i className="ti ti-plus" /> Nuova tipologia
        </Btn>
      </div>

      {err && <p style={{ color: "var(--red)", fontSize: 12, marginBottom: 12 }}>{err}</p>}

      {!tipologie && !err && (
        <div style={{ textAlign: "center", padding: 32, color: "var(--text2)" }}>
          <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 22 }} />
        </div>
      )}

      {tipologie?.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text2)" }}>
          <i className="ti ti-tags-off" style={{ fontSize: 32, opacity: 0.3, display: "block", marginBottom: 10 }} />
          Nessuna tipologia.
        </div>
      )}

      {tipologie && tipologie.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {tipologie.map(t => (
            <div key={t.id} style={{
              background: "var(--bg2)", border: "1px solid var(--border)",
              borderRadius: 10, padding: "11px 16px",
              display: "grid", gridTemplateColumns: "1fr auto",
              gap: 12, alignItems: "center",
              opacity: t.attivo ? 1 : 0.6,
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <Badge label={t.tipo === "entrata" ? "Entrata" : "Spesa"}
                         color={t.tipo === "entrata" ? "green" : "blue"} />
                  {!t.attivo && <Badge label="Inattiva" color="gray" />}
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{t.descrizione}</span>
                  {t.codice && t.codice !== t.id && (
                    <span style={{ fontSize: 11, color: "var(--text2)" }}>[{t.codice}]</span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: "var(--text2)", margin: 0 }}>
                  {[
                    t.categoria,
                    t.metodo_riparto && `Riparto: ${t.metodo_riparto}`,
                    t.validita_da && `dal ${t.validita_da}`,
                    t.validita_a  && `al ${t.validita_a}`,
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <Btn size="sm" variant="ghost" onClick={() => setEditing(t)}>
                  <i className="ti ti-pencil" />
                </Btn>
                <Btn size="sm" variant="ghost" onClick={() => setConfirmDel(t)}>
                  <i className="ti ti-trash" style={{ color: "var(--red)" }} />
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <TipologiaModal
          initial={editing?.id ? editing : undefined}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {confirmDel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
                      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }}>
          <div style={{ background: "var(--bg2)", border: "1px solid var(--red)", borderRadius: 12,
                        padding: 24, maxWidth: 400, width: "100%" }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Eliminare "{confirmDel.descrizione}"?</p>
            <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
              Impossibile eliminare se usata in fatti economici.
            </p>
            {delErr && (
              <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 12,
                          padding: "8px 10px", borderRadius: 7, background: "rgba(239,68,68,0.08)" }}>
                {delErr}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => { setConfirmDel(null); setDelErr(null); }}>Annulla</Btn>
              <Btn variant="danger" disabled={deleting}
                   onClick={() => handleDelete(confirmDel.id)}>
                {deleting ? "…" : <><i className="ti ti-trash" /> Elimina</>}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab principale ─────────────────────────────────────────────────────────────
export function EconomiaV2() {
  const [sezione,   setSezione]   = useState("movimenti");
  const [immobili,  setImmobili]  = useState([]);
  const [condomini, setCondomini] = useState([]);
  const [tipologie, setTipologie] = useState([]);

  useEffect(() => {
    Promise.all([
      immobiliV2.lista(),
      condominiV2.lista(),
      tipologieV2.lista(),
    ]).then(([imm, cond, tip]) => {
      setImmobili(imm);
      setCondomini(cond);
      setTipologie(tip);
    }).catch(() => {});
  }, []);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Economia</h2>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12,
                       background: "#1e3a5f", color: "#60a5fa", border: "1px solid #3b82f6" }}>v2</span>
      </div>
      <SubTabs active={sezione} onChange={setSezione} />
      {sezione === "movimenti" && (
        <MovimentiSection immobili={immobili} condomini={condomini} tipologie={tipologie} />
      )}
      {sezione === "tipologie" && <TipologieSection />}
    </div>
  );
}
