/**
 * Composition root dell'API v2 DDD.
 * Assembla tutti i repository, service e router in un unico punto.
 * Montato in src/server.js su /api/v2ddd (parallelo a /api/v2 legacy).
 */

import { Router } from "express";
import pool from "../../shared/db/pool.js";
import { requireAuth } from "../shared/authMiddleware.js";

// ── Repository factories ────────────────────────────────────────────────────
import { makePersonaRepository }            from "../infrastructure/persistence/postgres/PersonaRepository.js";
import { makeCondominioRepository }         from "../infrastructure/persistence/postgres/CondominioRepository.js";
import { makeImmobileRepository }           from "../infrastructure/persistence/postgres/ImmobileRepository.js";
import { makeRuoloPersonaRepository }       from "../infrastructure/persistence/postgres/RuoloPersonaRepository.js";
import { makeFattoEconomicoRepository }     from "../infrastructure/persistence/postgres/FattoEconomicoRepository.js";
import { makeRegolaRipartoRepository }      from "../infrastructure/persistence/postgres/RegolaRipartoRepository.js";
import { makePersonaCondominioRepository }  from "../infrastructure/persistence/postgres/PersonaCondominioRepository.js";
import { makeTipologiaRepository }          from "../infrastructure/persistence/postgres/TipologiaRepository.js";

// ── Service factories ───────────────────────────────────────────────────────
import { makePersonaService }   from "../application/anagrafica/PersonaService.js";
import { makePatrimonioService }from "../application/patrimonio/PatrimonioService.js";
import { makeEconomiaService }  from "../application/economia/EconomiaService.js";
import { makeRipartoService }   from "../application/riparto/RipartoService.js";

// ── Route factories ─────────────────────────────────────────────────────────
import { makePersonaRoutes }    from "./anagrafica/personaRoutes.js";
import { makeCondominioRoutes } from "./patrimonio/condominioRoutes.js";
import { makeImmobileRoutes }   from "./patrimonio/immobileRoutes.js";
import { makeRuoloRoutes }      from "./patrimonio/ruoloRoutes.js";
import { makeFattoRoutes }      from "./economia/fattoRoutes.js";
import { makeTipologiaRoutes }  from "./economia/tipologiaRoutes.js";
import { makeRipartoRoutes }    from "./riparto/ripartoRoutes.js";
import { makeGrigliaRoutes }          from "./economia/grigliaRoutes.js";
import { makeImportazioneV2Routes }    from "./economia/importazioneV2Routes.js";
import { makeAdminV2Routes }           from "./admin/adminV2Routes.js";
import { reportV2Router }              from "./economia/reportV2Routes.js";
import { archivioV2Router, archivioV2TipiRouter } from "./archivio/archivioV2Routes.js";

// ── Wire repositories ───────────────────────────────────────────────────────
const personaRepo             = makePersonaRepository(pool);
const condominioRepo          = makeCondominioRepository(pool);
const immobileRepo            = makeImmobileRepository(pool);
const ruoloRepo               = makeRuoloPersonaRepository(pool);
const fattoRepo               = makeFattoEconomicoRepository(pool);
const regolaRepo              = makeRegolaRipartoRepository(pool);
const personaCondominioRepo   = makePersonaCondominioRepository(pool);
const tipologiaRepo           = makeTipologiaRepository(pool);

// ── Wire services ───────────────────────────────────────────────────────────
const personaService    = makePersonaService({ personaRepo });
const patrimonioService = makePatrimonioService({ condominioRepo, immobileRepo, ruoloRepo, personaCondominioRepo });
const economiaService   = makeEconomiaService({ fattoRepo, tipologiaRepo });
const ripartoService    = makeRipartoService({ regolaRepo, ruoloRepo });

// ── Wire routes ─────────────────────────────────────────────────────────────
const personaRoutes    = makePersonaRoutes({ personaService });
const condominioRoutes = makeCondominioRoutes({ patrimonioService });
const immobileRoutes   = makeImmobileRoutes({ patrimonioService, ripartoService, economiaService });
const ruoloRoutes      = makeRuoloRoutes({ patrimonioService });
const fattoRoutes      = makeFattoRoutes({ economiaService });
const tipologiaRoutes  = makeTipologiaRoutes({ economiaService });
const ripartoRoutes    = makeRipartoRoutes({ ripartoService });
const grigliaRoutes         = makeGrigliaRoutes();
const importazioneV2Routes  = makeImportazioneV2Routes();
const adminV2Routes         = makeAdminV2Routes();

// ── Router principale ───────────────────────────────────────────────────────
export const v2DddRouter = Router();

v2DddRouter.use(requireAuth);

v2DddRouter.use("/persone",    personaRoutes);
v2DddRouter.use("/condomini",  condominioRoutes);
v2DddRouter.use("/immobili",   immobileRoutes);
v2DddRouter.use("/ruoli",      ruoloRoutes);
v2DddRouter.use("/fatti",      fattoRoutes);
v2DddRouter.use("/tipologie",  tipologiaRoutes);
v2DddRouter.use("/riparto",    ripartoRoutes);
v2DddRouter.use("/griglia",        grigliaRoutes);
v2DddRouter.use("/importazione",   importazioneV2Routes);
v2DddRouter.use("/admin",          adminV2Routes);
v2DddRouter.use("/report",         reportV2Router);
v2DddRouter.use("/archivio-tipi",  archivioV2TipiRouter);
v2DddRouter.use("/archivio",       archivioV2Router);

// ── Migration status (admin only) ───────────────────────────────────────────
import { h } from "../../shared/middleware.js";
import { requireRole } from "../shared/authMiddleware.js";
import { query } from "../../shared/db/pool.js";

v2DddRouter.get("/migration-status", requireRole("admin"), h(async (_req, res) => {
  const log = await query("SELECT * FROM v2._phase_log ORDER BY phase, step");
  res.json(log);
}));
