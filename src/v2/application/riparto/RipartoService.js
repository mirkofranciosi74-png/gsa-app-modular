import { calcolaRipartoPuro } from "../../domain/riparto/MotoreRiparto.js";

/**
 * Use cases per il modulo Riparto.
 * Il motore di calcolo è puro (no DB); il repository fornisce i dati di contesto.
 *
 * @param {{ regolaRepo: any, ruoloRepo: any }} deps
 */
export function makeRipartoService({ regolaRepo, ruoloRepo }) {
  async function ruoliAttiviInMese(immobileId, mese, target) {
    const ruolo = target === "proprietari" ? "proprietario" : "inquilino";
    return ruoloRepo.listByImmobile(immobileId, { ruolo, dataRif: mese + "-01" });
  }

  return {
    // ── Calcolo riparto ────────────────────────────────────────────────────────
    async calcola({ immobileId, tipoSpesaId, mese, importo, target = "inquilini" }) {
      const regola   = await regolaRepo.findApplicabile(immobileId, tipoSpesaId, mese);
      const attivi   = await ruoliAttiviInMese(immobileId, mese, target);

      if (attivi.length === 0) {
        return { importoTotale: importo, quote: [], bilanciato: false, fonte: "nessun_ruolo" };
      }

      if (!regola) {
        const quote = attivi.map(a => ({
          id:      a.personaId,
          nome:    [a.personaCognome, a.personaNome].filter(Boolean).join(" "),
          quota:   1,
        }));
        const risultato = calcolaRipartoPuro({ importoTotale: importo, quote });
        return { ...risultato, fonte: "default_uguale" };
      }

      const dettagli = regola.dettagli || [];
      const esclusioni = new Set(dettagli.filter(d => !d.includi).map(d => d.personaId || d.persona_id));
      const inclusioni  = new Set(dettagli.filter(d =>  d.includi).map(d => d.personaId || d.persona_id));

      let partecipanti;
      if (regola.modalita === "includi" && inclusioni.size > 0) {
        partecipanti = attivi.filter(a => inclusioni.has(a.personaId));
      } else {
        partecipanti = attivi.filter(a => !esclusioni.has(a.personaId));
      }

      if (partecipanti.length === 0) {
        return { importoTotale: importo, quote: [], bilanciato: false, fonte: "nessun_partecipante" };
      }

      const quotaTotale = Number(regola.quota_totale_pct || 100);

      const quote = partecipanti.map(p => {
        const det = dettagli.find(d => (d.personaId || d.persona_id) === p.personaId && d.includi);
        return {
          id:    p.personaId,
          nome:  [p.personaCognome, p.personaNome].filter(Boolean).join(" "),
          quota: det?.percentuale != null
            ? Number(det.percentuale)
            : (regola.split_uguale ? quotaTotale / partecipanti.length : (Number(p.quota) || 1)),
        };
      });

      const risultato = calcolaRipartoPuro({ importoTotale: importo, quote });
      return { ...risultato, fonte: regola.split_uguale ? "regola_uguale" : "regola_quote" };
    },

    // ── Gestione regole ────────────────────────────────────────────────────────
    listaRegole(immobileId) {
      return regolaRepo.listByImmobile(immobileId);
    },

    creaRegola(dati) {
      return regolaRepo.create(dati);
    },

    aggiungiDettaglio(regolaId, dati) {
      return regolaRepo.addDettaglio(regolaId, dati);
    },

    rimuoviRegola(id) {
      return regolaRepo.remove(id);
    },
  };
}
