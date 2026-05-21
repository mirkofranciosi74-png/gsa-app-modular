import { useState, useEffect, useCallback } from "react";
import { tipiSpesaApi } from "../api.js";
import { Btn, Badge, Modal, Field, SectionHeader } from "../components/ui.jsx";

export function Tipologie() {
  const [list,  setList]  = useState([]);
  const [modal, setModal] = useState(null);

  const load = useCallback(() => tipiSpesaApi.list().then(setList), []);
  useEffect(() => { load(); }, [load]);

  async function save(f) {
    try {
      f.id ? await tipiSpesaApi.update(f.id, f) : await tipiSpesaApi.create(f);
      setModal(null); load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  return (
    <div>
      <SectionHeader
        title="Tipologie di Spesa"
        action={
          <Btn variant="primary" onClick={() =>
            setModal({ descrizione: "", categoria: "Utenza", riparto: "Percentuale", attivo: true })
          }>
            <i className="ti ti-plus" /> Nuova Tipologia
          </Btn>
        }
      />
      <table>
        <thead>
          <tr>
            <th>Tipologia</th><th>Categoria</th><th>Riparto</th><th>Stato</th>
            <th style={{ textAlign: "right" }}>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {list.map(t => (
            <tr key={t.id} style={{ opacity: t.attivo ? 1 : 0.5 }}>
              <td style={{ fontWeight: 600 }}>{t.descrizione}</td>
              <td style={{ color: "var(--text2)" }}>{t.categoria}</td>
              <td style={{ color: "var(--text2)" }}>{t.riparto}</td>
              <td>{t.attivo ? <Badge label="Attivo" color="green" /> : <Badge label="Inattivo" color="gray" />}</td>
              <td style={{ textAlign: "right" }}>
                <Btn variant="secondary" size="sm" onClick={() => setModal({ ...t })}>
                  <i className="ti ti-edit" /> Rinomina
                </Btn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {modal && (
        <Modal title={modal.id ? "Modifica" : "Nuova Tipologia"} onClose={() => setModal(null)} width={400}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setModal(null)}>Annulla</Btn>
              <Btn variant="success" onClick={() => save(modal)}><i className="ti ti-check" /> Salva</Btn>
            </>
          }>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Descrizione *" warn={!modal.descrizione}>
              <input value={modal.descrizione}
                onChange={e => setModal(m => ({ ...m, descrizione: e.target.value }))}
                placeholder="Es. Acqua" />
            </Field>
            <Field label="Categoria">
              <select value={modal.categoria} onChange={e => setModal(m => ({ ...m, categoria: e.target.value }))}>
                {["Utenza","Condominio","Tassa","Altro"].map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Metodo di riparto">
              <select value={modal.riparto} onChange={e => setModal(m => ({ ...m, riparto: e.target.value }))}>
                {["Percentuale","Parti uguali","Manuale"].map(r => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={modal.attivo !== false}
                onChange={e => setModal(m => ({ ...m, attivo: e.target.checked }))} />
              Attivo
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
