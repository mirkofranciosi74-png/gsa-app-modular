import crypto from "crypto";
import { extract } from "../../../shared/extractor.js";
import { salvaPdf, leggiPdf, eliminaPdf, pdfEsiste } from "../../../shared/storage.js";
import { ValidationError } from "../../domain/shared/DomainError.js";

/**
 * Use cases per il modulo Economia.
 * @param {{ fattoRepo: any, tipologiaRepo: any }} deps
 */
export function makeEconomiaService({ fattoRepo, tipologiaRepo }) {
  return {
    // ── Fatti Economici ───────────────────────────────────────────────────────

    lista(filtri) {
      return fattoRepo.list(filtri);
    },

    trovaPerId(id) {
      return fattoRepo.findById(id);
    },

    async crea(dati) {
      return fattoRepo.create(dati);
    },

    async aggiorna(id, dati) {
      return fattoRepo.update(id, dati);
    },

    async aggiornaBulk(ids, dati) {
      return fattoRepo.updateBulk(ids, dati);
    },

    async rimuovi(id) {
      // Se ha un PDF, eliminalo dal filesystem
      const fatto = await fattoRepo.findById(id);
      if (fatto.filePath) {
        try { eliminaPdf(id); } catch { /* non bloccante */ }
      }
      return fattoRepo.remove(id);
    },

    totaliPerImmobile(immobileId, periodoDa, periodoA) {
      return fattoRepo.totaliPerImmobile(immobileId, periodoDa, periodoA);
    },

    quadraturaImmobile(immobileId) {
      return fattoRepo.quadratura(immobileId);
    },

    // ── PDF ───────────────────────────────────────────────────────────────────

    /** Controlla se il file hash è già presente (duplicato binario) */
    async checkHashFile(buffer, excludeId = null) {
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      const duplicati = await fattoRepo.checkHashFile(hash, excludeId);
      return { hash, duplicati: duplicati.map(f => f.toJSON()) };
    },

    /**
     * Estrae dati dal PDF (OCR/parse) per auto-fill del form.
     * Passa immobili v2 per il fuzzy-matching al posto degli appartamenti legacy.
     */
    async estraiPdf(buffer, filename, { immobili = [], tipologie = [] } = {}) {
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      const dupFile = await fattoRepo.checkHashFile(hash);

      const e = await extract(buffer, filename, {
        appartamenti: immobili.map(i => ({
          id:    i.id,
          nome:  i.nome,
          via:   i.via || "",
          citta: i.citta || "",
        })),
        tipi: tipologie.map(t => t.descrizione),
      });

      const tipoObj = tipologie.find(t => t.descrizione === e.tipo_descrizione);

      return {
        fileHash:        hash,
        nomeFile:        filename,
        tipoSpesaId:     tipoObj?.id       || null,
        tipoSpesaDesc:   e.tipo_descrizione || null,
        immobileId:      e.appartamento_id  || null,
        immobileNome:    e.appartamento_nome || null,
        periodoDa:       e.periodo_da       || null,
        periodoA:        e.periodo_a        || null,
        importo:         e.importo          || null,
        fornitore:       e.fornitore        || null,
        numeroDoc:       e.numero_doc       || null,
        confidenza:      e.confidenza,
        metodo:          e.metodo_estrazione,
        duplicatiFile:   dupFile.map(f => f.toJSON()),
      };
    },

    /** Salva/sostituisce il PDF collegato a un fatto già esistente */
    async salvaPdfFatto(id, buffer, nomeFile, mimeType = "application/pdf") {
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      salvaPdf(id, buffer);
      const filePath = `pdf/${id}.pdf`;
      await fattoRepo.updateFile(id, { fileHash: hash, filePath, nomeFile, mimeType });
      return { hasPdf: true, fileHash: hash };
    },

    /** Restituisce il buffer PDF di un fatto */
    leggiPdfFatto(id) {
      return leggiPdf(id);
    },

    pdfEsiste(id) {
      return pdfEsiste(id);
    },

    async eliminaPdfFatto(id) {
      eliminaPdf(id);
      await fattoRepo.clearFile(id);
    },

    // ── Deduplication dati ────────────────────────────────────────────────────

    checkDuplicatiDati(filtri) {
      return fattoRepo.checkDuplicatiDati(filtri).then(list => list.map(f => f.toJSON()));
    },

    // ── Tipologie Economiche ──────────────────────────────────────────────────

    listaTipologie(filtri) {
      return tipologiaRepo.list(filtri);
    },

    trovaTipologia(id) {
      return tipologiaRepo.findById(id);
    },

    creaTipologia(dati) {
      return tipologiaRepo.create(dati);
    },

    aggiornaTipologia(id, dati) {
      return tipologiaRepo.update(id, dati);
    },

    async rimuoviTipologia(id) {
      return tipologiaRepo.remove(id);
    },

    contaUsoTipologia(id) {
      return tipologiaRepo.countUso(id);
    },
  };
}
