import { Router } from "express";
import { h }      from "../../shared/middleware.js";
import * as repo  from "./repo.js";
import { query }  from "../../shared/db/pool.js";

export const movimentiRouter = Router();

const STATI_VALIDI = ["normale", "sospetto", "verificato"];

movimentiRouter.get("/",       h(async (q, r) => r.json(await repo.listAll(q.query))));
movimentiRouter.post("/",      h(async (q, r) => r.status(201).json(await repo.create(q.body))));
movimentiRouter.put("/:id",    h(async (q, r) => r.json(await repo.update(q.params.id, q.body))));
movimentiRouter.patch("/:id/stato", h(async (req, res) => {
  const { stato } = req.body;
  if (!STATI_VALIDI.includes(stato))
    return res.status(400).json({ error: `stato non valido: ${stato}` });
  await query("UPDATE movimenti SET stato=$1, updated_at=NOW() WHERE id=$2", [stato, req.params.id]);
  res.json({ ok: true, stato });
}));
movimentiRouter.delete("/:id", h(async (q, r) => {
  await repo.remove(q.params.id);
  r.status(204).end();
}));
