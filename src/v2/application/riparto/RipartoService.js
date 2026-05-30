import { calcolaRipartoPuro } from "../../domain/riparto/MotoreRiparto.js";

/**
 * Use cases per il modulo Riparto.
 * @param {{ regolaRepo: any, ruoloRepo: any }} deps
 */
export function makeRipartoService({ regolaRepo, ruoloRepo }) {
  async function ruoliAttiviInMese(immobileId, mese, target) {
    const ruolo = target === "proprietari" ? "proprietario" : "inquilino";
    return ruoloRepo.listByImmobile(immobileId, { ruolo, dataRif: mese + "-01" });
  }

  return {
    // ── Calcolo riparto appartamento ──────────────────────────────────────────
    async calcola({ immobileId, tipoSpesaId, mese, importo, target = "inquilini" }) {
      // dataRif: first day of month as DATE string for DB comparison
      const dataRif = mese + "-01";
      const regola = await regolaRepo.findApplicabile(immobileId, tipoSpesaId, dataRif, target);
      const attivi = await ruoliAttiviInMese(immobileId, mese, target);

      if (attivi.length === 0) {
        return { importoTotale: importo, quote: [], bilanciato: false, fonte: "nessun_ruolo" };
      }

      if (!regola) {
        // Per entrambi i target si usa "quota" (quote millesimali/percentuali del ruolo).
        // "quota_affitto" è l'importo mensile di affitto, NON una percentuale di riparto.
        const quote = attivi.map(a => ({
          id:    a.personaId,
          nome:  [a.personaCognome, a.personaNome].filter(Boolean).join(" "),
          quota: Number(a.quota) || 1,
        }));
        const risultato = calcolaRipartoPuro({ importoTotale: importo, quote });
        return { ...risultato, fonte: "default_quote" };
      }

      const dettagli  = regola.dettagli || [];
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
      const importoEffettivo = importo * quotaTotale / 100;

      const quote = partecipanti.map(p => {
        const det = dettagli.find(d => (d.personaId || d.persona_id) === p.personaId && d.includi);
        let quotaVal;
        if (det?.percentuale != null) {
          quotaVal = Number(det.percentuale);
        } else if (regola.split_uguale) {
          quotaVal = quotaTotale / partecipanti.length;
        } else {
          quotaVal = Number(p.quota) || 1;
        }
        return {
          id:    p.personaId,
          nome:  [p.personaCognome, p.personaNome].filter(Boolean).join(" "),
          quota: quotaVal,
        };
      });

      const risultato = calcolaRipartoPuro({ importoTotale: importoEffettivo, quote });
      return {
        ...risultato,
        importoTotale:   importo,
        quotaTotalePct:  quotaTotale,
        fonte: regola.split_uguale ? "regola_uguale" : "regola_quote",
      };
    },

    // ── CRUD regole appartamento ──────────────────────────────────────────────
    listaRegole(immobileId, filtri) {
      return regolaRepo.listByImmobile(immobileId, filtri);
    },

    creaRegola(dati) {
      return regolaRepo.create(dati);
    },

    aggiungiDettaglio(regolaId, dati) {
      return regolaRepo.addDettaglio(regolaId, dati);
    },

    async aggiornaRegola(id, dati) {
      await regolaRepo.update(id, dati);
      if (Array.isArray(dati.dettagli)) {
        await regolaRepo.clearDettagli(id);
        for (const d of dati.dettagli) {
          await regolaRepo.addDettaglio(id, d);
        }
      }
    },

    rimuoviRegola(id) {
      return regolaRepo.remove(id);
    },

    // ── Regola coppia (livelli 2+3): crea proprietari + inquilini in un colpo ──
    async creaRegolaCoppia({ immobileId, tipoSpesaIds, validitaDa, validitaA, quotaProprietari, quotaInquilini, note }) {
      const tids = (tipoSpesaIds?.length) ? tipoSpesaIds : [null];
      const creati = [];
      for (const tipoSpesaId of tids) {
        const base = { immobileId, tipoSpesaId: tipoSpesaId || null, validitaDa: validitaDa || null, validitaA: validitaA || null, splitUguale: true, note: note || null };
        const rProp = await regolaRepo.create({ ...base, target: "proprietari", quotaTotalePct: Number(quotaProprietari ?? 100) });
        const rInq  = await regolaRepo.create({ ...base, target: "inquilini",   quotaTotalePct: Number(quotaInquilini  ?? 100) });
        creati.push({ proprietariId: rProp.id, inquiliniId: rInq.id, tipoSpesaId: tipoSpesaId || null });
      }
      return creati;
    },

    // ── CRUD regole condominio → appartamenti ─────────────────────────────────
    listaRegoleCondominio(condominioId) {
      return regolaRepo.listByCondominio(condominioId);
    },

    creaRegolaCondominio(dati) {
      return regolaRepo.createCondominio(dati);
    },

    aggiungiDettaglioCondominio(regolaId, dati) {
      return regolaRepo.addDettaglioCondominio(regolaId, dati);
    },

    async aggiornaRegolaCondominio(id, dati) {
      await regolaRepo.updateCondominio(id, dati);
      if (Array.isArray(dati.dettagli)) {
        await regolaRepo.clearDettagliCondominio(id);
        for (const d of dati.dettagli) {
          await regolaRepo.addDettaglioCondominio(id, d);
        }
      }
    },

    rimuoviRegolaCondominio(id) {
      return regolaRepo.removeCondominio(id);
    },
  };
}
