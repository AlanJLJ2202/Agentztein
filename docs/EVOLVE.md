# Cada agente reescribe su propio código (ADR-026)

Cualquier persona que entra a la app y pega su llave de Meta tiene **su propio agente**, y ese agente puede
**cambiar su propio código**, no solo escribirse skills de texto. Todo pasa con la llave de esa persona, dentro de
su presupuesto, y con los modelos de Meta en cada paso.

El código que cambia es el núcleo del agente: `packages/agent-core`, la función `solve(task, tools)` que presenta los
exámenes. Cada usuario tiene su propia línea de versiones de ese núcleo en la base de datos (`app.agent_cores`). Quien
todavía no tiene ninguna usa el de la plataforma (v0). El banco, el calificador, el arnés y los workflows son el
anfitrión y el juez, y el agente no los toca.

```
App · pestaña "Su código" (cualquier usuario con su llave)        GitHub Actions · evolve.yml
  Muse Wonder (llave del usuario, dentro de su arnés) lee:
  su núcleo actual, sus errores de práctica, las ideas
  que aprobó en el radar y sus intentos anteriores
  → escribe UNA hipótesis de cambio de código
  → crea la corrida (token de un solo uso) y dispara  ──────────►  1. pide la corrida a /api/evolve-ci: la llave del
    el workflow (workflow_dispatch)                                   usuario (enmascarada), su núcleo actual, la idea
                                                                   2. mide ese núcleo en el set de práctica
                                                                   3. taller con solo el núcleo; Muse Code (`muse exec`)
                                                                      lo cambia como un usuario sin permisos
                                                                      (si no corre: Forja, Muse + function calling)
                                                                   4. examen NUEVO (semilla aleatoria, held-out) para
                                                                      el núcleo actual y el nuevo, cada uno en el sandbox
  /api/evolve-ci vuelve a revisar el código y el         ◄──────── 5. manda el código nuevo y los resultados
  veredicto: si mejora y no rompe nada, esa versión
  queda ACTIVA para ese usuario (y solo para él)
  Sus exámenes en la app corren ya con su núcleo, en el sandbox
```

## Por qué es válido para el hackathon de Meta

| Paso | Modelo | Llave |
|---|---|---|
| Decide qué cambiar | **Muse Wonder** | la del usuario |
| Escribe el código | **Muse Code**, el agente de terminal de Meta (`muse exec`), o **Forja** (Muse con function calling) | la del usuario |
| Presenta los exámenes | **Muse Spark** | la del usuario |

## Cuándo se adopta una versión nueva

La decide el servidor (`api/_lib/core-rules.js`), no CI ni el agente:

| Caso | Resultado |
|---|---|
| El código rompe las reglas (red, `process`, `import()`, `eval`, imports de fuera, ids memorizados…) | rechazada, ni siquiera se guarda |
| Un escenario baja más de lo permitido, o el núcleo nuevo falla donde el actual no | rechazada |
| Sube menos de 2 aciertos o del 2% del examen | rechazada |
| Mejora y no rompe nada | **activa** para ese usuario |

El usuario puede regresar a cualquier versión suya que haya pasado, o al núcleo de la plataforma. Las versiones no
se borran ni se reescriben (trigger en la migración `0008`).

### Aislamiento y contra las trampas

- **Cada núcleo corre en un sandbox.** En la app y en CI, el núcleo corre en un proceso hijo de Node con el
  *permission model* (`api/_lib/sandbox.js`): solo puede leer su carpeta, su entorno está vacío y no puede lanzar
  procesos ni workers. Para usar el modelo tiene que pedírselo al padre, que lo mide y lo cobra al arnés del usuario.
  Las pruebas (`test/api/sandbox.test.ts`) corren código hostil que se saltó el escaneo y verifican que no puede leer
  archivos, ni el entorno del padre, ni lanzar procesos.
- **La llave viaja una sola vez.** CI la pide con el token de un solo uso de esa corrida (solo su hash vive en la DB)
  y `EVOLVE_CI_SECRET`. Queda en un archivo que el constructor no puede leer y se borra al terminar.
- **El examen no existe cuando el agente escribe el código.** Se genera en cada corrida con una semilla aleatoria, en
  un rango que ningún otro set usa.
- **El constructor no ve al juez.** Trabaja en `/tmp/workshop` como el usuario `builder` del runner, sin `sudo` y sin
  acceso a la home del runner: no ve el repo, ni el banco, ni los generadores, ni la llave guardada.

## Qué tienes que configurar (una vez, ~10 min)

1. **Migración:** GitHub → Actions → `db-migrate` → *Run workflow* (`migrate`). Crea `app.agent_cores` y
   `app.evolve_runs` (`0008`).
2. **Un secreto compartido:** genera uno con `openssl rand -base64 48`. Ponlo como **`EVOLVE_CI_SECRET`** en GitHub
   (Settings → Secrets and variables → Actions → *Secrets*) y en Vercel (Environment Variables). Es lo único que el
   repo necesita: cada corrida usa la llave de Meta de su usuario.
3. **Un token de GitHub para disparar el workflow:** un *fine-grained personal access token* con acceso solo a este
   repo y **Actions: Read and write** (nada más). En Vercel: `AGENT_GH_TOKEN` = ese token y
   `AGENT_GH_REPO` = `AlanJLJ2202/Agentztein`.
4. **El workflow tiene que estar en `main`:** GitHub solo deja disparar `workflow_dispatch` de workflows que están en la
   rama por defecto. Fusiona esta rama.
5. **Opcional, en Vercel:** `EVOLVE_APP_URL`, la URL a la que CI reporta (por defecto el dominio de producción). Los
   *previews* con Vercel Authentication no aceptarían la llamada de CI. `EVOLVE_MAX_USD` (tope por corrida, $2 por
   defecto, nunca más de lo que le queda al usuario en el mes) y `EVOLVE_DAILY_RUNS` (3 por defecto: los minutos de
   Actions son de la plataforma).
6. **Opcional, variables del repo:** `MUSE_INSTALL_URL` (instalador de Muse Code; por defecto
   `https://dev.meta.ai/install.sh`, **verifícalo en la doc oficial de Meta**), `MUSE_INSTALL_SHA256` y
   `MUSE_EXEC_FLAGS` (por defecto `--yolo`; el aislamiento lo da el usuario `builder`).
7. **Prueba:** entra a la app con cualquier cuenta que tenga su llave de Meta → pestaña **Su código** → *Que Muse Wonder
   proponga un cambio* (elige Forja si Muse Code todavía no instala).

## Costo por corrida (con la llave del usuario)

- Wonder propone: una llamada.
- Práctica: 4 llamadas a Spark. Examen: unas 8 llamadas a Spark sobre ~360 registros. Centavos.
- Forja: con tope (55% del tope de la corrida). **Muse Code cobra su propio uso a la llave del usuario y el arnés no lo
  puede medir**; el registro solo incluye lo medido.
- Todo lo medido queda en `app.harness_runs` (`evolve`, `evolve-ci`) y cuenta para su presupuesto mensual.

## El núcleo de la plataforma

Es el v0 con el que arranca todo usuario nuevo y cambia por PR. `agent-gate.yml` examina cada PR que lo toca con las
mismas reglas y el mismo examen nuevo (si el repo tiene el secreto `META_API_KEY`) y deja un comentario; lo fusiona
una persona.

## Riesgos que quedan (honestos)

- **El constructor tiene la llave del usuario.** Muse Code o Forja la necesitan para trabajar; con una guía maliciosa,
  un usuario solo podría gastar su propia llave.
- **El permission model de Node no bloquea la red.** Un núcleo podría abrir conexiones, pero dentro del sandbox no hay
  ninguna llave, entorno ni archivo que mandar.
- **El juez es estadísticamente modesto.** ~360 registros y un umbral de +2% filtran ruido grueso, no diferencias finas.
- **Muse Code en CI no está probado aquí.** Esta sesión no pudo abrir `dev.meta.ai`. Si el instalador o los flags
  cambian, la corrida cae sola en Forja.
- Todo esto sigue siendo sobre los escenarios sintéticos del banco, no sobre SWE-bench u otros benchmarks públicos.
