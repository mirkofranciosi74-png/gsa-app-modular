import { Router } from "express";
import { h } from "../../shared/middleware.js";
import { query } from "../../shared/db/pool.js";
import { righeGrigliaV2, grigliaProprietariV2 } from "../../application/economia/grigliaSvcV2.js";
import { report } from "../../../modules/contabilita/reportSvc.js";
import { reportSalvatiRepo } from "../../../modules/contabilita/reportSalvatiRepo.js";

// Adatta i dati v2 al formato atteso da reportSvc (costruito sul modello v1)
function adattaPerReport(immobile, gInq, gProp) {
  const comps = gInq.persone.map(p => ({
    id:            p.id,
    nome:          p.label,
    cognome:       "",
    percentuale:   p.quota || 0,
    validita_da:   p.validitaDa ? p.validitaDa + "-01" : null,
    validita_a:    p.validitaA  ? p.validitaA  + "-28" : null,
    quota_affitto: p.quotaAffitto || 0,
  }));

  const righeDocumenti = gInq.righeSpese.map(r => ({
    tipo_descrizione: r.tipoSpesaDesc || r.label,
    nome_file:        r.nomeFile || r.label,
    fornitore:        r.fornitore || null,
    periodo_da:       r.periodoDa,
    periodo_a:        r.periodoA,
    importo:          r.importo,
  }));

  const righeMovimenti = gInq.righeEntrate.map(r => ({
    comp_id:         r.paganteId,
    comp_label:      r.paganteLabel,
    tipo_versamento: r.tipoVersamento || "entrata",
    periodo_da:      r.periodoDa,
    periodo_a:       r.periodoA,
    importo:         Math.abs(r.importo),
    segno:           r.segno,
  }));

  const props = gProp.props.map(p => ({
    proprietario_id:      p.id,
    proprietario_nome:    p.label,
    proprietario_cognome: "",
  }));

  return {
    app: { id: immobile.id, nome: immobile.nome },
    griglia: {
      comps, righeDocumenti, righeMovimenti,
      totaliDovuto:  gInq.totaliDovuto,
      totaliVersato: gInq.totaliVersato,
    },
    grigliaProp: {
      props,
      totaliDareTeorico:     gProp.totaliDareTeorico,
      totaliAvereTeorico:    gProp.totaliAvereTeorico,
      totaliPagato:          gProp.totaliPagato,
      totaliIncassato:       gProp.totaliIncassato,
      totaliDareTeoricoProp: {},
      totaliPagatoProp:      {},
    },
  };
}

export const reportV2Router = Router();

reportV2Router.post("/genera", h(async (req, res) => {
  const { params } = req.body;
  const immobili = await query(`SELECT id, nome FROM v2.immobile ORDER BY nome`);

  const datiPerApp = [];
  for (const im of immobili) {
    const [gInq, gProp] = await Promise.all([
      righeGrigliaV2(im.id, params.periodoDA || null, params.periodoA || null),
      grigliaProprietariV2(im.id, params.periodoDA || null, params.periodoA || null),
    ]);
    datiPerApp.push(adattaPerReport(im, gInq, gProp));
  }

  res.json(await report({ params, datiPerApp }));
}));

reportV2Router.get("/",       h(async (_, r)  => r.json(await reportSalvatiRepo.listAll())));
reportV2Router.get("/:id",    h(async (q, r)  => {
  const rep = await reportSalvatiRepo.findById(q.params.id);
  return rep ? r.json(rep) : r.status(404).json({ error: "Non trovato" });
}));
reportV2Router.post("/",      h(async (q, r)  => r.status(201).json(await reportSalvatiRepo.create(q.body))));
reportV2Router.delete("/:id", h(async (q, r)  => {
  await reportSalvatiRepo.remove(q.params.id);
  r.status(204).end();
}));
