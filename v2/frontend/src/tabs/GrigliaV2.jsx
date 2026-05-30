import React, { useState, useEffect, useMemo } from "react";
import { immobiliV2, grigliav2, fattiV2 } from "../api/apiV2.js";
import { Btn, Field, SectionHeader } from "../../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const euro = v => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v ?? 0);

function ym2L(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"][+m - 1] + " " + y;
}
function toSlice7(v) { return v ? String(v).slice(0, 7) : ""; }

// ── Header colonna ────────────────────────────────────────────────────────────
const thS = { padding: "9px 10px", fontWeight: 600, fontSize: 11, background: "var(--bg3)", whiteSpace: "nowrap" };
const tdN = (color, bold, bg) => ({
  padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap",
  fontWeight: bold ? 700 : 500,
  color: color || "var(--text)",
  background: bg || "transparent",
});
function SepRow({ label, color, nCols }) {
  return (
    <tr>
      <td colSpan={nCols} style={{
        padding: "6px 10px", fontWeight: 700, fontSize: 12, color,
        background: "var(--bg2)",
        borderTop: "2px solid var(--border)", borderBottom: "1px solid var(--border)",
      }}>{label}</td>
    </tr>
  );
}

// ── PDF opener ─────────────────────────────────────────────────────────────────
async function apriPdf(fattoId) {
  try {
    const url = fattiV2.getPdfUrl(fattoId);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem("gsa_token")}` } });
    if (!res.ok) return;
    const blobUrl = URL.createObjectURL(await res.blob());
    window.open(blobUrl, "_blank");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
  } catch {}
}

// ── Vista sintetica helpers ───────────────────────────────────────────────────
function gruppiSpeseDoc(righeSpese, persone) {
  const m = new Map();
  for (const r of righeSpese) {
    const tipo = r.tipoSpesaDesc || r.nomeFile || "Spesa";
    if (!m.has(tipo)) {
      const q = {}; for (const p of persone) q[p.id] = 0;
      m.set(tipo, { tipo, importo: 0, quote: q, periodoDa: r.periodoDa, periodoA: r.periodoA });
    }
    const g = m.get(tipo);
    g.importo += r.importo || 0;
    if (r.periodoDa && (!g.periodoDa || r.periodoDa < g.periodoDa)) g.periodoDa = r.periodoDa;
    if (r.periodoA  && (!g.periodoA  || r.periodoA  > g.periodoA))  g.periodoA  = r.periodoA;
    for (const p of persone) g.quote[p.id] = (g.quote[p.id] || 0) + (r.quote[p.id] || 0);
  }
  return [...m.values()].sort((a, b) => a.tipo.localeCompare(b.tipo));
}

function gruppiEntrate(righeEntrate, persone) {
  const m = new Map();
  for (const r of righeEntrate) {
    const tipo = r.tipoVersamento || "Entrata";
    const mese = r.periodoDa;
    const key = `${tipo}::${mese}`;
    if (!m.has(key)) {
      const q = {}; for (const p of persone) q[p.id] = 0;
      m.set(key, { tipo, mese, importo: 0, quote: q });
    }
    const g = m.get(key);
    g.importo += r.importo || 0;
    for (const p of persone) g.quote[p.id] = (g.quote[p.id] || 0) + (r.quote[p.id] || 0);
  }
  return [...m.values()].sort((a, b) => a.mese < b.mese ? -1 : a.mese > b.mese ? 1 : a.tipo.localeCompare(b.tipo));
}

// ═════════════════════════════════════════════════════════════════════════════
// Griglia inquilini
// ═════════════════════════════════════════════════════════════════════════════
function GrigliaInquilini({ dati, pDA, pA, sintetico }) {
  const { persone, righeSpese, righeEntrate, totaliDovuto, totaliVersato } = dati;

  // Calcolo affitto client-side
  const mesiGriglia = useMemo(() => {
    const da = pDA || "2000-01";
    const a  = pA  || new Date().toISOString().slice(0, 7);
    const res = [];
    let [y, m] = da.split("-").map(Number);
    const [ya, ma] = a.split("-").map(Number);
    while (y < ya || (y === ya && m <= ma)) {
      res.push(`${y}-${String(m).padStart(2, "0")}`);
      m++; if (m > 12) { m = 1; y++; }
    }
    return res;
  }, [pDA, pA]);

  const righeAffitto = useMemo(() => mesiGriglia.map(mese => {
    const q = {};
    for (const p of persone) {
      const da = toSlice7(p.validitaDa) || "2000-01";
      const a  = toSlice7(p.validitaA)  || "2999-12";
      q[p.id] = (mese >= da && mese <= a && parseFloat(p.quotaAffitto || 0) > 0)
        ? parseFloat(p.quotaAffitto) : 0;
    }
    return { mese, quote: q };
  }).filter(r => Object.values(r.quote).some(v => v > 0)), [mesiGriglia, persone]);

  const totaliAffitto = useMemo(() => Object.fromEntries(
    persone.map(p => [p.id, righeAffitto.reduce((s, r) => s + (r.quote[p.id] || 0), 0)])
  ), [righeAffitto, persone]);

  const conguaglio = useMemo(() => Object.fromEntries(
    persone.map(p => [p.id, (totaliVersato[p.id] || 0) - (totaliDovuto[p.id] || 0) - (totaliAffitto[p.id] || 0)])
  ), [totaliVersato, totaliDovuto, totaliAffitto, persone]);

  // Nascondi persone senza movimenti
  const personeVis = persone.filter(p =>
    (totaliDovuto[p.id] || 0) !== 0 || (totaliVersato[p.id] || 0) !== 0 ||
    (totaliAffitto[p.id] || 0) !== 0 || (conguaglio[p.id] || 0) !== 0
  );
  const personeNas = persone.filter(p => !personeVis.includes(p));

  const righeSpeseFiltrate  = righeSpese.filter(r => personeVis.some(p => (r.quote[p.id] || 0) !== 0));
  const righeEntrateFiltrate = righeEntrate.filter(r => personeVis.some(p => (r.quote[p.id] || 0) !== 0));

  const totD = personeVis.reduce((s, p) => s + (totaliDovuto[p.id]  || 0), 0);
  const totV = personeVis.reduce((s, p) => s + (totaliVersato[p.id] || 0), 0);
  const totA = personeVis.reduce((s, p) => s + (totaliAffitto[p.id] || 0), 0);
  const totC = personeVis.reduce((s, p) => s + (conguaglio[p.id]    || 0), 0);
  const nCols = 3 + personeVis.length;

  const speseS = sintetico ? gruppiSpeseDoc(righeSpeseFiltrate, personeVis) : null;
  const entrateS = sintetico ? gruppiEntrate(righeEntrateFiltrate, personeVis) : null;

  if (!personeVis.length) return (
    <div className="alert alert-warn" style={{ marginTop: 12 }}>
      Nessun inquilino con movimenti nel periodo.
    </div>
  );

  return (
    <div>
      {personeNas.length > 0 && (
        <div className="alert alert-info" style={{ marginBottom: 12, fontSize: 12 }}>
          Inquilini senza movimenti (nascosti):{" "}
          <strong>{personeNas.map(p => p.label).join(", ")}</strong>
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ minWidth: 400, borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...thS, textAlign: "left", minWidth: 220 }}>Voce</th>
              <th style={{ ...thS, textAlign: "center", minWidth: 120 }}>Periodo</th>
              <th style={{ ...thS, textAlign: "right", minWidth: 100 }}>Importo</th>
              {personeVis.map(p => (
                <th key={p.id} style={{ ...thS, textAlign: "right", minWidth: 120 }}>
                  {p.label}
                  <br />
                  <span style={{ fontWeight: 400, fontSize: 10, color: "var(--text2)" }}>
                    {p.quota != null ? `${p.quota}%` : "—"}
                    {p.validitaDa ? ` · dal ${ym2L(toSlice7(p.validitaDa))}` : ""}
                    {p.validitaA  ? ` al ${ym2L(toSlice7(p.validitaA))}`   : ""}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* ── SPESE ── */}
            <SepRow label="▼  SPESE — quota dovuta per inquilino" color="#f87171" nCols={nCols} />
            {righeSpeseFiltrate.length === 0
              ? <tr><td colSpan={nCols} style={{ padding: 10, color: "var(--text2)", fontSize: 12 }}>Nessuna spesa nel periodo.</td></tr>
              : sintetico
                ? speseS.map((r, i) => (
                  <tr key={"ds"+i} style={{ borderBottom: "1px solid var(--bg3)" }}>
                    <td style={{ padding: "7px 10px" }}>
                      <p style={{ fontWeight: 600, margin: 0, fontSize: 13 }}>{r.tipo}</p>
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "center", fontSize: 11, color: "var(--text2)" }}>
                      {ym2L(r.periodoDa)}{r.periodoA && r.periodoA !== r.periodoDa ? ` → ${ym2L(r.periodoA)}` : ""}
                    </td>
                    <td style={{ ...tdN("#a5b4fc", true, "rgba(99,102,241,0.07)") }}>
                      {euro(personeVis.reduce((s, p) => s + (r.quote[p.id] || 0), 0))}
                    </td>
                    {personeVis.map(p => {
                      const q = r.quote[p.id] || 0;
                      return <td key={p.id} style={{ ...tdN(q !== 0 ? "var(--text)" : "var(--text2)") }}>{q !== 0 ? euro(q) : <span style={{ opacity: 0.25 }}>—</span>}</td>;
                    })}
                  </tr>
                ))
                : righeSpeseFiltrate.map((r, i) => (
                  <tr key={"d"+i} style={{ borderBottom: "1px solid var(--bg3)" }}>
                    <td style={{ padding: "7px 10px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontWeight: 600, margin: 0, fontSize: 13 }}>{r.label}</p>
                          {r.nomeFile && r.nomeFile !== r.label && (
                            <p style={{ fontSize: 10, color: "var(--text2)", margin: "2px 0 0", fontStyle: "italic" }}>{r.nomeFile}</p>
                          )}
                          {r.fornitore && <p style={{ fontSize: 10, color: "var(--text2)", margin: "2px 0 0" }}>{r.fornitore}</p>}
                          {r.mesiFiltro < r.mesiTotali && (
                            <p style={{ fontSize: 10, color: "var(--accent)", margin: "2px 0 0" }}>
                              {r.mesiFiltro}/{r.mesiTotali} mesi · totale {euro(r.importoFattura)}
                            </p>
                          )}
                        </div>
                        {r.hasPdf && (
                          <button onClick={() => apriPdf(r.id)} title="PDF"
                            style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", padding: "3px 6px", color: "#ef4444", flexShrink: 0 }}>
                            <i className="ti ti-file-type-pdf" style={{ fontSize: 14 }} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "center", fontSize: 11, color: "var(--text2)" }}>
                      {ym2L(r.periodoDa)}{r.periodoA && r.periodoA !== r.periodoDa ? ` → ${ym2L(r.periodoA)}` : ""}
                    </td>
                    <td style={{ ...tdN("#a5b4fc", true, "rgba(99,102,241,0.07)") }}>{euro(r.importo)}</td>
                    {personeVis.map(p => {
                      const q = r.quote[p.id] || 0;
                      return <td key={p.id} style={{ ...tdN(q !== 0 ? "var(--text)" : "var(--text2)") }}>{q !== 0 ? euro(q) : <span style={{ opacity: 0.25 }}>—</span>}</td>;
                    })}
                  </tr>
                ))
            }
            <tr style={{ background: "rgba(239,68,68,0.10)", borderTop: "2px solid var(--border)" }}>
              <td colSpan={2} style={{ padding: "9px 10px", fontWeight: 700, fontSize: 13 }}>Totale dovuto</td>
              <td style={{ ...tdN("#a5b4fc", true, "rgba(99,102,241,0.10)") }}>{euro(totD)}</td>
              {personeVis.map(p => <td key={p.id} style={{ ...tdN("#f87171", true) }}>{euro(totaliDovuto[p.id] || 0)}</td>)}
            </tr>

            {/* ── ENTRATE ── */}
            <SepRow label="▼  ENTRATE — importi versati per inquilino" color="#4ade80" nCols={nCols} />
            {righeEntrateFiltrate.length === 0
              ? <tr><td colSpan={nCols} style={{ padding: 10, color: "var(--text2)", fontSize: 12 }}>Nessuna entrata nel periodo.</td></tr>
              : sintetico
                ? entrateS.map((r, i) => (
                  <tr key={"es"+i} style={{ borderBottom: "1px solid var(--bg3)" }}>
                    <td style={{ padding: "7px 10px" }}>
                      <p style={{ fontWeight: 600, margin: 0, fontSize: 13, color: "#4ade80" }}>{r.tipo}</p>
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "center", fontSize: 11, color: "var(--text2)" }}>{ym2L(r.mese)}</td>
                    <td style={{ ...tdN("#4ade80", true, "rgba(74,222,128,0.05)") }}>{euro(r.importo)}</td>
                    {personeVis.map(p => {
                      const q = r.quote[p.id] || 0;
                      return <td key={p.id} style={{ ...tdN(q !== 0 ? "#4ade80" : "var(--text2)") }}>{q !== 0 ? euro(q) : <span style={{ opacity: 0.25 }}>—</span>}</td>;
                    })}
                  </tr>
                ))
                : righeEntrateFiltrate.map((r, i) => (
                  <React.Fragment key={"e"+i}>
                    <tr style={{ borderBottom: r.quotaTeorica ? "none" : "1px solid var(--bg3)" }}>
                      <td style={{ padding: "7px 10px" }}>
                        <p style={{ fontWeight: 600, margin: 0, fontSize: 13, color: "#4ade80" }}>{r.label}</p>
                        {r.tipoVersamento && r.tipoVersamento !== r.label && (
                          <p style={{ fontSize: 10, color: "var(--text2)", margin: "2px 0 0" }}>{r.tipoVersamento}</p>
                        )}
                      </td>
                      <td style={{ padding: "7px 10px", textAlign: "center", fontSize: 11, color: "var(--text2)" }}>
                        {ym2L(r.periodoDa)}{r.periodoA ? ` → ${ym2L(r.periodoA)}` : ""}
                      </td>
                      <td style={{ ...tdN("#4ade80", true, "rgba(74,222,128,0.05)") }}>{euro(r.importo)}</td>
                      {personeVis.map(p => {
                        const q = r.quote[p.id] || 0;
                        return <td key={p.id} style={{ ...tdN(q !== 0 ? "#4ade80" : "var(--text2)") }}>{q !== 0 ? euro(q) : <span style={{ opacity: 0.25 }}>—</span>}</td>;
                      })}
                    </tr>
                    {r.quotaTeorica && (
                      <tr style={{ borderBottom: "1px solid var(--bg3)", background: "rgba(251,191,36,0.04)" }}>
                        <td style={{ padding: "4px 10px 6px 20px", fontSize: 11, color: "#fbbf24" }}>
                          <i className="ti ti-calculator" style={{ marginRight: 4 }} />Quota teorica (riparto)
                        </td>
                        <td />
                        <td style={{ ...tdN("#fbbf24", false), fontSize: 11 }}>{euro(r.importo)}</td>
                        {personeVis.map(p => {
                          const qt = r.quotaTeorica[p.id] || 0;
                          return <td key={p.id} style={{ ...tdN(qt !== 0 ? "#fbbf24" : "var(--text2)", false), fontSize: 11 }}>{qt !== 0 ? euro(qt) : <span style={{ opacity: 0.25 }}>—</span>}</td>;
                        })}
                      </tr>
                    )}
                  </React.Fragment>
                ))
            }
            <tr style={{ background: "rgba(74,222,128,0.10)", borderTop: "2px solid var(--border)" }}>
              <td colSpan={2} style={{ padding: "9px 10px", fontWeight: 700, fontSize: 13 }}>Totale versato</td>
              <td style={{ ...tdN("#4ade80", true, "rgba(74,222,128,0.08)") }}>{euro(totV)}</td>
              {personeVis.map(p => <td key={p.id} style={{ ...tdN("#4ade80", true) }}>{euro(totaliVersato[p.id] || 0)}</td>)}
            </tr>

            {/* ── AFFITTO ── */}
            <SepRow label="▼  AFFITTO — canone mensile dovuto" color="#fbbf24" nCols={nCols} />
            {righeAffitto.length === 0
              ? <tr><td colSpan={nCols} style={{ padding: 10, color: "var(--text2)", fontSize: 12 }}>Nessun canone affitto nel periodo.</td></tr>
              : righeAffitto.map((r, i) => (
                <tr key={"aff"+i} style={{ borderBottom: "1px solid var(--bg3)" }}>
                  <td style={{ padding: "7px 10px" }}><p style={{ fontWeight: 600, margin: 0, fontSize: 13, color: "#fbbf24" }}>Affitto</p></td>
                  <td style={{ padding: "7px 10px", textAlign: "center", fontSize: 11, color: "var(--text2)" }}>{ym2L(r.mese)}</td>
                  <td style={{ ...tdN("#fbbf24", true, "rgba(251,191,36,0.06)") }}>{euro(Object.values(r.quote).reduce((s, v) => s + v, 0))}</td>
                  {personeVis.map(p => {
                    const q = r.quote[p.id] || 0;
                    return <td key={p.id} style={{ ...tdN(q !== 0 ? "#fbbf24" : "var(--text2)") }}>{q !== 0 ? euro(q) : <span style={{ opacity: 0.25 }}>—</span>}</td>;
                  })}
                </tr>
              ))
            }
            <tr style={{ background: "rgba(251,191,36,0.10)", borderTop: "2px solid var(--border)" }}>
              <td colSpan={2} style={{ padding: "9px 10px", fontWeight: 700, fontSize: 13 }}>Totale affitto</td>
              <td style={{ ...tdN("#fbbf24", true, "rgba(251,191,36,0.12)") }}>{euro(totA)}</td>
              {personeVis.map(p => <td key={p.id} style={{ ...tdN("#fbbf24", true) }}>{euro(totaliAffitto[p.id] || 0)}</td>)}
            </tr>

            {/* ── CONGUAGLIO ── */}
            <tr style={{ background: "var(--bg3)", borderTop: "2px solid var(--border)" }}>
              <td colSpan={2} style={{ padding: "11px 10px", fontWeight: 700, fontSize: 14 }}>Conguaglio finale</td>
              <td style={{ padding: "11px 10px", textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "var(--text2)", marginBottom: 2 }}>Saldo globale</div>
                <strong style={{ fontSize: 14, color: totC >= 0 ? "#4ade80" : "#f87171" }}>{totC >= 0 ? "+" : ""}{euro(totC)}</strong>
              </td>
              {personeVis.map(p => {
                const v = conguaglio[p.id] || 0;
                return (
                  <td key={p.id}
                    title={`Versato: ${euro(totaliVersato[p.id]||0)}\nSpese: ${euro(totaliDovuto[p.id]||0)}\nAffitto: ${euro(totaliAffitto[p.id]||0)}\n─────\nConguaglio: ${v>=0?"+":""}${euro(v)}`}
                    style={{ padding: "11px 10px", textAlign: "right", fontWeight: 700, fontSize: 14, color: v >= 0 ? "#4ade80" : "#f87171", cursor: "help" }}>
                    {v >= 0 ? "+" : ""}{euro(v)}
                  </td>
                );
              })}
            </tr>

            {/* Riepilogo */}
            <tr style={{ background: "var(--bg2)", borderTop: "2px solid var(--border)" }}>
              <td style={{ padding: "8px 10px", fontWeight: 600, fontSize: 12, color: "var(--text2)" }}>Riepilogo</td>
              <td />
              <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, color: "var(--text2)" }}>
                Spese: <strong style={{ color: "#a5b4fc" }}>{euro(totD)}</strong>
              </td>
              <td colSpan={personeVis.length} style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, color: "var(--text2)" }}>
                Spese: <strong style={{ color: "#f87171" }}>{euro(totD)}</strong>
                {"  ·  "}Affitto: <strong style={{ color: "#fbbf24" }}>{euro(totA)}</strong>
                {"  ·  "}Versato: <strong style={{ color: "#4ade80" }}>{euro(totV)}</strong>
                {"  ·  "}Saldo: <strong style={{ color: totC >= 0 ? "#4ade80" : "#f87171" }}>{totC >= 0 ? "+" : ""}{euro(totC)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Griglia proprietari
// ═════════════════════════════════════════════════════════════════════════════
function GrigliaProprietari({ datiProp }) {
  const { props, righeSpese, righeEntrate, totaliDareTeorico, totaliAvereTeorico, totaliPagato, totaliIncassato } = datiProp;

  const conguaglio = Object.fromEntries(props.map(p => [
    p.id,
    (totaliPagato[p.id] || 0) - (totaliIncassato[p.id] || 0) - (totaliDareTeorico[p.id] || 0) + (totaliAvereTeorico[p.id] || 0),
  ]));
  const totCong = props.reduce((s, p) => s + (conguaglio[p.id] || 0), 0);
  const nCols = 2 + props.length;
  const thP = { ...thS };

  if (!props.length) return (
    <div className="alert alert-warn" style={{ marginTop: 12 }}>
      Nessun proprietario associato a questo immobile nel periodo.
    </div>
  );

  return (
    <div>
      <div className="alert alert-info" style={{ marginBottom: 12, fontSize: 12 }}>
        <i className="ti ti-info-circle" />
        Conguaglio = Pagato reale − Incassato reale − Dare teorico + Avere teorico
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ minWidth: 500, borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...thP, textAlign: "left", minWidth: 220 }}>Voce</th>
              <th style={{ ...thP, textAlign: "right", minWidth: 110 }}>Importo</th>
              {props.map(p => (
                <th key={p.id} style={{ ...thP, textAlign: "right", minWidth: 120 }}>
                  {p.label}
                  <br />
                  <span style={{ fontWeight: 400, fontSize: 10, color: "var(--text2)" }}>
                    {p.quota != null ? `${p.quota}%` : "—"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* ── SPESE ── */}
            <SepRow label="▼  SPESE — quota teorica a carico dei proprietari" color="#f87171" nCols={nCols} />
            {righeSpese.length === 0
              ? <tr><td colSpan={nCols} style={{ padding: 10, color: "var(--text2)", fontSize: 12 }}>Nessuna spesa nel periodo.</td></tr>
              : righeSpese.map((r, i) => {
                const pagante = r.pagatoDaPropId ? props.find(p => p.id === r.pagatoDaPropId) : null;
                return (
                  <React.Fragment key={"sp"+i}>
                    <tr style={{ borderBottom: "none" }}>
                      <td style={{ padding: "7px 10px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 600, margin: 0, fontSize: 13 }}>{r.tipoSpesaDesc}</p>
                            {r.fornitore && <p style={{ fontSize: 10, color: "var(--text2)", margin: "2px 0 0" }}>{r.fornitore}</p>}
                            <p style={{ fontSize: 10, color: "var(--text2)", margin: "2px 0 0", fontStyle: "italic" }}>Quota teorica</p>
                          </div>
                          {r.hasPdf && (
                            <button onClick={() => apriPdf(r.id)} title="PDF"
                              style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", padding: "3px 6px", color: "#ef4444", flexShrink: 0 }}>
                              <i className="ti ti-file-type-pdf" style={{ fontSize: 14 }} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ ...tdN("#a5b4fc", true, "rgba(99,102,241,0.07)") }}>{euro(r.importo)}</td>
                      {props.map(p => { const q = r.quote[p.id] || 0; return <td key={p.id} style={{ ...tdN(q !== 0 ? "var(--text)" : "var(--text2)") }}>{q !== 0 ? euro(q) : <span style={{ opacity: 0.25 }}>—</span>}</td>; })}
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--bg3)", background: "rgba(165,180,252,0.04)" }}>
                      <td style={{ padding: "4px 10px 6px 20px", fontSize: 11, color: "#a5b4fc" }}>
                        <i className="ti ti-credit-card" style={{ marginRight: 4 }} />
                        {pagante ? `Pagato da: ${pagante.label}` : "Pagante non registrato"}
                      </td>
                      <td style={{ ...tdN("#a5b4fc", false), fontSize: 11 }}>{euro(r.importo)}</td>
                      {props.map(p => { const isPag = p.id === r.pagatoDaPropId; return <td key={p.id} style={{ ...tdN(isPag ? "#a5b4fc" : "var(--text2)", isPag), fontSize: 11 }}>{isPag ? euro(r.importo) : <span style={{ opacity: 0.25 }}>—</span>}</td>; })}
                    </tr>
                  </React.Fragment>
                );
              })
            }
            <tr style={{ background: "rgba(239,68,68,0.08)", borderTop: "2px solid var(--border)" }}>
              <td colSpan={2} style={{ padding: "9px 10px", fontWeight: 700, fontSize: 13 }}>Totale dare teorico</td>
              {props.map(p => <td key={p.id} style={{ ...tdN("#f87171", true) }}>{euro(totaliDareTeorico[p.id] || 0)}</td>)}
            </tr>
            <tr style={{ background: "rgba(165,180,252,0.06)", borderTop: "1px solid var(--border)" }}>
              <td colSpan={2} style={{ padding: "7px 10px", fontSize: 12, color: "var(--text2)", fontStyle: "italic" }}>↳ Pagato effettivamente</td>
              {props.map(p => { const v = totaliPagato[p.id] || 0; return <td key={p.id} style={{ ...tdN("#a5b4fc", false) }}>{v ? euro(v) : <span style={{ opacity: 0.3 }}>—</span>}</td>; })}
            </tr>

            {/* ── ENTRATE ── */}
            <SepRow label="▼  ENTRATE — incassato per proprietario" color="#4ade80" nCols={nCols} />
            {righeEntrate.length === 0
              ? <tr><td colSpan={nCols} style={{ padding: 10, color: "var(--text2)", fontSize: 12 }}>Nessuna entrata nel periodo.</td></tr>
              : righeEntrate.map((r, i) => (
                <React.Fragment key={"ep"+i}>
                  <tr style={{ borderBottom: "none" }}>
                    <td style={{ padding: "7px 10px" }}>
                      <p style={{ fontWeight: 600, margin: 0, fontSize: 13, color: "#4ade80" }}>
                        {r.tipoVersamento}
                        {r.dispDa ? <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text2)", marginLeft: 6 }}>{ym2L(r.dispDa)}{r.dispA ? ` → ${ym2L(r.dispA)}` : ""}</span> : null}
                      </p>
                      <p style={{ fontSize: 10, color: "var(--text2)", margin: "2px 0 0", fontStyle: "italic" }}>Incassato reale</p>
                    </td>
                    <td style={{ ...tdN("#4ade80", true, "rgba(74,222,128,0.05)") }}>{euro(r.importo)}</td>
                    {props.map(p => { const q = r.quoteReale[p.id] || 0; return <td key={p.id} style={{ ...tdN(q !== 0 ? "#4ade80" : "var(--text2)", q !== 0) }}>{q !== 0 ? euro(q) : <span style={{ opacity: 0.25 }}>—</span>}</td>; })}
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--bg3)", background: "rgba(251,191,36,0.04)" }}>
                    <td style={{ padding: "4px 10px 6px 20px", fontSize: 11, color: "#fbbf24" }}>
                      <i className="ti ti-calculator" style={{ marginRight: 4 }} />Quota teorica (riparto)
                    </td>
                    <td style={{ ...tdN("#fbbf24", false), fontSize: 11 }}>{euro(r.importo)}</td>
                    {props.map(p => { const qt = r.quotaTeorica[p.id] || 0; return <td key={p.id} style={{ ...tdN(qt !== 0 ? "#fbbf24" : "var(--text2)", false), fontSize: 11 }}>{qt !== 0 ? euro(qt) : <span style={{ opacity: 0.25 }}>—</span>}</td>; })}
                  </tr>
                </React.Fragment>
              ))
            }
            <tr style={{ background: "rgba(74,222,128,0.08)", borderTop: "2px solid var(--border)" }}>
              <td colSpan={2} style={{ padding: "9px 10px", fontWeight: 700, fontSize: 13 }}>Totale incassato reale</td>
              {props.map(p => <td key={p.id} style={{ ...tdN("#4ade80", true) }}>{euro(totaliIncassato[p.id] || 0)}</td>)}
            </tr>
            <tr style={{ background: "rgba(251,191,36,0.05)", borderTop: "1px solid var(--border)" }}>
              <td colSpan={2} style={{ padding: "7px 10px", fontSize: 12, color: "var(--text2)", fontStyle: "italic" }}>↳ Avere teorico (% sul totale)</td>
              {props.map(p => <td key={p.id} style={{ ...tdN("#fbbf24", false) }}>{euro(totaliAvereTeorico[p.id] || 0)}</td>)}
            </tr>

            {/* ── CONGUAGLIO ── */}
            <tr style={{ background: "var(--bg3)", borderTop: "2px solid var(--border)" }}>
              <td colSpan={2} style={{ padding: "11px 10px", fontWeight: 700, fontSize: 14 }}>Conguaglio finale</td>
              {props.map(p => {
                const v = conguaglio[p.id] || 0;
                return (
                  <td key={p.id}
                    title={`Pagato: ${euro(totaliPagato[p.id]||0)}\nIncassato: ${euro(totaliIncassato[p.id]||0)}\nDare teorico: ${euro(totaliDareTeorico[p.id]||0)}\nAvere teorico: ${euro(totaliAvereTeorico[p.id]||0)}\n─────\nConguaglio: ${v>=0?"+":""}${euro(v)}`}
                    style={{ padding: "11px 10px", textAlign: "right", fontWeight: 700, fontSize: 14, color: v >= 0 ? "#4ade80" : "#f87171", cursor: "help" }}>
                    {v >= 0 ? "+" : ""}{euro(v)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Componente principale
// ═════════════════════════════════════════════════════════════════════════════
export function GrigliaV2() {
  const { user } = useAuth();
  const isAdmin = user?.ruolo === "admin" || user?.ruolo === "editor";

  const [immobili,     setImmobili]     = useState([]);
  const [selImm,       setSelImm]       = useState("");
  const [inquilini,    setInquilini]    = useState([]);
  const [pDA,          setPDA]          = useState("");
  const [pA,           setPA]           = useState("");
  const [selInquilino, setSelInquilino] = useState("");
  const [dati,         setDati]         = useState(null);
  const [datiProp,     setDatiProp]     = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [errore,       setErrore]       = useState(null);
  const [modoProp,     setModoProp]     = useState(false);
  const [sintetico,    setSintetico]    = useState(false);
  const [exporting,    setExporting]    = useState(false);
  const [showExportMenu, setExportMenu] = useState(false);

  useEffect(() => {
    immobiliV2.lista().then(list => setImmobili(list)).catch(() => {});
  }, []);

  useEffect(() => {
    setSelInquilino("");
    setInquilini([]);
    if (!selImm) return;
    immobiliV2.ruoli(selImm, { ruolo: "inquilino" })
      .then(ruoli => setInquilini(ruoli.filter(r => r.validitaDa || r.validitaA)))
      .catch(() => {});
  }, [selImm]);

  function selezionaInquilino(personaId) {
    setSelInquilino(personaId);
    if (!personaId) return;
    const r = inquilini.find(x => x.personaId === personaId);
    if (!r) return;
    if (r.validitaDa) setPDA(r.validitaDa.slice(0, 7));
    if (r.validitaA)  setPA(r.validitaA.slice(0, 7));
  }

  async function esportaExcel(modo) {
    setExporting(true);
    try {
      await grigliav2.downloadExcel({
        immobileId: selImm,
        periodoDa: pDA || undefined,
        periodoA:  pA  || undefined,
        modo,
      });
    } catch (e) { alert("Errore export: " + e.message); }
    finally { setExporting(false); }
  }

  async function esportaZip(modo = "dettaglio") {
    setExporting(true);
    try {
      await grigliav2.downloadZip({
        immobileId: selImm,
        periodoDa: pDA || undefined,
        periodoA:  pA  || undefined,
        modo,
      });
    } catch (e) { alert("Errore export: " + e.message); }
    finally { setExporting(false); }
  }

  async function calcola() {
    if (!selImm) return;
    setLoading(true); setErrore(null); setDati(null); setDatiProp(null);
    try {
      const [d, dp] = await Promise.all([
        grigliav2.inquilini({ immobileId: selImm, periodoDa: pDA || undefined, periodoA: pA || undefined, personaId: selInquilino || undefined }),
        grigliav2.proprietari({ immobileId: selImm, periodoDa: pDA || undefined, periodoA: pA || undefined }),
      ]);
      setDati(d);
      setDatiProp(dp);
    } catch (e) { setErrore(e.message); }
    finally { setLoading(false); }
  }

  const ym2L = ym => ym ? (["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"][+ym.split("-")[1] - 1] + " " + ym.split("-")[0]) : "";

  return (
    <div>
      <SectionHeader title="Griglia Economica v2" />

      {/* ── Barra filtri ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto auto auto auto", gap: 12, alignItems: "flex-end" }}>
          <Field label="Immobile">
            <select value={selImm} onChange={e => { setSelImm(e.target.value); setDati(null); setDatiProp(null); }}>
              <option value="">-- Seleziona --</option>
              {immobili.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
            </select>
          </Field>
          <Field label="Periodo da">
            <input type="month" value={pDA} onChange={e => setPDA(e.target.value)} />
          </Field>
          <Field label="Periodo a">
            <input type="month" value={pA}  onChange={e => setPA(e.target.value)} />
          </Field>
          <Btn variant="primary" onClick={calcola} disabled={!selImm || loading}>
            <i className="ti ti-calculator" />{loading ? "Calcolo…" : "Calcola"}
          </Btn>
          {dati && isAdmin && (
            <Btn variant={modoProp ? "primary" : "secondary"}
              onClick={() => setModoProp(s => !s)}
              title="Modalità proprietari">
              <i className="ti ti-user-circle" />
              {modoProp ? "Inquilini" : "Proprietari"}
            </Btn>
          )}
          {dati && !modoProp && (
            <Btn variant={sintetico ? "primary" : "secondary"}
              onClick={() => setSintetico(s => !s)}
              title="Vista sintetica">
              <i className="ti ti-table-options" />
              {sintetico ? "Dettaglio" : "Sintetico"}
            </Btn>
          )}
          {dati && isAdmin && (
            <div style={{ position: "relative" }}>
              <Btn variant="secondary"
                onClick={() => setExportMenu(s => !s)}
                disabled={exporting}
                title="Opzioni di esportazione">
                <i className="ti ti-download" />
                {exporting ? "Export…" : "Esporta"}
                <i className="ti ti-chevron-down" style={{ marginLeft: 4, fontSize: 10 }} />
              </Btn>
              {showExportMenu && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 49 }}
                       onClick={() => setExportMenu(false)} />
                  <div style={{
                    position: "absolute", right: 0, top: "110%", zIndex: 50,
                    background: "var(--bg2)", border: "1px solid var(--border)",
                    borderRadius: 8, minWidth: 240,
                    boxShadow: "0 6px 20px rgba(0,0,0,0.35)", overflow: "hidden",
                  }}>
                    {[
                      { label: "Excel completo (3 fogli)",           icon: "ti-table",            modo: "excel-tutti" },
                      { label: "Excel inquilini (dettaglio)",         icon: "ti-file-spreadsheet", modo: "excel-inquilini" },
                      { label: "Excel inquilini (sintetico)",         icon: "ti-file-spreadsheet", modo: "excel-sintetico" },
                      { label: "Excel proprietari",                   icon: "ti-file-spreadsheet", modo: "excel-proprietari" },
                      { label: "ZIP sintetico (Excel sintetico + PDF)", icon: "ti-file-zip",       modo: "zip-sintetico" },
                      { label: "ZIP completo (tutti i fogli + PDF)", icon: "ti-file-zip",          modo: "zip-tutti" },
                    ].map((opt, i, arr) => (
                      <button key={opt.modo}
                        onClick={() => {
                          setExportMenu(false);
                          if (opt.modo === "zip-sintetico") esportaZip("sintetico");
                          else if (opt.modo === "zip-tutti") esportaZip("tutti");
                          else esportaExcel(opt.modo.replace("excel-", ""));
                        }}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          width: "100%", padding: "10px 14px",
                          background: "transparent", border: "none",
                          borderBottom: i < arr.length - 1 ? "1px solid var(--bg3)" : "none",
                          cursor: "pointer", color: "var(--text1)", fontSize: 13,
                          textAlign: "left",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--bg3)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <i className={`ti ${opt.icon}`} style={{ fontSize: 15, flexShrink: 0, color: "var(--accent)" }} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Filtro inquilino */}
        {inquilini.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--text2)", whiteSpace: "nowrap" }}>
              <i className="ti ti-user-search" style={{ marginRight: 4 }} />
              Filtro per inquilino:
            </span>
            <select value={selInquilino} onChange={e => selezionaInquilino(e.target.value)}
              style={{ flex: 1, maxWidth: 300 }}>
              <option value="">— seleziona inquilino per impostare il periodo —</option>
              {inquilini.map(r => {
                const da = r.validitaDa ? toSlice7(r.validitaDa) : null;
                const a  = r.validitaA  ? toSlice7(r.validitaA)  : null;
                const periodo = (da || a) ? ` (${da ? ym2L(da) : "…"} → ${a ? ym2L(a) : "oggi"})` : "";
                const nome = [r.personaCognome, r.personaNome].filter(Boolean).join(" ") || r.personaId;
                return <option key={r.personaId} value={r.personaId}>{nome}{periodo}</option>;
              })}
            </select>
            <span style={{ fontSize: 11, color: "var(--text2)" }}>→ imposta periodo e premi Calcola</span>
          </div>
        )}
      </div>

      {/* ── Messaggi ── */}
      {!selImm && !dati && (
        <div className="alert alert-info">
          <i className="ti ti-info-circle" />
          Seleziona un immobile e il periodo, poi premi Calcola.
        </div>
      )}
      {errore && (
        <div className="alert alert-danger">
          <i className="ti ti-alert-circle" />{errore}
        </div>
      )}

      {/* ── Griglia ── */}
      {dati && modoProp && datiProp && <GrigliaProprietari datiProp={datiProp} />}
      {dati && !modoProp && (
        <GrigliaInquilini dati={dati} pDA={pDA} pA={pA} sintetico={sintetico} />
      )}
    </div>
  );
}
