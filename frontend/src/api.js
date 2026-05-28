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

function authHeader() {
  const token = localStorage.getItem("gsa_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function http(method, path, body, isForm = false) {
  const contentType = isForm ? {} : body ? { "Content-Type": "application/json" } : {};
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...authHeader(), ...contentType },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  // Token scaduto → forza logout
  if (r.status === 401) {
    localStorage.removeItem("gsa_token");
    window.location.reload();
    throw new Error("Sessione scaduta");
  }

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
  riparto: id      => get(`/documenti/${id}/riparto`),
  create: d        => post("/documenti", d),
  update: (id, d)  => put(`/documenti/${id}`, d),
  delete: id       => del(`/documenti/${id}`),

  checkHash: file => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${BASE}/documenti/check-hash`, { method: "POST", body: fd })
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); });
  },

  checkHashGlobal: file => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${BASE}/documenti/check-hash-global`, { method: "POST", body: fd })
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); });
  },

  deletePdf: id => del(`/documenti/${id}/pdf`),

  extract: file => {
    const fd = new FormData();
    fd.append("file", file);
    return up("/documenti/extract", fd);
  },

  // URL diretta al PDF salvato sul server (usata per preview in modifica)
  pdfUrl: id => `${BASE}/documenti/${id}/pdf`,

  uploadPdf: (id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return up(`/documenti/${id}/pdf`, fd);
  },

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
  create:      d        => post("/movimenti", d),
  update:      (id, d)  => put(`/movimenti/${id}`, d),
  updateStato: (id, s)  => http("PATCH", `/movimenti/${id}/stato`, { stato: s }),
  delete:      id       => del(`/movimenti/${id}`),

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
  downloadExcel: async ({ appartamentoId, periodoDA, periodoA, modo = "tutti" }) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries({ appartamentoId, periodoDA, periodoA, modo })
          .filter(([, v]) => v)
      )
    ).toString();
    const res  = await fetch(`${BASE}/griglia/export-excel?${qs}`, { headers: authHeader() });
    if (!res.ok) throw new Error(`Export fallito: HTTP ${res.status}`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `griglia_${modo}_${periodoDA || "tutto"}_${periodoA || "oggi"}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },

  downloadZip: async ({ appartamentoId, periodoDA, periodoA, modo = "dettaglio" }) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries({ appartamentoId, periodoDA, periodoA, modo })
          .filter(([, v]) => v)
      )
    ).toString();
    const res  = await fetch(`${BASE}/griglia/export-zip?${qs}`, { headers: authHeader() });
    if (!res.ok) throw new Error(`Export fallito: HTTP ${res.status}`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `griglia_${modo}_${periodoDA || "tutto"}_${periodoA || "oggi"}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};

// ── TIPI SPESA ────────────────────────────────────────────────────────────────
export const tipiSpesaApi = {
  list:        ()       => get("/tipi-spesa"),
  create:      d        => post("/tipi-spesa", d),
  update:      (id, d)  => put(`/tipi-spesa/${id}`, d),
  dipendenze:  id       => get(`/tipi-spesa/${id}/dipendenze`),
  delete:      id       => del(`/tipi-spesa/${id}`),
};

// ── TIPI VERSAMENTO ───────────────────────────────────────────────────────────
export const tipiVersamentoApi = {
  list:   ()       => get("/tipi-versamento"),
  create: d        => post("/tipi-versamento", d),
  update: (id, d)  => put(`/tipi-versamento/${id}`, d),
  delete: id       => del(`/tipi-versamento/${id}`),
};

// ── REGOLE RIPARTO ────────────────────────────────────────────────────────────
export const regoleApi = {
  listByAppartamento: appId  => get(`/regole/appartamento/${appId}`),
  create:             d      => post("/regole", d),
  update:             (id, d) => put(`/regole/${id}`, d),
  delete:             id     => del(`/regole/${id}`),
};

// ── SPESE PROPRIETARI ─────────────────────────────────────────────────────────
export const speseProprietariApi = {
  list: (f = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(f).filter(([, v]) => v))
    ).toString();
    return get(`/spese-proprietari${qs ? "?" + qs : ""}`);
  },
  create:      d       => post("/spese-proprietari", d),
  update:      (id, d) => put(`/spese-proprietari/${id}`, d),
  updateStato: (id, s) => http("PATCH", `/spese-proprietari/${id}/stato`, { stato: s }),
  delete:      id      => del(`/spese-proprietari/${id}`),
  riparto:     id      => get(`/spese-proprietari/${id}/riparto`),
  audit:       id      => get(`/spese-proprietari/${id}/audit`),

  checkHash: file => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${BASE}/spese-proprietari/check-hash`, { method: "POST", body: fd })
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); });
  },

  extract: file => {
    const fd = new FormData();
    fd.append("file", file);
    return up("/spese-proprietari/extract", fd);
  },

  listAllegati:   id            => get(`/spese-proprietari/${id}/allegati`),
  allegatoUrl:    (id, aid)     => `${BASE}/spese-proprietari/${id}/allegati/${aid}`,
  uploadAllegati: (id, files)   => {
    const fd = new FormData();
    Array.from(files).forEach(f => fd.append("files", f));
    return up(`/spese-proprietari/${id}/allegati`, fd);
  },
  deleteAllegato: (id, aid)     => del(`/spese-proprietari/${id}/allegati/${aid}`),

  allegati: {
    list:   id          => get(`/spese-proprietari/${id}/allegati`),
    getUrl: (id, aid)   => `${BASE}/spese-proprietari/${id}/allegati/${aid}`,
    upload: (id, files) => {
      const fd = new FormData();
      Array.from(files).forEach(f => fd.append("files", f));
      return up(`/spese-proprietari/${id}/allegati`, fd);
    },
    delete: (id, aid)   => del(`/spese-proprietari/${id}/allegati/${aid}`),
  },
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

  checkHash: file => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${BASE}/archivio/check-hash`, { method: "POST", body: fd })
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); });
  },

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
  list:        ()              => get("/proprietari"),
  get:         id              => get(`/proprietari/${id}`),
  create:      d               => post("/proprietari", d),
  update:      (id, d)         => put(`/proprietari/${id}`, d),
  delete:      id              => del(`/proprietari/${id}`),
  dipendenze:  id              => get(`/proprietari/${id}/dipendenze`),
  elimina:     (id, nuovoId)   => post(`/proprietari/${id}/elimina`, { nuovoProprietarioId: nuovoId || null }),
};

export const associazioniApi = {
  listByAppartamento:       appId      => get(`/associazioni/appartamento/${appId}`),
  create:                   d          => post("/associazioni", d),
  update:                   (id, d)    => put(`/associazioni/${id}`, d),
  delete:                   id         => del(`/associazioni/${id}`),
  defaultPerData:           (appartamentoId, data) =>
    get(`/associazioni/default?appartamentoId=${appartamentoId}&data=${data}`),
  bulkUpdateIncassatore:    d          => post("/associazioni/bulk-update-incassatore", d),
  bulkUpdatePagatore:       d          => post("/associazioni/bulk-update-pagatore", d),
  verificaAnomalie:         ()         => get("/associazioni/anomalie"),
  dipendenze:               id            => get(`/associazioni/${id}/dipendenze`),
  elimina:                  (id, nuovoId) => post(`/associazioni/${id}/elimina`, { nuovoId: nuovoId || null }),
  anomalieValidita:         id            => get(`/associazioni/${id}/anomalie-validita`),
  riassegnaAnomalie:        (id, nuovoId) => post(`/associazioni/${id}/riassegna-anomalie`, { nuovoId: nuovoId || null }),
};

// ── REPORT ────────────────────────────────────────────────────────────────────
// ── ADMIN ─────────────────────────────────────────────────────────────────────
export const adminApi = {
  verificaCoerenza: () => get("/admin/verifica-coerenza"),
  backfillHash:     () => post("/admin/backfill-hash", {}),
  backup: async (tipo = "tutto") => {
    const res = await fetch(`${BASE}/admin/backup?tipo=${tipo}`, { headers: authHeader() });
    if (!res.ok) throw new Error(`Backup fallito: HTTP ${res.status}`);
    const blob = await res.blob();
    const date = new Date().toISOString().slice(0, 10);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `gsa_backup_${tipo}_${date}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
  restore: (file, tipo = "tutto") => {
    const fd = new FormData();
    fd.append("file", file);
    return up(`/admin/restore?tipo=${tipo}`, fd);
  },
  logsStatus:   ()        => get("/admin/logs/status"),
  logsToggle:   (enabled) => post("/admin/logs/toggle", { enabled }),
  logsClear:    ()        => del("/admin/logs"),
  logsDownload: async () => {
    const res = await fetch(`${BASE}/admin/logs/download`, { headers: authHeader() });
    if (!res.ok) throw new Error(`Download log fallito: HTTP ${res.status}`);
    const blob = await res.blob();
    const date = new Date().toISOString().slice(0, 10);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `gsa_${date}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};

// ── IMPORTAZIONE ESTRATTO CONTO ───────────────────────────────────────────────
export const importazioneApi = {
  parse: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return up("/importazione/parse", fd);
  },
  import:           (righe) => post("/importazione/import", { righe }),
  checkDuplicati:   (righe) => post("/importazione/check-duplicati", { righe }),
  listRegole:   ()       => get("/importazione/regole"),
  saveRegola:   d        => post("/importazione/regole", d),
  updateRegola: (id, d)  => put(`/importazione/regole/${id}`, d),
  deleteRegola: id       => del(`/importazione/regole/${id}`),
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

const authFetch = (path, opts = {}) => {
  const { headers: extraHeaders = {}, ...restOpts } = opts;
  return fetch(`${BASE}/auth${path}`, {
    headers: { ...authHeader(), ...extraHeaders },
    ...restOpts,
  });
};

export const authApi = {
  loginGoogle: () => { window.location.href = `${BASE}/auth/google`; },
  loginApple:  () => { window.location.href = `${BASE}/auth/apple`; },
  loginLocal: async (email, password) => {
    const r = await fetch(`${BASE}/auth/login`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    return data;
  },
  logout:      () => authFetch("/logout", { method: "POST" }),

  listUsers:   () => authFetch("/users").then(r => r.json()),
  createUser:  (data) => authFetch("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then(r => r.json()),
  updateRuolo: (id, ruolo) => authFetch(`/users/${id}/ruolo`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ ruolo }),
  }).then(r => r.json()),
  updateAttivo: (id, attivo) => authFetch(`/users/${id}/attivo`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ attivo }),
  }).then(r => r.json()),
  deleteUser: id => authFetch(`/users/${id}`, { method: "DELETE" }),
  getAppartamenti: id      => authFetch(`/users/${id}/appartamenti`).then(r => r.json()),
  setAppartamenti: (id, ids) => authFetch(`/users/${id}/appartamenti`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ ids }),
  }).then(r => r.json()),
  getInquilini: id      => authFetch(`/users/${id}/inquilini`).then(r => r.json()),
  setInquilini: (id, ids) => authFetch(`/users/${id}/inquilini`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ ids }),
  }).then(r => r.json()),
  setPassword: (id, password) => authFetch(`/users/${id}/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ password }),
  }).then(r => r.json()),
};
