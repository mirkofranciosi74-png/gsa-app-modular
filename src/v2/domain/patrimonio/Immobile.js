import { ValidationError } from "../shared/DomainError.js";

export class Immobile {
  constructor({
    id, condominio_id, nome, via, citta, cap, note,
    attivo = true, legacy_id, condominio_nome, created_at, updated_at,
  }) {
    if (!nome?.trim())     throw new ValidationError("nome obbligatorio");
    if (!condominio_id)    throw new ValidationError("condominioId obbligatorio");
    this.id            = id;
    this.condominioId  = condominio_id;
    this.nome          = nome.trim();
    this.via           = via?.trim()    || null;
    this.citta         = citta?.trim()  || null;
    this.cap           = cap?.trim()    || null;
    this.note          = note?.trim()   || null;
    this.attivo        = Boolean(attivo);
    this.legacyId      = legacy_id      || null;
    this.condominioNome= condominio_nome|| null;
    this.createdAt     = created_at;
    this.updatedAt     = updated_at;
  }

  toJSON() {
    return {
      id:            this.id,
      condominioId:  this.condominioId,
      condominioNome:this.condominioNome,
      nome:          this.nome,
      via:           this.via,
      citta:         this.citta,
      cap:           this.cap,
      note:          this.note,
      attivo:        this.attivo,
      legacyId:      this.legacyId,
    };
  }

  static fromRow(row) {
    return new Immobile(row);
  }
}
