import { PlaceholderV2 } from "./PlaceholderV2.jsx";

export function PersoneV2() {
  return (
    <PlaceholderV2
      nome="Persone"
      icon="ti-users"
      fase="Fase 2"
      funzionalita={[
        "Lista unificata di proprietari e inquilini deduplicati (senza duplicati legacy)",
        "Ricerca full-text per nome, cognome, email",
        "Badge ruolo: proprietario / inquilino / garante / contatto",
        "Scheda persona con tutti i ruoli attivi per immobile",
        "Crea / modifica persona con validazione nome obbligatorio",
        "Link ai legacy refs (proprietario_id, componente_id originali)",
        "Pannello quadratura legacy↔v2 (solo admin)",
      ]}
      sostituisce={["Proprietari", "Inquilini"]}
    />
  );
}
