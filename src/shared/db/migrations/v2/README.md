# GSA v2 — Migration Runner

Migrazioni incrementali (Strangler Fig).
Ogni fase può essere eseguita e verificata indipendentemente.

## Comandi

```bash
# Tutte le fasi (phase0 → phase8)
node src/shared/db/migrations/v2/run.js

# Solo una fase
node src/shared/db/migrations/v2/run.js phase1

# Più fasi in sequenza
node src/shared/db/migrations/v2/run.js phase1 phase2 phase3

# Solo script di verifica/quadratura
node src/shared/db/migrations/v2/run.js --verify phase1

# Dry run (mostra i file senza eseguirli)
node src/shared/db/migrations/v2/run.js --dry-run
```

## Ordine delle fasi

| Fase    | Contenuto                              | Dipende da          |
|---------|----------------------------------------|---------------------|
| phase0  | Baseline: schema v2, viste legacy      | —                   |
| phase1  | Persona (inquilini + proprietari)      | phase0              |
| phase2  | Condominio + Immobile                  | phase0              |
| phase3  | Ruolo Persona (temporale)              | phase1, phase2      |
| phase4  | Fatto Economico (spese + entrate)      | phase1, phase2      |
| phase5  | Pagamento (cassa)                      | phase4              |
| phase6  | Documentale disaccoppiato              | phase4              |
| phase7  | Regola Riparto v2                      | phase1, phase2      |
| phase8  | Quadrature finali                      | tutte le fasi       |

## Regole

- **Non eseguire la fase N+1 prima di aver validato la fase N** con `--verify`
- **Non modificare mai** le tabelle del public schema (legacy)
- Ogni fase è idempotente: può essere rieseguita senza effetti collaterali
- `v2._phase_log` traccia ogni step applicato

## Test

```bash
# Test unitari Fase 1 (Persona)
node --test src/modules/v2/persona/__tests__/persona.test.js
```
