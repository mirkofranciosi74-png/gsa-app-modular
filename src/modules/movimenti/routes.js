import { Router } from "express";
import { h }      from "../../shared/middleware.js";
import * as repo  from "./repo.js";

export const movimentiRouter = Router();

movimentiRouter.get("/",      h(async (q, r) => r.json(await repo.listAll(q.query))));
movimentiRouter.post("/",     h(async (q, r) => r.status(201).json(await repo.create(q.body))));
movimentiRouter.put("/:id",   h(async (q, r) => r.json(await repo.update(q.params.id, q.body))));
movimentiRouter.delete("/:id", h(async (q, r) => {
  await repo.remove(q.params.id);
  r.status(204).end();
}));
