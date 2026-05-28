import { useState, useEffect, useCallback } from "react";
import { fattiV2, immobiliV2, condominiV2 } from "../api/apiV2.js";
import { Btn, Badge, Modal, Field } from "../../components/ui.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtEur = v =>
  v == null ? "—" : Number(v).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

const fmtData = iso => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", { dateStyle: "short" });
};

const TIPO_COLOR   = { spesa: "blue",  entrata: "green" };
const LEGACY_LABEL = {
  documento:         "Doc. inquilino",
  spesa_proprietario: "Spesa prop.",
  movimento:         "Entrata",
};
const CAT_COLOR = {
  Utenza:      "blue",
  Condominio:  "yellow",
  Tassa:       "red",
  Manutenzione: "orange",
};

// ── Modale dettaglio fatto ─────────────────────────────────────────────────────
function FattoDettaglio({ fatto, onClose }) {
  const netto = fatto.importo != null && fatto.segno != null
    ? Number(fatto.importo) * Number(fatto.segno)
    : null;

  const rows = [
    ["Immobile",    fatto.immobile_nome],
    ["Tipo",        fatto.tipo],
    ["Origine",     LEGACY_LABEL[fatto.legacy_tipo] || fatto.legacy_tipo],
    ["Importo",     fmtEur(fatto.importo)],
    ["Netto",       fmtEur(netto)],
    ["Tipo spesa",  fatto.tipo_spesa_desc],
    ["Categoria",   fatto.tipo_spesa_cat],
    ["Persona",     [fatto.persona_cognome, fatto.persona_nome].filter(Boolean).join(" ") || null],
    ["Data evento", fmtData(fatto.data_evento)],
    ["Periodo da",  fmtData(fatto.periodo_da)],
    ["Periodo a",   fmtData(fatto.periodo_a)],
    ["Stato",       fatto.stato],
    ["Note",        fatto.note],
  ].filter(([, v]) => v != null && v !== "" && v !== "—");

  return (
    <Modal title="Dettaglio fatto economico" onClose={onClose} width={480}
           footer={<Btn variant="ghost" onClick={onClose}>Chiudi</Btn>}>
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map(([label, val]) => (
          <div key={label} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, alignItems: "start" }}>
            <span style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase", letterSpacing: 0.5, paddingTop: 2 }}>
              {label}
            </span>
            <span style={{ fontSize: 13 }}>{val}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── Sezione totali per immobile ────────────────────────────────────────────────
function TotaliSection({ immobileId, filtriPeriodo }) {
  const [totali,  setTotali]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);

  const load = useCallback(async () => {
    if (!immobileId) return;
    setLoading(true);
    try {
      setTotali(await immobiliV2.totali(
        immobileId,
        filtriPeriodo.da || undefined,
        filtriPeriodo.a  || undefined,
      ));
    } catch (_) {}
    finally { setLoading(false); }
  }, [immobileId, filtriPeriodo.da, filtriPeriodo.a]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!immobileId) return null;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "11px 16px", background: "var(--bg2)", border: "none", cursor: "pointer",
        color: "var(--text)", fontSize: 13, fontWeight: 600,
      }}>
        <i className="ti ti-chart-bar" style={{ color: "var(--accent)", fontSize: 15 }} />
        <span style={{ flex: 1, textAlign: "left" }}>Totali per categoria</span>
        {loading && <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 14, color: "var(--text2)" }} />}
        <i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ color: "var(--text2)" }} />
      </button>
      {open && (
        <div style={{ padding: "14px 16px" }}>
          {!totali || loading ? (
            <p style={{ color: "var(--text2)", fontSize: 13 }}>
              <i className="ti ti-loader-2 ti-spin" style={{ marginRight: 6 }} />Carico…
            </p>
          ) : totali.length === 0 ? (
            <p style={{ color: "var(--text2)", fontSize: 13 }}>Nessun dato per questo immobile.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "var(--text2)", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left",  padding: "4px 8px" }}>Tipo</th>
                  <th style={{ textAlign: "left",  padding: "4px 8px" }}>Categoria</th>
                  <th style={{ textAlign: "left",  padding: "4px 8px" }}>Tipo spesa</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>N.</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>Netto</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>Lordo</th>
                </tr>
              </thead>
              <tbody>
                {totali.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 8px" }}>
                      <Badge label={r.tipo} color={TIPO_COLOR[r.tipo] || "gray"} />
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      {r.categoria
                        ? <Badge label={r.categoria} color={CAT_COLOR[r.categoria] || "gray"} />
                        : <span style={{ color: "var(--text2)" }}>—</span>
                      }
                    </td>
                    <td style={{ padding: "6px 8px", color: "var(--text2)", fontSize: 12 }}>
                      {r.tipo_spesa || "—"}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.n_fatti}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>
                      {fmtEur(r.totale_netto)}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: "var(--text2)" }}>
                      {fmtEur(r.totale_lordo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sezione quadratura legacy↔v2 ─────────────────────────────────────────────
function QuadraturaSection({ immobileId }) {
  const [quad,    setQuad]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);

  const load = useCallback(async () => {
    if (!immobileId) return;
    setLoading(true);
    try { setQuad(await immobiliV2.quadratura(immobileId)); }
    catch (_) {}
    finally { setLoading(false); }
  }, [immobileId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!immobileId) return null;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "11px 16px", background: "var(--bg2)", border: "none", cursor: "pointer",
        color: "var(--text)", fontSize: 13, fontWeight: 600,
      }}>
        <i className="ti ti-checkup-list" style={{ color: "var(--accent)", fontSize: 15 }} />
        <span style={{ flex: 1, textAlign: "left" }}>Quadratura legacy↔v2</span>
        {!loading && quad && (
          <i className={`ti ${quad.pass ? "ti-circle-check" : "ti-alert-triangle"}`}
             style={{ color: quad.pass ? "var(--green)" : "var(--red)", fontSize: 15 }} />
        )}
        {loading && <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 14, color: "var(--text2)" }} />}
        <i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ color: "var(--text2)" }} />
      </button>
      {open && (
        <div style={{ padding: "14px 16px" }}>
          {!quad || loading ? (
            <p style={{ color: "var(--text2)", fontSize: 13 }}>
              <i className="ti ti-loader-2 ti-spin" style={{ marginRight: 6 }} />Carico…
            </p>
          ) : (
            <>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
                padding: "8px 12px", borderRadius: 8,
                background: quad.pass ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                border: `1px solid ${quad.pass ? "rgba(34,197,94,0.3)" : "var(--red)"}`,
              }}>
                <i className={`ti ${quad.pass ? "ti-circle-check" : "ti-alert-triangle"}`}
                   style={{ color: quad.pass ? "var(--green)" : "var(--red)" }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {quad.pass ? "Dati allineati" : "Delta rilevato — verificare"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {[
                  ["Spese doc.",  quad.leg_spese_doc,  quad.v2_spese_doc,  quad.delta_spese_doc],
                  ["Spese prop.", quad.leg_spese_prop, quad.v2_spese_prop, quad.delta_spese_prop],
                  ["Versamenti",  quad.leg_versamenti, quad.v2_versamenti, quad.delta_versamenti],
                ].map(([label, legVal, v2Val, delta], i) => (
                  <div key={i} style={{
                    background: "var(--bg3)", borderRadius: 8, padding: "10px 12px",
                    border: `1px solid ${delta < 0.01 ? "var(--border)" : "var(--red)"}`,
                  }}>
                    <p style={{ fontSize: 10, color: "var(--text2)", margin: "0 0 6px",
                                textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</p>
                    <p style={{ fontSize: 12, margin: "0 0 2px" }}>Legacy: <strong>{fmtEur(legVal)}</strong></p>
                    <p style={{ fontSize: 12, margin: "0 0 4px" }}>v2: <strong>{fmtEur(v2Val)}</strong></p>
                    {delta >= 0.01 && (
                      <p style={{ fontSize: 11, color: "var(--red)", margin: 0 }}>Δ {fmtEur(delta)}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab principale ─────────────────────────────────────────────────────────────
export function EconomiaV2() {
  // Filtri
  const [immobili,   setImmobili]   = useState([]);
  const [filtri, setFiltri] = useState({
    immobileId: "",
    tipo:       "",
    legacyTipo: "",
    periodoDa:  "",
    periodoA:   "",
  });

  // Lista
  const [fatti,    setFatti]    = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState(null);
  const [selected, setSelected] = useState(null);

  // Carica dropdown immobili
  useEffect(() => {
    condominiV2.lista()
      .then(async (condomini) => {
        const lists = await Promise.all(condomini.map(c => immobiliV2.lista({ condominioId: c.id })));
        setImmobili(lists.flat().sort((a, b) => a.nome.localeCompare(b.nome)));
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = {};
      if (filtri.immobileId) params.immobileId = filtri.immobileId;
      if (filtri.tipo)       params.tipo        = filtri.tipo;
      if (filtri.legacyTipo) params.legacyTipo  = filtri.legacyTipo;
      if (filtri.periodoDa)  params.periodoDa   = filtri.periodoDa;
      if (filtri.periodoA)   params.periodoA    = filtri.periodoA;
      setFatti(await fattiV2.lista(params));
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [filtri]);

  useEffect(() => { load(); }, [load]);

  const setF = k => e => setFiltri(f => ({ ...f, [k]: e.target.value }));

  const immobileSelezionato = immobili.find(i => i.id === filtri.immobileId);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, background: "var(--bg2)",
          border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <i className="ti ti-coin" style={{ fontSize: 22, color: "var(--accent)" }} />
        </div>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            Economia
            <span style={{
              marginLeft: 10, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12,
              background: "#1e3a5f", color: "#60a5fa", border: "1px solid #3b82f6", verticalAlign: "middle",
            }}>v2</span>
          </h2>
          <p style={{ fontSize: 13, color: "var(--text2)", margin: 0 }}>
            Fatti economici unificati · spese + entrate
          </p>
        </div>
        <div style={{ flex: 1 }} />
        {fatti && !loading && (
          <span style={{ fontSize: 12, color: "var(--text2)" }}>
            {fatti.length} record
          </span>
        )}
        <Btn variant="ghost" size="sm" onClick={load} title="Aggiorna">
          <i className={`ti ti-refresh${loading ? " ti-spin" : ""}`} />
        </Btn>
      </div>

      {/* Filtri */}
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10,
        padding: "14px 16px", marginBottom: 16,
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12,
      }}>
        <Field label="Immobile">
          <select className="inp" value={filtri.immobileId} onChange={setF("immobileId")}>
            <option value="">Tutti gli immobili</option>
            {immobili.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
          </select>
        </Field>
        <Field label="Tipo">
          <select className="inp" value={filtri.tipo} onChange={setF("tipo")}>
            <option value="">Tutti</option>
            <option value="spesa">Spesa</option>
            <option value="entrata">Entrata</option>
          </select>
        </Field>
        <Field label="Origine (legacy)">
          <select className="inp" value={filtri.legacyTipo} onChange={setF("legacyTipo")}>
            <option value="">Tutte</option>
            <option value="documento">Doc. inquilino</option>
            <option value="spesa_proprietario">Spesa prop.</option>
            <option value="movimento">Entrata/movimento</option>
          </select>
        </Field>
        <Field label="Periodo da">
          <input className="inp" type="date" value={filtri.periodoDa} onChange={setF("periodoDa")} />
        </Field>
        <Field label="Periodo a">
          <input className="inp" type="date" value={filtri.periodoA} onChange={setF("periodoA")} />
        </Field>
      </div>

      {/* Sezioni per immobile specifico */}
      {filtri.immobileId && (
        <>
          <TotaliSection
            immobileId={filtri.immobileId}
            filtriPeriodo={{ da: filtri.periodoDa, a: filtri.periodoA }}
          />
          <QuadraturaSection immobileId={filtri.immobileId} />
        </>
      )}

      {/* Errore */}
      {err && (
        <div style={{
          background: "rgba(239,68,68,0.08)", border: "1px solid var(--red)",
          borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <i className="ti ti-alert-triangle" style={{ color: "var(--red)" }} />
          {err}
        </div>
      )}

      {/* Loading */}
      {loading && !fatti && (
        <div style={{ textAlign: "center", padding: 48, color: "var(--text2)" }}>
          <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 28, display: "block", marginBottom: 10 }} />
          Carico fatti economici…
        </div>
      )}

      {/* Tabella */}
      {fatti && fatti.length === 0 && !loading && (
        <div style={{
          background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10,
          padding: 40, textAlign: "center", color: "var(--text2)",
        }}>
          <i className="ti ti-coin-off" style={{ fontSize: 36, opacity: 0.35, display: "block", marginBottom: 12 }} />
          Nessun fatto economico con i filtri selezionati.
        </div>
      )}

      {fatti && fatti.length > 0 && (
        <div style={{
          background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--bg3)", borderBottom: "1px solid var(--border)" }}>
                {[
                  ["Tipo",       "left",  80],
                  ["Origine",    "left",  120],
                  ["Immobile",   "left",  null],
                  ["Tipo spesa", "left",  null],
                  ["Persona",    "left",  null],
                  ["Periodo",    "left",  110],
                  ["Importo",    "right", 100],
                  ["Netto",      "right", 100],
                  ["",           "right", 40],
                ].map(([label, align, w]) => (
                  <th key={label} style={{
                    textAlign: align, padding: "9px 12px",
                    color: "var(--text2)", fontWeight: 600, fontSize: 11,
                    textTransform: "uppercase", letterSpacing: 0.5,
                    ...(w ? { width: w } : {}),
                  }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fatti.map(fe => {
                const netto = fe.importo != null && fe.segno != null
                  ? Number(fe.importo) * Number(fe.segno)
                  : null;
                const persona = [fe.persona_cognome, fe.persona_nome].filter(Boolean).join(" ");
                const periodo = fe.periodo_da
                  ? `${fmtData(fe.periodo_da)}${fe.periodo_a ? " → " + fmtData(fe.periodo_a) : ""}`
                  : fmtData(fe.data_evento);

                return (
                  <tr key={fe.id}
                      onClick={() => setSelected(fe)}
                      style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--bg3)"}
                      onMouseLeave={e => e.currentTarget.style.background = ""}>
                    <td style={{ padding: "8px 12px" }}>
                      <Badge label={fe.tipo} color={TIPO_COLOR[fe.tipo] || "gray"} />
                    </td>
                    <td style={{ padding: "8px 12px", color: "var(--text2)" }}>
                      {LEGACY_LABEL[fe.legacy_tipo] || fe.legacy_tipo || "—"}
                    </td>
                    <td style={{ padding: "8px 12px", fontWeight: 500 }}>
                      {fe.immobile_nome || "—"}
                    </td>
                    <td style={{ padding: "8px 12px", color: "var(--text2)" }}>
                      {fe.tipo_spesa_cat
                        ? <><Badge label={fe.tipo_spesa_cat} color={CAT_COLOR[fe.tipo_spesa_cat] || "gray"} />
                            {fe.tipo_spesa_desc && <span style={{ marginLeft: 6 }}>{fe.tipo_spesa_desc}</span>}</>
                        : (fe.tipo_spesa_desc || "—")}
                    </td>
                    <td style={{ padding: "8px 12px", color: "var(--text2)" }}>
                      {persona || "—"}
                    </td>
                    <td style={{ padding: "8px 12px", color: "var(--text2)", whiteSpace: "nowrap" }}>
                      {periodo}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      {fmtEur(fe.importo)}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600,
                                 color: netto != null && netto >= 0 ? "var(--green)" : "var(--red)" }}>
                      {fmtEur(netto)}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      <Btn size="sm" variant="ghost" onClick={e => { e.stopPropagation(); setSelected(fe); }}>
                        <i className="ti ti-chevron-right" />
                      </Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <FattoDettaglio fatto={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
