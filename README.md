# skillab

> Nombre de código provisional (no es el nombre final del proyecto).

**En pocas palabras:** Agentztein es un agente de investigación de IA que se mejora a sí mismo, pieza por
pieza, como Frankenstein: crea sus propias habilidades y solo se queda con las que mejoran sin romper lo que
ya sabía. La meta es medirlo en benchmarks públicos de frontera (código, terminal, razonamiento, web e
investigación de IA); ver [`docs/FRONTERA.md`](docs/FRONTERA.md) y ADR-018. Hoy el mecanismo se prueba en
cinco exámenes sintéticos **al estilo de esos benchmarks** (SWE-bench Pro, Terminal-Bench, ARC-AGI, BrowseComp y
MLE-bench: se califican como ellos, pero no son ellos; `packages/scenarios`, ADR-028); antes se probaba en cinco
escenarios de negocio (conciliación bancaria, inspección de calidad, devoluciones, mensajes de
clientes y tarifas de paquetería); aún no hay resultados en ningún benchmark.

Laboratorio para estudiar la **evolución verificable de habilidades de agentes LLM**: ante un patrón de
fallos el sistema formula una hipótesis, genera **una** habilidad candidata, la compara contra la versión
vigente en entornos aislados y la conserva solo dentro del **alcance** y la **vigencia** (versión de reglas)
respaldados por evidencia.

Pregunta de investigación: *¿las habilidades con alcance y vigencia explícitos permiten adaptarse a cambios
de reglas con menos interferencia que acumular habilidades o modificar instrucciones globales?*
El objetivo es un protocolo reproducible y un reporte honesto, incluido el caso en que la respuesta sea "no".

## Qué NO es
- No reentrena pesos ni hace fine-tuning: el modelo es fijo.
- No modifica arbitrariamente el código del agente: cada usuario tiene su propia copia de `packages/agent-core`, y
  cada cambio pasa por un juez que la examina con registros nuevos y la adopta solo si mejora sin romper nada
  (ADR-026, [`docs/EVOLVE.md`](docs/EVOLVE.md)).
- No detecta drift automáticamente: los cambios de reglas son explícitos.
- No usa datos reales, bancarios ni personales: los escenarios son sintéticos. Mejorar en ellos no demuestra
  que funcione en un negocio real.
- No depende de ni reutiliza código del repositorio privado "Control".

## Estado

| Etapa | Estado |
|---|---|
| E1 Base: tooling, contratos, esquema DB, generador sintético | ✅ completada |
| E2 Ejecutor (model-adapter, runner, trazas, coste) | siguiente |
| Auto-cambio de código con Meta (Muse Wonder propone, Muse Code construye, gate con examen nuevo) | ✅ v0 (ADR-026) |
| E3–E8 | pendientes |

Especificación: anteproyecto v1.0 (contraste en ADR-000). Detalle en [`docs/PROGRESS.md`](docs/PROGRESS.md); decisiones en [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Estructura actual

```
packages/agent-core  el cuerpo del agente: el ejecutor que el propio agente reescribe (solve(task, tools), sin red ni secretos)
scripts/evolve       el juez y el taller: examen nuevo con semilla aleatoria, bench en workers sin llaves, reglas del gate, Forja
packages/contracts   esquemas Zod (fuente de los tipos) + hashing canónico
packages/env-recon   entorno sintético de conciliación: generador, reglas R1/R2, oráculos de validación
packages/scenarios   marco común + 5 exámenes al estilo de los benchmarks (código, terminal, razonamiento, web, investigación) + 5 escenarios de negocio originales
packages/db          esquema Drizzle + migraciones (tablas append-only, esquema `sealed`)
apps/panel           panel estático de solo lectura (Vite + React): validación del entorno, sin agentes aún
apps/app             app con sesión (Vite + React) en /app/: acceso con Google o correo + código; Inicio en vista sencilla o completa con Agentztein en 3D; Agentztein como compañero en todas las pestañas (explica, narra y se le habla en voz alta, /api/talk); Cerebro (grafo de lo que sabe y las herramientas que usa); Lab 3D (el edificio de la landing, siguiendo al agente cuarto por cuarto); ciclos que él decide con tope de gasto (ADR-027); llave de Meta por usuario y radar
api/_lib/memory.js   la memoria del agente: lecciones que consolida al soñar sobre sus ciclos y que cada paso recibe con presupuesto (ADR-031)
api/                 funciones de Vercel: /api/config, /api/keys (llaves cifradas), /api/radar (Hacker News, arXiv, Hugging Face Papers y GitHub, con tiempo por fuente, reintento y respaldo + triage con el modelo del usuario)
packages/research    lógica compartida del radar: fuentes (Hacker News, arXiv, Hugging Face, GitHub), capacidades y triage (prompt + validación)
apps/landing         landing de presentación: Agentztein en 3D (three.js); un edificio recorrible (cuna + un cuarto por benchmark, 1.ª/3.ª persona) y un laboratorio 3D por benchmark; `pnpm --filter @skillab/landing stills` regenera sus imágenes
datasets/manifest.json  hashes de todos los splits (los datos se regeneran desde semillas)
```

## Flujo en la nube (sin máquina local)

Todo se opera desde el navegador (ADR-015):

1. **Supabase:** crear el proyecto; en *Project Settings → Data API* quitar `public` de los esquemas expuestos;
   descargar el certificado CA en *Database Settings → SSL*.
2. **GitHub → Settings → Environments → `production`:** secretos `DATABASE_URL` (cadena del *Session pooler*,
   puerto 5432) y `DATABASE_SSL_CA` (contenido completo del certificado `.crt`).
3. **GitHub → Actions → `db-migrate` → Run workflow**, escribiendo `migrate`.
4. **Vercel:** importa el repo; `vercel.json` ya indica cómo construir el sitio (`pnpm build:site`): la landing
   (`apps/landing`) en `/` y el panel (`apps/panel`) en `/panel/`. Producción sale de `main`; cada rama tiene su URL de *preview*.
5. Cada push corre `ci` (lint, typecheck, verificación de datasets y tests con Postgres efímero).
6. **Auto-cambio de código (opcional):** cada usuario lo usa con su propia llave de Meta. El servidor necesita
   `AGENT_GH_TOKEN`, `AGENT_GH_REPO` y `EVOLVE_CI_SECRET` en Vercel, y el mismo `EVOLVE_CI_SECRET` como secreto del
   repo; migración `0008`. Los pasos están en [`docs/EVOLVE.md`](docs/EVOLVE.md).
7. **Memoria y sueños:** correr `db-migrate` para la migración `0009` (lecciones y sueños). No requiere llaves nuevas:
   sueña con la misma llave de Meta del usuario (ADR-031).

### Login (Google o correo con código) y llave de Meta (`/app/`, ADR-019 y ADR-020)

1. **Google Cloud Console** (console.cloud.google.com), en un proyecto nuevo o existente:
   - *Google Auth Platform → Branding:* nombre de la app (Agentztein), correo de soporte, logo opcional y en
     *Authorized domains* tu dominio de producción y `<proyecto>.supabase.co`.
   - *Audience:* tipo **External** y **Publish app** (en modo *Testing* solo entran los correos de prueba).
   - *Data Access:* solo los scopes básicos `openid`, `email` y `profile` (no requieren verificación de Google).
   - *Clients → Create client → Web application:*
     - *Authorized JavaScript origins* (para el botón de Google): `https://<dominio>` y `http://localhost:5173`.
     - *Authorized redirect URIs* (flujo con redirección, que usan los previews): `https://<proyecto>.supabase.co/auth/v1/callback`.
     - Copia el **Client ID** y el **Client Secret**.
2. **Supabase → Authentication → Sign In / Providers:**
   - **Google:** activarlo con el Client ID y el Client Secret del paso 1 (deja *Skip nonce checks* apagado).
     Con *Allow new users to sign up* encendido (Authentication → Sign In / Providers → User Signups), el
     mismo botón registra a quien entra por primera vez: la cuenta se crea con su nombre, correo y foto de Google.
   - **Email:** activado, con *Confirm email* encendido y *Email OTP length* = 6.
3. **Supabase → Authentication → Emails:** pegar las plantillas de `supabase/templates/` en *Confirm signup* y
   *Reset password*. Usan `{{ .Token }}`, así que el usuario recibe un código de 6 dígitos en vez de un enlace.
   El correo integrado de Supabase tiene un límite muy bajo de envíos por hora: para producción configura un
   SMTP propio (*Authentication → Emails → SMTP Settings*, p. ej. Resend o SES).
4. **Supabase → Authentication → URL Configuration:** *Site URL* = el dominio de producción; en *Redirect URLs*
   agregar `https://<dominio>/app/` y `https://*-<equipo>.vercel.app/app/` (previews).
5. **Vercel → Settings → Environment Variables:** `GOOGLE_CLIENT_ID` (público: el mismo Client ID del paso 1),
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` (públicas),
   `DATABASE_URL` (Transaction pooler, puerto 6543), `DATABASE_SSL_CA` y `KEYS_ENCRYPTION_SECRET`
   (32+ caracteres aleatorios, p. ej. `openssl rand -base64 48`). Si falta alguna, `/app/` dice cuál.
6. **Comprobar Google:** `SUPABASE_URL=… SUPABASE_ANON_KEY=… GOOGLE_CLIENT_ID=… pnpm auth:check` (o abrir
   `/api/config?check=google`). Confirma que Google está activado en Supabase y que Supabase y el botón usan
   el mismo Client ID; si no, dice qué corregir.
7. Correr `db-migrate` para crear el esquema `app` (migraciones `0005`, `0006` y `0007`: llaves, notas, presupuesto, skills del agente y
   registro del arnés). No se expone por la Data API de Supabase.

**Sonido y voz (opcional, ElevenLabs).** La landing suena: pasos, descarga de las bobinas, puertas, alarma del
arnés y la voz de Agentztein diciendo sus frases (en inglés y español). Para que use ElevenLabs agrega en Vercel
`ELEVENLABS_API_KEY` (y, si quieres otra voz, `ELEVENLABS_VOICE_ID`). La llave se queda en el servidor:
`/api/audio` solo genera los sonidos y frases de la lista cerrada de `api/_data/audio-catalog.js` (nadie puede
pedirle texto propio) y la CDN guarda cada audio un año, así que cada uno se paga una sola vez. Sin llave, el
sitio sintetiza sus propios efectos en el navegador y las frases solo salen en el globo de texto. El botón del
altavoz (abajo a la izquierda) enciende y apaga el sonido; arranca al primer toque, salvo que lo hayas silenciado.

**Solo modelos de Meta.** Cada usuario pega su llave de la **Meta Model API** (`https://api.meta.ai/v1`,
compatible con OpenAI; se crea en dev.meta.ai). Es la que reemplazó a la Llama API (retirada el 6 jul 2026) y
sirve los modelos Muse Spark. Está en vista previa pública para desarrolladores en EE. UU. La llave se verifica
con Meta, se cifra con AES-256-GCM (atada a usuario y proveedor) y nunca regresa al navegador. Por defecto se usa
el Muse Spark estándar más nuevo; los modelos `-contributor` nunca se eligen solos porque Meta puede entrenar con
sus datos. Comprar créditos de IA queda para la fase 2.

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
