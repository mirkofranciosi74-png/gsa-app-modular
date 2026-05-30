/**
 * Use cases per il modulo Patrimonio.
 *
 * @param {{
 *   condominioRepo:        any,
 *   immobileRepo:          any,
 *   ruoloRepo:             any,
 *   personaCondominioRepo: any,
 * }} deps
 */
export function makePatrimonioService({ condominioRepo, immobileRepo, ruoloRepo, personaCondominioRepo }) {
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
    async rimuoviCondominio(id) {
      const n = await condominioRepo.countImmobili(id);
      if (n > 0) {
        const { ValidationError } = await import("../../domain/shared/DomainError.js");
        throw new ValidationError(
          `Impossibile eliminare: il condominio ha ${n} immobile${n !== 1 ? "i" : ""} associato${n !== 1 ? "i" : ""}.`
        );
      }
      return condominioRepo.remove(id);
    },

    // ── Immobile ───────────────────────────────────────────────────────────────
    listaImmobili({ condominioId, attivo, soggetto } = {}) {
      return immobileRepo.findAll({ condominioId, attivo, soggetto });
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
    ruoliTutti() {
      return ruoloRepo.listAll();
    },
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
    verificaQuote(immobileId) {
      return ruoloRepo.verificaQuote(immobileId);
    },

    // ── PersonaCondominio ──────────────────────────────────────────────────────
    personeCondominio(condominioId, filtri) {
      return personaCondominioRepo.listByCondominio(condominioId, filtri);
    },
    proprietariImmobiliCondominio(condominioId, dataRif) {
      return immobileRepo.proprietariByCondominio(condominioId, dataRif);
    },
    condominiBypersona(personaId) {
      return personaCondominioRepo.listByPersona(personaId);
    },
    associaPersonaCondominio(dati) {
      return personaCondominioRepo.create(dati);
    },
    aggiornaAssociazioneCondominio(id, dati) {
      return personaCondominioRepo.update(id, dati);
    },
    rimuoviAssociazioneCondominio(id) {
      return personaCondominioRepo.remove(id);
    },
  };
}
