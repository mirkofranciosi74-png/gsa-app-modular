import { ValidationError } from "../shared/DomainError.js";

export const TIPI_FATTO = Object.freeze(["spesa", "entrata"]);
export const PERIODICITA_VALIDE = Object.freeze([
  "una_tantum", "mensile", "bimestrale", "trimestrale", "semestrale", "annuale"
]);

const MESI_PER_PERIODICITA = {
  mensile: 1, bimestrale: 2, trimestrale: 3, semestrale: 6, annuale: 12,
};

export class FattoEconomico {
  constructor({
    id, immobile_id, condominio_id, persona_id, soggetto_pagante_id, soggetto_incassante_id,
    tipo, tipo_spesa_id, importo, segno = 1,
    nome, descrizione, note, fornitore,
    numero_doc, numero_fattura,
    periodicita, stato,
    periodo_da, periodo_a,
    rif_da, rif_a,
    data_evento, data_pagamento,
    file_hash, file_path, nome_file, mime_type,
    documento_allegato_id,
    legacy_tipo, legacy_id,
    created_at, updated_at,
    // join fields
    immobile_nome, immobile_tipologia, persona_nome, persona_cognome,
    condominio_nome,
    soggetto_pagante_nome, soggetto_pagante_cognome,
    soggetto_incassante_nome, soggetto_incassante_cognome,
    tipo_spesa_desc, tipo_spesa_cat,
  }) {
    if (!immobile_id && !condominio_id)
      throw new ValidationError("immobileId o condominioId obbligatorio");
    if (!TIPI_FATTO.includes(tipo))
      throw new ValidationError("tipo deve essere 'spesa' o 'entrata'");
    if (importo == null || Number(importo) < 0)
      throw new ValidationError("importo deve essere >= 0");
    if (periodicita && !PERIODICITA_VALIDE.includes(periodicita))
      throw new ValidationError(`periodicita deve essere uno di: ${PERIODICITA_VALIDE.join(", ")}`);

    this.id                 = id;
    this.immobileId         = immobile_id         || null;
    this.condominioId       = condominio_id        || null;
    this.personaId          = persona_id           || null;
    this.soggettoPaganteId    = soggetto_pagante_id    || null;
    this.soggettoIncassanteId = soggetto_incassante_id || null;
    this.tipo               = tipo;
    this.tipoSpesaId        = tipo_spesa_id        || null;
    this.importo            = Number(importo);
    this.segno              = Number(segno) || 1;
    this.nome               = nome?.trim()         || null;
    this.descrizione        = descrizione?.trim()  || null;
    this.note               = note?.trim()         || null;
    this.fornitore          = fornitore?.trim()    || null;
    this.numeroDoc          = numero_doc?.trim()   || null;
    this.numeroFattura      = numero_fattura?.trim()|| null;
    this.periodicita        = periodicita          || "una_tantum";
    this.stato              = stato                || "normale";
    this.periodoDa          = periodo_da           || null;
    this.periodoA           = periodo_a            || null;
    this.rifDa              = rif_da               || null;
    this.rifA               = rif_a                || null;
    this.dataEvento         = data_evento          || null;
    this.dataPagamento      = data_pagamento       || null;
    this.fileHash           = file_hash            || null;
    this.filePath           = file_path            || null;
    this.nomeFile           = nome_file            || null;
    this.mimeType           = mime_type            || null;
    this.documentoAllegatoId = documento_allegato_id || null;
    this.legacyTipo         = legacy_tipo          || null;
    this.legacyId           = legacy_id            || null;
    this.createdAt          = created_at;
    this.updatedAt          = updated_at;
    // join fields
    this.immobileNome       = immobile_nome        || null;
    this.immobileTipologia  = immobile_tipologia   || null;
    this.personaNome        = persona_nome         || null;
    this.personaCognome     = persona_cognome      || null;
    this.condominioNome          = condominio_nome           || null;
    this.soggettoPaganteNome     = [soggetto_pagante_cognome, soggetto_pagante_nome]
                                     .filter(Boolean).join(" ") || null;
    this.soggettoIncassanteNome  = [soggetto_incassante_cognome, soggetto_incassante_nome]
                                     .filter(Boolean).join(" ") || null;
    this.tipoSpesaDesc           = tipo_spesa_desc           || null;
    this.tipoSpesaCat       = tipo_spesa_cat       || null;
  }

  importoNetto() {
    return Math.round(this.importo * this.segno * 100) / 100;
  }

  /** Calcola le rate logiche per periodici (non duplica il dato) */
  rateLogiche() {
    if (this.periodicita === "una_tantum" || !this.rifDa || !this.rifA) return [];
    const mesiStep = MESI_PER_PERIODICITA[this.periodicita] || 1;
    const [ya, ma] = this.rifDa.split("-").map(Number);
    const [yb, mb] = this.rifA.split("-").map(Number);
    const totMesi  = (yb - ya) * 12 + (mb - ma) + 1;
    const nRate    = Math.max(1, Math.floor(totMesi / mesiStep));
    const rate     = [];
    for (let i = 0; i < nRate; i++) {
      const mesi  = ya * 12 + ma - 1 + i * mesiStep;
      const y     = Math.floor(mesi / 12);
      const m     = (mesi % 12) + 1;
      const mStr  = `${y}-${String(m).padStart(2, "0")}`;
      rate.push({ periodo: mStr, importo: Math.round(this.importo / nRate * 100) / 100 });
    }
    return rate;
  }

  toJSON() {
    return {
      id:                  this.id,
      immobileId:          this.immobileId,
      immobileNome:        this.immobileNome,
      immobileTipologia:   this.immobileTipologia,
      condominioId:        this.condominioId,
      condominioNome:      this.condominioNome,
      personaId:           this.personaId,
      personaNome:         [this.personaCognome, this.personaNome].filter(Boolean).join(" ") || this.personaNome,
      soggettoPaganteId:     this.soggettoPaganteId,
      soggettoPaganteNome:   this.soggettoPaganteNome,
      soggettoIncassanteId:  this.soggettoIncassanteId,
      soggettoIncassanteNome:this.soggettoIncassanteNome,
      tipo:                this.tipo,
      tipoSpesaId:         this.tipoSpesaId,
      tipoSpesaDesc:       this.tipoSpesaDesc,
      tipoSpesaCat:        this.tipoSpesaCat,
      importo:             this.importo,
      segno:               this.segno,
      importoNetto:        this.importoNetto(),
      nome:                this.nome,
      descrizione:         this.descrizione,
      note:                this.note,
      fornitore:           this.fornitore,
      numeroDoc:           this.numeroDoc,
      numeroFattura:       this.numeroFattura,
      periodicita:         this.periodicita,
      stato:               this.stato,
      periodoDa:           this.periodoDa,
      periodoA:            this.periodoA,
      rifDa:               this.rifDa,
      rifA:                this.rifA,
      dataEvento:          this.dataEvento,
      dataPagamento:       this.dataPagamento,
      fileHash:            this.fileHash,
      filePath:            this.filePath,
      nomeFile:            this.nomeFile,
      mimeType:            this.mimeType,
      hasPdf:              !!this.filePath,
      legacyTipo:          this.legacyTipo,
      legacyId:            this.legacyId,
    };
  }

  static fromRow(row) {
    return new FattoEconomico(row);
  }
}
