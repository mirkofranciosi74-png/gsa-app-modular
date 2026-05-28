import { PlaceholderV2 } from "./PlaceholderV2.jsx";

export function PatrimonioV2() {
  return (
    <PlaceholderV2
      nome="Patrimonio"
      icon="ti-building-estate"
      fase="Fase 3"
      funzionalita={[
        "Condomini: lista, crea, modifica — supporto consolidamento di condomini virtuali",
        "Immobili: scheda completa con via, città, CAP, note, condominio di appartenenza",
        "Ruoli: assegna persona↔immobile con ruolo (proprietario/inquilino/garante/contatto)",
        "Validità temporale dei ruoli (data inizio / data fine)",
        "Quote millesimali con verifica che la somma = 100%",
        "Totali economici dell'immobile integrati nella scheda",
      ]}
      sostituisce={["Appartamenti", "Gestione Ruoli"]}
    />
  );
}
