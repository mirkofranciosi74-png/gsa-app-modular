/**
 * CreaRegolaModal — crea o aggiorna una regola di associazione
 * partendo da un movimento esistente.
 *
 * Props:
 *   movimento    – oggetto movimento (descrizione, appartamento_id, componente_id, tipo_versamento)
 *   appartamenti – lista appartamenti con componenti
 *   onSaved      – callback dopo il salvataggio
 *   onClose      – chiude il modal
 */

import { useState, useEffect } from "react";
import { importazioneApi, tipiVersamentoApi, tipiSpesaApi } from "../api.js";
import { Modal, Btn, Field } from "./ui.jsx";

export default function CreaRegolaModal({ movimento, appartamenti, onSaved, onClose }) {
  const [stringa,        setStringa]       = useState(movimento?.descrizione || "");
  const [appartamentoId, setAppartamentoId] = useState(String(movimento?.appartamento_id || ""));
  const [componenteId,   setComponenteId]  = useState(String(movimento?.componente_id   || ""));
  const [tipoRiga,       setTipoRiga]      = useState(movimento?.tipo_versamento || "");
  const [tipiVers,       setTipiVers]      = useState([]);
  const [tipiSpesa,      setTipiSpesa]     = useState([]);
  const [saving,         setSaving]        = useState(false);
  const [esistente,      setEsistente]     = useState(null);

  useEffect(() => {
    tipiVersamentoApi.list().then(tv => setTipiVers(tv || [])).catch(() => {});
    tipiSpesaApi.list()
      .then(ts => setTipiSpesa((ts || []).map(t => ({ ...t, nome: t.descrizione || t.nome }))))
      .catch(() => {});
    // verifica se esiste già una regola per questa stringa
    if (movimento?.descrizione) {
      importazioneApi.listRegole()
        .then(rs => {
          const norm = s => (s || "").toLowerCase().trim();
          const trovata = rs.find(r => norm(r.stringa) === norm(movimento.descrizione));
          if (trovata) setEsistente(trovata);
        })
        .catch(() => {});
    }
  }, []);

  const appSel = appartamenti.find(a => String(a.id) === appartamentoId);
  const comps  = appSel?.componenti || [];

  async function handleSave() {
    if (!stringa.trim()) return;
    setSaving(true);
    try {
      await importazioneApi.saveRegola({
        stringa:         stringa.trim(),
        appartamento_id: appartamentoId || null,
        componente_id:   componenteId   || null,
        tipo_riga:       tipoRiga        || null,
      });
      onSaved();
      onClose();
    } catch (e) {
      alert("Errore nel salvataggio: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={esistente ? "Aggiorna regola di associazione" : "Nuova regola di associazione"}
      onClose={onClose}
      width={520}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Annulla</Btn>
          <div style={{ flex: 1 }} />
          <Btn variant="primary" onClick={handleSave} disabled={saving || !stringa.trim()}>
            <i className={`ti ${saving ? "ti-loader" : "ti-check"}`} />
            {saving ? "Salvataggio…" : esistente ? "Aggiorna regola" : "Salva regola"}
          </Btn>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {esistente && (
          <div style={{
            background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.3)",
            borderRadius: 8, padding: "8px 12px", fontSize: 12,
          }}>
            <i className="ti ti-info-circle" style={{ marginRight: 6, color: "var(--accent)" }} />
            Esiste già una regola per questa stringa — verrà aggiornata.
          </div>
        )}

        <Field label="Stringa da cercare nell'estratto conto"
          hint="La parola o frase da trovare nella descrizione bancaria">
          <input
            value={stringa}
            onChange={e => setStringa(e.target.value)}
            placeholder="es. MARIO ROSSI o AFFITTO LUGO"
            style={{ fontFamily: "monospace" }}
            autoFocus
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Appartamento">
            <select value={appartamentoId}
              onChange={e => { setAppartamentoId(e.target.value); setComponenteId(""); }}>
              <option value="">— Nessuno —</option>
              {appartamenti.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </Field>
          <Field label="Inquilino">
            <select value={componenteId}
              onChange={e => setComponenteId(e.target.value)}
              disabled={!appartamentoId}>
              <option value="">— Nessuno —</option>
              {comps.map(c => (
                <option key={c.id} value={c.id}>{c.cognome || ""} {c.nome || ""}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Categoria"
          hint="Tipo di versamento o spesa assegnato automaticamente alle righe che corrispondono">
          <select value={tipoRiga} onChange={e => setTipoRiga(e.target.value)}>
            <option value="">— Nessuna —</option>
            {tipiVers.length > 0 && (
              <optgroup label="Entrate (versamenti)">
                {tipiVers.map(t => <option key={t.id} value={t.nome}>{t.nome}</option>)}
              </optgroup>
            )}
            {tipiSpesa.length > 0 && (
              <optgroup label="Uscite (spese)">
                {tipiSpesa.map(t => <option key={t.id} value={t.nome}>{t.nome}</option>)}
              </optgroup>
            )}
            <option value="ignora">— Ignora questa riga —</option>
          </select>
        </Field>

        <div style={{
          background: "var(--bg2)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "10px 12px", fontSize: 11, color: "var(--text2)",
        }}>
          <i className="ti ti-bulb" style={{ marginRight: 5, color: "var(--accent)" }} />
          La regola verrà applicata automaticamente durante la prossima importazione di estratto conto:
          ogni riga che contiene <strong style={{ color: "var(--text)" }}>"{stringa || "…"}"</strong> verrà
          associata a questo appartamento/inquilino.
        </div>
      </div>
    </Modal>
  );
}
