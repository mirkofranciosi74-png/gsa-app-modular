import { ValidationError } from "../shared/DomainError.js";

export const TIPI_FATTO = Object.freeze(["spesa", "entrata"]);

export class FattoEconomico {
  constructor({
    id, immobile_id, persona_id, tipo, tipo_spesa_id, importo, segno = 1,
    periodo_da, periodo_a, data_evento, descrizione, fornitore, numero_doc,
    periodicita, stato, legacy_tipo, legacy_id, created_at, updated_at,
    immobile_nome, persona_nome,
  }) {
    if (!immobile_id)              throw new ValidationError("immobileId obbligatorio");
    if (!TIPI_FATTO.includes(tipo)) throw new ValidationError("tipo deve essere 'spesa' o 'entrata'");
    if (importo == null || Number(importo) <= 0) throw new ValidationError("importo deve essere > 0");

    this.id          = id;
    this.immobileId  = immobile_id;
    this.personaId   = persona_id   || null;
    this.tipo        = tipo;
    this.tipoSpesaId = tipo_spesa_id|| null;
    this.importo     = Number(importo);
    this.segno       = Number(segno) || 1;
    this.periodoDa   = periodo_da   || null;
    this.periodoA    = periodo_a    || null;
    this.dataEvento  = data_evento  || null;
    this.descrizione = descrizione?.trim() || null;
    this.fornitore   = fornitore?.trim()   || null;
    this.numeroDoc   = numero_doc?.trim()  || null;
    this.periodicita = periodicita  || null;
    this.stato       = stato        || null;
    this.legacyTipo  = legacy_tipo  || null;
    this.legacyId    = legacy_id    || null;
    this.createdAt   = created_at;
    this.updatedAt   = updated_at;
    // join fields
    this.immobileNome= immobile_nome|| null;
    this.personaNome = persona_nome || null;
  }

  importoNetto() {
    return Math.round(this.importo * this.segno * 100) / 100;
  }

  toJSON() {
    return {
      id:          this.id,
      immobileId:  this.immobileId,
      immobileNome:this.immobileNome,
      personaId:   this.personaId,
      personaNome: this.personaNome,
      tipo:        this.tipo,
      tipoSpesaId: this.tipoSpesaId,
      importo:     this.importo,
      segno:       this.segno,
      importoNetto:this.importoNetto(),
      periodoDa:   this.periodoDa,
      periodoA:    this.periodoA,
      dataEvento:  this.dataEvento,
      descrizione: this.descrizione,
      fornitore:   this.fornitore,
      numeroDoc:   this.numeroDoc,
      periodicita: this.periodicita,
      stato:       this.stato,
      legacyTipo:  this.legacyTipo,
      legacyId:    this.legacyId,
    };
  }

  static fromRow(row) {
    return new FattoEconomico(row);
  }
}
