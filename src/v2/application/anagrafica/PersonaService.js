/**
 * Use cases per il modulo Anagrafica > Persona.
 * Riceve il repository via DI — non importa mai il pool direttamente.
 *
 * @param {{ personaRepo: ReturnType<import('../../infrastructure/persistence/postgres/PersonaRepository.js').makePersonaRepository> }} deps
 */
export function makePersonaService({ personaRepo }) {
  return {
    async lista({ q, attivo } = {}) {
      if (q?.trim()) return personaRepo.search(q.trim());
      return personaRepo.findAll({ attivo });
    },

    async trovaPerId(id) {
      return personaRepo.findById(id);
    },

    async trovaPerLegacy(tipo, legacyId) {
      return personaRepo.findByLegacyId(tipo, legacyId);
    },

    async crea(dati) {
      return personaRepo.create(dati);
    },

    async aggiorna(id, dati) {
      return personaRepo.update(id, dati);
    },

    async aggiungiLegacyRef(personaId, tipo, legacyId) {
      await personaRepo.addLegacyRef(personaId, tipo, legacyId);
      return personaRepo.findById(personaId);
    },

    async quadratura() {
      return personaRepo.quadratura();
    },
  };
}
