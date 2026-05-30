// Componenti UI riutilizzabili — nessuna dipendenza da api.js o stato globale

export function Btn({ children, onClick, variant = "secondary", size = "", disabled, title, style: sx = {} }) {
  return (
    <button
      className={`btn btn-${variant}${size ? " btn-" + size : ""}`}
      onClick={onClick} disabled={disabled} title={title} style={sx}
    >
      {children}
    </button>
  );
}

export function Badge({ label, color = "blue" }) {
  const s = {
    blue:   { background: "#1e3a5f", color: "#60a5fa", border: "1px solid #3b82f6" },
    green:  { background: "#14532d", color: "#22c55e", border: "1px solid #22c55e" },
    red:    { background: "#7f1d1d", color: "#ef4444", border: "1px solid #ef4444" },
    yellow: { background: "#713f12", color: "#eab308", border: "1px solid #eab308" },
    purple: { background: "#581c87", color: "#a855f7", border: "1px solid #a855f7" },
    gray:   { background: "#1e293b", color: "#94a3b8", border: "1px solid #475569" },
  };
  return <span className="badge" style={s[color] || s.gray}>{label}</span>;
}

export function StatoBadge({ stato }) {
  const c = { elaborato: "green", da_verificare: "yellow", errore: "red", duplicato: "purple" };
  const l = { elaborato: "Elaborato", da_verificare: "Da verificare", errore: "Errore", duplicato: "Duplicato" };
  return <Badge label={l[stato] || stato} color={c[stato] || "gray"} />;
}

export function Modal({ title, subtitle, onClose, children, footer, width = 520, resizable = false }) {
  const boxStyle = resizable
    ? {
        background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12,
        width: width, minWidth: width, maxWidth: "95vw", maxHeight: "90vh",
        display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        resize: "horizontal", overflow: "hidden",
      }
    : {
        background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12,
        width: "100%", maxWidth: width, maxHeight: "90vh",
        display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex",
                  alignItems: "center", justifyContent: "center", zIndex: 400, padding: 12 }}>
      <div style={boxStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "14px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>{title}</p>
            {subtitle && <p style={{ fontSize: 11, color: "var(--text2)", margin: 0 }}>{subtitle}</p>}
          </div>
          <Btn variant="ghost" size="sm" onClick={onClose}><i className="ti ti-x" /></Btn>
        </div>
        <div style={{ overflowY: "auto", padding: 20, flex: 1 }}>{children}</div>
        {footer && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)",
                        display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Confirm({ msg, onYes, onNo }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex",
                  alignItems: "center", justifyContent: "center", zIndex: 500, padding: 16 }}>
      <div style={{ background: "var(--bg2)", border: "1px solid var(--red)", borderRadius: 12,
                    padding: 24, maxWidth: 380, width: "100%" }}>
        <p style={{ marginBottom: 20, fontSize: 15, lineHeight: 1.5 }}>{msg}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onNo}>Annulla</Btn>
          <Btn variant="danger" onClick={onYes}><i className="ti ti-trash" /> Elimina</Btn>
        </div>
      </div>
    </div>
  );
}

export function Field({ label, children, warn, hint }) {
  return (
    <div>
      <label style={{ color: warn ? "var(--yellow)" : "var(--text2)", fontSize: 13 }}>
        {label}{warn ? " ⚠" : ""}
      </label>
      {children}
      {hint && <p style={{ fontSize: 11, color: "var(--text2)", marginTop: 3 }}>{hint}</p>}
    </div>
  );
}

export function SectionHeader({ title, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h2>
      {action}
    </div>
  );
}
