/**
 * Componente placeholder condiviso per tab v2 non ancora implementate.
 * Mostra nome, icona, fase di sviluppo prevista e le funzionalità in arrivo.
 */
export function PlaceholderV2({ nome, icon, fase, funzionalita = [], sostituisce = [] }) {
  return (
    <div style={{ maxWidth: 600, margin: "80px auto", textAlign: "center" }}>
      <div style={{
        width: 80, height: 80, borderRadius: 20, margin: "0 auto 24px",
        background: "var(--bg2)", border: "2px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <i className={`ti ${icon}`} style={{ fontSize: 40, color: "var(--accent)", opacity: 0.7 }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 8 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{nome}</h2>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12,
          background: "#1e3a5f", color: "#60a5fa", border: "1px solid #3b82f6",
        }}>v2</span>
      </div>

      <p style={{ color: "var(--text2)", fontSize: 14, marginBottom: 28 }}>
        Questa sezione fa parte della nuova architettura DDD.
        Sarà disponibile nella <strong style={{ color: "var(--text)" }}>{fase}</strong>.
      </p>

      {funzionalita.length > 0 && (
        <div style={{
          background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12,
          padding: "20px 24px", textAlign: "left", marginBottom: 16,
        }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase",
                      letterSpacing: 1, marginBottom: 12 }}>Funzionalità in arrivo</p>
          <ul style={{ listStyle: "none", display: "grid", gap: 8 }}>
            {funzionalita.map((f, i) => (
              <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13 }}>
                <i className="ti ti-circle-check" style={{ color: "var(--accent)", marginTop: 1, flexShrink: 0 }} />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sostituisce.length > 0 && (
        <div style={{
          background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12,
          padding: "16px 24px", textAlign: "left",
        }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase",
                      letterSpacing: 1, marginBottom: 10 }}>Sostituisce (sezioni legacy)</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {sostituisce.map((s, i) => (
              <span key={i} style={{
                fontSize: 12, padding: "3px 10px", borderRadius: 8,
                background: "var(--bg3)", color: "var(--text2)", border: "1px solid var(--border)",
              }}>
                <i className="ti ti-replace" style={{ marginRight: 4, fontSize: 11 }} />{s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
