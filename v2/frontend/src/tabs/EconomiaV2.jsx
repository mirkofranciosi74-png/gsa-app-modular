import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { fattiV2, immobiliV2, condominiV2, tipologieV2 } from "../api/apiV2.js";
import { Btn, Badge, Modal, Field } from "../../components/ui.jsx";
import ImportazioneV2Modal from "../components/ImportazioneV2Modal.jsx";
import { usePdfQueue }   from "../../hooks/usePdfQueue.js";
import { PdfQueuePanel } from "../../components/PdfQueuePanel.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────
const oggi = () => new Date().toISOString().slice(0, 10);
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
const TIPOLOGIA_LABEL = {
  appartamento: "Appartamento", villa: "Villa", villetta: "Villetta",
  box: "Box / Garage", posto_auto: "Posto auto", ufficio: "Ufficio",
  locale_commerciale: "Locale comm.", magazzino: "Magazzino",
  terreno: "Terreno", cantina: "Cantina", altro: "Altro",
};

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
    <Modal title="⚠ File già presente in archivio" onClose={onAnnulla} width={600}
           footer={<>
             <Btn variant="ghost" onClick={onAnnulla}>Annulla caricamento</Btn>
             <Btn variant="danger" onClick={onProcedi}>Carica comunque</Btn>
           </>}>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.10)",
                      border: "1px solid var(--red)", borderRadius: 8, fontSize: 13,
                      display: "flex", gap: 10, alignItems: "center" }}>
          <i className="ti ti-fingerprint" style={{ color: "var(--red)", fontSize: 20, flexShrink: 0 }} />
          <div>
            Questo file è <strong>identico</strong> a un documento già presente.
            Trovat{duplicati.length > 1 ? "i" : "o"} <strong>{duplicati.length}</strong> oggett{duplicati.length > 1 ? "i" : "o"} con lo stesso contenuto.
          </div>
        </div>

        <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text2)",
                    textTransform: "uppercase", letterSpacing: 0.6, margin: 0 }}>
          Oggetti che contengono il file duplicato:
        </p>

        {duplicati.map((d, i) => (
          <div key={i} style={{ padding: "12px 14px", background: "var(--bg3)",
                                border: "2px solid var(--red)", borderRadius: 8 }}>
            {/* Riga principale */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Badge label={TIPO_LABEL[d.tipo] || d.tipo} color={TIPO_COLOR[d.tipo] || "gray"} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                {d.nome || d.descrizione || d.fornitore || "Voce senza nome"}
              </span>
              <span style={{ marginLeft: "auto", fontWeight: 700, fontSize: 14, color: "var(--accent)" }}>
                {fmtEur(d.importo)}
              </span>
            </div>
            {/* Dettagli griglia */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))",
                          gap: "4px 16px", fontSize: 12, color: "var(--text2)" }}>
              {d.immobileNome   && <span><strong>Immobile:</strong> {d.immobileNome}</span>}
              {d.condominioNome && <span><strong>Condominio:</strong> {d.condominioNome}</span>}
              {d.fornitore      && <span><strong>Fornitore:</strong> {d.fornitore}</span>}
              {d.numeroFattura  && <span><strong>N. fattura:</strong> {d.numeroFattura}</span>}
              {d.periodoDa      && <span><strong>Periodo:</strong> {d.periodoDa}{d.periodoA && d.periodoA !== d.periodoDa ? ` → ${d.periodoA}` : ""}</span>}
              {(d.dataPagamento || d.dataEvento) && (
                <span><strong>Data:</strong> {fmtData(d.dataPagamento || d.dataEvento)}</span>
              )}
              {d.tipoSpesaDesc  && <span><strong>Tipo spesa:</strong> {d.tipoSpesaDesc}</span>}
              {d.nomeFile       && <span><strong>File:</strong> {d.nomeFile}</span>}
              {d.stato && d.stato !== "normale" && (
                <span><strong>Stato:</strong> <Badge label={d.stato} color={STATO_COLOR[d.stato] || "gray"} /></span>
              )}
            </div>
          </div>
        ))}

        <p style={{ fontSize: 11, color: "var(--text2)", margin: 0 }}>
          Hash SHA-256: <code style={{ fontSize: 10, userSelect: "all" }}>{hash}</code>
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
// pdfUrl: blob URL diretto dal file (da coda), nessun decode base64 necessario.
// fattoId: scarica da server con auth → blob URL.
function PdfPanel({ fattoId, pdfUrl, nomeFile, onPdfSaved, onPdfDeleted, onDuplicatiTrovati }) {
  const [uploading,      setUploading]      = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [err,            setErr]            = useState(null);
  const [fetchedUrl,     setFetchedUrl]     = useState(null);
  const [fetchVer,       setFetchVer]       = useState(0);
  const [pendingDup,     setPendingDup]     = useState(null); // { file, hash, duplicati }
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [deleting,       setDeleting]       = useState(false);
  const inputRef = useRef();

  // Scarica da server solo quando non c'è già un pdfUrl (anteprima da coda)
  useEffect(() => {
    if (pdfUrl || !fattoId) { setFetchedUrl(null); return; }
    let active = true;
    let url    = null;
    setLoading(true);
    setErr(null);
    const token = localStorage.getItem("gsa_token");
    fetch(fattiV2.getPdfUrl(fattoId), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => { if (!r.ok) throw new Error(`PDF non disponibile (${r.status})`); return r.arrayBuffer(); })
      .then(buf => {
        if (!active) return;
        url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
        setFetchedUrl(url);
      })
      .catch(e  => { if (active) setErr(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
      setFetchedUrl(null);
    };
  }, [fattoId, pdfUrl, fetchVer]);

  const displayUrl = pdfUrl || fetchedUrl;

  async function doUpload(file) {
    setUploading(true);
    setErr(null);
    try {
      await fattiV2.uploadPdf(fattoId, file);
      setFetchVer(v => v + 1);
      onPdfSaved?.();
    } catch (e) { setErr(e.message); }
    finally { setUploading(false); }
  }

  async function checkAndUpload(file) {
    setErr(null);
    try {
      const { hash, duplicati } = await fattiV2.checkHash(file, fattoId);
      if (duplicati?.length) {
        const info = { file, hash, duplicati, doUpload: () => doUpload(file) };
        if (onDuplicatiTrovati) { onDuplicatiTrovati(info); } else { setPendingDup(info); }
        return;
      }
      await doUpload(file);
    } catch (e) { setErr(e.message); }
  }

  async function doDeletePdf() {
    setDeleting(true);
    setErr(null);
    try {
      await fattiV2.eliminaPdf(fattoId);
      setFetchedUrl(null);
      setConfirmDelete(false);
      onPdfDeleted?.();
    } catch (e) { setErr(e.message); }
    finally { setDeleting(false); }
  }

  return (
    <div>
      {pendingDup && (
        <DuplicatiModal
          hash={pendingDup.hash}
          duplicati={pendingDup.duplicati}
          onAnnulla={() => setPendingDup(null)}
          onProcedi={() => { const du = pendingDup.doUpload; setPendingDup(null); du(); }}
        />
      )}
      {loading && (
        <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center",
                      color: "var(--text2)", fontSize: 13, border: "1px solid var(--border)",
                      borderRadius: 8, marginBottom: 8 }}>
          <i className="ti ti-loader-2 ti-spin" style={{ marginRight: 6 }} /> Carico PDF…
        </div>
      )}
      {displayUrl && (
        <iframe
          key={displayUrl}
          src={displayUrl}
          style={{ width: "100%", height: 400, border: "1px solid var(--border)",
                   borderRadius: 8, display: "block" }}
          title="PDF allegato"
        />
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--text2)", flex: 1 }}>
          {nomeFile || "Nessun file caricato"}
        </span>
        {displayUrl && (
          <Btn size="sm" variant="ghost" onClick={() => window.open(displayUrl, "_blank")}>
            <i className="ti ti-external-link" /> Apri PDF
          </Btn>
        )}
        {fattoId && fetchedUrl && !confirmDelete && (
          <Btn size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} title="Elimina PDF allegato">
            <i className="ti ti-trash" style={{ color: "var(--red)" }} />
          </Btn>
        )}
        {fattoId && fetchedUrl && confirmDelete && (
          <>
            <span style={{ fontSize: 12, color: "var(--red)" }}>Elimina PDF?</span>
            <Btn size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>No</Btn>
            <Btn size="sm" variant="danger" disabled={deleting} onClick={doDeletePdf}>
              {deleting ? "…" : "Sì"}
            </Btn>
          </>
        )}
        {fattoId && (
          <Btn size="sm" variant="ghost" onClick={() => inputRef.current?.click()} disabled={uploading || loading}>
            <i className="ti ti-upload" /> {uploading ? "Carico…" : "Cambia PDF"}
          </Btn>
        )}
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" style={{ display: "none" }}
               onChange={e => { if (e.target.files[0]) checkAndUpload(e.target.files[0]); e.target.value = ""; }} />
      </div>
      {err && <p style={{ fontSize: 12, color: "var(--red)", marginTop: 4 }}>{err}</p>}
    </div>
  );
}

// ── Modale Form Fatto Economico ───────────────────────────────────────────────
function FattoModal({
  initial,
  onSave, onClose,
  immobili, condomini, tipologie,
}) {
  const isEdit = !!initial?.id;

  const [form, setForm] = useState({
    tipo:                "spesa",
    immobileId:          "",
    condominioId:        "",
    soggettoPaganteId:   "",
    soggettoIncassanteId:"",
    tipoSpesaId:         "",
    nome:              "",
    descrizione:       "",
    importo:           "",
    segno:             1,
    fornitore:         "",
    numeroFattura:     "",
    periodicita:       "una_tantum",
    dataPagamento:     "",
    periodoDa:         "",
    periodoA:          "",
    rifDa:             "",
    rifA:              "",
    note:              "",
    stato:             "normale",
    ...initial,
  });
  const [saving,       setSaving]       = useState(false);
  const [err,          setErr]          = useState(null);
  const [dupDati,      setDupDati]      = useState(null);
  const [pdfUrl,       setPdfUrl]       = useState(initial?._pdfUrl   || null);
  const [nomeFile,     setNomeFile]     = useState(initial?.nomeFile   || null);
  const [pdfEliminato,  setPdfEliminato]  = useState(false);
  const [pendingPdfDup, setPendingPdfDup] = useState(null);
  const [confidenza,   setConfidenza]   = useState(initial?.confidenza || null);
  const [soggetti,     setSoggetti]     = useState([]);      // chi paga / chi versa
  const [incassanti,   setIncassanti]   = useState([]);      // chi incassa (solo entrate)

  const set    = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setNum = k => e => setForm(f => ({ ...f, [k]: e.target.value === "" ? "" : Number(e.target.value) }));

  // Carica soggetti (pagante / versante) e incassanti in base a immobile o condominio selezionato
  useEffect(() => {
    const dataRif = oggi();

    if (form.immobileId) {
      // ── Fatto legato a un immobile specifico ──────────────────────────────────
      const ruoloPagante = form.tipo === "entrata" ? "inquilino" : "proprietario";
      immobiliV2.ruoli(form.immobileId, { ruolo: ruoloPagante, dataRif })
        .then(list => {
          setSoggetti(list);
          if (!form.soggettoPaganteId) {
            const def = form.tipo === "spesa"
              ? (list.find(r => r.defaultPagante) || list[0])
              : list[0];
            if (def) setForm(f => ({ ...f, soggettoPaganteId: def.personaId }));
          }
        })
        .catch(() => {});

      if (form.tipo === "entrata") {
        immobiliV2.ruoli(form.immobileId, { ruolo: "proprietario", dataRif })
          .then(list => {
            setIncassanti(list);
            if (!form.soggettoIncassanteId) {
              const def = list.find(r => r.defaultIncassante) || list[0];
              if (def) setForm(f => ({ ...f, soggettoIncassanteId: def.personaId }));
            }
          })
          .catch(() => {});
      } else {
        setIncassanti([]);
      }

    } else if (form.condominioId) {
      // ── Fatto legato solo al condominio: proprietari di tutti gli immobili ────
      condominiV2.proprietariImmobili(form.condominioId, dataRif)
        .then(list => {
          setSoggetti(list);
          if (!form.soggettoPaganteId) {
            const def = list.find(r => r.defaultPagante) || list[0];
            if (def) setForm(f => ({ ...f, soggettoPaganteId: def.personaId }));
          }
          if (form.tipo === "entrata") {
            setIncassanti(list);
            if (!form.soggettoIncassanteId) {
              const def = list.find(r => r.defaultIncassante) || list[0];
              if (def) setForm(f => ({ ...f, soggettoIncassanteId: def.personaId }));
            }
          } else {
            setIncassanti([]);
          }
        })
        .catch(() => {});

    } else {
      setSoggetti([]);
      setIncassanti([]);
    }
  }, [form.immobileId, form.condominioId, form.tipo]);

  const rate = form.periodicita !== "una_tantum"
    ? calcolaRate(form.periodicita, form.rifDa, form.rifA, form.importo)
    : [];

  // Debounce check duplicati dati
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
      onClose(saved);
    } catch (e) { setErr(e.message); setSaving(false); }
  }

  const tipoFiltrate = tipologie.filter(t => !t.tipo || t.tipo === form.tipo);
  const soggLabel = form.tipo === "entrata" ? "Chi versa" : "Chi ha pagato";

  return (
    <>
    <Modal
      title={isEdit ? "Modifica movimento" : `Nuovo ${form.tipo === "entrata" ? "Entrata" : "Spesa"}`}
      onClose={() => onClose(null)}
      width={640}
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
        {/* Avviso duplicato file (stesso hash già in archivio) */}
        {initial?.duplicatiFile?.length > 0 && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid var(--red)",
                        borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8,
                          borderBottom: "1px solid rgba(239,68,68,0.25)" }}>
              <i className="ti ti-alert-triangle" style={{ color: "var(--red)", fontSize: 16, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--red)" }}>
                Questo file è già presente in {initial.duplicatiFile.length} registr{initial.duplicatiFile.length > 1 ? "i" : "o"} — verifica prima di salvare
              </span>
            </div>
            <div style={{ padding: "10px 14px", display: "grid", gap: 8 }}>
              {initial.duplicatiFile.map((d, i) => (
                <div key={i} style={{ padding: "10px 12px", background: "var(--bg3)",
                                      border: "1px solid rgba(239,68,68,0.35)", borderRadius: 7 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <Badge label={TIPO_LABEL[d.tipo] || d.tipo} color={TIPO_COLOR[d.tipo] || "gray"} />
                    <span style={{ fontWeight: 700, fontSize: 13 }}>
                      {d.nome || d.descrizione || d.fornitore || "Voce senza nome"}
                    </span>
                    <span style={{ marginLeft: "auto", fontWeight: 700, fontSize: 13, color: "var(--accent)" }}>
                      {fmtEur(d.importo)}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))",
                                gap: "3px 14px", fontSize: 11, color: "var(--text2)" }}>
                    {d.immobileNome   && <span><strong>Immobile:</strong> {d.immobileNome}</span>}
                    {d.condominioNome && <span><strong>Condominio:</strong> {d.condominioNome}</span>}
                    {d.fornitore      && <span><strong>Fornitore:</strong> {d.fornitore}</span>}
                    {d.numeroFattura  && <span><strong>N. fattura:</strong> {d.numeroFattura}</span>}
                    {d.periodoDa      && <span><strong>Periodo:</strong> {d.periodoDa}{d.periodoA && d.periodoA !== d.periodoDa ? ` → ${d.periodoA}` : ""}</span>}
                    {(d.dataPagamento || d.dataEvento) && (
                      <span><strong>Data:</strong> {fmtData(d.dataPagamento || d.dataEvento)}</span>
                    )}
                    {d.tipoSpesaDesc  && <span><strong>Tipo spesa:</strong> {d.tipoSpesaDesc}</span>}
                    {d.nomeFile       && <span><strong>File:</strong> {d.nomeFile}</span>}
                    {d.stato && d.stato !== "normale" && (
                      <span><strong>Stato:</strong> {d.stato}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tipo + Stato */}
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

        {/* Immobile + Condominio */}
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

        {/* Soggetto pagante / versante + incassante */}
        <div style={{ display: "grid", gridTemplateColumns: form.tipo === "entrata" ? "1fr 1fr" : "1fr", gap: 12 }}>
          <Field label={soggLabel}>
            <select className="inp" value={form.soggettoPaganteId} onChange={set("soggettoPaganteId")}>
              <option value="">— Seleziona —</option>
              {soggetti.map(s => (
                <option key={s.personaId} value={s.personaId}>
                  {[s.personaCognome, s.personaNome].filter(Boolean).join(" ")}
                  {s.defaultPagante && " ★"}
                  {s.validitaDa && ` (dal ${fmtData(s.validitaDa)})`}
                </option>
              ))}
            </select>
            {!form.immobileId && !form.condominioId && (
              <span style={{ fontSize: 11, color: "var(--text2)" }}>Seleziona prima immobile o condominio</span>
            )}
          </Field>
          {form.tipo === "entrata" && (
            <Field label="Chi incassa" hint="proprietario che riceve">
              <select className="inp" value={form.soggettoIncassanteId} onChange={set("soggettoIncassanteId")}>
                <option value="">— Seleziona —</option>
                {incassanti.map(s => (
                  <option key={s.personaId} value={s.personaId}>
                    {[s.personaCognome, s.personaNome].filter(Boolean).join(" ")}
                    {s.defaultIncassante && " ★"}
                    {s.validitaDa && ` (dal ${fmtData(s.validitaDa)})`}
                  </option>
                ))}
              </select>
              {!form.immobileId && !form.condominioId && (
                <span style={{ fontSize: 11, color: "var(--text2)" }}>Seleziona prima immobile o condominio</span>
              )}
            </Field>
          )}
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

        {/* Periodo riferimento preciso per periodici */}
        {form.periodicita !== "una_tantum" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Rif. da (data precisa)">
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

        {/* PDF preview dal file selezionato (da coda) */}
        {pdfUrl && (
          <div>
            <p style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase",
                        letterSpacing: 0.6, margin: "0 0 6px", fontWeight: 700 }}>
              PDF estratto (sarà allegato al salvataggio)
            </p>
            <PdfPanel pdfUrl={pdfUrl} nomeFile={nomeFile} />
          </div>
        )}

        {/* PDF allegato (modifica voce esistente) */}
        {isEdit && initial?.hasPdf && !pdfUrl && !pdfEliminato && (
          <div>
            <p style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase",
                        letterSpacing: 0.6, margin: "0 0 6px", fontWeight: 700 }}>
              Documento allegato
            </p>
            <PdfPanel fattoId={initial.id} nomeFile={initial.nomeFile || nomeFile}
                      onPdfDeleted={() => setPdfEliminato(true)}
                      onDuplicatiTrovati={setPendingPdfDup} />
          </div>
        )}
      </div>
    </Modal>
    {pendingPdfDup && (
      <DuplicatiModal
        hash={pendingPdfDup.hash}
        duplicati={pendingPdfDup.duplicati}
        onAnnulla={() => setPendingPdfDup(null)}
        onProcedi={() => { const du = pendingPdfDup.doUpload; setPendingPdfDup(null); du(); }}
      />
    )}
    </>
  );
}

// ── Modale dettaglio Fatto ────────────────────────────────────────────────────
function FattoDettaglio({ fatto, onClose, onEdit, onDeleted, onPdfChange }) {
  const [deleting,      setDeleting]      = useState(false);
  const [confirmDel,    setConfirmDel]    = useState(false);
  const [delErr,        setDelErr]        = useState(null);
  const [hasPdf,        setHasPdf]        = useState(fatto.hasPdf);
  const [pdfErr,        setPdfErr]        = useState(null);
  const [pdfUploading,  setPdfUploading]  = useState(false);
  const [pendingDup,    setPendingDup]    = useState(null); // { file, hash, duplicati }
  const pdfInputRef = useRef();

  async function handleDelete() {
    setDeleting(true);
    try {
      await fattiV2.elimina(fatto.id);
      onDeleted?.();
      onClose();
    } catch (e) { setDelErr(e.message); setDeleting(false); }
  }

  async function doUploadPdf(file) {
    setPdfErr(null);
    setPdfUploading(true);
    try {
      await fattiV2.uploadPdf(fatto.id, file);
      setHasPdf(true);
      onPdfChange?.();
    } catch (e) {
      setPdfErr(e.message || "Errore upload PDF");
    } finally {
      setPdfUploading(false);
    }
  }

  async function handlePdfUpload(file) {
    setPdfErr(null);
    try {
      const { hash, duplicati } = await fattiV2.checkHash(file, fatto.id);
      if (duplicati?.length) {
        setPendingDup({ file, hash, duplicati, doUpload: () => doUploadPdf(file) });
        return;
      }
      await doUploadPdf(file);
    } catch (e) {
      setPdfErr(e.message || "Errore controllo duplicati");
    }
  }

  return (
    <>
    <Modal title={fatto.nome || fatto.descrizione || `${TIPO_LABEL[fatto.tipo]} — ${fmtEur(fatto.importo)}`}
           subtitle={fatto.immobileNome || fatto.condominioNome}
           onClose={onClose} width={600}
           footer={<>
             <Btn variant="ghost" onClick={onClose}>Chiudi</Btn>
             {confirmDel
               ? <>
                   <span style={{ fontSize: 12, color: "var(--red)", marginRight: 8 }}>Sicuro?</span>
                   <Btn variant="ghost" onClick={() => setConfirmDel(false)}>No</Btn>
                   <Btn variant="danger" disabled={deleting} onClick={handleDelete}>
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: 10 }}>
          {[
            ["Tipo",           <Badge label={TIPO_LABEL[fatto.tipo]} color={TIPO_COLOR[fatto.tipo]} />],
            ["Stato",          <Badge label={fatto.stato || "normale"} color={STATO_COLOR[fatto.stato] || "gray"} />],
            ["Importo",        fmtEur(fatto.importo)],
            ["Netto",          fmtEur(fatto.importoNetto)],
            [fatto.tipo === "entrata" ? "Chi versa"  : "Chi ha pagato", fatto.soggettoPaganteNome],
            [fatto.tipo === "entrata" ? "Chi incassa" : null,            fatto.soggettoIncassanteNome],
            ["Data pagam.",    fmtData(fatto.dataPagamento || fatto.dataEvento)],
            ["Periodo",        fatto.periodoDa && (fatto.periodoDa + (fatto.periodoA ? ` → ${fatto.periodoA}` : ""))],
            ["Fornitore",      fatto.fornitore],
            ["N. Fattura",     fatto.numeroFattura || fatto.numeroDoc],
            ["Tipologia",      fatto.tipoSpesaDesc],
            ["Periodicità",    fatto.periodicita !== "una_tantum" && PERIODICITA_OPTS.find(o => o.value === fatto.periodicita)?.label],
            ["Immobile",       fatto.immobileNome],
            ["Condominio",     fatto.condominioNome],
            ["Note",           fatto.note],
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
                        onPdfSaved={() => { setHasPdf(true); onPdfChange?.(); }}
                        onPdfDeleted={() => { setHasPdf(false); onPdfChange?.(); }}
                        onDuplicatiTrovati={setPendingDup} />
            : <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "var(--text2)" }}>
                    {pdfUploading ? "Caricamento in corso…" : "Nessun PDF allegato"}
                  </span>
                  <Btn size="sm" variant="ghost" disabled={pdfUploading}
                       onClick={() => pdfInputRef.current?.click()}>
                    <i className={`ti ${pdfUploading ? "ti-loader-2 ti-spin" : "ti-upload"}`} />
                    {pdfUploading ? " Carico…" : " Allega PDF"}
                  </Btn>
                  <input ref={pdfInputRef} type="file" accept="application/pdf,.pdf"
                         style={{ display: "none" }}
                         onChange={e => { if (e.target.files[0]) handlePdfUpload(e.target.files[0]); e.target.value = ""; }} />
                </div>
                {pdfErr && (
                  <p style={{ fontSize: 12, color: "var(--red)", marginTop: 6 }}>{pdfErr}</p>
                )}
              </div>
          }
        </div>
      </div>
    </Modal>
    {pendingDup && (
      <DuplicatiModal
        hash={pendingDup.hash}
        duplicati={pendingDup.duplicati}
        onAnnulla={() => setPendingDup(null)}
        onProcedi={() => { const du = pendingDup.doUpload; setPendingDup(null); du(); }}
      />
    )}
    </>
  );
}

// ── Intestazione colonne griglia ──────────────────────────────────────────────
const GRID_COLS = "28px 140px 130px 95px 110px 80px 100px 1fr 95px 80px 28px 65px";

function SortableGridHeader({ sortKey, sortDir, onSort, allSelected, someSelected, onSelectAll }) {
  const thBase = {
    fontSize: 10, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: 0.6, padding: "6px 8px", cursor: "pointer",
    userSelect: "none", display: "flex", alignItems: "center", gap: 3,
  };
  function Cell({ label, k, style }) {
    const active = sortKey === k;
    return (
      <div onClick={() => onSort(k)}
           style={{ ...thBase, ...style, color: active ? "var(--accent)" : "var(--text2)" }}>
        {label}
        {active
          ? <i className={`ti ti-chevron-${sortDir === "asc" ? "up" : "down"}`} style={{ fontSize: 9 }} />
          : <i className="ti ti-selector" style={{ fontSize: 9, opacity: 0.3 }} />}
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: GRID_COLS,
                  borderBottom: "2px solid var(--border)", marginBottom: 2 }}>
      <div style={{ ...thBase, justifyContent: "center", cursor: "default" }}>
        <input type="checkbox" checked={allSelected}
               ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
               onChange={onSelectAll}
               style={{ cursor: "pointer", accentColor: "var(--accent)" }} />
      </div>
      <Cell label="Soggetto"    k="soggettoPaganteNome" />
      <Cell label="Patrimonio"  k="immobileNome" />
      <Cell label="Tipologia"   k="tipoSpesaDesc" />
      <Cell label="Tipo"        k="tipo" />
      <Cell label="Periodicità" k="periodicita" />
      <Cell label="Periodo"     k="periodoDa" />
      <Cell label="Descrizione" k="nome" />
      <Cell label="Importo"     k="importoNetto" style={{ justifyContent: "flex-end" }} />
      <Cell label="Stato"       k="stato" />
      <div style={thBase} />
      <div style={thBase} />
    </div>
  );
}

// ── Modale modifica massiva ───────────────────────────────────────────────────
function BulkEditModal({ count, immobili, condomini, tipologie, onApplica, onClose }) {
  const [form,   setForm]   = useState({
    stato: "", tipoSpesaId: "", periodicita: "", immobileId: "", condominioId: "",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  function setImmobile(e) {
    setForm(f => ({ ...f, immobileId: e.target.value, condominioId: e.target.value ? "" : f.condominioId }));
  }
  function setCondominio(e) {
    setForm(f => ({ ...f, condominioId: e.target.value, immobileId: e.target.value ? "" : f.immobileId }));
  }

  async function handleApplica() {
    const dati = {};
    if (form.stato)       dati.stato       = form.stato;
    if (form.tipoSpesaId) dati.tipoSpesaId = form.tipoSpesaId;
    if (form.periodicita) dati.periodicita = form.periodicita;
    // destinazione: mutua esclusione — chi viene impostato azzera l'altro
    if (form.immobileId)   { dati.immobileId = form.immobileId;     dati.condominioId = null; }
    if (form.condominioId) { dati.condominioId = form.condominioId; dati.immobileId   = null; }
    if (!Object.keys(dati).length) { setErr("Compila almeno un campo da modificare"); return; }
    setSaving(true);
    try { await onApplica(dati); onClose(); }
    catch (e) { setErr(e.message); setSaving(false); }
  }

  const destSet = !!(form.immobileId || form.condominioId);

  return (
    <Modal title={`Modifica massiva — ${count} ${count === 1 ? "voce" : "voci"}`}
           onClose={onClose} width={460}
           footer={<>
             <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
             <Btn variant="primary" onClick={handleApplica} disabled={saving}>
               {saving ? "Applico…" : `Applica a ${count} ${count === 1 ? "voce" : "voci"}`}
             </Btn>
           </>}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <p style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{err}</p>}
        <p style={{ fontSize: 12, color: "var(--text2)", margin: 0,
                    padding: "8px 10px", borderRadius: 7, background: "var(--bg3)" }}>
          Solo i campi compilati verranno aggiornati. Lasciare "— Non modificare —" per non toccare quel campo.
        </p>

        <Field label="Stato">
          <select className="inp" value={form.stato} onChange={set("stato")}>
            <option value="">— Non modificare —</option>
            <option value="normale">Normale</option>
            <option value="da_verificare">Da verificare</option>
            <option value="verificato">Verificato</option>
            <option value="duplicato">Duplicato</option>
          </select>
        </Field>
        <Field label="Tipologia / Tipo spesa">
          <select className="inp" value={form.tipoSpesaId} onChange={set("tipoSpesaId")}>
            <option value="">— Non modificare —</option>
            {tipologie.map(t => <option key={t.id} value={t.id}>{t.descrizione}</option>)}
          </select>
        </Field>
        <Field label="Periodicità">
          <select className="inp" value={form.periodicita} onChange={set("periodicita")}>
            <option value="">— Non modificare —</option>
            {PERIODICITA_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>

        {/* Sezione destinazione */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text2)",
                      textTransform: "uppercase", letterSpacing: 0.6, margin: "0 0 12px" }}>
            Sposta destinazione
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Immobile">
              <select className="inp" value={form.immobileId} onChange={setImmobile}
                      style={{ opacity: form.condominioId ? 0.4 : 1 }}>
                <option value="">— Non modificare —</option>
                {immobili.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </select>
            </Field>
            <Field label="Condominio">
              <select className="inp" value={form.condominioId} onChange={setCondominio}
                      style={{ opacity: form.immobileId ? 0.4 : 1 }}>
                <option value="">— Non modificare —</option>
                {condomini.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Field>
          </div>
          {destSet && (
            <p style={{ fontSize: 11, color: "var(--accent)", margin: "8px 0 0",
                        display: "flex", alignItems: "center", gap: 5 }}>
              <i className="ti ti-info-circle" />
              {form.immobileId
                ? "Le voci verranno spostate all'immobile selezionato. Il condominio diretto verrà azzerato."
                : "Le voci verranno spostate al condominio selezionato. L'immobile verrà azzerato."}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Riga griglia fatto ────────────────────────────────────────────────────────
function FattoRow({ fatto, selected, onToggle, onSelect, onEdit, onDelete }) {
  const [hover, setHover] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const periodo = fatto.periodoDa
    ? fatto.periodoA && fatto.periodoA !== fatto.periodoDa
      ? `${fatto.periodoDa} → ${fatto.periodoA}`
      : fatto.periodoDa
    : "—";

  const periLabel = PERIODICITA_OPTS.find(o => o.value === fatto.periodicita)?.label || "—";

  const td = {
    padding: "8px 8px",
    fontSize: 13,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
  };

  return (
    <div
      onClick={() => onSelect(fatto)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid",
        gridTemplateColumns: GRID_COLS,
        background: hover ? "var(--bg3)" : "var(--bg2)",
        border: `1px solid ${hover ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 8,
        cursor: "pointer",
        transition: "all 0.1s",
        marginBottom: 3,
      }}
    >
      {/* Checkbox selezione */}
      <div style={{ ...td, justifyContent: "center" }} onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={!!selected} onChange={() => onToggle(fatto.id)}
               style={{ cursor: "pointer", accentColor: "var(--accent)" }} />
      </div>

      {/* Soggetto */}
      <div style={td}>
        <span style={{ color: fatto.soggettoPaganteNome ? "var(--text)" : "var(--text2)",
                        fontSize: 12 }}>
          {fatto.soggettoPaganteNome || "—"}
        </span>
      </div>

      {/* Patrimonio */}
      <div style={{ ...td, gap: 5 }}>
        <i className={`ti ${fatto.condominioNome && !fatto.immobileNome ? "ti-building" : "ti-home"}`}
           style={{ fontSize: 11, color: "var(--text2)", flexShrink: 0 }} />
        <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>
          {fatto.immobileNome || fatto.condominioNome || "—"}
        </span>
      </div>

      {/* Tipologia (tipo spesa) */}
      <div style={td}>
        <span style={{ fontSize: 11, color: fatto.tipoSpesaDesc ? "var(--text)" : "var(--text2)",
                        overflow: "hidden", textOverflow: "ellipsis" }}>
          {fatto.tipoSpesaDesc || "—"}
        </span>
      </div>

      {/* Tipo */}
      <div style={td}>
        <Badge label={TIPO_LABEL[fatto.tipo]} color={TIPO_COLOR[fatto.tipo]} />
      </div>

      {/* Periodicità */}
      <div style={td}>
        <span style={{ fontSize: 11, color: fatto.periodicita !== "una_tantum" ? "var(--accent)" : "var(--text2)" }}>
          {periLabel}
        </span>
      </div>

      {/* Periodo */}
      <div style={td}>
        <span style={{ fontSize: 11, color: "var(--text2)" }}>{periodo}</span>
      </div>

      {/* Descrizione */}
      <div style={{ ...td, flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
        {fatto.nome && (
          <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
            {fatto.nome}
          </span>
        )}
        {fatto.fornitore && (
          <span style={{ fontSize: 11, color: "var(--text2)", overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
            {fatto.fornitore}
          </span>
        )}
        {!fatto.nome && !fatto.fornitore && fatto.descrizione && (
          <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis",
                          whiteSpace: "nowrap", maxWidth: "100%" }}>
            {fatto.descrizione}
          </span>
        )}
      </div>

      {/* Importo */}
      <div style={{ ...td, justifyContent: "flex-end" }}>
        <span style={{ fontWeight: 700, fontSize: 14,
                        color: fatto.tipo === "entrata" ? "var(--green, #22c55e)" : "var(--text)" }}>
          {fmtEur(fatto.importoNetto ?? fatto.importo)}
        </span>
      </div>

      {/* Stato */}
      <div style={td}>
        {fatto.stato && fatto.stato !== "normale"
          ? <Badge label={fatto.stato} color={STATO_COLOR[fatto.stato] || "gray"} />
          : <span style={{ fontSize: 11, color: "var(--text2)" }}>—</span>
        }
      </div>

      {/* Allegato */}
      <div style={{ ...td, justifyContent: "center" }}>
        {fatto.hasPdf && (
          <i className="ti ti-paperclip" style={{ fontSize: 13, color: "var(--accent)" }}
             title="PDF allegato" />
        )}
      </div>

      {/* Azioni */}
      <div style={{ ...td, gap: 2, justifyContent: "flex-end" }}
           onClick={e => e.stopPropagation()}>
        {confirmDel ? (
          <>
            <Btn size="sm" variant="ghost" title="Annulla" onClick={() => setConfirmDel(false)}>
              <i className="ti ti-x" style={{ fontSize: 11 }} />
            </Btn>
            <Btn size="sm" variant="danger" title="Conferma eliminazione"
                 onClick={() => onDelete(fatto)}>
              <i className="ti ti-check" style={{ fontSize: 11 }} />
            </Btn>
          </>
        ) : (
          <>
            <Btn size="sm" variant="ghost" title="Modifica" onClick={() => onEdit(fatto)}>
              <i className="ti ti-pencil" style={{ fontSize: 12 }} />
            </Btn>
            <Btn size="sm" variant="ghost" title="Elimina"
                 onClick={() => setConfirmDel(true)}>
              <i className="ti ti-trash" style={{ fontSize: 12, color: "var(--red)" }} />
            </Btn>
          </>
        )}
      </div>
    </div>
  );
}


// ── Sezione Movimenti ─────────────────────────────────────────────────────────
function MovimentiSection({ immobili, condomini, tipologie }) {
  const [fatti,      setFatti]      = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [filtri,     setFiltri]     = useState({
    immobileId: "", condominioId: "", tipo: "",
    tipoSpesaId: "", periodoDa: "", periodoA: "",
  });
  const [filtText,      setFiltText]      = useState("");
  const [soggettoIn,    setSoggettoIn]    = useState("");
  const [sortKey,       setSortKey]       = useState("periodoDa");
  const [sortDir,       setSortDir]       = useState("desc");
  const [selected,      setSelected]      = useState(null);   // fatto aperto in dettaglio
  const [editing,       setEditing]       = useState(null);
  const [err,           setErr]           = useState(null);
  const [selIds,        setSelIds]        = useState(new Set());  // righe selezionate
  const [showBulk,      setShowBulk]      = useState(false);
  const [showImporta,      setShowImporta]      = useState(false);
  const [pendingQueueItem, setPendingQueueItem] = useState(null); // item in attesa conferma duplicati

  const load = useCallback(async () => {
    setLoading(true);
    try { setFatti(await fattiV2.lista(filtri)); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [JSON.stringify(filtri)]);

  useEffect(() => { load(); }, [load]);

  const displayed = useMemo(() => {
    if (!fatti) return [];
    let list = fatti;
    if (filtText.trim()) {
      const q = filtText.trim().toLowerCase();
      list = list.filter(f =>
        [f.nome, f.fornitore, f.descrizione, f.immobileNome, f.condominioNome, f.tipoSpesaDesc]
          .some(v => v?.toLowerCase().includes(q))
      );
    }
    if (soggettoIn.trim()) {
      const q = soggettoIn.trim().toLowerCase();
      list = list.filter(f =>
        [f.soggettoPaganteNome, f.soggettoIncassanteNome, f.personaNome]
          .some(v => v?.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => {
      let va = a[sortKey] ?? "";
      let vb = b[sortKey] ?? "";
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [fatti, filtText, soggettoIn, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function toggleSelId(id) {
    setSelIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const allIds = new Set(displayed.map(f => f.id));
    setSelIds(prev => prev.size === displayed.length ? new Set() : allIds);
  }

  async function handleBulkApplica(dati) {
    await fattiV2.aggiornaBulk([...selIds], dati);
    setSelIds(new Set());
    await load();
  }

  const pdfInputRef = useRef();

  const { queue, addFiles, removeItem, clearQueue, apriProssimo } = usePdfQueue({
    extractFn: async (file) => {
      const { hash, duplicati } = await fattiV2.checkHash(file);
      const data = await fattiV2.estraiPdf(file, { immobili, tipologie });
      return { ...data, nomeFile: file.name, hash, duplicatiFile: duplicati };
    },
    onReady: (item) => {
      if (item.data?.duplicatiFile?.length > 0) {
        setPendingQueueItem(item);
      } else {
        apriEditingDaCoda(item);
      }
    },
    keepFile: true,
  });

  function apriEditingDaCoda(item) {
    setEditing({
      tipo:           "spesa",
      immobileId:     item.data?.immobileId  || "",
      tipoSpesaId:    item.data?.tipoSpesaId || "",
      importo:        item.data?.importo     || "",
      fornitore:      item.data?.fornitore   || "",
      numeroFattura:  item.data?.numeroDoc   || "",
      periodoDa:      item.data?.periodoDa   || "",
      periodoA:       item.data?.periodoA    || "",
      nomeFile:       item.nomeFile,
      fileHash:       item.data?.hash,
      confidenza:     item.data?.confidenza,
      duplicatiFile:  item.data?.duplicatiFile,
      _pdfUrl:        item.pdfUrl,
      _pdfFile:       item._file,
      _queueId:       item.id,
    });
  }

  async function handleSave(form) {
    const fatto = editing?.id
      ? await fattiV2.aggiorna(editing.id, form)
      : await fattiV2.crea(form);

    // Auto-upload del file originale dalla coda
    if (!editing?.id && editing?._pdfFile) {
      try { await fattiV2.uploadPdf(fatto.id, editing._pdfFile); }
      catch { /* non bloccante */ }
    }

    await load();
    return fatto;
  }

  async function handleDelete(fatto) {
    try {
      await fattiV2.elimina(fatto.id);
      await load();
    } catch (e) { setErr("Eliminazione fallita: " + e.message); }
  }

  const setFiltro = k => e => setFiltri(f => ({ ...f, [k]: e.target.value }));

  const totali = fatti
    ? {
        spese:   fatti.filter(f => f.tipo === "spesa")  .reduce((s, f) => s + (f.importoNetto ?? f.importo), 0),
        entrate: fatti.filter(f => f.tipo === "entrata").reduce((s, f) => s + (f.importoNetto ?? f.importo), 0),
      }
    : null;

  return (
    <div>
      {/* Barra filtri — riga 1: filtri server */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select className="inp" value={filtri.tipo} onChange={setFiltro("tipo")} style={{ width: 120 }}>
          <option value="">Tutti i tipi</option>
          <option value="spesa">Spese</option>
          <option value="entrata">Entrate</option>
        </select>
        <select className="inp" value={filtri.condominioId} onChange={setFiltro("condominioId")} style={{ width: 165 }}>
          <option value="">Tutti i condomini</option>
          {condomini.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className="inp" value={filtri.immobileId} onChange={setFiltro("immobileId")} style={{ width: 165 }}>
          <option value="">Tutti gli immobili</option>
          {immobili.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
        </select>
        <select className="inp" value={filtri.tipoSpesaId} onChange={setFiltro("tipoSpesaId")} style={{ width: 145 }}>
          <option value="">Tutti i tipi spesa</option>
          {tipologie.map(t => <option key={t.id} value={t.id}>{t.descrizione}</option>)}
        </select>
        <input className="inp" type="month" value={filtri.periodoDa}
               onChange={setFiltro("periodoDa")} style={{ width: 128 }}
               title="Periodo da" />
        <input className="inp" type="month" value={filtri.periodoA}
               onChange={setFiltro("periodoA")} style={{ width: 128 }}
               title="Periodo a" />
      </div>
      {/* Barra filtri — riga 2: ricerca testo + soggetto + contatori */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input className="inp" placeholder="Cerca testo…" value={filtText}
               onChange={e => setFiltText(e.target.value)} style={{ width: 190 }} />
        <input className="inp" placeholder="Cerca soggetto…" value={soggettoIn}
               onChange={e => setSoggettoIn(e.target.value)}
               title="Filtra per soggetto pagante / incassante"
               style={{ width: 190 }} />
        <span style={{ flex: 1 }} />
        {totali && (
          <span style={{ fontSize: 12, color: "var(--text2)", display: "flex", gap: 12 }}>
            {loading
              ? <i className="ti ti-loader-2 ti-spin" />
              : <>
                  <span>
                    {displayed.length}
                    {displayed.length !== fatti.length && ` / ${fatti.length}`}
                    {" voci"}
                  </span>
                  {filtri.tipo !== "entrata" && <span style={{ color: "#60a5fa" }}>▼ {fmtEur(totali.spese)}</span>}
                  {filtri.tipo !== "spesa"   && <span style={{ color: "#4ade80" }}>▲ {fmtEur(totali.entrate)}</span>}
                </>
            }
          </span>
        )}
      </div>

      {/* Toolbar azioni */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, justifyContent: "flex-end" }}>
        <Btn variant="secondary" onClick={() => setShowImporta(true)} title="Importa estratto conto PDF/Excel/CSV">
          <i className="ti ti-sparkles" /> Importa estratto
        </Btn>
        <Btn variant="ghost" onClick={() => pdfInputRef.current?.click()}>
          <i className="ti ti-file-upload" /> Carica PDF
        </Btn>
        <input ref={pdfInputRef} type="file" accept="application/pdf,.pdf" multiple
               style={{ display: "none" }}
               onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
        <Btn variant="ghost" onClick={() => setEditing({ tipo: "entrata" })}>
          <i className="ti ti-plus" /> Entrata
        </Btn>
        <Btn variant="primary" onClick={() => setEditing({ tipo: "spesa" })}>
          <i className="ti ti-plus" /> Spesa
        </Btn>
      </div>

      {/* Coda PDF */}
      <PdfQueuePanel
        queue={queue}
        onValida={item => { setEditing(null); setTimeout(() => apriProssimo([item]), 0); }}
        onRemove={removeItem}
        onClear={clearQueue}
        onProssimo={() => apriProssimo(queue)}
      />

      {err && (
        <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 12,
                      padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)",
                      border: "1px solid var(--red)", display: "flex", justifyContent: "space-between" }}>
          {err}
          <button onClick={() => setErr(null)} style={{ background: "none", border: "none",
                                                         cursor: "pointer", color: "var(--red)" }}>✕</button>
        </div>
      )}

      {!fatti && !err && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text2)" }}>
          <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 24 }} />
        </div>
      )}

      {fatti && displayed.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: 48, color: "var(--text2)" }}>
          <i className="ti ti-coin-off" style={{ fontSize: 36, opacity: 0.35, display: "block", marginBottom: 12 }} />
          Nessun movimento trovato.
        </div>
      )}

      {/* Barra selezione bulk */}
      {selIds.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 8,
          padding: "9px 14px", borderRadius: 9,
          background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.4)",
        }}>
          <i className="ti ti-checklist" style={{ color: "var(--accent)", fontSize: 16 }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>
            {selIds.size} {selIds.size === 1 ? "voce selezionata" : "voci selezionate"}
          </span>
          <Btn variant="primary" size="sm" onClick={() => setShowBulk(true)}>
            <i className="ti ti-edit" /> Modifica massiva
          </Btn>
          <Btn variant="ghost" size="sm" onClick={() => setSelIds(new Set())}>
            <i className="ti ti-x" /> Deseleziona
          </Btn>
        </div>
      )}

      {fatti && displayed.length > 0 && (
        <div>
          <SortableGridHeader
            sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}
            allSelected={selIds.size === displayed.length && displayed.length > 0}
            someSelected={selIds.size > 0}
            onSelectAll={toggleSelectAll}
          />
          {displayed.map(f => (
            <FattoRow
              key={f.id}
              fatto={f}
              selected={selIds.has(f.id)}
              onToggle={toggleSelId}
              onSelect={setSelected}
              onEdit={fatto => { setEditing(fatto); setSelected(null); }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Blocco duplicati coda PDF — modale bloccante prima di aprire il form */}
      {pendingQueueItem && (
        <DuplicatiModal
          hash={pendingQueueItem.data?.hash}
          duplicati={pendingQueueItem.data?.duplicatiFile}
          onAnnulla={() => {
            const item = pendingQueueItem;
            setPendingQueueItem(null);
            removeItem(item.id);
            const remaining = queue.filter(q => q.id !== item.id);
            if (remaining.some(q => q.stato === "pronto"))
              setTimeout(() => apriProssimo(remaining), 150);
          }}
          onProcedi={() => {
            const item = pendingQueueItem;
            setPendingQueueItem(null);
            apriEditingDaCoda(item);
          }}
        />
      )}

      {/* Modale form fatto */}
      {editing !== null && (
        <FattoModal
          initial={editing || undefined}
          onSave={handleSave}
          onClose={saved => {
            const queueId = editing?._queueId;
            setEditing(null);
            if (saved && queueId) {
              const remaining = queue.filter(q => q.id !== queueId);
              removeItem(queueId);
              if (remaining.some(q => q.stato === "pronto"))
                setTimeout(() => apriProssimo(remaining), 150);
            }
            if (saved) load();
          }}
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

      {/* Modale modifica massiva */}
      {showBulk && (
        <BulkEditModal
          count={selIds.size}
          immobili={immobili}
          condomini={condomini}
          tipologie={tipologie}
          onApplica={handleBulkApplica}
          onClose={() => setShowBulk(false)}
        />
      )}

      {/* Modale importa estratto */}
      {showImporta && (
        <ImportazioneV2Modal
          immobili={immobili}
          onSaved={() => load()}
          onClose={() => setShowImporta(false)}
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
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
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
