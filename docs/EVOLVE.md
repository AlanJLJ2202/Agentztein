# Agentztein reescribe su propio código (ADR-026)

Agentztein ya no se mejora solo con skills de texto: **cambia su propio código**, y lo hace con los modelos de
Meta en cada paso. El código que puede cambiar es `packages/agent-core`, el ejecutor que presenta los exámenes en la
app. Todo lo demás (la app, el banco, el calificador, el arnés, los workflows) es el anfitrión y el juez, y el
agente no lo toca.

```
App (/app/#evolve, "Su código")                      GitHub Actions
  Muse Wonder lee: estrategia actual del núcleo,
  errores de práctica, ideas aprobadas del radar
  y los intentos anteriores con su veredicto
  → escribe UNA hipótesis de cambio de código
  → abre un issue con la etiqueta "evolve"  ───────►  evolve.yml · build (solo la llave de Meta)
                                                        1. mide el núcleo actual en el set de práctica
                                                        2. arma un taller: copia del núcleo + práctica + BRIEF.md
                                                        3. Muse Code (`muse exec`) lo cambia, como un usuario
                                                           sin permisos que no puede leer el repo
                                                           (si Muse Code no corre: Forja, Muse + function calling)
                                                        4. trae de vuelta SOLO packages/agent-core → patch
                                                      evolve.yml · publish (runner nuevo, token de GitHub)
                                                        5. aplica el patch, lo revisa con las reglas de main
                                                        6. abre el PR "evolve: …"
                                                      agent-gate.yml (código del juez = el de main)
                                                        · check: pnpm check del PR
                                                        · judge: rutas + escaneo estático del núcleo +
                                                          examen NUEVO (semilla aleatoria, perfil held-out)
                                                          para el núcleo de main y el del PR, cada uno en un
                                                          worker sin llaves → comentario con la tabla
                                                        · merge: solo si "merge" → squash + tag agent-vN
  La pantalla muestra versiones, intentos y veredictos ◄───────────────────────────────┘
```

## Por qué es válido para el hackathon de Meta

| Paso | Modelo |
|---|---|
| Decide qué cambiar | **Muse Wonder** (`/api/evolve`, con la llave del usuario y dentro del arnés) |
| Escribe el código | **Muse Code**, el agente de terminal de Meta (`muse exec`), o **Forja** (Muse Wonder/Spark con function calling) |
| Presenta los exámenes | **Muse Spark**, tanto en la app como en el gate |

Cada PR dice qué constructor lo hizo (`builder=muse-code|forja`) y el comentario del gate dice qué modelo hizo el
examen y cuánto costó.

## El gate: cuándo se fusiona solo

| Caso | Decisión |
|---|---|
| El PR no toca `packages/agent-core` | `skip` (el gate no opina) |
| El núcleo rompe las reglas (red, `process`, `import()`, `eval`, imports de fuera, ids memorizados…) | `reject` (el check falla) |
| Un escenario baja más de lo permitido, o el núcleo nuevo falla donde el viejo no | `reject` |
| Sube menos de lo necesario (2 aciertos o el 2% del examen) | `human` |
| Toca archivos fuera de `packages/agent-core` | `human` |
| No lo abrió el workflow `evolve` (rama `evolve/<run>`) | `human` |
| Abierto por `evolve`, solo el núcleo, mejora y no rompe nada, y `pnpm check` pasa | **`merge`** + tag `agent-vN` |

Las reglas (`scripts/evolve/gate.ts`), el examen (`scripts/evolve/exam.ts`) y el calificador (`api/_lib/agent.js`)
siempre salen de `main`, no del PR. Y el token que abre los PRs no tiene permiso de *Workflows*, así que un PR no puede
cambiar los workflows que lo juzgan.

### Contra las trampas

- **El examen no existe cuando el agente escribe el código.** Se genera en cada corrida del gate con una semilla
  aleatoria, en un rango de semillas que ningún otro set usa y con el perfil *held-out*. Memorizar registros no sirve.
- **El constructor no ve el juez.** Trabaja en `/tmp/workshop` como el usuario `builder`, sin `sudo` y sin acceso a la
  home del runner. Ahí solo hay una copia del núcleo, el set de práctica (con respuestas, como ya lo ve el
  planificador) y el brief. No ve los generadores de escenarios, ni el banco, ni el gate.
- **El núcleo corre aislado.** En el gate, cada versión corre en un `worker_thread` con `env: {}`: sin llave y sin
  poder tocar los objetos globales del calificador. Solo puede salir por `tools.model`, con un límite de llamadas.
- **Solo vuelve el núcleo.** El job `publish` rechaza cualquier patch que toque otra ruta.

## Qué tienes que configurar (una vez, ~15 min)

1. **Secretos del repo** (GitHub → Settings → Secrets and variables → Actions → *Secrets*):
   - `META_API_KEY`: una llave de la Meta Model API **solo para CI**, con límite de gasto (por ejemplo, $20).
     La usan Muse Code, Forja y el gate.
   - `AGENT_GH_TOKEN`: un *fine-grained personal access token* (GitHub → Settings → Developer settings →
     Fine-grained tokens) con acceso **solo** a este repo. Permisos: *Contents: Read and write*, *Pull requests:
     Read and write*, *Issues: Read and write*, *Metadata: Read*. **Sin** *Workflows*. Con este token los PRs sí
     disparan `agent-gate` (con el `GITHUB_TOKEN` no se dispararía).
2. **Variables del repo** (misma página, pestaña *Variables*; todas opcionales):
   - `EVOLVE_SCHEDULE` = `on`: un ciclo diario solo (16:41 UTC).
   - `EVOLVE_BUILDER` = `muse-code` (por defecto) o `forja`.
   - `MUSE_INSTALL_URL`: instalador de Muse Code (por defecto `https://dev.meta.ai/install.sh`). **Verifícalo en la
     doc oficial de Meta**; no lo pude confirmar desde aquí. Opcional: `MUSE_INSTALL_SHA256` para verificar el script.
   - `MUSE_EXEC_FLAGS`: por defecto `--yolo` (sin aprobaciones ni sandbox propio de Muse Code; el aislamiento lo da
     el usuario `builder`). Si tu versión usa otros flags: `--approval-mode never --disable-sandbox`.
   - `META_MODEL` / `META_PLANNER_MODEL`: para fijar los modelos (por defecto, el Muse Spark/Wonder más nuevo que
     liste la llave).
3. **Settings → General → Pull Requests:** deja activado *Allow squash merging*.
4. **Vercel → Environment Variables:**
   - `AGENT_GH_TOKEN`: el mismo token (la app solo abre issues y lee PRs).
   - `AGENT_GH_REPO` = `AlanJLJ2202/Agentztein` (o deja que se use el repo del que despliega Vercel).
   - `EVOLVE_ADMINS`: tu correo (separa varios con comas). Solo esas cuentas pueden mandar al agente a cambiar su
     código, porque eso gasta la llave del proyecto en CI.
5. **Primera prueba:** Actions → **evolve** → *Run workflow* (builder `forja` si Muse Code aún no instala), o en la
   app: pestaña **Su código** → *Que Muse Wonder proponga un cambio*.

## Costo por ciclo (estimado)

- Práctica antes de construir: 4 llamadas a Spark, unos centavos.
- Construcción: Muse Code o Forja, con tope de $2 en Forja. Muse Code cobra según su plan.
- Gate: unas 8 llamadas a Spark (4 escenarios × 2 versiones) sobre ~360 registros, unos centavos.
- Actions: gratis en el plan de GitHub hasta tus minutos incluidos.

## Riesgos que quedan (honestos)

- **La llave de CI está en el proceso del constructor.** Un núcleo malicioso que lograra ofuscar su código más allá del
  escaneo estático podría intentar usarla. Mitigación: una llave aparte con límite de gasto.
- **El gate es estadísticamente modesto.** Un examen de ~360 registros y el umbral de +2% filtran ruido grueso, no
  diferencias finas. Para afirmaciones fuertes hay que repetir con varias semillas.
- **Muse Code en CI no está probado aquí.** La sesión que construyó esto no pudo abrir `dev.meta.ai`. Si el instalador
  o los flags cambian, el workflow cae solo en Forja.
- Todo esto sigue siendo sobre los escenarios sintéticos del banco, no sobre SWE-bench u otros benchmarks públicos.
