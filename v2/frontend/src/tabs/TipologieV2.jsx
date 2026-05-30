import { useState, useEffect, useCallback, useMemo } from "react";
import { tipologieV2 } from "../api/apiV2.js";
import { Btn, Badge, Modal, Field } from "../../components/ui.jsx";

// ── Costanti ──────────────────────────────────────────────────────────────────
const METODI_RIPARTO = ["", "Percentuale", "Parti uguali", "Manuale"];

const CATEGORIE_SPESA   = ["Utenza", "Condominio", "Tassa", "Manutenzione", "Assicurazione", "Altro"];
const CATEGORIE_ENTRATA = ["Affitto", "Rimborso", "B&B", "Altro"];

const CAT_COLOR = {
  Utenza:       "blue",
  Condominio:   "purple",
  Tassa:        "orange",
  Manutenzione: "yellow",
  Assicurazione:"gray",
  Affitto:      "green",
  Rimborso:     "blue",
  "B&B":        "purple",
  Altro:        "gray",
};

const fmtData = iso => {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString("it-IT", { dateStyle: "short" }); }
  catch { return iso; }
};

// ── Modal crea / modifica ─────────────────────────────────────────────────────
function TipologiaModal({ initial, onSave, onClose }) {
  const isNew = !initial?.id;
  const [form, setForm] = useState({
    descrizione:    "",
    tipo:           "spesa",
    categoria:      "",
    metodo_riparto: "",
    codice:         "",
    validita_da:    "",
    validita_a:     "",
    note:           "",
    attivo:         true,
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);

  const set  = k => e  => setForm(f => ({ ...f, [k]: e.target.value }));
  const setB = k => e  => setForm(f => ({ ...f, [k]: e.target.checked }));

  async function handleSave() {
    if (!form.descrizione?.trim()) { setErr("Descrizione obbligatoria"); return; }
    setSaving(true); setErr(null);
    try { await onSave(form); onClose(); }
    catch (e) { setErr(e.message); setSaving(false); }
  }

  const cats = form.tipo === "entrata" ? CATEGORIE_ENTRATA : CATEGORIE_SPESA;

  return (
    <Modal
      title={isNew ? "Nuova tipologia" : `Modifica — ${initial.descrizione}`}
      onClose={onClose}
      width={500}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
          <Btn variant="primary" onClick={handleSave} disabled={saving || !form.descrizione?.trim()}>
            {saving ? <><i className="ti ti-loader-2 ti-spin" /> Salvo…</> : <><i className="ti ti-check" /> Salva</>}
          </Btn>
        </>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        {err && (
          <p style={{ fontSize: 13, color: "var(--red)", margin: 0,
                      padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)" }}>
            <i className="ti ti-alert-circle" style={{ marginRight: 6 }} />{err}
          </p>
        )}

        {/* Riga 1: Descrizione + Codice */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 10 }}>
          <Field label="Descrizione *">
            <input className="inp" value={form.descrizione} onChange={set("descrizione")} autoFocus
                   placeholder="Es. Acqua, Affitto, Condominio…" />
          </Field>
          <Field label="Codice breve">
            <input className="inp" value={form.codice || ""} onChange={set("codice")}
                   placeholder="Es. ACQ" style={{ textTransform: "uppercase" }} />
          </Field>
        </div>

        {/* Riga 2: Tipo + Categoria */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Tipo *">
            <select className="inp" value={form.tipo} onChange={set("tipo")}>
              <option value="spesa">Spesa</option>
              <option value="entrata">Entrata</option>
            </select>
          </Field>
          <Field label="Categoria">
            <select className="inp" value={form.categoria || ""} onChange={set("categoria")}>
              <option value="">— Nessuna —</option>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>

        {/* Riga 3: Metodo riparto */}
        <Field label="Metodo di riparto">
          <select className="inp" value={form.metodo_riparto || ""} onChange={set("metodo_riparto")}>
            {METODI_RIPARTO.map(m => <option key={m} value={m}>{m || "— Non specificato —"}</option>)}
          </select>
        </Field>

        {/* Riga 4: Validità da/a */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Valida dal">
            <input className="inp" type="date" value={form.validita_da || ""} onChange={set("validita_da")} />
          </Field>
          <Field label="Valida al">
            <input className="inp" type="date" value={form.validita_a || ""} onChange={set("validita_a")} />
          </Field>
        </div>

        {/* Note interne */}
        <Field label="Note interne">
          <textarea className="inp" rows={2} value={form.note || ""} onChange={set("note")}
                    style={{ resize: "vertical" }} placeholder="Visibili solo in gestione tipologie" />
        </Field>

        {/* Attivo */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={form.attivo !== false} onChange={setB("attivo")} />
          Tipologia attiva (visibile nella selezione fatti economici)
        </label>
      </div>
    </Modal>
  );
}

// ── Conferma eliminazione ─────────────────────────────────────────────────────
function DeleteConfirm({ tipologia, onConfirm, onClose }) {
  const [uso,      setUso]      = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [err,      setErr]      = useState(null);

  useEffect(() => {
    tipologieV2.uso(tipologia.id)
      .then(r => setUso(r.count))
      .catch(() => setUso(0));
  }, [tipologia.id]);

  async function doDelete() {
    setDeleting(true); setErr(null);
    try { await onConfirm(); onClose(); }
    catch (e) { setErr(e.message); setDeleting(false); }
  }

  return (
    <Modal
      title="Conferma eliminazione"
      onClose={onClose}
      width={420}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
          <Btn variant="danger" onClick={doDelete}
               disabled={deleting || uso === null || uso > 0}>
            {deleting ? "…" : <><i className="ti ti-trash" /> Elimina</>}
          </Btn>
        </>
      }
    >
      <p style={{ margin: "0 0 14px" }}>
        Eliminare la tipologia <strong>"{tipologia.descrizione}"</strong>?
      </p>

      {uso === null && (
        <p style={{ color: "var(--text2)", fontSize: 13 }}>
          <i className="ti ti-loader-2 ti-spin" style={{ marginRight: 6 }} />Verifica utilizzi…
        </p>
      )}

      {uso === 0 && (
        <p style={{ color: "#16a34a", fontSize: 13 }}>
          <i className="ti ti-circle-check" style={{ marginRight: 6 }} />Nessun fatto economico associato. Eliminazione possibile.
        </p>
      )}

      {uso > 0 && (
        <div style={{ background: "var(--bg3)", border: "1px solid var(--border)",
                      borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
          <p style={{ color: "var(--red)", fontWeight: 600, margin: "0 0 4px" }}>
            <i className="ti ti-alert-triangle" style={{ marginRight: 6 }} />Impossibile eliminare
          </p>
          <p style={{ color: "var(--text2)", margin: 0 }}>
            Questa tipologia è usata in <strong>{uso}</strong> {uso === 1 ? "fatto economico" : "fatti economici"}.
            Riassegna o elimina prima quei fatti.
          </p>
        </div>
      )}

      {err && (
        <p style={{ color: "var(--red)", fontSize: 12, marginTop: 10 }}>{err}</p>
      )}
    </Modal>
  );
}

// ── Card singola tipologia ────────────────────────────────────────────────────
function TipologiaCard({ t, onEdit, onDelete }) {
  const meta = [
    t.metodo_riparto && `Riparto: ${t.metodo_riparto}`,
    t.validita_da && `dal ${fmtData(t.validita_da)}`,
    t.validita_a  && `al ${fmtData(t.validita_a)}`,
  ].filter(Boolean);

  return (
    <div style={{
      background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10,
      padding: "12px 16px", display: "grid",
      gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center",
      opacity: t.attivo ? 1 : 0.55,
      transition: "box-shadow 0.15s",
    }}>
      {/* Indicatore tipo */}
      <div style={{
        width: 4, height: 44, borderRadius: 4,
        background: t.tipo === "entrata" ? "var(--green)" : "var(--accent)",
        flexShrink: 0,
      }} />

      {/* Contenuto */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 4 }}>
          <Badge label={t.tipo === "entrata" ? "Entrata" : "Spesa"}
                 color={t.tipo === "entrata" ? "green" : "blue"} />
          {t.categoria && (
            <Badge label={t.categoria} color={CAT_COLOR[t.categoria] || "gray"} />
          )}
          {!t.attivo && <Badge label="Inattiva" color="gray" />}
          <span style={{ fontWeight: 700, fontSize: 14 }}>{t.descrizione}</span>
          {t.codice && t.codice !== String(t.id) && (
            <span style={{ fontSize: 11, color: "var(--text2)", fontFamily: "monospace" }}>[{t.codice}]</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--text2)", display: "flex", gap: 10, flexWrap: "wrap" }}>
          {meta.map((m, i) => <span key={i}>{m}</span>)}
          {t.note_interne && (
            <span title={t.note_interne}>
              <i className="ti ti-notes" style={{ fontSize: 11 }} /> {t.note_interne.length > 40 ? t.note_interne.slice(0, 40) + "…" : t.note_interne}
            </span>
          )}
        </div>
      </div>

      {/* Azioni */}
      <div style={{ display: "flex", gap: 4 }}>
        <Btn size="sm" variant="ghost" onClick={() => onEdit(t)} title="Modifica">
          <i className="ti ti-pencil" />
        </Btn>
        <Btn size="sm" variant="ghost" onClick={() => onDelete(t)} title="Elimina">
          <i className="ti ti-trash" style={{ color: "var(--red)" }} />
        </Btn>
      </div>
    </div>
  );
}

// ── Tab principale ─────────────────────────────────────────────────────────────
export function TipologieV2() {
  const [tipologie,  setTipologie]  = useState(null);
  const [filtroTipo, setFiltroTipo] = useState("tutte");
  const [cerca,      setCerca]      = useState("");
  const [editing,    setEditing]    = useState(null);   // null | {} | tipologia
  const [confirmDel, setConfirmDel] = useState(null);
  const [err,        setErr]        = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setTipologie(await tipologieV2.lista()); }
    catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visibili = useMemo(() => {
    if (!tipologie) return [];
    return tipologie.filter(t => {
      if (filtroTipo !== "tutte" && t.tipo !== filtroTipo) return false;
      if (cerca.trim()) {
        const q = cerca.toLowerCase();
        return t.descrizione?.toLowerCase().includes(q) ||
               t.categoria?.toLowerCase().includes(q)   ||
               t.codice?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [tipologie, filtroTipo, cerca]);

  const countSpese   = tipologie?.filter(t => t.tipo === "spesa").length   ?? 0;
  const countEntrate = tipologie?.filter(t => t.tipo === "entrata").length ?? 0;
  const countInattive = tipologie?.filter(t => !t.attivo).length           ?? 0;

  async function handleSave(form) {
    if (editing?.id) await tipologieV2.aggiorna(editing.id, form);
    else             await tipologieV2.crea(form);
    await load();
  }

  const TABS = [
    { id: "tutte",   label: `Tutte (${tipologie?.length ?? 0})` },
    { id: "spesa",   label: `Spese (${countSpese})`   },
    { id: "entrata", label: `Entrate (${countEntrate})` },
  ];

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Intestazione */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
            <i className="ti ti-tags" style={{ marginRight: 8, color: "var(--accent)" }} />
            Tipologie Economiche
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text2)" }}>
            Voci di spesa e di entrata utilizzabili nei fatti economici
          </p>
        </div>
        <Btn variant="primary" onClick={() => setEditing({})}>
          <i className="ti ti-plus" /> Nuova tipologia
        </Btn>
      </div>

      {/* Stats */}
      {tipologie && (
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { label: "Spese",    value: countSpese,    color: "var(--accent)",  icon: "ti-arrow-up-circle" },
            { label: "Entrate",  value: countEntrate,  color: "var(--green)",   icon: "ti-arrow-down-circle" },
            { label: "Inattive", value: countInattive, color: "var(--text2)",   icon: "ti-eye-off" },
          ].map(s => (
            <div key={s.label} style={{
              background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10,
              padding: "10px 18px", display: "flex", alignItems: "center", gap: 10,
            }}>
              <i className={`ti ${s.icon}`} style={{ fontSize: 18, color: s.color }} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "var(--text2)" }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar: sub-tab tipo + search */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {/* Sub-tabs */}
        <div style={{ display: "flex", borderBottom: "2px solid var(--border)", gap: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setFiltroTipo(t.id)} style={{
              padding: "6px 14px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, color: filtroTipo === t.id ? "var(--accent)" : "var(--text2)",
              fontWeight: filtroTipo === t.id ? 700 : 400,
              borderBottom: filtroTipo === t.id ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -2,
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <span style={{ flex: 1 }} />

        {/* Ricerca */}
        <div style={{ position: "relative" }}>
          <i className="ti ti-search" style={{
            position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
            fontSize: 14, color: "var(--text2)", pointerEvents: "none",
          }} />
          <input
            className="inp"
            placeholder="Cerca descrizione, categoria, codice…"
            value={cerca}
            onChange={e => setCerca(e.target.value)}
            style={{ paddingLeft: 32, width: 260 }}
          />
        </div>
      </div>

      {/* Errore caricamento */}
      {err && (
        <p style={{ color: "var(--red)", fontSize: 13, padding: "8px 12px",
                    borderRadius: 8, background: "rgba(239,68,68,0.08)", marginBottom: 12 }}>
          <i className="ti ti-alert-circle" style={{ marginRight: 6 }} />{err}
        </p>
      )}

      {/* Loading */}
      {!tipologie && !err && (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text2)" }}>
          <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 28 }} />
        </div>
      )}

      {/* Nessun risultato */}
      {tipologie && visibili.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text2)" }}>
          <i className="ti ti-tags-off" style={{ fontSize: 36, opacity: 0.3, display: "block", marginBottom: 12 }} />
          {cerca ? "Nessuna tipologia corrisponde alla ricerca." : "Nessuna tipologia presente."}
        </div>
      )}

      {/* Lista */}
      {visibili.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {visibili.map(t => (
            <TipologiaCard
              key={t.id}
              t={t}
              onEdit={setEditing}
              onDelete={setConfirmDel}
            />
          ))}
        </div>
      )}

      {/* Modali */}
      {editing !== null && (
        <TipologiaModal
          initial={editing?.id ? editing : undefined}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {confirmDel && (
        <DeleteConfirm
          tipologia={confirmDel}
          onConfirm={() => tipologieV2.elimina(confirmDel.id).then(load)}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}
