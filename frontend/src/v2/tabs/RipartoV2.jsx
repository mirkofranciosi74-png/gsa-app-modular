import { PlaceholderV2 } from "./PlaceholderV2.jsx";

export function RipartoV2() {
  return (
    <PlaceholderV2
      nome="Riparto"
      icon="ti-adjustments"
      fase="Fase 5"
      funzionalita={[
        "Seleziona immobile + mese + importo → calcolo istantaneo con motore Largest Remainder",
        "Distribuzione garantita al centesimo: la somma delle quote = importo esatto",
        "Gerarchia regole: regola specifica > regola tipo spesa > default parti uguali",
        "Mostra la fonte usata: default_uguale / regola_quote / regola_uguale",
        "Gestione regole di riparto: crea, aggiungi esclusioni/inclusioni per persona",
        "Verifica quote millesimali con badge ok/warning per ogni regola",
      ]}
      sostituisce={["Riparti"]}
    />
  );
}
