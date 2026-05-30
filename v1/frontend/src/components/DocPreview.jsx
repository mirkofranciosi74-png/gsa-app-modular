/**
 * DocPreview — anteprima inline di un documento.
 *
 * Props:
 *   file   – File object (upload locale); crea/revoca objectURL in automatico
 *   url    – URL stringa (file già sul server); fetch con auth header → blob URL
 *   mime   – mime type (opzionale, usato per decidere il renderer)
 *   nome   – nome file (opzionale, fallback per riconoscere il tipo dall'estensione)
 *   height – altezza del riquadro (default 500)
 */

import { useState, useEffect } from "react";

export default function DocPreview({ file, url, mime, nome, height = 500 }) {
  const [blobUrl,  setBlobUrl]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [errored,  setErrored]  = useState(false);

  // File locale → objectURL diretto
  useEffect(() => {
    if (!file) { setBlobUrl(null); return; }
    const u = URL.createObjectURL(file);
    setBlobUrl(u);
    setErrored(false);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // URL server → fetch con auth, poi blob URL
  // Non tocca blobUrl se url è assente: ci pensa l'effect del file
  useEffect(() => {
    if (!url) return;
    let revoked = false;
    let created = null;
    setBlobUrl(null);
    setLoading(true);
    setErrored(false);

    const token = localStorage.getItem("gsa_token");
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then(blob => {
        if (revoked) return;
        created = URL.createObjectURL(blob);
        setBlobUrl(created);
      })
      .catch(() => { if (!revoked) setErrored(true); })
      .finally(() => { if (!revoked) setLoading(false); });

    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  const previewUrl = blobUrl;
  const mimeType   = mime || file?.type || "";
  const fileName   = nome || file?.name || "";
  const ext        = fileName.toLowerCase().split(".").pop();

  const isPdf   = mimeType.includes("pdf") || ext === "pdf";
  const isImage = mimeType.startsWith("image/") || ["png","jpg","jpeg","gif","webp","bmp","svg"].includes(ext);

  const wrap = (content) => (
    <div style={{
      height, border: "1px solid var(--border)", borderRadius: 8,
      overflow: "hidden", background: "var(--bg3)",
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative",
    }}>
      {content}
    </div>
  );

  if (loading) return wrap(
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center",
                  color: "var(--text2)", fontSize: 13 }}>
      <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 32 }} />
      <span>Caricamento…</span>
    </div>
  );

  if (errored) return wrap(
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center",
                  color: "var(--text2)", fontSize: 13, padding: 20 }}>
      <i className="ti ti-file-off" style={{ fontSize: 40 }} />
      <span>File non disponibile</span>
    </div>
  );

  if (!previewUrl) return wrap(
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center",
                  color: "var(--text2)", fontSize: 13, padding: 20 }}>
      <i className="ti ti-file-off" style={{ fontSize: 40 }} />
      <span>Nessun file</span>
    </div>
  );

  if (isPdf) return wrap(
    <iframe
      src={`${previewUrl}#toolbar=1&navpanes=0&scrollbar=1`}
      style={{ width: "100%", height: "100%", border: "none" }}
      title={fileName}
    />
  );

  if (isImage) return wrap(
    <img
      src={previewUrl}
      alt={fileName}
      style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", padding: 8 }}
    />
  );

  // Tipo non previewable — icona + pulsante download
  const icons = {
    doc:  "ti-file-type-doc",  docx: "ti-file-type-doc",
    xls:  "ti-file-type-xls",  xlsx: "ti-file-type-xls",
    txt:  "ti-file-type-txt",  csv:  "ti-file-type-csv",
    zip:  "ti-file-zip",       rar:  "ti-file-zip",
  };
  const icon = icons[ext] || "ti-file";

  return wrap(
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center",
                  padding: 24, textAlign: "center", maxWidth: 280 }}>
      <i className={`ti ${icon}`} style={{ fontSize: 56, color: "var(--text2)" }} />
      <div style={{ fontWeight: 600, fontSize: 13, wordBreak: "break-all", color: "var(--text)" }}>
        {fileName}
      </div>
      <div style={{ fontSize: 11, color: "var(--text2)" }}>
        Anteprima non disponibile per questo tipo di file.
      </div>
      <a href={previewUrl} download={fileName}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 12, color: "var(--accent)",
          padding: "5px 12px", borderRadius: 6,
          border: "1px solid rgba(59,130,246,0.3)",
          background: "rgba(59,130,246,0.08)",
          textDecoration: "none",
        }}>
        <i className="ti ti-download" />
        Scarica il file
      </a>
    </div>
  );
}
