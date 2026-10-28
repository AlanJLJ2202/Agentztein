# skillab

> Nombre de código provisional (no es el nombre final del proyecto).

Laboratorio para estudiar la **evolución verificable de habilidades de agentes LLM**: ante un patrón de
fallos el sistema formula una hipótesis, genera **una** habilidad candidata, la compara contra la versión
vigente en entornos aislados y la conserva solo dentro del **alcance** y la **vigencia** (versión de reglas)
respaldados por evidencia.

Pregunta de investigación: *¿las habilidades con alcance y vigencia explícitos permiten adaptarse a cambios
de reglas con menos interferencia que acumular habilidades o modificar instrucciones globales?*
El objetivo es un protocolo reproducible y un reporte honesto, incluido el caso en que la respuesta sea "no".

## Qué NO es
- No reentrena pesos ni hace fine-tuning: el modelo es fijo.
- No modifica arbitrariamente el código del agente.
- No detecta drift automáticamente: los cambios de reglas son explícitos.
- No usa datos reales, bancarios ni personales: el entorno es sintético.
- No depende de ni reutiliza código del repositorio privado "Control".

## Estado

| Etapa | Estado |
|---|---|
| E1 Base: tooling, contratos, esquema DB, generador sintético | ✅ completada |
| E2 Ejecutor (model-adapter, runner, trazas, coste) | siguiente |
| E3–E8 | pendientes |

Detalle en [`docs/PROGRESS.md`](docs/PROGRESS.md); decisiones en [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Estructura actual

```
packages/contracts   esquemas Zod (fuente de los tipos) + hashing canónico
packages/env-recon   entorno sintético de conciliación: generador, reglas R1/R2, oráculos de validación
packages/db          esquema Drizzle + migraciones (tablas append-only, esquema `sealed`)
datasets/manifest.json  hashes de todos los splits (los datos se regeneran desde semillas)
```

## Cómo correr

Requisitos: Node ≥ 22.12, pnpm 10, PostgreSQL 16 (vía `docker compose up` o local).

```bash
pnpm install
```

```bash
docker compose up -d postgres
```

```bash
cp .env.example .env && export DATABASE_URL=postgres://skillab:skillab@localhost:5432/skillab
```

```bash
pnpm db:migrate
```

```bash
pnpm check   # lint + typecheck + datasets:verify + tests
```

```bash
pnpm datasets:generate   # escribe adaptation/, validation/ y sealed/test/ + manifest
```

```bash
pnpm env:conflict        # muestra el conflicto A/B y el efecto R1→R2 con oráculos de referencia
```

Sin `DATABASE_URL`, los tests de Postgres se marcan como *skipped* (visiblemente); el resto corre igual.

## Antecedentes

Este proyecto toma ideas de trabajos previos sobre agentes que mejoran su propio andamiaje, entre ellos
Darwin Gödel Machine (DGM), GEPA, ACE, Hermes, Meta-Harness, MESH, Skill-V, CTA y CHASE. El crédito es de
sus autores; aquí no se reproduce su trabajo como propio. Las referencias bibliográficas completas se
tomarán del anteproyecto y se añadirán en `docs/REPORT.md`.
