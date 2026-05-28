import { ValidationError } from "../shared/DomainError.js";

export class Condominio {
  constructor({ id, nome, indirizzo, virtuale = false, created_at, updated_at }) {
    if (!nome?.trim()) throw new ValidationError("nome obbligatorio");
    this.id        = id;
    this.nome      = nome.trim();
    this.indirizzo = indirizzo?.trim() || null;
    this.virtuale  = Boolean(virtuale);
    this.createdAt = created_at;
    this.updatedAt = updated_at;
  }

  toJSON() {
    return {
      id:        this.id,
      nome:      this.nome,
      indirizzo: this.indirizzo,
      virtuale:  this.virtuale,
    };
  }

  static fromRow(row) {
    return new Condominio(row);
  }
}
