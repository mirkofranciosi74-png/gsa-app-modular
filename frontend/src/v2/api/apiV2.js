/**
 * Client API v2 DDD — parallelo a frontend/src/api.js (legacy).
 * Prefisso: /api/v2ddd
 * Tutte le richieste includono il JWT da localStorage.
 */

const BASE = (import.meta.env.VITE_API_BASE_URL ?? "") + "/api/v2ddd";

function authHeader() {
  const token = localStorage.getItem("gsa_token");
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
  lista:          (q, attivo)       => get(`/persone${q ? `?q=${encodeURIComponent(q)}` : ""}${attivo !== undefined ? `${q ? "&" : "?"}attivo=${attivo}` : ""}`),
  trovaPerId:     id                => get(`/persone/${id}`),
  trovaPerLegacy: (tipo, legacyId)  => get(`/persone/legacy/${tipo}/${legacyId}`),
  crea:           dati              => post("/persone", dati),
  aggiorna:       (id, dati)        => put(`/persone/${id}`, dati),
  aggiungiRef:    (id, tipo, lid)   => post(`/persone/${id}/legacy-ref`, { tipo, legacyId: lid }),
  quadratura:     ()                => get("/persone/quadratura"),
};

// ── Patrimonio — Condomini ─────────────────────────────────────────────────────
export const condominiV2 = {
  lista:       ()                 => get("/condomini"),
  trovaPerId:  id                 => get(`/condomini/${id}`),
  crea:        dati               => post("/condomini", dati),
  aggiorna:    (id, dati)         => put(`/condomini/${id}`, dati),
  consolida:   (id, sourceIds)    => post(`/condomini/${id}/consolida`, { sourceIds }),
};

// ── Patrimonio — Immobili ──────────────────────────────────────────────────────
export const immobiliV2 = {
  lista:            (filtri = {})         => {
    const p = new URLSearchParams();
    if (filtri.condominioId) p.set("condominioId", filtri.condominioId);
    if (filtri.attivo !== undefined) p.set("attivo", filtri.attivo);
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
  totali:           (id, da, a)           => get(`/immobili/${id}/totali${da ? `?da=${da}&a=${a}` : ""}`),
  quadratura:       id                    => get(`/immobili/${id}/quadratura`),
  regoleRiparto:    id                    => get(`/immobili/${id}/regole-riparto`),
};

// ── Patrimonio — Ruoli ─────────────────────────────────────────────────────────
export const ruoliV2 = {
  perPersona:  personaId          => get(`/ruoli/persone/${personaId}/ruoli`),
  crea:        dati               => post("/ruoli", dati),
  aggiorna:    (id, dati)         => put(`/ruoli/${id}`, dati),
  rimuovi:     id                 => del(`/ruoli/${id}`),
};

// ── Economia — Fatti Economici ────────────────────────────────────────────────
export const fattiV2 = {
  lista: (filtri = {}) => {
    const p = new URLSearchParams();
    Object.entries(filtri).forEach(([k, v]) => { if (v !== undefined) p.set(k, v); });
    return get(`/fatti${p.toString() ? "?" + p : ""}`);
  },
  trovaPerId: id => get(`/fatti/${id}`),
};

// ── Riparto ────────────────────────────────────────────────────────────────────
export const ripartoV2 = {
  calcola:          dati           => post("/riparto/calcola", dati),
  creaRegola:       dati           => post("/riparto/regole", dati),
  aggiungiDettaglio:(id, dati)     => post(`/riparto/regole/${id}/dettagli`, dati),
  rimuoviRegola:    id             => del(`/riparto/regole/${id}`),
};

// ── Admin ──────────────────────────────────────────────────────────────────────
export const adminV2 = {
  migrationStatus: () => get("/migration-status"),
};
