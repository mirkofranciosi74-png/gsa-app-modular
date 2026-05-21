/**
 * frontend/src/api.js
 *
 * FIX #4 (parte 1/2): rimosso l'URL hardcoded "http://localhost:3001/api".
 * Con il proxy di vite.config.js attivo, basta usare il path relativo "/api":
 * il browser manda la richiesta a :5173/api/... e Vite la inoltra a :3001/api/...
 * senza generare errori CORS.
 *
 * Questo rende il frontend deployabile su qualsiasi origine senza toccare
 * questo file: in produzione il reverse proxy (nginx, Caddy, ecc.) gestirà
 * l'inoltro allo stesso modo.
 *
 * FIX #4 (parte 2/2): il file "api.js.old" va eliminato dalla repo.
 * Conteneva un errore di sintassi grave (export const reportApi aperta ma
 * mai chiusa, con le sue funzioni orphan fuori dal blocco), che avrebbe
 * causato un crash immediato se importato per errore.
 * Istruzioni: eseguire  git rm frontend/src/api.js.old  e committare.
 */

// ── Unico punto dove cambiare il base URL in caso di deploy ──────────────────
// In sviluppo: "" → il proxy di Vite risolve "/api/..." verso localhost:3001
// In produzione: impostare VITE_API_BASE_URL nel .env del build se necessario
const BASE = (import.meta.env.VITE_API_BASE_URL ?? "") + "/api";

async function http(method, path, body, isForm = false) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: isForm ? {} : body ? { "Content-Type": "application/json" } : {},
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  if (r.status === 204) return null;
  const text = await r.text();
  if (!text || text.trim() === "") return null;

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Risposta non valida dal server (${r.status}): ${text.slice(0, 200)}`
    );
  }

  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}

const get  = p      => http("GET",    p);
const post = (p, b) => http("POST",   p, b);
const put  = (p, b) => http("PUT",    p, b);
const del  = p      => http("DELETE", p);
const up   = (p, f) => http("POST",   p, f, true);

// ── APPARTAMENTI ──────────────────────────────────────────────────────────────
export const appartamentiApi = {
  list:             ()           => get("/appartamenti"),
  get:              id           => get(`/appartamenti/${id}`),
  create:           d            => post("/appartamenti", d),
  update:           (id, d)      => put(`/appartamenti/${id}`, d),
  delete:           id           => del(`/appartamenti/${id}`),
  checkPercentuali: id           => get(`/appartamenti/${id}/percentuali`),
  addComponente:    (id, d)      => post(`/appartamenti/${id}/componenti`, d),

  updateComponente: (id, cid, d) =>
    put(`/appartamenti/${id}/componenti/${cid}`, d),

  updateComponenteConPropagazioneDate: (id, cid, d) =>
    put(`/appartamenti/${id}/componenti/${cid}`,
      { ...d, propagaDate: true, confermato: false }),

  confermaPropagazione: (id, cid, d) =>
    put(`/appartamenti/${id}/componenti/${cid}`,
      { ...d, propagaDate: true, confermato: true }),

  deleteComponente: (id, cid)    => del(`/appartamenti/${id}/componenti/${cid}`),
};

// ── DOCUMENTI ─────────────────────────────────────────────────────────────────
export const documentiApi = {
  list: (f = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(f).filter(([, v]) => v))
    ).toString();
    return get(`/documenti${qs ? "?" + qs : ""}`);
  },
  stats:       ()                  => get("/documenti/stats"),
  buchiUtenze: ({ periodoDA, periodoA } = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries({ periodoDA, periodoA }).filter(([, v]) => v))
    ).toString();
    return get(`/documenti/buchi-utenze${qs ? "?" + qs : ""}`);
  },
  get:    id       => get(`/documenti/${id}`),
  audit:  id       => get(`/documenti/${id}/audit`),
  create: d        => post("/documenti", d),
  update: (id, d)  => put(`/documenti/${id}`, d),
  delete: id       => del(`/documenti/${id}`),

  extract: file => {
    const fd = new FormData();
    fd.append("file", file);
    return up("/documenti/extract", fd);
  },

  // URL diretta al PDF salvato sul server (usata per preview in modifica)
  pdfUrl: id => `${BASE}/documenti/${id}/pdf`,

  extractBulk: async (files, onProgress = () => {}) => {
    const results = [];
    for (let i = 0; i < files.length; i++) {
      try {
        results.push({ ok: true, ...await documentiApi.extract(files[i]) });
      } catch (e) {
        results.push({ ok: false, nome_file: files[i].name, error: e.message });
      }
      onProgress(i + 1, files.length);
    }
    return results;
  },
};

// ── MOVIMENTI ─────────────────────────────────────────────────────────────────
export const movimentiApi = {
  list: (f = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(f).filter(([, v]) => v))
    ).toString();
    return get(`/movimenti${qs ? "?" + qs : ""}`);
  },
  create: d        => post("/movimenti", d),
  update: (id, d)  => put(`/movimenti/${id}`, d),
  delete: id       => del(`/movimenti/${id}`),

};

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
export const dashboardApi = {
  get:              () => get("/dashboard"),
  getProprietari:   () => get("/dashboard/proprietari"),
};

// ── GRIGLIA ───────────────────────────────────────────────────────────────────
export const grigliaApi = {
  get: ({ appartamentoId, periodoDA, periodoA, componenteId }) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries({ appartamentoId, periodoDA, periodoA, componenteId })
          .filter(([, v]) => v)
      )
    ).toString();
    return get(`/griglia?${qs}`);
  },
  getProprietari: ({ appartamentoId, periodoDA, periodoA }) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries({ appartamentoId, periodoDA, periodoA })
          .filter(([, v]) => v)
      )
    ).toString();
    return get(`/griglia/proprietari?${qs}`);
  },
  versatoPeriodo: f => {
    const qs = new URLSearchParams(f).toString();
    return get(`/griglia/versatoperiodo?${qs}`);
  },
  downloadZip: async ({ appartamentoId, periodoDA, periodoA }) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries({ appartamentoId, periodoDA, periodoA })
          .filter(([, v]) => v)
      )
    ).toString();
    const res  = await fetch(`${BASE}/griglia/export-zip?${qs}`);
    if (!res.ok) throw new Error(`Export fallito: HTTP ${res.status}`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `griglia_${periodoDA || "tutto"}_${periodoA || "oggi"}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};

// ── TIPI SPESA ────────────────────────────────────────────────────────────────
export const tipiSpesaApi = {
  list:   ()       => get("/tipi-spesa"),
  create: d        => post("/tipi-spesa", d),
  update: (id, d)  => put(`/tipi-spesa/${id}`, d),
  delete: id       => del(`/tipi-spesa/${id}`),
};

// ── REGOLE RIPARTO ────────────────────────────────────────────────────────────
export const regoleApi = {
  listByAppartamento: appId  => get(`/regole/appartamento/${appId}`),
  create:             d      => post("/regole", d),
  update:             (id, d) => put(`/regole/${id}`, d),
  delete:             id     => del(`/regole/${id}`),
};

// ── ARCHIVIO DOCUMENTALE ─────────────────────────────────────────────────────
export const archivioTipiApi = {
  list:   ()       => get("/archivio-tipi"),
  create: d        => post("/archivio-tipi", d),
  update: (id, d)  => put(`/archivio-tipi/${id}`, d),
  delete: id       => del(`/archivio-tipi/${id}`),
};

export const archivioApi = {
  list: (f = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(f).filter(([, v]) => v))
    ).toString();
    return get(`/archivio${qs ? "?" + qs : ""}`);
  },
  get:    id       => get(`/archivio/${id}`),
  update: (id, d)  => put(`/archivio/${id}`, d),
  delete: id       => del(`/archivio/${id}`),
  fileUrl: id      => `${BASE}/archivio/${id}/file`,

  upload: (file, { tipDocId, note, associazioni = [] }) => {
    const fd = new FormData();
    fd.append("file", file);
    if (tipDocId) fd.append("tipo_documento_id", tipDocId);
    if (note)     fd.append("note", note);
    if (associazioni.length)
      fd.append("associazioni", JSON.stringify(associazioni));
    return up("/archivio/upload", fd);
  },
};

// ── PROPRIETARI ───────────────────────────────────────────────────────────────
export const proprietariApi = {
  list:   ()       => get("/proprietari"),
  get:    id       => get(`/proprietari/${id}`),
  create: d        => post("/proprietari", d),
  update: (id, d)  => put(`/proprietari/${id}`, d),
  delete: id       => del(`/proprietari/${id}`),
};

export const associazioniApi = {
  listByAppartamento: appId  => get(`/associazioni/appartamento/${appId}`),
  create:             d      => post("/associazioni", d),
  update:             (id, d) => put(`/associazioni/${id}`, d),
  delete:             id     => del(`/associazioni/${id}`),
  defaultPerData:     (appartamentoId, data) =>
    get(`/associazioni/default?appartamentoId=${appartamentoId}&data=${data}`),
};

// ── REPORT ────────────────────────────────────────────────────────────────────
// ── ADMIN ─────────────────────────────────────────────────────────────────────
export const adminApi = {
  backup: async () => {
    const res = await fetch(`${BASE}/admin/backup`);
    if (!res.ok) throw new Error(`Backup fallito: HTTP ${res.status}`);
    const blob = await res.blob();
    const date = new Date().toISOString().slice(0, 10);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `gsa_backup_${date}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
  restore: file => {
    const fd = new FormData();
    fd.append("file", file);
    return up("/admin/restore", fd);
  },
};

export const reportApi = {
  genera:  params => post("/report/genera", { params }),
  list:    ()     => get("/report"),
  get:     id     => get(`/report/${id}`),
  save:    d      => post("/report", d),
  delete:  id     => del(`/report/${id}`),

  downloadPdf: (b64, name = "report.pdf") => {
    const blob = new Blob(
      [Uint8Array.from(atob(b64), c => c.charCodeAt(0))],
      { type: "application/pdf" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    // Libera la memoria dopo il click
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  },
};
