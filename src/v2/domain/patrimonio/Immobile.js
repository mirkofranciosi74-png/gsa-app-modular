import { ValidationError } from "../shared/DomainError.js";

export class Immobile {
  constructor({
    id,
    condominio_id,
    nome,
    codice,
    via,
    citta,
    cap,
    superficie,
    percentuale_condominio,
    millesimi_condominio,
    tipologia,
    note,
    validita_da,
    validita_a,
    attivo           = true,
    legacy_id,
    condominio_nome,
    created_at,
    updated_at,
  }) {
    if (!nome?.trim())  throw new ValidationError("nome obbligatorio");
    if (!condominio_id) throw new ValidationError("condominioId obbligatorio");
    if (validita_a && validita_da && validita_a < validita_da)
      throw new ValidationError("validita_a deve essere >= validita_da");
    if (superficie != null && superficie <= 0)
      throw new ValidationError("superficie deve essere > 0");
    if (percentuale_condominio != null &&
        (percentuale_condominio < 0 || percentuale_condominio > 100))
      throw new ValidationError("percentuale_condominio deve essere tra 0 e 100");

    this.id                    = id;
    this.condominioId          = condominio_id;
    this.nome                  = nome.trim();
    this.codice                = codice?.trim()              || null;
    this.via                   = via?.trim()                 || null;
    this.citta                 = citta?.trim()               || null;
    this.cap                   = cap?.trim()                 || null;
    this.superficie            = superficie != null ? Number(superficie) : null;
    this.percentualeCondominio = percentuale_condominio != null
                                  ? Number(percentuale_condominio) : null;
    this.millesimiCondominio   = millesimi_condominio != null
                                  ? Number(millesimi_condominio) : null;
    this.tipologia             = tipologia?.trim()            || null;
    this.note                  = note?.trim()                || null;
    this.validitaDa            = validita_da                 || null;
    this.validitaA             = validita_a                  || null;
    this.attivo                = Boolean(attivo);
    this.legacyId              = legacy_id                   || null;
    this.condominioNome        = condominio_nome             || null;
    this.createdAt             = created_at;
    this.updatedAt             = updated_at;
  }

  toJSON() {
    return {
      id:                    this.id,
      condominioId:          this.condominioId,
      condominioNome:        this.condominioNome,
      nome:                  this.nome,
      codice:                this.codice,
      via:                   this.via,
      citta:                 this.citta,
      cap:                   this.cap,
      superficie:            this.superficie,
      percentualeCondominio: this.percentualeCondominio,
      millesimiCondominio:   this.millesimiCondominio,
      tipologia:             this.tipologia,
      note:                  this.note,
      validitaDa:            this.validitaDa,
      validitaA:             this.validitaA,
      attivo:                this.attivo,
      legacyId:              this.legacyId,
    };
  }

  static fromRow(row) {
    return new Immobile(row);
  }
}
