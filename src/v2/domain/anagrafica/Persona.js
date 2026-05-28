import { ValidationError } from "../shared/DomainError.js";

export class Persona {
  constructor({
    id,
    tipo_persona    = "fisica",
    nome,
    cognome,
    ragione_sociale,
    codice_fiscale,
    p_iva,
    codice,
    email,
    telefono,
    indirizzo,
    note,
    validita_da,
    validita_a,
    attivo          = true,
    legacy_refs     = [],
    created_at,
    updated_at,
  }) {
    if (!nome?.trim()) throw new ValidationError("nome obbligatorio");
    if (!["fisica", "giuridica"].includes(tipo_persona))
      throw new ValidationError("tipo_persona deve essere 'fisica' o 'giuridica'");
    if (validita_a && validita_da && validita_a < validita_da)
      throw new ValidationError("validita_a deve essere >= validita_da");

    this.id              = id;
    this.tipoPersona     = tipo_persona;
    this.nome            = nome.trim();
    this.cognome         = cognome?.trim()          || null;
    this.ragioneSociale  = ragione_sociale?.trim()  || null;
    this.codiceFiscale   = codice_fiscale?.trim().toUpperCase() || null;
    this.pIva            = p_iva?.trim()            || null;
    this.codice          = codice?.trim()            || null;
    this.email           = email?.trim()             || null;
    this.telefono        = telefono?.trim()          || null;
    this.indirizzo       = indirizzo?.trim()         || null;
    this.note            = note?.trim()              || null;
    this.validitaDa      = validita_da               || null;
    this.validitaA       = validita_a                || null;
    this.attivo          = Boolean(attivo);
    this.legacyRefs      = Array.isArray(legacy_refs) ? legacy_refs : [];
    this.createdAt       = created_at;
    this.updatedAt       = updated_at;
  }

  nomeCompleto() {
    if (this.tipoPersona === "giuridica") return this.ragioneSociale || this.nome;
    return this.cognome ? `${this.cognome} ${this.nome}` : this.nome;
  }

  toJSON() {
    return {
      id:             this.id,
      tipoPersona:    this.tipoPersona,
      nome:           this.nome,
      cognome:        this.cognome,
      ragioneSociale: this.ragioneSociale,
      codiceFiscale:  this.codiceFiscale,
      pIva:           this.pIva,
      codice:         this.codice,
      email:          this.email,
      telefono:       this.telefono,
      indirizzo:      this.indirizzo,
      note:           this.note,
      validitaDa:     this.validitaDa,
      validitaA:      this.validitaA,
      attivo:         this.attivo,
      legacyRefs:     this.legacyRefs,
      createdAt:      this.createdAt,
      updatedAt:      this.updatedAt,
    };
  }

  static fromRow(row) {
    return new Persona(row);
  }
}
