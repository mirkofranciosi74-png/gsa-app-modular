import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Persona } from "../../domain/anagrafica/Persona.js";
import { ValidationError } from "../../domain/shared/DomainError.js";

describe("Persona domain entity", () => {
  test("crea persona valida", () => {
    const p = new Persona({ id: "1", nome: "Mario", cognome: "Rossi", email: "mario@test.it" });
    assert.equal(p.nome, "Mario");
    assert.equal(p.cognome, "Rossi");
    assert.equal(p.attivo, true);
  });

  test("trimma i campi stringa", () => {
    const p = new Persona({ nome: "  Luca  ", cognome: "  Bianchi  " });
    assert.equal(p.nome, "Luca");
    assert.equal(p.cognome, "Bianchi");
  });

  test("lancia ValidationError se nome mancante", () => {
    assert.throws(
      () => new Persona({ nome: "" }),
      e => e instanceof ValidationError && e.status === 400
    );
  });

  test("lancia ValidationError se nome undefined", () => {
    assert.throws(
      () => new Persona({}),
      e => e instanceof ValidationError
    );
  });

  test("nomeCompleto con cognome", () => {
    const p = new Persona({ nome: "Mario", cognome: "Rossi" });
    assert.equal(p.nomeCompleto(), "Rossi Mario");
  });

  test("nomeCompleto senza cognome", () => {
    const p = new Persona({ nome: "Mario" });
    assert.equal(p.nomeCompleto(), "Mario");
  });

  test("toJSON restituisce struttura corretta", () => {
    const p = new Persona({ id: "abc", nome: "Anna", cognome: "Verdi", attivo: false });
    const j = p.toJSON();
    assert.equal(j.id, "abc");
    assert.equal(j.nome, "Anna");
    assert.equal(j.attivo, false);
    assert.deepEqual(j.legacyRefs, []);
  });

  test("fromRow costruisce da riga DB", () => {
    const p = Persona.fromRow({ nome: "Test", cognome: null, legacy_refs: [] });
    assert.ok(p instanceof Persona);
    assert.equal(p.cognome, null);
  });

  test("email e telefono vuoti diventano null", () => {
    const p = new Persona({ nome: "X", email: "  ", telefono: "" });
    assert.equal(p.email, null);
    assert.equal(p.telefono, null);
  });
});
