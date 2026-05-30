import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";
import { makePersonaService } from "../../application/anagrafica/PersonaService.js";
import { Persona } from "../../domain/anagrafica/Persona.js";

function makeRepoMock(overrides = {}) {
  return {
    findAll:       async () => [],
    search:        async () => [],
    findById:      async () => new Persona({ id: "1", nome: "Test" }),
    findByLegacyId:async () => null,
    create:        async d  => new Persona({ id: "new", ...d }),
    update:        async () => new Persona({ id: "1", nome: "Updated" }),
    addLegacyRef:  async () => {},
    quadratura:    async () => ({ pass: true }),
    ...overrides,
  };
}

describe("PersonaService", () => {
  test("lista senza query chiama findAll", async () => {
    let findAllCalled = false;
    const repo = makeRepoMock({
      findAll: async () => { findAllCalled = true; return []; },
    });
    const svc = makePersonaService({ personaRepo: repo });
    await svc.lista({});
    assert.ok(findAllCalled);
  });

  test("lista con query chiama search", async () => {
    let searchTerm = null;
    const repo = makeRepoMock({
      search: async t => { searchTerm = t; return []; },
    });
    const svc = makePersonaService({ personaRepo: repo });
    await svc.lista({ q: "mario" });
    assert.equal(searchTerm, "mario");
  });

  test("lista con query whitespace chiama findAll", async () => {
    let findAllCalled = false;
    const repo = makeRepoMock({
      findAll: async () => { findAllCalled = true; return []; },
    });
    const svc = makePersonaService({ personaRepo: repo });
    await svc.lista({ q: "   " });
    assert.ok(findAllCalled);
  });

  test("crea delega al repository", async () => {
    let createData = null;
    const repo = makeRepoMock({
      create: async d => { createData = d; return new Persona({ id: "x", ...d }); },
    });
    const svc = makePersonaService({ personaRepo: repo });
    await svc.crea({ nome: "Nuovo", cognome: "Utente" });
    assert.equal(createData.nome, "Nuovo");
  });

  test("quadratura restituisce oggetto con pass", async () => {
    const svc = makePersonaService({ personaRepo: makeRepoMock() });
    const q = await svc.quadratura();
    assert.ok("pass" in q);
  });
});
