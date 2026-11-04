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

1. ~~PDF ausente~~ → recibido el 2026-10-28 y contrastado (ADR-000).
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
- Los oráculos son reglas escritas a mano; que el entorno sea resoluble por reglas no implica que un LLM lo
  resuelva sin ayuda: eso lo mide la calibración de E2.
- Roles de Postgres (`proposer_ro`, `runner`, `evaluator`) y vistas por split: E3.

## E1.1 — Ajustes tras recibir el anteproyecto (2026-10-28)

**Hecho**
- Revisión completa del PDF contra prompt y código (ADR-000): sin contradicciones metodológicas; 8 huecos
  resueltos o planificados.
- `Decision.reason` obligatorio (contrato + migración `0002_decision_reason` + test).
- `pnpm datasets:review` → `docs/GROUND_TRUTH_REVIEW.md` (ADR-011). **Bloquea E2-calibración** hasta que
  Alan apruebe la revisión.
- ADR-003 reescrito (umbrales derivados de la calibración), ADR-012 (H3, paquetes), ADR-013
  (transformaciones semánticas en test, E4), ADR-014 (trazas como datos, E3).
- Referencias [1]–[14] del anteproyecto en `README.md`.

**Verificación**
```bash
pnpm check
```

## Panel de vista previa (2026-10-31)
- `apps/panel`: panel estático de solo lectura para Vercel, adelanto mínimo de E7. Muestra avance por etapa,
  tabla del conflicto A/B y R1→R2 (n/N), lotes de ejemplo de adaptation con sus etiquetas, y hashes del
  manifest. Rotulado como validación del entorno, no resultados del sistema. No incluye el split test.
- Se construye sin DB (`scripts/snapshot.ts` genera los datos en build). `pnpm check` ahora también
  construye el panel para detectar fallos de despliegue antes de Vercel.

## Escenarios de negocio y panel en lenguaje claro (2026-11-01)
- `@skillab/scenarios`: 5 escenarios (ADR-016) con marco común, contratos genéricos (ADR-017) y 33 pruebas que
  exigen a cada uno la trampa A/B, el cambio R1→R2 solo en B, solubilidad y separación de splits.
- Datasets `ds-v2`: 45 conjuntos, manifest `7615ab2bffd5d92ab3dffb40d09139d18f19d5e71860857c9d348d54141f3b69`. `docs/GROUND_TRUTH_REVIEW.md` regenerado para los 5.
- Panel reescrito para público no técnico: cada sección abre con "De qué trata"; términos técnicos como
  etiqueta junto a la idea. Secciones: idea, cómo aprende, estrategias, escenarios (con resultados de
  reglas fijas y datos de ejemplo), qué medimos, bitácora (vacía hasta E2–E3), avance, glosario, detalles técnicos.
- `pnpm check`: 69 tests en verde + build del panel.

## E2 — Ejecutor (plan)
- `packages/model-adapter`: interfaz `ModelClient`, `FakeModelClient` determinista (scripted), contabilidad
  de tokens y coste con `config/pricing.json` (fallo al arrancar si falta precio). Adaptador Anthropic tras
  leer la documentación oficial vigente (nombre exacto de modelo, formato de tool use, límites).
- Herramientas genéricas (`list_items`, `get_item`, `get_context_metadata`, `submit_labels`) como funciones
  puras sobre el lote de cualquier escenario; validación Zod de la salida.
- `packages/runner`: episodio con timeout, presupuesto (80% warning, 100% stop), traza completa a `BlobStore`
  local por sha256, persistencia en `episodes` incluso en fallo.
- Loader de datasets a DB (cases / sealed.test_cases / sealed.truth).
- Registro de cambios de infraestructura (`infra_changes`: versión de Node, dependencias, modelo, adaptador)
  que el anteproyecto pide registrar (§06).
- **Salida:** corrida de A (frozen) en las 3 familias con FakeModelClient, resultados y coste persistidos,
  test que fuerza timeout/JSON inválido. Calibración con modelo real solo tras confirmar precios y API key.

## Memoria y sueños (2026-11-04, ADR-031)
- `api/_lib/memory.js`: lecciones con alcance, tipo y fuerza; el sueño relee los ciclos terminados comprimidos en
  una línea cada uno y el servidor aplica su respuesta con reglas fijas (reforzar, reescribir como versión nueva,
  desvanecer lo que no se conserva ni se usa, máximo 40). Planificador, director y charla reciben las lecciones con
  su propio presupuesto de caracteres; el ejecutor nunca.
- Migración `0009_memory`: `app.agent_memories`, `app.agent_dreams` (congeladas por trigger) y `agent_jobs.dreamt_at`.
- `/api/agent`: `op: "dream"`, `op: "memory"` (fijar, soltar, olvidar) y fase `dream` en ciclos autónomos con ≥3 ciclos
  sin digerir. `/api/talk` conoce la memoria y puede sugerir `dream`.
- App: panel "Memoria y sueños" en la pestaña Agente; herramientas `dream` y `memory` en la traza y la narración.
- Tests: `test/api/memory.test.ts` (reglas puras) y el ciclo que sueña de punta a punta en `test/api/agent.test.ts`.

## Pantallas más digeribles, con Agentztein como guía (2026-11-04)
- `Robot.tsx`: Agentztein en una pose (ok, alerta, dormido, explicando, feliz, saludando, leyendo) con una frase. Las
  poses son fotos del mismo modelo 3D (`render-stills.mjs agent-*`), sin un segundo canvas WebGL.
- Inicio: tarjeta "Memoria y sueños" con Agentztein dormido, alertas de sueño, KPI de memoria y sueños en la historia.
- Agente: el robot dice qué pasa; los pasos del ciclo como fichas; tope con botones rápidos; guía, modelos y esfuerzo
  en "Más opciones"; el panel vacío ya no repite el texto.
- Ajustes: una fila horizontal por tema con el robot a la izquierda; los modelos de Meta como fichas con ícono, precio
  en $ y lo que ven; límite mensual con botones rápidos; voz en dos filas de opciones.
- Radar y Su código: el robot resume la pantalla; la explicación larga queda en "Cómo funciona".
- Login: cabe en la pantalla en 10 tamaños de 375×667 a 1920×1080 (antes se cortaba en casi cualquier laptop).
