/**
 * Test suite per v2.persona — usa node:test (built-in Node 18+).
 * Esecuzione: node --test src/modules/v2/persona/__tests__/persona.test.js
 *
 * Prerequisiti:
 *   - DB di test raggiungibile (usa DATABASE_URL da .env)
 *   - Phase 0 e Phase 1 già applicate
 */

import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../../shared/db/pool.js";
import { personaRepo } from "../repo.js";

describe("v2.persona — repo", () => {

  let testPersonaId = null;

  before(async () => {
    // Verifica che lo schema v2 esista
    const { rows } = await pool.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name='v2'`
    );
    assert.ok(rows.length > 0, "Schema v2 non trovato — eseguire prima Phase 0");
  });

  after(async () => {
    // Cleanup: rimuove le persone di test
    if (testPersonaId) {
      await pool.query("DELETE FROM v2.persona WHERE id=$1", [testPersonaId]);
    }
    await pool.end();
  });

  it("crea una nuova persona", async () => {
    const p = await personaRepo.create({
      nome:     "Mario",
      cognome:  "Rossi",
      email:    "mario.rossi.test@example.com",
      telefono: "3331234567",
    });
    testPersonaId = p.id;

    assert.equal(p.nome, "Mario");
    assert.equal(p.cognome, "Rossi");
    assert.equal(p.email, "mario.rossi.test@example.com");
    assert.ok(p.id, "id deve essere valorizzato");
    assert.ok(p.attivo === true, "attivo di default TRUE");
  });

  it("findById restituisce la persona con legacy_refs", async () => {
    const p = await personaRepo.findById(testPersonaId);
    assert.ok(p, "persona non trovata");
    assert.equal(p.nome, "Mario");
    // Una persona appena creata non ha legacy refs
    assert.ok(p.legacy_refs === null || Array.isArray(p.legacy_refs));
  });

  it("search trova per nome", async () => {
    const results = await personaRepo.search("mario rossi");
    assert.ok(results.some(r => r.id === testPersonaId), "persona non trovata nella ricerca");
  });

  it("update modifica i campi", async () => {
    const updated = await personaRepo.update(testPersonaId, {
      nome:    "Mario",
      cognome: "Rossi",
      email:   "mario.updated@example.com",
    });
    assert.equal(updated.email, "mario.updated@example.com");
  });

  it("errore se nome mancante", async () => {
    await assert.rejects(
      () => personaRepo.create({ nome: "" }),
      /nome obbligatorio/
    );
  });

  it("errore findById su id inesistente", async () => {
    const p = await personaRepo.findById("00000000-0000-0000-0000-000000000000");
    assert.equal(p, null);
  });

  it("update lancia 404 su id inesistente", async () => {
    await assert.rejects(
      () => personaRepo.update("00000000-0000-0000-0000-000000000000", { nome: "X" }),
      /Persona non trovata/
    );
  });

  it("quadratura: se Phase 1 migrata, orfani = 0", async () => {
    const q = await personaRepo.quadratura();
    // Solo se la migrazione è stata eseguita
    if (Number(q.migrati_proprietari) > 0 || Number(q.migrati_componenti) > 0) {
      assert.equal(Number(q.proprietari_orfani), 0, "ci sono proprietari non migrati");
      assert.equal(Number(q.componenti_orfani),  0, "ci sono componenti non migrati");
    }
  });

  it("listAll restituisce array", async () => {
    const list = await personaRepo.listAll();
    assert.ok(Array.isArray(list));
    assert.ok(list.some(p => p.id === testPersonaId));
  });

  it("addLegacyRef collega un legacy_id", async () => {
    // Usa un UUID fittizio come legacy_id
    const fakeId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    await personaRepo.addLegacyRef(testPersonaId, "componente", fakeId);
    const p = await personaRepo.findById(testPersonaId);
    assert.ok(p.legacy_refs?.some(r => r.legacy_id === fakeId));
    // Cleanup
    await pool.query(
      "DELETE FROM v2.persona_legacy WHERE legacy_tipo='componente' AND legacy_id=$1",
      [fakeId]
    );
  });
});
