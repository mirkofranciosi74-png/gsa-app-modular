# GSA v2 — Architettura Modulare e Piano di Migrazione

## Strategia: Strangler Fig

Il sistema legacy (v1) continua a funzionare **invariato** durante tutta la migrazione.
Il nuovo modello v2 vive nello schema PostgreSQL `v2`, separato dal public schema (legacy).
Ogni fase:
1. Crea tabelle v2
2. Migra i dati (legacy → v2) mantenendo `legacy_id` per tracciabilità
3. Espone nuove API v2 in parallelo a quelle v1
4. Verifica quadrature (confronto legacy vs v2)
5. Solo dopo la validazione, le API v1 vengono deprecate (mai cancellate prima)

---

## Mappatura Entità Legacy → v2

### Entità Legacy (schema `public`)

| Tabella legacy             | Colonne chiave                                                    | Note                                      |
|----------------------------|-------------------------------------------------------------------|-------------------------------------------|
| `appartamenti`             | id, nome, via, citta, cap, attivo                                 | Unità fisica (ex "appartamento")          |
| `componenti`               | id, appartamento_id, nome, cognome, email, percentuale, quota_affitto, caparra, validita_da, validita_a, attivo | Inquilino/residente |
| `proprietari`              | id, nome, cognome, indirizzo, telefono, email, attivo             | Proprietario immobile                     |
| `appartamento_proprietari` | id, appartamento_id, proprietario_id, percentuale_proprieta, data_inizio, data_fine, proprietario_default | Associazione proprietario-appartamento con validità temporale |
| `documenti`                | id, appartamento_id, tipo_spesa_id, pagato_da_proprietario_id, importo, periodo_da, periodo_a, stato, nome_file | Spesa documentata (OCR pipeline) |
| `movimenti`                | id, appartamento_id, componente_id, importo, segno, tipo_versamento, data_versamento, validita_da, validita_a | Pagamento/versamento inquilino |
| `spese_proprietari`        | id, proprietario_id, appartamento_id, tipo_spesa_id, importo, validita_da, validita_a | Spesa sostenuta da proprietario |
| `regole_riparto`           | id, appartamento_id, tipo_spesa_id, target, modalita, quota_totale_pct, validita_da, validita_a | Regola distribuzione spese/entrate |
| `tipi_spesa`               | id, descrizione, categoria, riparto, attivo                       | Classificazione spese (rimane in public)  |
| `archivio_documenti`       | id, nome_file, file_hash, tipo_documento_id                       | Archivio documentale generico             |

### Entità v2 (schema `v2`)

| Tabella v2                  | Fase | Sostituisce                                  | Novità introdotte                              |
|-----------------------------|------|----------------------------------------------|------------------------------------------------|
| `v2.persona`                | 1    | `componenti` + `proprietari`                 | Identità unificata, deduplicazione per email   |
| `v2.persona_legacy`         | 1    | —                                            | Tracciabilità legacy_id                        |
| `v2.condominio`             | 2    | — (virtuale)                                 | Livello gerarchico superiore all'immobile      |
| `v2.immobile`               | 2    | `appartamenti`                               | Collegato a un condominio                      |
| `v2.ruolo_persona`          | 3    | `componenti` (ruolo) + `appartamento_proprietari` | Semantica ruolo separata dall'identità    |
| `v2.fatto_economico`        | 4    | `documenti` + `movimenti` + `spese_proprietari` | Fatto neutro con tipo (spesa/entrata)       |
| `v2.pagamento`              | 5    | `movimenti` (data_versamento)                | Flusso finanziario separato dalla competenza   |
| `v2.documento`              | 6    | `archivio_documenti` + `documenti` (file)    | Store documentale universale                   |
| `v2.documento_link`         | 6    | `archivio_associazioni`                      | Collegamento generico documento-entità         |
| `v2.regola_riparto`         | 7    | `regole_riparto`                             | Dichiarativa, gerarchica, temporale            |
| `v2.regola_riparto_dettaglio` | 7  | `regole_riparto_esclusi/inclusi`             | Dettaglio per persona (non più per componente) |

---

## Fase 0 — Baseline

**Obiettivo**: congelare il modello legacy come `baseline_v1`.
- Crea viste `v2.legacy_*` sulle tabelle legacy (read-only snapshot)
- Produce metriche di baseline: conteggi, totali, integrità referenziale

**Output**: `phase0/baseline.sql`

---

## Fase 1 — Persona

**Obiettivo**: unificare `componenti` e `proprietari` in `v2.persona`.

Regola di deduplicazione:
1. Match per `email` (se non NULL) → stessa persona
2. Altrimenti match per `LOWER(nome) + LOWER(cognome)` → stessa persona
3. Altrimenti → persona distinta

Ogni persona mantiene `v2.persona_legacy` con:
- `legacy_tipo`: `'componente'` o `'proprietario'`
- `legacy_id`: UUID della riga legacy

**Invariante post-migrazione**:
```
COUNT(v2.persona_legacy WHERE legacy_tipo='componente')  = COUNT(componenti)
COUNT(v2.persona_legacy WHERE legacy_tipo='proprietario') = COUNT(proprietari)
```

---

## Fase 2 — Condominio e Immobile

**Obiettivo**: introdurre la gerarchia fisica.

Ogni `appartamento` diventa un `v2.immobile` collegato a un `v2.condominio`.
Se non esiste un condominio reale, viene creato un condominio **virtuale** (`virtuale=TRUE`)
con il nome dell'appartamento stesso.

**Invariante post-migrazione**:
```
COUNT(v2.immobile) = COUNT(appartamenti)
Ogni v2.immobile ha condominio_id NOT NULL
```

---

## Fase 3 — Ruolo Persona

**Obiettivo**: separare identità (chi è) da ruolo (che cosa fa in relazione a un immobile).

`v2.ruolo_persona` ha:
- `ruolo IN ('inquilino','proprietario')`
- `validita_da / validita_a`: periodo di validità
- `quota`: percentuale di proprietà (proprietari) o quota affitto (inquilini)

**Invarianti**:
- Quote proprietari per immobile e periodo = 100%
- Nessuna sovrapposizione temporale dello stesso tipo per stessa persona+immobile

---

## Fase 4 — Fatti Economici

**Obiettivo**: unificare `documenti`, `movimenti`, `spese_proprietari` in `v2.fatto_economico`.

Il `fatto_economico` è neutro rispetto al tipo:
- `tipo='spesa'`: spesa documentata o sostenuta
- `tipo='entrata'`: versamento/pagamento ricevuto

**Invariante post-migrazione**:
```
SUM(v2.fatto_economico.importo WHERE tipo='spesa' AND immobile_id=X)
= SUM(documenti.importo WHERE appartamento_id=X AND stato='elaborato')
+ SUM(spese_proprietari.importo WHERE appartamento_id=X)
```

---

## Fase 5 — Pagamenti

**Obiettivo**: separare competenza economica (fatto_economico) da flussi finanziari (pagamento).

I `movimenti` con `data_versamento` diventano `v2.pagamento` collegati al relativo `fatto_economico`.

**Invariante**:
```
SUM(v2.pagamento.importo * segno WHERE persona_id=X) 
= SUM(movimenti.importo * segno WHERE componente_id=legacy)
```

---

## Fase 6 — Documentale Disaccoppiato

**Obiettivo**: store documentale universale indipendente dal dominio economico.

`v2.documento` sostituisce `archivio_documenti` e `documenti` (lato file).
`v2.documento_link` sostituisce `archivio_associazioni` e le FK implicite.

**Invariante**:
```
Hash di ogni file in v2.documento = hash del file legacy corrispondente
Ogni v2.documento ha almeno un v2.documento_link
```

---

## Fase 7 — Nuovo Riparto

**Obiettivo**: motore di calcolo riparti dichiarativo, gerarchico, temporale.

La gerarchia delle regole:
1. Regola specifica (immobile + tipo_spesa + periodo)
2. Regola per tipo_spesa (tutti gli immobili)
3. Regola default immobile
4. Default globale (parti uguali)

**Invariante**:
```
Output motore v2 = Output motore legacy
per ogni immobile, ogni periodo, ogni tipo_spesa
```

---

## Fase 8 — Quadrature Finali

Report automatici di confronto legacy vs v2:
- Per immobile: totale spese, totale entrate, saldo
- Per persona: totale versato, totale addebitato
- Per periodo: bilancio mensile

Scostamento massimo ammesso: **0** (ogni differenza deve essere spiegata e documentata).

---

## Regole di Naming

| Contesto         | Convenzione                            |
|------------------|----------------------------------------|
| Schema DB nuovo  | `v2.*`                                 |
| API endpoints    | `/api/v2/*` (parallele a `/api/*`)    |
| Service layer    | `src/modules/v2/<dominio>/`           |
| Migrazioni       | `src/shared/db/migrations/v2/phaseN/` |
| Legacy_id        | Ogni tabella v2 ha `legacy_id UUID`   |

---

## Divieti Assoluti

- Cancellare o alterare tabelle legacy (`public.*`) durante la migrazione
- Big-bang refactor: nessuna fase può eliminare API v1 in uso
- Hardcode di logica di riparto nel codice (deve essere sempre guidata da `v2.regola_riparto`)
- Assunzioni temporali implicite: ogni evento deve avere `validita_da` / `validita_a`
- Passare alla fase N+1 prima di aver validato la quadratura della fase N
