import { ValidationError } from "../shared/DomainError.js";

export class Condominio {
  constructor({
    id,
    nome,
    codice,
    indirizzo,
    citta,
    cap,
    millesimi_totali = 1000,
    note,
    virtuale         = false,
    validita_da,
    validita_a,
    attivo           = true,
    created_at,
    updated_at,
  }) {
    if (!nome?.trim()) throw new ValidationError("nome obbligatorio");
    if (millesimi_totali <= 0) throw new ValidationError("millesimi_totali deve essere > 0");
    if (validita_a && validita_da && validita_a < validita_da)
      throw new ValidationError("validita_a deve essere >= validita_da");

    this.id              = id;
    this.nome            = nome.trim();
    this.codice          = codice?.trim()     || null;
    this.indirizzo       = indirizzo?.trim()  || null;
    this.citta           = citta?.trim()      || null;
    this.cap             = cap?.trim()        || null;
    this.millesimitotali = Number(millesimi_totali);
    this.note            = note?.trim()       || null;
    this.virtuale        = Boolean(virtuale);
    this.validitaDa      = validita_da        || null;
    this.validitaA       = validita_a         || null;
    this.attivo          = Boolean(attivo);
    this.createdAt       = created_at;
    this.updatedAt       = updated_at;
  }

  toJSON() {
    return {
      id:              this.id,
      nome:            this.nome,
      codice:          this.codice,
      indirizzo:       this.indirizzo,
      citta:           this.citta,
      cap:             this.cap,
      millesimitotali: this.millesimitotali,
      note:            this.note,
      virtuale:        this.virtuale,
      validitaDa:      this.validitaDa,
      validitaA:       this.validitaA,
      attivo:          this.attivo,
    };
  }

  static fromRow(row) {
    return new Condominio({ ...row, millesimi_totali: row.millesimi_totali ?? 1000 });
  }
}
