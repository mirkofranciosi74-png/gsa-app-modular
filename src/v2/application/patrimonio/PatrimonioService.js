/**
 * Use cases per il modulo Patrimonio (Condominio + Immobile + RuoloPersona).
 *
 * @param {{
 *   condominioRepo: any,
 *   immobileRepo:   any,
 *   ruoloRepo:      any,
 * }} deps
 */
export function makePatrimonioService({ condominioRepo, immobileRepo, ruoloRepo }) {
  return {
    // ── Condominio ─────────────────────────────────────────────────────────────
    listaCondomini() {
      return condominioRepo.findAll();
    },
    trovaCondominio(id) {
      return condominioRepo.findById(id);
    },
    creaCondominio(dati) {
      return condominioRepo.create(dati);
    },
    aggiornaCondominio(id, dati) {
      return condominioRepo.update(id, dati);
    },
    consolidaCondomini(id, sourceIds) {
      return condominioRepo.consolida(id, sourceIds);
    },

    // ── Immobile ───────────────────────────────────────────────────────────────
    listaImmobili({ condominioId, attivo } = {}) {
      return immobileRepo.findAll({ condominioId, attivo });
    },
    trovaImmobile(id) {
      return immobileRepo.findById(id);
    },
    creaImmobile(dati) {
      return immobileRepo.create(dati);
    },
    aggiornaImmobile(id, dati) {
      return immobileRepo.update(id, dati);
    },
    dipendenzaImmobile(id) {
      return immobileRepo.countDipendenze(id);
    },
    async rimuoviImmobile(id) {
      const dep = await immobileRepo.countDipendenze(id);
      if (dep.totale > 0) {
        const { ValidationError } = await import("../../domain/shared/DomainError.js");
        throw new ValidationError(
          `Impossibile eliminare: l'immobile ha ${dep.nRuoli} ruoli, ${dep.nFatti} movimenti e ${dep.nRegole} regole associate.`
        );
      }
      return immobileRepo.remove(id);
    },

    // ── RuoloPersona ───────────────────────────────────────────────────────────
    ruoliPerImmobile(immobileId, filtri) {
      return ruoloRepo.listByImmobile(immobileId, filtri);
    },
    ruoliPerPersona(personaId) {
      return ruoloRepo.listByPersona(personaId);
    },
    creaRuolo(dati) {
      return ruoloRepo.create(dati);
    },
    aggiornaRuolo(id, dati) {
      return ruoloRepo.update(id, dati);
    },
    rimuoviRuolo(id) {
      return ruoloRepo.remove(id);
    },
    verificaQuote(immobileId, da, a) {
      return ruoloRepo.verificaQuote(immobileId, da, a);
    },
  };
}
