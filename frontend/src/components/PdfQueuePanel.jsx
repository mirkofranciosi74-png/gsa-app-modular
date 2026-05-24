import { Btn } from "./ui.jsx";

/**
 * Generic panel that shows a PDF processing queue.
 * Used by Documenti and SpeseProprietari.
 *
 * Props:
 *   queue      – QueueItem[]  (from usePdfQueue)
 *   onValida   – (item) => void   — "Valida" per item clicked
 *   onRemove   – (id) => void     — remove single item
 *   onClear    – () => void       — clear entire queue
 *   onProssimo – () => void       — "Valida prossimo" header button
 */
export function PdfQueuePanel({ queue, onValida, onRemove, onClear, onProssimo }) {
  if (!queue.length) return null;

  const pronti   = queue.filter(q => q.stato === "pronto").length;
  const inAttesa = queue.filter(q => q.stato === "attesa" || q.stato === "caricamento").length;

  return (
    <div style={{ marginBottom: 12, border: "1px solid var(--accent)", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                    background: "rgba(59,130,246,0.08)" }}>
        <i className="ti ti-stack" style={{ color: "var(--accent)", fontSize: 18 }} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          Coda — {queue.length} document{queue.length > 1 ? "i" : "o"}
        </span>
        {inAttesa > 0 && (
          <span style={{ fontSize: 12, color: "var(--text2)" }}>
            <i className="ti ti-loader" style={{ marginRight: 4 }} />{inAttesa} in elaborazione…
          </span>
        )}
        {pronti > 0 && (
          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20,
                         background: "#713f12", color: "#eab308", border: "1px solid #eab308" }}>
            {pronti} da validare
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {pronti > 0 && onProssimo && (
            <Btn variant="primary" size="sm" onClick={onProssimo}>
              <i className="ti ti-edit" /> Valida prossimo
            </Btn>
          )}
          {onClear && (
            <Btn variant="ghost" size="sm" onClick={onClear}>
              <i className="ti ti-x" />
            </Btn>
          )}
        </div>
      </div>

      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        {queue.map(q => (
          <div key={q.id} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "7px 14px",
            borderBottom: "1px solid var(--bg3)",
            background: q.stato === "pronto" ? "rgba(234,179,8,0.06)"
                      : q.stato === "errore" ? "rgba(239,68,68,0.06)" : "transparent",
          }}>
            <i className={`ti ${
              q.stato === "caricamento" ? "ti-loader" :
              q.stato === "pronto"      ? "ti-alert-triangle" :
              q.stato === "errore"      ? "ti-alert-circle" : "ti-clock"
            }`} style={{
              fontSize: 14, flexShrink: 0,
              color: q.stato === "pronto" ? "var(--yellow)"
                   : q.stato === "errore" ? "var(--red)" : "var(--text2)",
            }} />
            <span style={{ flex: 1, fontSize: 12, overflow: "hidden",
                           textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
              {q.nomeFile}
            </span>
            <span style={{ fontSize: 11, color: "var(--text2)", flexShrink: 0 }}>
              {q.stato === "attesa"      ? "In attesa"
               : q.stato === "caricamento" ? "Caricamento…"
               : q.stato === "pronto"      ? "Da validare"
               : q.stato === "errore"      ? q._errore
               : "Elaborato"}
            </span>
            {q.stato === "pronto" && onValida && (
              <Btn variant="secondary" size="sm" onClick={() => onValida(q)}>
                <i className="ti ti-edit" /> Valida
              </Btn>
            )}
            {onRemove && (
              <Btn variant="ghost" size="sm" onClick={() => onRemove(q.id)}>
                <i className="ti ti-x" />
              </Btn>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
