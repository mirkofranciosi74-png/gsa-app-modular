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

const CATEGORIA_COLORI = {
  Utenza:     "blue",
  Condominio: "purple",
  Tassa:      "orange",
  Altro:      "gray",
};

// ── Tipi Spesa ────────────────────────────────────────────────────────────────
function TipiSpesa() {
  const [list,  setList]  = useState([]);
  const [modal, setModal] = useState(null);
  const [conf,  setConf]  = useState(null); // { id, descrizione, deleting, dep }

  const load = useCallback(() => tipiSpesaApi.list().then(setList), []);
  useEffect(() => { load(); }, [load]);

  async function save(f) {
    try {
      f.id ? await tipiSpesaApi.update(f.id, f) : await tipiSpesaApi.create(f);
      setModal(null); load();
    } catch (e) { alert("Errore: " + e.message); }
  }

  async function askDelete(t) {
    setConf({ id: t.id, descrizione: t.descrizione, deleting: false, dep: null });
    try {
      const dep = await tipiSpesaApi.dipendenze(t.id);
      setConf(c => c ? { ...c, dep } : null);
    } catch {
      setConf(c => c ? { ...c, dep: { documenti: 0, spese_proprietari: 0 } } : null);
    }
  }

  async function doDelete() {
    if (!conf) return;
    setConf(c => ({ ...c, deleting: true }));
    try {
      await tipiSpesaApi.delete(conf.id);
      setConf(null); load();
    } catch (e) {
      alert("Errore: " + e.message);
      setConf(c => c ? { ...c, deleting: false } : null);
    }
  }

  const depTot = conf?.dep ? conf.dep.documenti + conf.dep.spese_proprietari : null;

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
            <th>Tipologia</th><th>Categoria</th><th>Stato</th>
            <th style={{ textAlign: "right" }}>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {list.map(t => (
            <tr key={t.id} style={{ opacity: t.attivo ? 1 : 0.5 }}>
              <td style={{ fontWeight: 600 }}>{t.descrizione}</td>
              <td>
                <Badge label={t.categoria} color={CATEGORIA_COLORI[t.categoria] || "gray"} />
              </td>
              <td>{t.attivo ? <Badge label="Attivo" color="green" /> : <Badge label="Inattivo" color="gray" />}</td>
              <td style={{ textAlign: "right", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <Btn variant="secondary" size="sm" onClick={() => setModal({ ...t })}>
                  <i className="ti ti-edit" /> Modifica
                </Btn>
                <Btn variant="danger" size="sm" onClick={() => askDelete(t)} title="Elimina (solo se non in uso)">
                  <i className="ti ti-trash" />
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

      {conf && (
        <Modal title="Conferma eliminazione" onClose={() => setConf(null)} width={400}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setConf(null)}>Annulla</Btn>
              <Btn variant="danger" onClick={doDelete}
                disabled={conf.deleting || depTot === null || depTot > 0}>
                <i className="ti ti-trash" /> Elimina
              </Btn>
            </>
          }>
          <p style={{ margin: "0 0 12px" }}>
            Eliminare la tipologia <strong>{conf.descrizione}</strong>?
          </p>
          {conf.dep === null && (
            <p style={{ color: "var(--text2)", fontSize: 13 }}>
              <i className="ti ti-loader-2 ti-spin" /> Verifica dipendenze…
            </p>
          )}
          {conf.dep !== null && depTot === 0 && (
            <p style={{ color: "#16a34a", fontSize: 13 }}>
              <i className="ti ti-circle-check" /> Nessuna spesa associata. Eliminazione possibile.
            </p>
          )}
          {conf.dep !== null && depTot > 0 && (
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
              <p style={{ color: "#dc2626", fontWeight: 600, margin: "0 0 6px" }}>
                <i className="ti ti-alert-triangle" /> Impossibile eliminare: tipo spesa in uso.
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text2)" }}>
                {conf.dep.documenti > 0      && <li>{conf.dep.documenti} spese inquilini</li>}
                {conf.dep.spese_proprietari > 0 && <li>{conf.dep.spese_proprietari} spese proprietari</li>}
              </ul>
            </div>
          )}
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
