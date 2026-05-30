import { useState, useEffect } from "react";
import { adminV2 } from "../api/apiV2.js";

const PHASE_LABELS = {
  phase0: "Baseline & schema",
  phase1: "Persona",
  phase2: "Condominio + Immobile",
  phase3: "RuoloPersona",
  phase4: "FattoEconomico",
  phase5: "Pagamento",
  phase6: "Documentale",
  phase7: "RegolaRiparto",
  phase8: "Quadratura",
};

const STEP_LABELS = {
  baseline: "Schema v2 creato",
  migrate:  "Dati migrati",
  schema:   "Schema creato",
  verify:   "Verifica completata",
};

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

export function QuadraturaV2() {
  const [log, setLog]     = useState(null);
  const [err, setErr]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminV2.migrationStatus()
      .then(setLog)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const phaseGroups = log
    ? Object.entries(
        log.reduce((acc, row) => {
          (acc[row.phase] = acc[row.phase] || []).push(row);
          return acc;
        }, {})
      ).sort(([a], [b]) => a.localeCompare(b))
    : [];

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, background: "var(--bg2)",
          border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <i className="ti ti-checkup-list" style={{ fontSize: 22, color: "var(--accent)" }} />
        </div>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            Quadratura v2
            <span style={{
              marginLeft: 10, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12,
              background: "#1e3a5f", color: "#60a5fa", border: "1px solid #3b82f6", verticalAlign: "middle",
            }}>v2</span>
          </h2>
          <p style={{ fontSize: 13, color: "var(--text2)", margin: 0 }}>
            Stato migrazione legacy → v2 · dati in tempo reale
          </p>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text2)" }}>
          <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 28 }} />
          <p style={{ marginTop: 10 }}>Carico stato migrazione…</p>
        </div>
      )}

      {err && (
        <div style={{
          background: "var(--red-bg)", border: "1px solid var(--red)", borderRadius: 10,
          padding: "16px 20px", display: "flex", alignItems: "center", gap: 12,
        }}>
          <i className="ti ti-alert-triangle" style={{ color: "var(--red)", fontSize: 20 }} />
          <div>
            <p style={{ fontWeight: 600, marginBottom: 2 }}>Errore caricamento</p>
            <p style={{ fontSize: 12, color: "var(--text2)", margin: 0 }}>{err}</p>
          </div>
        </div>
      )}

      {!loading && !err && log?.length === 0 && (
        <div style={{
          background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10,
          padding: 32, textAlign: "center", color: "var(--text2)",
        }}>
          <i className="ti ti-database-off" style={{ fontSize: 36, opacity: 0.4 }} />
          <p style={{ marginTop: 12, fontSize: 14 }}>
            Nessuna fase di migrazione eseguita.<br />
            Esegui <code style={{ color: "var(--accent)" }}>bash scripts/migrate-v2.sh</code> per avviare.
          </p>
        </div>
      )}

      {/* Fase log */}
      {phaseGroups.map(([phase, steps]) => (
        <div key={phase} style={{
          background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10,
          marginBottom: 12, overflow: "hidden",
        }}>
          <div style={{
            padding: "12px 16px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
              background: "var(--bg3)", color: "var(--text2)",
            }}>
              {phase}
            </span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              {PHASE_LABELS[phase] || phase}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--green)" }}>
              <i className="ti ti-circle-check-filled" style={{ marginRight: 4 }} />
              {steps.length} step{steps.length > 1 ? " completati" : " completato"}
            </span>
          </div>

          <div>
            {steps.map((s, i) => (
              <div key={i} style={{
                padding: "10px 16px 10px 24px",
                borderBottom: i < steps.length - 1 ? "1px solid var(--border)" : "none",
                display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center",
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13 }}>
                    <i className="ti ti-point-filled" style={{ color: "var(--green)", fontSize: 10, marginRight: 6 }} />
                    <strong>{STEP_LABELS[s.step] || s.step}</strong>
                  </p>
                  {s.note && (
                    <p style={{ margin: "2px 0 0 20px", fontSize: 11, color: "var(--text2)" }}>{s.note}</p>
                  )}
                </div>
                <span style={{ fontSize: 11, color: "var(--text2)", whiteSpace: "nowrap" }}>
                  {fmt(s.applied_at || s.quando)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Legenda fasi non ancora eseguite */}
      {!loading && !err && log && (
        <div style={{
          background: "var(--bg2)", border: "1px dashed var(--border)", borderRadius: 10,
          padding: "16px 20px", marginTop: 8,
        }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase",
                      letterSpacing: 1, marginBottom: 10 }}>Fasi pianificate</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
            {Object.entries(PHASE_LABELS).map(([id, label]) => {
              const done = phaseGroups.some(([p]) => p === id);
              return (
                <div key={id} style={{
                  display: "flex", alignItems: "center", gap: 8, fontSize: 12,
                  color: done ? "var(--green)" : "var(--text2)",
                }}>
                  <i className={`ti ${done ? "ti-circle-check" : "ti-circle-dashed"}`}
                     style={{ fontSize: 14, flexShrink: 0 }} />
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
