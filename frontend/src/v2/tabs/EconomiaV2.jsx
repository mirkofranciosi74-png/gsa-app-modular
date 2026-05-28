import { PlaceholderV2 } from "./PlaceholderV2.jsx";

export function EconomiaV2() {
  return (
    <PlaceholderV2
      nome="Economia"
      icon="ti-coin"
      fase="Fase 4"
      funzionalita={[
        "Lista unificata spese + entrate (fatto_economico) con filtri per immobile, tipo e periodo",
        "Colonne: importo, segno, importo netto calcolato, tipo spesa, stato",
        "Totali per immobile aggregati per categoria (Utenza, Condominio, Tassa…)",
        "Quadratura per immobile: confronto importi legacy vs v2 con indicatore verde/rosso",
        "Filtro per legacy_tipo (documento, movimento, spesa_proprietario) durante la migrazione",
      ]}
      sostituisce={["Spese Inquilini", "Spese Proprietari", "Entrate"]}
    />
  );
}
