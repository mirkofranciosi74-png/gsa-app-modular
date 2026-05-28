import { ValidationError } from "../shared/DomainError.js";

export class Persona {
  constructor({
    id, nome, cognome, email, telefono, indirizzo, note,
    attivo = true, legacy_refs = [], created_at, updated_at,
  }) {
    if (!nome?.trim()) throw new ValidationError("nome obbligatorio");
    this.id        = id;
    this.nome      = nome.trim();
    this.cognome   = cognome?.trim()   || null;
    this.email     = email?.trim()     || null;
    this.telefono  = telefono?.trim()  || null;
    this.indirizzo = indirizzo?.trim() || null;
    this.note      = note?.trim()      || null;
    this.attivo    = Boolean(attivo);
    this.legacyRefs = Array.isArray(legacy_refs) ? legacy_refs : [];
    this.createdAt = created_at;
    this.updatedAt = updated_at;
  }

  nomeCompleto() {
    return this.cognome ? `${this.cognome} ${this.nome}` : this.nome;
  }

  toJSON() {
    return {
      id:          this.id,
      nome:        this.nome,
      cognome:     this.cognome,
      email:       this.email,
      telefono:    this.telefono,
      indirizzo:   this.indirizzo,
      note:        this.note,
      attivo:      this.attivo,
      legacyRefs:  this.legacyRefs,
      createdAt:   this.createdAt,
      updatedAt:   this.updatedAt,
    };
  }

  static fromRow(row) {
    return new Persona(row);
  }
}
