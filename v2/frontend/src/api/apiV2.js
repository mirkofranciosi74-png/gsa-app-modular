const BASE = (import.meta.env.VITE_API_BASE_URL ?? "") + "/api";

function authHeader() {
  const token = localStorage.getItem("gsa_v2_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function http(method, path, body) {
  const opts = {
    method,
    headers: { ...authHeader(), "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const e = new Error(err.error || "Errore API v2");
    e.status = res.status;
    throw e;
  }
  if (res.status === 204) return null;
  return res.json();
}

const get  = path         => http("GET",    path);
const post = (path, body) => http("POST",   path, body);
const put  = (path, body) => http("PUT",    path, body);
const del  = path         => http("DELETE", path);

// ── Anagrafica ─────────────────────────────────────────────────────────────────
export const personeV2 = {
  lista:       (q, attivo) => get(`/persone${q ? `?q=${encodeURIComponent(q)}` : ""}${attivo !== undefined ? `${q ? "&" : "?"}attivo=${attivo}` : ""}`),
  trovaPerId:  id          => get(`/persone/${id}`),
  crea:        dati        => post("/persone", dati),
  aggiorna:    (id, dati)  => put(`/persone/${id}`, dati),
  dipendenze:  id          => get(`/persone/${id}/dipendenze`),
  elimina:     id          => del(`/persone/${id}`),
};

// ── Patrimonio — Condomini ─────────────────────────────────────────────────────
export const condominiV2 = {
  lista:              ()                 => get("/condomini"),
  trovaPerId:         id                 => get(`/condomini/${id}`),
  crea:               dati               => post("/condomini", dati),
  aggiorna:           (id, dati)         => put(`/condomini/${id}`, dati),
  elimina:            id                 => del(`/condomini/${id}`),
  consolida:          (id, sourceIds)    => post(`/condomini/${id}/consolida`, { sourceIds }),
  // Persone associate
  persone:            (id, filtri = {})  => {
    const p = new URLSearchParams();
    if (filtri.dataRif) p.set("dataRif", filtri.dataRif);
    return get(`/condomini/${id}/persone${p.toString() ? "?" + p : ""}`);
  },
  associaPersona:     (id, dati)         => post(`/condomini/${id}/persone`, dati),
  aggiornaAssociazione:(id, assId, dati) => put(`/condomini/${id}/persone/${assId}`, dati),
  rimuoviAssociazione:(id, assId)        => del(`/condomini/${id}/persone/${assId}`),
  proprietariImmobili:(id, dataRif)      => get(`/condomini/${id}/proprietari-immobili${dataRif ? `?dataRif=${dataRif}` : ""}`),
};

// ── Patrimonio — Immobili ──────────────────────────────────────────────────────
export const immobiliV2 = {
  lista:            (filtri = {})         => {
    const p = new URLSearchParams();
    if (filtri.condominioId) p.set("condominioId", filtri.condominioId);
    if (filtri.attivo !== undefined) p.set("attivo", filtri.attivo);
    if (filtri.soggetto) p.set("soggetto", filtri.soggetto);
    return get(`/immobili${p.toString() ? "?" + p : ""}`);
  },
  trovaPerId:       id                    => get(`/immobili/${id}`),
  crea:             dati                  => post("/immobili", dati),
  aggiorna:         (id, dati)            => put(`/immobili/${id}`, dati),
  elimina:          id                    => del(`/immobili/${id}`),
  dipendenze:       id                    => get(`/immobili/${id}/dipendenze`),
  ruoli:            (id, filtri = {})     => {
    const p = new URLSearchParams();
    if (filtri.ruolo)   p.set("ruolo",   filtri.ruolo);
    if (filtri.dataRif) p.set("dataRif", filtri.dataRif);
    return get(`/immobili/${id}/ruoli${p.toString() ? "?" + p : ""}`);
  },
  verificaQuote:    (id, da, a)           => get(`/immobili/${id}/quote-verifica${da ? `?da=${da}&a=${a}` : ""}`),
  regoleRiparto:    id                    => get(`/immobili/${id}/regole-riparto`),
};

// ── Patrimonio — Ruoli ─────────────────────────────────────────────────────────
export const ruoliV2 = {
  tutti:       ()                 => get("/ruoli"),
  perPersona:  personaId          => get(`/ruoli/persone/${personaId}/ruoli`),
  crea:        dati               => post("/ruoli", dati),
  aggiorna:    (id, dati)         => put(`/ruoli/${id}`, dati),
  rimuovi:     id                 => del(`/ruoli/${id}`),
};

// ── Economia — Fatti Economici ────────────────────────────────────────────────
export const fattiV2 = {
  lista: (filtri = {}) => {
    const p = new URLSearchParams();
    Object.entries(filtri).forEach(([k, v]) => { if (v !== undefined && v !== "") p.set(k, v); });
    return get(`/fatti${p.toString() ? "?" + p : ""}`);
  },
  trovaPerId: id => get(`/fatti/${id}`),
  crea:       dati => post("/fatti", dati),
  aggiorna:       (id, dati)   => put(`/fatti/${id}`, dati),
  aggiornaBulk:   (ids, dati)  => put("/fatti/bulk", { ids, ...dati }),
  elimina:        id           => del(`/fatti/${id}`),

  // Deduplication
  duplicatiDati: (filtri = {}) => {
    const p = new URLSearchParams();
    Object.entries(filtri).forEach(([k, v]) => { if (v != null && v !== "") p.set(k, v); });
    return get(`/fatti/duplicati-dati${p.toString() ? "?" + p : ""}`);
  },

  // PDF — usa FormData (non JSON)
  checkHash: async (file, excludeId = null) => {
    const fd = new FormData();
    fd.append("file", file);
    if (excludeId) fd.append("excludeId", excludeId);
    const res = await fetch(BASE + "/fatti/check-hash", {
      method: "POST",
      headers: authHeader(),
      body: fd,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw Object.assign(new Error(e.error || "Errore"), { status: res.status }); }
    return res.json();
  },

  estraiPdf: async (file, { immobili = [], tipologie = [] } = {}) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("immobili",  JSON.stringify(immobili));
    fd.append("tipologie", JSON.stringify(tipologie));
    const res = await fetch(BASE + "/fatti/extract", {
      method: "POST",
      headers: authHeader(),
      body: fd,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw Object.assign(new Error(e.error || "Errore estrazione"), { status: res.status }); }
    return res.json();
  },

  uploadPdf: async (id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(BASE + `/fatti/${id}/pdf`, {
      method: "POST",
      headers: authHeader(),
      body: fd,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw Object.assign(new Error(e.error || "Errore upload"), { status: res.status }); }
    return res.json();
  },

  getPdfUrl: id => BASE + `/fatti/${id}/pdf`,
  eliminaPdf: id => del(`/fatti/${id}/pdf`),
};

// ── Economia — Tipologie ──────────────────────────────────────────────────────
export const tipologieV2 = {
  lista: (filtri = {}) => {
    const p = new URLSearchParams();
    Object.entries(filtri).forEach(([k, v]) => { if (v !== undefined && v !== "") p.set(k, v); });
    return get(`/tipologie${p.toString() ? "?" + p : ""}`);
  },
  trovaPerId: id         => get(`/tipologie/${id}`),
  uso:        id         => get(`/tipologie/${id}/uso`),
  crea:       dati       => post("/tipologie", dati),
  aggiorna:   (id, dati) => put(`/tipologie/${id}`, dati),
  elimina:    id         => del(`/tipologie/${id}`),
};

// ── Riparto ────────────────────────────────────────────────────────────────────
export const ripartoV2 = {
  calcola:          dati           => post("/riparto/calcola", dati),
  creaRegolaCoppia: dati           => post("/riparto/regole/coppia", dati),

  // Regole appartamento (proprietari / inquilini)
  listaRegole:            (immobileId, target) => {
    const p = new URLSearchParams({ immobileId });
    if (target) p.set("target", target);
    return get(`/riparto/regole?${p}`);
  },
  creaRegola:             dati       => post("/riparto/regole", dati),
  aggiornaRegola:         (id, dati) => put(`/riparto/regole/${id}`, dati),
  aggiungiDettaglio:      (id, dati) => post(`/riparto/regole/${id}/dettagli`, dati),
  rimuoviRegola:          id         => del(`/riparto/regole/${id}`),

  // Regole condominio → appartamenti
  listaRegoleCondominio:          condominioId => get(`/riparto/regole-condominio?condominioId=${condominioId}`),
  creaRegolaCondominio:           dati         => post("/riparto/regole-condominio", dati),
  aggiornaRegolaCondominio:       (id, dati)   => put(`/riparto/regole-condominio/${id}`, dati),
  aggiungiDettaglioCondominio:    (id, dati)   => post(`/riparto/regole-condominio/${id}/dettagli`, dati),
  rimuoviRegolaCondominio:        id           => del(`/riparto/regole-condominio/${id}`),
};

// ── Dashboard v2 ──────────────────────────────────────────────────────────────
export const dashboardV2 = {
  get:         () => get("/griglia/dashboard"),
  proprietari: () => get("/griglia/dashboard/proprietari"),
  stats:       () => get("/griglia/dashboard/stats"),
  recenti:     () => get("/griglia/dashboard/recenti"),
};

// ── Griglia Economica v2 ───────────────────────────────────────────────────────
export const grigliav2 = {
  inquilini: (filtri = {}) => {
    const p = new URLSearchParams();
    Object.entries(filtri).forEach(([k, v]) => { if (v != null && v !== "") p.set(k, v); });
    return get(`/griglia/inquilini?${p}`);
  },
  proprietari: (filtri = {}) => {
    const p = new URLSearchParams();
    Object.entries(filtri).forEach(([k, v]) => { if (v != null && v !== "") p.set(k, v); });
    return get(`/griglia/proprietari?${p}`);
  },

  downloadExcel: async (filtri = {}) => {
    const p = new URLSearchParams();
    Object.entries(filtri).forEach(([k, v]) => { if (v != null && v !== "") p.set(k, v); });
    const token = localStorage.getItem("gsa_v2_token");
    const res = await fetch(BASE + `/griglia/export-excel?${p}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const cd   = res.headers.get("Content-Disposition") || "";
    const match = cd.match(/filename="([^"]+)"/);
    a.href = url;
    a.download = match ? match[1] : `griglia_v2.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  downloadZip: async (filtri = {}) => {
    const p = new URLSearchParams();
    Object.entries(filtri).forEach(([k, v]) => { if (v != null && v !== "") p.set(k, v); });
    const token = localStorage.getItem("gsa_v2_token");
    const res = await fetch(BASE + `/griglia/export-zip?${p}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const cd   = res.headers.get("Content-Disposition") || "";
    const match = cd.match(/filename="([^"]+)"/);
    a.href = url;
    a.download = match ? match[1] : `griglia_v2.zip`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
};

// ── Importazione v2 ───────────────────────────────────────────────────────────
export const importazioneV2 = {
  immobili:       ()            => get("/importazione/immobili"),
  parse: async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(BASE + "/importazione/parse", {
      method: "POST", headers: authHeader(), body: fd,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw Object.assign(new Error(e.error || "Errore parse"), { status: res.status }); }
    return res.json();
  },
  checkDuplicati: (righe)       => post("/importazione/check-duplicati", { righe }),
  listRegole:     ()            => get("/importazione/regole"),
  saveRegola:     dati          => post("/importazione/regole", dati),
  updateRegola:   (id, dati)    => put(`/importazione/regole/${id}`, dati),
  deleteRegola:   id            => del(`/importazione/regole/${id}`),
};

// ── Report v2 ─────────────────────────────────────────────────────────────────
export const reportV2 = {
  genera:  params => post("/report/genera", { params }),
  list:    ()     => get("/report"),
  get:     id     => get(`/report/${id}`),
  save:    d      => post("/report", d),
  delete:  id     => del(`/report/${id}`),
  downloadPdf: (b64, name = "report.pdf") => {
    const link = document.createElement("a");
    link.href = `data:application/pdf;base64,${b64}`;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },
};

// ── Admin ──────────────────────────────────────────────────────────────────────
export const adminV2 = {
  verificaCoerenza:  () => get("/admin/verifica-coerenza"),
  backfillHash:      () => post("/admin/backfill-hash", {}),
  backfillSpeseProp: () => post("/admin/backfill-spese-prop", {}),
};

// ── Archivio documentale v2 ───────────────────────────────────────────────────
export const archivioTipiV2 = {
  list:   ()       => get("/archivio-tipi"),
  create: d        => post("/archivio-tipi", d),
  update: (id, d)  => put(`/archivio-tipi/${id}`, d),
  delete: id       => del(`/archivio-tipi/${id}`),
};

export const archivioV2 = {
  list: (f = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(f).filter(([, v]) => v))
    ).toString();
    return get(`/archivio${qs ? "?" + qs : ""}`);
  },
  get:     id      => get(`/archivio/${id}`),
  update:  (id, d) => put(`/archivio/${id}`, d),
  delete:  id      => del(`/archivio/${id}`),
  fileUrl: id      => `${BASE}/archivio/${id}/file`,

  checkHash: file => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${BASE}/archivio/check-hash`, {
      method: "POST", body: fd,
      headers: (() => { const t = localStorage.getItem("gsa_v2_token"); return t ? { Authorization: `Bearer ${t}` } : {}; })(),
    }).then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); });
  },

  upload: (file, { tipDocId, note, validita_da, validita_a, associazioni = [] }) => {
    const fd = new FormData();
    fd.append("file", file);
    if (tipDocId)    fd.append("tipo_documento_id", tipDocId);
    if (note)        fd.append("note", note);
    if (validita_da) fd.append("validita_da", validita_da);
    if (validita_a)  fd.append("validita_a", validita_a);
    if (associazioni.length) fd.append("associazioni", JSON.stringify(associazioni));
    const token = localStorage.getItem("gsa_v2_token");
    return fetch(`${BASE}/archivio/upload`, {
      method: "POST", body: fd,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); });
  },
};

// ── Admin (backup, restore, logs) ─────────────────────────────────────────────
export const adminApi = {
  backup: async (tipo = "tutto") => {
    const res = await fetch(`${BASE}/admin/backup?tipo=${tipo}`, { headers: authHeader() });
    if (!res.ok) throw new Error(`Backup fallito: HTTP ${res.status}`);
    const blob = await res.blob();
    const date = new Date().toISOString().slice(0, 10);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `gsa_v2_backup_${tipo}_${date}.zip`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
  restore: (file, tipo = "tutto") => {
    const fd = new FormData(); fd.append("file", file);
    return fetch(`${BASE}/admin/restore?tipo=${tipo}`, {
      method: "POST", body: fd, headers: authHeader(),
    }).then(r => r.json());
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
    a.href = url; a.download = `gsa_v2_${date}.log`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};

// ── Auth — gestione utenti ─────────────────────────────────────────────────────
const authFetch = (path, opts = {}) => {
  const { headers: extraHeaders = {}, ...restOpts } = opts;
  return fetch(`${BASE}/auth${path}`, {
    headers: { ...authHeader(), ...extraHeaders },
    ...restOpts,
  });
};

export const authApi = {
  listUsers:    ()           => authFetch("/users").then(r => r.json()),
  createUser:   (data)       => authFetch("/users", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  }).then(r => r.json()),
  updateRuolo:  (id, ruolo)  => authFetch(`/users/${id}/ruolo`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruolo }),
  }).then(r => r.json()),
  updateAttivo: (id, attivo) => authFetch(`/users/${id}/attivo`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attivo }),
  }).then(r => r.json()),
  deleteUser:   id           => authFetch(`/users/${id}`, { method: "DELETE" }),
  setPassword:  (id, password) => authFetch(`/users/${id}/password`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }),
  }).then(r => r.json()),
  getRestrizioniV2: id       => authFetch(`/users/${id}/restrizioni-v2`).then(r => r.json()),
  setImmobiliV2:    (id, ids) => authFetch(`/users/${id}/immobili-v2`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }),
  }).then(r => r.json()),
  setInquiliniV2:   (id, ids) => authFetch(`/users/${id}/inquilini-v2`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }),
  }).then(r => r.json()),
  setProprietariV2: (id, ids) => authFetch(`/users/${id}/proprietari-v2`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }),
  }).then(r => r.json()),
};
