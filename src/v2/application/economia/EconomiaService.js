/**
 * Use cases per il modulo Economia (FattoEconomico + Pagamento).
 *
 * @param {{ fattoRepo: any }} deps
 */
export function makeEconomiaService({ fattoRepo }) {
  return {
    lista(filtri) {
      return fattoRepo.list(filtri);
    },

    trovaPerId(id) {
      return fattoRepo.findById(id);
    },

    totaliPerImmobile(immobileId, periodoDa, periodoA) {
      return fattoRepo.totaliPerImmobile(immobileId, periodoDa, periodoA);
    },

    quadraturaImmobile(immobileId) {
      return fattoRepo.quadratura(immobileId);
    },
  };
}
