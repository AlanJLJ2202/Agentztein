# Progreso

## Cómo entendí el proyecto

`skillab` es un laboratorio para estudiar si las habilidades de un agente LLM con **alcance** (dónde
aplican) y **vigencia** (bajo qué versión de reglas fueron evaluadas) permiten adaptarse a cambios de
reglas con menos interferencia que (B) acumular habilidades o (C) reescribir instrucciones globales.
El modelo es fijo; evoluciona el sistema que lo rodea. El ciclo: trazas de adaptación → hipótesis →
**una** candidata → comparación aislada contra la versión vigente (validation) → promoción solo con
criterios pre-registrados → medición final en un test sellado que el proponente no puede leer.
El dominio es sintético: conciliar movimientos de dos proveedores ficticios donde una regla útil en
vendorA ("duplicado = mismo importe + fecha") daña a vendorB, y donde R1→R2 cambia la semántica del
signo de `amount` solo en vendorB. El éxito es un protocolo reproducible y un reporte honesto, aunque
la variante D no gane (H4).

## Riesgos que veo en la especificación

1. **PDF ausente** (ADR-000): trabajo con el prompt como especificación provisional.
2. **Entorno demasiado fácil o demasiado difícil**: si el modelo resuelve vendorB sin habilidades, no hay
   nada que aprender; si es imposible, todas las variantes empatan en 0. Mitigación: señales observables
   diseñadas (hora en la descripción) y calibración con A antes de fijar tamaños.
3. **Potencia estadística**: 10 casos por familia dan IC muy anchos; muchos resultados serán
   "no concluyentes". Es aceptable si se reporta así; el piloto no promete potencia.
4. **Coste**: 360 episodios + adaptación con un modelo grande puede superar USD 50. La calibración decide.
5. **Fuga de información al proponente**: el aislamiento por ruta + rol de DB debe ser real (E3), y los
   ids no deben codificar etiquetas ni split.
6. **No determinismo del API**: semillas no garantizan reproducibilidad del modelo; se registran
   `modelId` y trazas completas.
7. **Selector como confusor**: un selector defectuoso invalida la comparación D vs B/C; se mide aparte.

## E1 — Base

**Plan**
- Archivos: monorepo pnpm (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`,
  `eslint.config.js`, `vitest.config.ts`, `docker-compose.yml`, `.env.example`).
- `packages/contracts`: esquemas Zod (env: Row/Label/Batch/Case/Dataset; skills: SkillVersion,
  SkillState, SkillEvent, Evidence, Decision; RuleVersion; Experiment; Episode/Trace).
- `packages/env-recon`: PRNG determinista, generador por (seed, rulesVersion, familia), splits con semillas
  disjuntas, hash canónico, oráculos de referencia y CLI (`datasets:generate`, `datasets:verify`,
  `env:conflict`).
- `packages/db`: esquema Drizzle + migración generada + migración SQL de inmutabilidad, script de migración.
- Tests: determinismo, consistencia de etiquetas (propiedades con fast-check), conflicto A/B con oráculo
  ingenuo, fallo de la regla por signo bajo R2 solo en vendorB, splits disjuntos, contratos, migraciones
  e inmutabilidad en Postgres.
- **Criterio de salida:** `pnpm check` (lint + typecheck + test) en verde; hash de dataset reproducible;
  el oráculo ingenuo demuestra el conflicto A/B.

## E1 — cierre (2026-10-28)

**Hecho**
- Monorepo pnpm + TS 5.9 estricto (`noUncheckedIndexedAccess`), ESLint strict, Vitest 5, fast-check, CI de
  GitHub Actions con Postgres 16 (`.github/workflows/ci.yml`) que corre `pnpm check`.
- `@skillab/contracts`: Row (con reglas por esquema A@1/B@1/B@2), Label, Batch, SubmitLabels, Case, Dataset,
  Manifest, RuleVersion, SkillVersion/Content/Scope/Validity, SkillState, SkillEvent, Evidence, Decision,
  Experiment, Episode, SelectorDecision; hashing canónico sha256.
- `@skillab/env-recon`: generador determinista (mulberry32), R1/R2, familias F1–F3, splits con semillas
  disjuntas y perfil `heldout` para test, oráculos de validación (ingenuo, por signo, referencia), CLIs.
- `@skillab/db`: 12 tablas, esquema `sealed` (test_cases, truth), migración de inmutabilidad (triggers que
  rechazan UPDATE/DELETE/TRUNCATE en tablas append-only).
- Tests: 33 (determinismo, consistencia de etiquetas por propiedades, solvencia del entorno, conflicto A/B,
  R2 rompe la regla por signo solo en vendorB, splits disjuntos, distribución heldout, contratos, DB).

**Verificación**
```bash
pnpm check
```
```bash
pnpm env:conflict
```

**Resultados**
- Manifest de datasets `ds-v1` / `env-recon@1`: `dfff584334683dc5f34c80bbd1c7cc067711446b30c8fdfa45102a5531c9f3ff`.
- Conflicto A/B (adaptation + validation, unidad = lote): regla "mismo importe + fecha" acierta
  30/30 lotes en F1/vendorA y 0/15 en F2/vendorB (182/203 filas); vendorA en F2 sigue 15/15.
- R1→R2 (F3): la regla por signo acierta 8/8 y 7/7 lotes en vendorA (R1, R2), 7/7 en vendorB/R1 y
  0/8 en vendorB/R2. El oráculo de referencia acierta 100% en todas las celdas (el entorno es resoluble).
- Coste gastado en modelos: USD 0 (no se llamó a ningún modelo).

**Pendiente / notas**
- PDF del anteproyecto no recibido (ADR-000).
- Los oráculos son reglas escritas a mano; que el entorno sea resoluble por reglas no implica que un LLM lo
  resuelva sin ayuda: eso lo mide la calibración de E2.
- Roles de Postgres (`proposer_ro`, `runner`, `evaluator`) y vistas por split: E3.

## E2 — Ejecutor (plan)
- `packages/model-adapter`: interfaz `ModelClient`, `FakeModelClient` determinista (scripted), contabilidad
  de tokens y coste con `config/pricing.json` (fallo al arrancar si falta precio). Adaptador Anthropic tras
  leer la documentación oficial vigente (nombre exacto de modelo, formato de tool use, límites).
- Herramientas del entorno (`list_rows`, `get_row`, `get_import_metadata`, `submit_labels`) como funciones
  puras sobre el fixture; validación Zod de la salida.
- `packages/runner`: episodio con timeout, presupuesto (80% warning, 100% stop), traza completa a `BlobStore`
  local por sha256, persistencia en `episodes` incluso en fallo.
- Loader de datasets a DB (cases / sealed.test_cases / sealed.truth).
- **Salida:** corrida de A (frozen) en las 3 familias con FakeModelClient, resultados y coste persistidos,
  test que fuerza timeout/JSON inválido. Calibración con modelo real solo tras confirmar precios y API key.
