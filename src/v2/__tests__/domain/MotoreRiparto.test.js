import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { calcolaRipartoPuro } from "../../domain/riparto/MotoreRiparto.js";

describe("MotoreRiparto — calcolaRipartoPuro", () => {
  test("distribuisce parti uguali tra 3 persone", () => {
    const r = calcolaRipartoPuro({
      importoTotale: 300,
      quote: [
        { id: "a", nome: "Alice", quota: 1 },
        { id: "b", nome: "Bob",   quota: 1 },
        { id: "c", nome: "Carlo", quota: 1 },
      ],
    });
    assert.equal(r.importoTotale, 300);
    assert.equal(r.bilanciato, true);
    assert.equal(r.totaleVerificato, 300);
    r.quote.forEach(q => assert.equal(q.importo, 100));
  });

  test("gestisce importo non divisibile — Largest Remainder", () => {
    const r = calcolaRipartoPuro({
      importoTotale: 100,
      quote: [
        { id: "a", nome: "A", quota: 1 },
        { id: "b", nome: "B", quota: 1 },
        { id: "c", nome: "C", quota: 1 },
      ],
    });
    assert.equal(r.bilanciato, true);
    assert.equal(r.totaleVerificato, 100);
    const somma = r.quote.reduce((s, q) => s + q.importo, 0);
    assert.ok(Math.abs(somma - 100) < 0.001);
  });

  test("rispetta quote asimmetriche", () => {
    const r = calcolaRipartoPuro({
      importoTotale: 1000,
      quote: [
        { id: "a", nome: "A", quota: 70 },
        { id: "b", nome: "B", quota: 30 },
      ],
    });
    assert.equal(r.bilanciato, true);
    const a = r.quote.find(q => q.id === "a");
    const b = r.quote.find(q => q.id === "b");
    assert.equal(a.importo, 700);
    assert.equal(b.importo, 300);
  });

  test("lancia errore se importoTotale = 0", () => {
    assert.throws(
      () => calcolaRipartoPuro({ importoTotale: 0, quote: [{ id: "a", quota: 1 }] }),
      /importoTotale/
    );
  });

  test("lancia errore se quote vuoto", () => {
    assert.throws(
      () => calcolaRipartoPuro({ importoTotale: 100, quote: [] }),
      /vuoto/
    );
  });

  test("lancia errore se somma quote = 0", () => {
    assert.throws(
      () => calcolaRipartoPuro({
        importoTotale: 100,
        quote: [{ id: "a", quota: 0 }, { id: "b", quota: 0 }],
      }),
      /zero/
    );
  });

  test("calcolo centesimale preciso — 10 euro su 3 persone", () => {
    const r = calcolaRipartoPuro({
      importoTotale: 10,
      quote: [
        { id: "a", quota: 1 },
        { id: "b", quota: 1 },
        { id: "c", quota: 1 },
      ],
    });
    assert.equal(r.bilanciato, true);
    assert.equal(r.totaleVerificato, 10);
    // 3.33 + 3.33 + 3.34 = 10.00
    const importi = r.quote.map(q => q.importo).sort();
    assert.equal(importi[0], 3.33);
    assert.equal(importi[1], 3.33);
    assert.equal(importi[2], 3.34);
  });
});
