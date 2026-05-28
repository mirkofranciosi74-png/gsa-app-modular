import { ValidationError } from "../shared/DomainError.js";

export const RUOLI = Object.freeze(["proprietario", "inquilino", "garante", "contatto"]);

export class RuoloPersona {
  constructor({
    id, persona_id, immobile_id, ruolo, validita_da, validita_a,
    quota, quota_affitto, caparra, default_flag = false,
    persona_nome, persona_cognome, immobile_nome, condominio_nome,
  }) {
    if (!persona_id)          throw new ValidationError("personaId obbligatorio");
    if (!immobile_id)         throw new ValidationError("immobileId obbligatorio");
    if (!RUOLI.includes(ruolo)) throw new ValidationError(`ruolo deve essere uno di: ${RUOLI.join(", ")}`);

    this.id            = id;
    this.personaId     = persona_id;
    this.immobileId    = immobile_id;
    this.ruolo         = ruolo;
    this.validitaDa    = validita_da   || null;
    this.validitaA     = validita_a    || null;
    this.quota         = quota         != null ? Number(quota)         : null;
    this.quotaAffitto  = quota_affitto != null ? Number(quota_affitto) : null;
    this.caparra       = caparra       != null ? Number(caparra)       : null;
    this.defaultFlag   = Boolean(default_flag);
    // join fields (read-only)
    this.personaNome     = persona_nome     || null;
    this.personaCognome  = persona_cognome  || null;
    this.immobileNome    = immobile_nome    || null;
    this.condominioNome  = condominio_nome  || null;
  }

  isAttivo(dataRif = new Date()) {
    const d = typeof dataRif === "string" ? new Date(dataRif) : dataRif;
    const da = this.validitaDa ? new Date(this.validitaDa) : null;
    const a  = this.validitaA  ? new Date(this.validitaA)  : null;
    return (!da || da <= d) && (!a || a >= d);
  }

  toJSON() {
    return {
      id:            this.id,
      personaId:     this.personaId,
      immobileId:    this.immobileId,
      ruolo:         this.ruolo,
      validitaDa:    this.validitaDa,
      validitaA:     this.validitaA,
      quota:         this.quota,
      quotaAffitto:  this.quotaAffitto,
      caparra:       this.caparra,
      defaultFlag:   this.defaultFlag,
      personaNome:   this.personaNome,
      personaCognome:this.personaCognome,
      immobileNome:  this.immobileNome,
      condominioNome:this.condominioNome,
    };
  }

  static fromRow(row) {
    return new RuoloPersona(row);
  }
}
