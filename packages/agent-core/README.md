# agent-core: el cuerpo de Agentztein

Este paquete es **la parte del agente que el propio agente puede reescribir**. Lo demás del repositorio (la app,
el banco de pruebas, el calificador, el arnés, los workflows) es el anfitrión y el juez, y el agente no lo toca
(ver `docs/EVOLVE.md` y ADR-026).

Lo usan dos anfitriones:

- La app (`/api/agent`), cada vez que el ejecutor presenta un examen en un ciclo de mejora.
- El juez del PR (`scripts/evolve/bench.ts` en el workflow `agent-gate`), que compara la versión de `main`
  contra la del PR en un examen nuevo, generado con una semilla secreta que nadie ve.

## El contrato

```js
export async function solve(task, tools) → { answers: { "1": "etiqueta", ... }, notes? }
export const CORE_VERSION  // súbela con cada cambio
export const STRATEGY      // una o dos frases sobre cómo resuelve hoy
```

- `task.scenario`: tarea, etiquetas permitidas y contextos (nombres, no reglas).
- `task.skills`: las skills activas del usuario, una por contexto (pueden faltar).
- `task.batches`: lotes, cada uno de un contexto, con filas `{ n, fields }`.
- `tools.model(req)`: la única salida al mundo. `req` acepta `system`, `user`, `messages`, `effort`
  (`minimal` … `xhigh`) y `tools` (function calling de la Meta Model API: `{ name, description, parameters }`).
  Devuelve `{ text, toolCalls, message }`. Si pides herramientas, tú ejecutas la llamada (con tu propio código,
  aquí dentro) y le devuelves el resultado con un mensaje `{ role: "tool", tool_call_id, content }`.
- `tools.maxCalls`: cuántas llamadas al modelo te deja el anfitrión en esta tarea. Si te pasas, la llamada falla.

## Reglas (el juez las revisa y rechaza el PR si no se cumplen)

1. Solo archivos `.js`, `.mjs`, `.json` y `.md` dentro de `packages/agent-core/`.
2. Nada de red, archivos, procesos ni variables de entorno: sin `fetch`, `process`, `require`, `import()`
   dinámico, `eval`, `Function`, `globalThis` ni imports de fuera del paquete (tampoco `node:`).
   Las pruebas en `test/` pueden importar solo `node:test` y `node:assert`.
3. Nunca memorices registros, ids ni respuestas. El juez te examina con registros que no existían cuando
   escribiste el código.
4. Deja `node --test test/*.test.mjs` en verde y sube `CORE_VERSION`.

## Cómo se acepta un cambio

El PR se fusiona solo si: toca únicamente este paquete, pasa `pnpm check`, el examen nuevo sube al menos
2 aciertos en total y ningún escenario baja más de 1. Si toca cualquier otra cosa, espera a una persona.
