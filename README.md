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

Especificación: anteproyecto v1.0 (contraste en ADR-000). Detalle en [`docs/PROGRESS.md`](docs/PROGRESS.md); decisiones en [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Estructura actual

```
packages/contracts   esquemas Zod (fuente de los tipos) + hashing canónico
packages/env-recon   entorno sintético de conciliación: generador, reglas R1/R2, oráculos de validación
packages/db          esquema Drizzle + migraciones (tablas append-only, esquema `sealed`)
apps/panel           panel estático de solo lectura (Vite + React): validación del entorno, sin agentes aún
datasets/manifest.json  hashes de todos los splits (los datos se regeneran desde semillas)
```

## Flujo en la nube (sin máquina local)

Todo se opera desde el navegador (ADR-015):

1. **Supabase:** crear el proyecto; en *Project Settings → Data API* quitar `public` de los esquemas expuestos;
   descargar el certificado CA en *Database Settings → SSL*.
2. **GitHub → Settings → Environments → `production`:** secretos `DATABASE_URL` (cadena del *Session pooler*,
   puerto 5432) y `DATABASE_SSL_CA` (contenido completo del certificado `.crt`).
3. **GitHub → Actions → `db-migrate` → Run workflow**, escribiendo `migrate`.
4. **Vercel:** importa el repo; `vercel.json` ya indica cómo construir el panel (`apps/panel`). Producción sale
   de `main`; cada rama tiene su URL de *preview*.
5. Cada push corre `ci` (lint, typecheck, verificación de datasets y tests con Postgres efímero).

## Cómo correr (local, opcional)

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

```bash
pnpm datasets:review     # regenera docs/GROUND_TRUTH_REVIEW.md para revisión humana
```

Sin `DATABASE_URL`, los tests de Postgres se marcan como *skipped* (visiblemente); el resto corre igual.

## Antecedentes

Este proyecto se apoya en trabajo previo; el crédito es de sus autores y aquí no se reproduce como propio.
Ninguno de sus resultados se ha reproducido en este repositorio. Referencias tal como aparecen en el
anteproyecto v1.0 (§13); las publicaciones recientes pueden ser preprints.

1. Nous Research. *Hermes Agent Self-Evolution*. https://github.com/NousResearch/hermes-agent-self-evolution
2. Nous Research. *Hermes Agent: Skills System y aprobación de escrituras*. https://hermes-agent.nousresearch.com/docs/user-guide/features/skills/
3. Sakana AI. *The Darwin Gödel Machine*. 30 may 2025. https://sakana.ai/dgm/
4. Agrawal et al. *GEPA: Reflective Prompt Evolution Can Outperform Reinforcement Learning*. ICLR 2026. https://arxiv.org/abs/2507.19457
5. *ACE. Agentic Context Engineering*. https://ace-agent.github.io/
6. Lee et al. *Meta-Harness: End-to-End Optimization of Model Harnesses*. Mar 2026. https://arxiv.org/abs/2603.28052
7. Shang et al. *MESH-Harness: Self-Improving Agent Harnesses via Bandit-Guided Compositional Evolution*. Oct 2026. https://arxiv.org/abs/2610.05300
8. Ma et al. *Skill-V: Verifiable Self-Evolving Skill Library for Interactive Agents*. Oct 2026. https://arxiv.org/html/2610.11781v1
9. Zhou et al. *Counterfactual Trace Auditing of LLM Agent Skills* (CTA). May 2026. https://arxiv.org/abs/2605.11946
10. Zhu et al. *Bad Genius: Counterfactual-Guided Harness Evolution Beyond Task-Specific Shortcuts* (CHASE). Sep 2026. https://arxiv.org/abs/2609.18366
11. Chen et al. *Are Self-Evolving Agents Continual Learners?* 19 oct 2026. https://arxiv.org/abs/2610.25858
12. Zhao et al. *Self-Evolving Agents Can Repair Failures but Struggle to Generalize from Them*. 16 oct 2026. https://arxiv.org/abs/2610.22984
13. Huang et al. *From Raw Experience to Skill Consumption: A Systematic Study of Model-Generated Agent Skills*. May 2026. https://arxiv.org/abs/2605.23899
14. Meta. *Global AI Developer Hackathon: temas, criterios y fechas*. https://dev.meta.ai/events/global-hackathon
