import { ValidationError } from "../shared/DomainError.js";

export const METODI_PAGAMENTO = Object.freeze([
  "bonifico", "contanti", "rid", "assegno", "carta", "altro",
]);

export class Pagamento {
  constructor({
    id, fatto_id, importo, data_pagamento, metodo, note,
    persona_id, created_at, updated_at, persona_nome,
  }) {
    if (importo == null || Number(importo) <= 0) throw new ValidationError("importo deve essere > 0");
    this.id          = id;
    this.fattoId     = fatto_id     || null;
    this.importo     = Number(importo);
    this.dataPagamento= data_pagamento || null;
    this.metodo      = metodo       || null;
    this.note        = note?.trim() || null;
    this.personaId   = persona_id   || null;
    this.createdAt   = created_at;
    this.updatedAt   = updated_at;
    this.personaNome = persona_nome  || null;
  }

  toJSON() {
    return {
      id:            this.id,
      fattoId:       this.fattoId,
      importo:       this.importo,
      dataPagamento: this.dataPagamento,
      metodo:        this.metodo,
      note:          this.note,
      personaId:     this.personaId,
      personaNome:   this.personaNome,
    };
  }

  static fromRow(row) {
    return new Pagamento(row);
  }
}
