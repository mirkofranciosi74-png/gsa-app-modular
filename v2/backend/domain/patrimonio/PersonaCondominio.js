import { ValidationError } from "../shared/DomainError.js";

const RUOLI_VALIDI = ["condomino", "amministratore", "delegato", "altro"];

export class PersonaCondominio {
  constructor({
    id,
    persona_id,
    condominio_id,
    ruolo       = "condomino",
    validita_da,
    validita_a,
    note,
    persona_nome,
    persona_cognome,
    condominio_nome,
    created_at,
    updated_at,
  }) {
    if (!persona_id)    throw new ValidationError("persona_id obbligatorio");
    if (!condominio_id) throw new ValidationError("condominio_id obbligatorio");
    if (!validita_da)   throw new ValidationError("validita_da obbligatoria");
    if (!RUOLI_VALIDI.includes(ruolo))
      throw new ValidationError(`ruolo deve essere uno di: ${RUOLI_VALIDI.join(", ")}`);
    if (validita_a && validita_a < validita_da)
      throw new ValidationError("validita_a deve essere >= validita_da");

    this.id             = id;
    this.personaId      = persona_id;
    this.condominioId   = condominio_id;
    this.ruolo          = ruolo;
    this.validitaDa     = validita_da;
    this.validitaA      = validita_a      || null;
    this.note           = note?.trim()    || null;
    this.personaNome    = persona_nome    || null;
    this.personaCognome = persona_cognome || null;
    this.condominioNome = condominio_nome || null;
    this.createdAt      = created_at;
    this.updatedAt      = updated_at;
  }

  isAttivo(dataRif = new Date().toISOString().slice(0, 10)) {
    return (!this.validitaDa || this.validitaDa <= dataRif) &&
           (!this.validitaA  || this.validitaA  >= dataRif);
  }

  toJSON() {
    return {
      id:             this.id,
      personaId:      this.personaId,
      condominioId:   this.condominioId,
      ruolo:          this.ruolo,
      validitaDa:     this.validitaDa,
      validitaA:      this.validitaA,
      note:           this.note,
      personaNome:    this.personaNome,
      personaCognome: this.personaCognome,
      condominioNome: this.condominioNome,
      createdAt:      this.createdAt,
      updatedAt:      this.updatedAt,
    };
  }

  static fromRow(row) {
    return new PersonaCondominio(row);
  }
}
