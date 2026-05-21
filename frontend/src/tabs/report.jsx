import { useState, useEffect } from "react";
import { reportApi } from "../api.js";
import { Btn, Field, SectionHeader } from "../components/ui.jsx";

export function Report() {
  const [params, setParams] = useState({
    periodoDA: "", periodoA: "", mostraComponenti: true,
    mostraSaldo: true, mostraMovimenti: true, mostraDettaglio: true,
  });
  const [result,   setResult]  = useState(null);
  const [loading,  setLoad]    = useState(false);
  const [saved,    setSaved]   = useState([]);
  const [saveName, setSaveN]   = useState("");

  const sp = (k, v) => setParams(p => ({ ...p, [k]: v }));
  useEffect(() => { reportApi.list().then(setSaved).catch(() => {}); }, []);

  async function genera() {
    setLoad(true); setResult(null);
    try { setResult(await reportApi.genera(params)); }
    catch (e) { alert("Errore: " + e.message); }
    finally { setLoad(false); }
  }

  async function salva() {
    if (!saveName.trim() || !result) return;
    const r = await reportApi.save({ nome: saveName.trim(), parametri: params, testo: result.testo, pdf_base64: result.pdf });
    setSaved(s => [r, ...s]); setSaveN("");
  }

  return (
    <div>
      <SectionHeader title="Report" />
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }}>
        <div className="card">
          <p style={{ fontWeight: 700, marginBottom: 12 }}>Parametri</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Periodo da"><input type="month" value={params.periodoDA} onChange={e => sp("periodoDA", e.target.value)} /></Field>
            <Field label="Periodo a" ><input type="month" value={params.periodoA}  onChange={e => sp("periodoA",  e.target.value)} /></Field>
            <hr className="divider" />
            {[["mostraComponenti","Componenti"],["mostraSaldo","Saldo"],
              ["mostraMovimenti","Entrate"],["mostraDettaglio","Dettaglio doc."]].map(([k, l]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "var(--text)" }}>
                <input type="checkbox" checked={params[k]} onChange={e => sp(k, e.target.checked)} />{l}
              </label>
            ))}
            <Btn variant="primary" onClick={genera} disabled={loading} style={{ marginTop: 4 }}>
              <i className={`ti ${loading ? "ti-loader" : "ti-file-analytics"}`} />
              {loading ? "Generazione…" : "Genera Report"}
            </Btn>
          </div>
          {saved.length > 0 && (
            <>
              <hr className="divider" />
              <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Report salvati</p>
              {saved.map(r => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--bg3)" }}>
                  <span style={{ fontSize: 12, cursor: "pointer", color: "var(--accent)" }} onClick={() => reportApi.get(r.id).then(setResult)}>
                    {r.nome}
                  </span>
                  <Btn variant="danger" size="sm" onClick={async () => { await reportApi.delete(r.id); setSaved(s => s.filter(x => x.id !== r.id)); }}>
                    <i className="ti ti-trash" />
                  </Btn>
                </div>
              ))}
            </>
          )}
        </div>

        <div>
          {!result && !loading && (
            <div className="alert alert-info">
              <i className="ti ti-info-circle" /> Imposta i parametri e premi "Genera Report".
            </div>
          )}
          {result && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>Report generato</p>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input value={saveName} onChange={e => setSaveN(e.target.value)} placeholder="Nome per salvare…" style={{ width: 180 }} />
                  <Btn variant="secondary" size="sm" onClick={salva} disabled={!saveName.trim()}><i className="ti ti-bookmark" /> Salva</Btn>
                  <Btn variant="primary" size="sm" onClick={() => reportApi.downloadPdf(result.pdf, `report-${params.periodoDA || "completo"}.pdf`)}>
                    <i className="ti ti-download" /> PDF
                  </Btn>
                </div>
              </div>
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 12, lineHeight: 1.7, color: "var(--text2)", maxHeight: 600, overflowY: "auto", background: "var(--bg)", padding: 12, borderRadius: 8, border: "1px solid var(--border)", margin: 0 }}>
                {result.testo}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
