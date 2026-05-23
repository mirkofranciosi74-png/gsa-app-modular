import { useState, useEffect, useCallback } from "react";
import { tipiSpesaApi, tipiVersamentoApi } from "../api.js";
import { Btn, Badge, Modal, Field, SectionHeader } from "../components/ui.jsx";

const COLORI_TV = [
  { value: "blue",   label: "Blu"      },
  { value: "green",  label: "Verde"    },
  { value: "purple", label: "Viola"    },
  { value: "red",    label: "Rosso"    },
  { value: "orange", label: "Arancio"  },
  { value: "gray",   label: "Grigio"   },
];

// ── Tipi Spesa ────────────────────────────────────────────────────────────────
function TipiSpesa() {
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
    <div style={{ marginBottom: 40 }}>
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

// ── Tipi Versamento ───────────────────────────────────────────────────────────
function TipiVersamento() {
  const [list,  setList]  = useState([]);
  const [modal, setModal] = useState(null);
  const [conf,  setConf]  = useState(null);

  const load = useCallback(() => tipiVersamentoApi.list().then(setList), []);
  useEffect(() => { load(); }, [load]);

  async function save(f) {
    try {
      f.id
        ? await tipiVersamentoApi.update(f.id, f)
        : await tipiVersamentoApi.create(f);
      setModal(null); load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  async function remove(id) {
    try {
      await tipiVersamentoApi.delete(id);
      load();
    } catch (e) { alert("Errore: " + e.message); }
    setConf(null);
  }

  return (
    <div>
      <SectionHeader
        title="Tipi di Versamento"
        action={
          <Btn variant="primary" onClick={() =>
            setModal({ nome: "", colore: "gray", attivo: true })
          }>
            <i className="ti ti-plus" /> Nuovo Tipo
          </Btn>
        }
      />
      <table>
        <thead>
          <tr>
            <th>Nome</th><th>Colore</th><th>Stato</th>
            <th style={{ textAlign: "right" }}>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {list.map(t => (
            <tr key={t.id} style={{ opacity: t.attivo ? 1 : 0.5 }}>
              <td style={{ fontWeight: 600 }}>{t.nome}</td>
              <td>
                <Badge label={COLORI_TV.find(c => c.value === t.colore)?.label || t.colore}
                       color={t.colore} />
              </td>
              <td>{t.attivo ? <Badge label="Attivo" color="green" /> : <Badge label="Inattivo" color="gray" />}</td>
              <td style={{ textAlign: "right", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <Btn variant="secondary" size="sm" onClick={() => setModal({ ...t })}>
                  <i className="ti ti-edit" /> Modifica
                </Btn>
                <Btn variant="danger" size="sm" onClick={() => setConf(t.id)}
                  title="Elimina (solo se non in uso)">
                  <i className="ti ti-trash" />
                </Btn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {modal && (
        <Modal title={modal.id ? "Modifica Tipo Versamento" : "Nuovo Tipo Versamento"}
          onClose={() => setModal(null)} width={380}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setModal(null)}>Annulla</Btn>
              <Btn variant="success" onClick={() => save(modal)}
                disabled={!modal.nome?.trim()}>
                <i className="ti ti-check" /> Salva
              </Btn>
            </>
          }>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Nome *" warn={!modal.nome?.trim()}>
              <input value={modal.nome}
                onChange={e => setModal(m => ({ ...m, nome: e.target.value }))}
                placeholder="Es. entrata b&b" />
            </Field>
            <Field label="Colore badge">
              <select value={modal.colore}
                onChange={e => setModal(m => ({ ...m, colore: e.target.value }))}>
                {COLORI_TV.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
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

      {conf && (
        <Modal title="Conferma eliminazione" onClose={() => setConf(null)} width={360}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setConf(null)}>Annulla</Btn>
              <Btn variant="danger" onClick={() => remove(conf)}>
                <i className="ti ti-trash" /> Elimina
              </Btn>
            </>
          }>
          <p>Eliminare questo tipo di versamento?<br />
            <small style={{ color: "var(--text2)" }}>
              Non è possibile eliminare tipi già utilizzati nei movimenti.
            </small>
          </p>
        </Modal>
      )}
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
export function Tipologie() {
  return (
    <div>
      <TipiSpesa />
      <TipiVersamento />
    </div>
  );
}
