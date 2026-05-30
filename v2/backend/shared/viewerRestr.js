import { userRepo } from "../auth/userRepo.js";

/**
 * Per un viewer carica le restrizioni v2 dal DB.
 * Restituisce null se l'utente non è viewer o non ha restrizioni su quel campo.
 * Il Set vuoto indica "nessun vincolo" (accesso totale su quella dimensione).
 *
 * @returns {null | { immobili: Set<string>|null, inquilini: Set<string>|null, proprietari: Set<string>|null }}
 */
export async function getViewerRestrV2(req) {
  if (req.user?.ruolo !== "viewer") return null;
  const r = await userRepo.getRestrizioniV2(req.user.id);
  return {
    immobili:    r.immobili.length    > 0 ? new Set(r.immobili)    : null,
    inquilini:   r.inquilini.length   > 0 ? new Set(r.inquilini)   : null,
    proprietari: r.proprietari.length > 0 ? new Set(r.proprietari) : null,
  };
}
