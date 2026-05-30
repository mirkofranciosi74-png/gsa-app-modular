/**
 * Motore di riparto — puro, nessuna dipendenza da DB o I/O.
 * Algoritmo: Largest Remainder Method (garantisce somma esatta al centesimo).
 */

/**
 * @param {{ importoTotale: number, quote: Array<{ id: string, nome: string, quota: number }> }} params
 * @returns {{ importoTotale: number, quote: Array, totaleVerificato: number, bilanciato: boolean }}
 */
export function calcolaRipartoPuro({ importoTotale, quote }) {
  if (!importoTotale || importoTotale <= 0)
    throw new Error("importoTotale deve essere > 0");
  if (!Array.isArray(quote) || quote.length === 0)
    throw new Error("quote non può essere vuoto");

  const sommaQuote = quote.reduce((s, q) => s + Number(q.quota), 0);
  if (sommaQuote === 0)
    throw new Error("somma delle quote è zero: impossibile ripartire");

  const importoCent = Math.round(importoTotale * 100);

  // Assegna parte intera (floor)
  const withFloor = quote.map(q => {
    const qNum = Number(q.quota);
    const rawCent = (qNum / sommaQuote) * importoCent;
    const floorCent = Math.floor(rawCent);
    return { ...q, floorCent, remainder: rawCent - floorCent };
  });

  const assegnatiCent = withFloor.reduce((s, q) => s + q.floorCent, 0);
  const restoCent = importoCent - assegnatiCent;

  // Distribuisce i centesimi rimanenti a chi ha il remainder più alto
  withFloor.sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < restoCent; i++) {
    withFloor[i].floorCent += 1;
  }

  const risultati = withFloor.map(({ floorCent, remainder, ...q }) => ({
    ...q,
    importo: floorCent / 100,
  }));

  const totaleVerificato = Math.round(risultati.reduce((s, r) => s + r.importo, 0) * 100) / 100;

  return {
    importoTotale,
    quote: risultati,
    totaleVerificato,
    bilanciato: Math.abs(totaleVerificato - importoTotale) < 0.001,
  };
}
