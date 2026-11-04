import type { ScenarioBatch } from "@skillab/contracts";
import { Rng } from "@skillab/env-recon";
import { batchIdFor, materialize, num } from "../common.js";
import type { Policy, Role, ScenarioDefinition } from "../types.js";

/**
 * Terminal, in the style of Terminal-Bench: did the agent complete a task in a container? Like Terminal-Bench, the
 * grade comes from the task's own tests after the run, not from the last command's exit code.
 * Trap: the evaluation server has a hidden 60-second limit; a run that passes its tests too late still fails.
 * Change (R2): that server starts reporting the time in milliseconds.
 */

const CONTEXT = { A: "contenedor_local", B: "servidor_evaluacion" } as const;
const LIMIT_S = 60;
const TASKS = {
  train: ["compilar con make", "configurar nginx", "reparar un git rebase", "extraer un .tar.gz cifrado", "migrar una base SQLite"],
  heldout: ["levantar un servicio con systemd", "entrenar un modelo pequeño", "arreglar permisos de un repo", "parchear un Dockerfile", "recuperar un archivo borrado"],
} as const;
const LAST = ["make test", "pytest -q", "curl -s localhost:8080", "grep -c ERROR app.log", "./run.sh", "git status"];

const opt = (v: unknown) => (typeof v === "number" ? v : Number.NaN);
const role = (b: ScenarioBatch): Role => (b.context === CONTEXT.A ? "A" : "B");
type F = ScenarioBatch["items"][number]["fields"];
const seconds = (f: F, honourR2: boolean) => (honourR2 && typeof f.tiempo_ms === "number" ? f.tiempo_ms / 1000 : opt(f.tiempo_s));

const decide = (timed: (b: ScenarioBatch) => boolean, honourR2: boolean): Policy => (b) =>
  b.items.map((i) => ({
    itemId: i.itemId,
    label: num(i.fields.pruebas_ok) === num(i.fields.pruebas_total) && (!timed(b) || seconds(i.fields, honourR2) <= LIMIT_S) ? "completada" : "fallida",
  }));

export const terminal: ScenarioDefinition = {
  id: "terminal",
  version: "1",
  info: {
    industry: "Benchmark de terminal · estilo Terminal-Bench",
    title: "Calificar tareas de terminal",
    summary: "Decidir si un agente completó una tarea en una terminal Linux, como en Terminal-Bench.",
    problem:
      "La terminal engaña: un comando puede salir con error y la tarea estar bien hecha, o al revés. Lo que cuenta son las pruebas de la tarea, y algunos servidores además ponen límite de tiempo.",
    task: "Marcar cada corrida como completada o fallida con sus pruebas, su código de salida y su tiempo.",
    contexts: {
      A: { id: CONTEXT.A, name: "Contenedor local", rule: "Completada si pasan todas sus pruebas; el tiempo no importa." },
      B: { id: CONTEXT.B, name: "Servidor de evaluación", rule: "Completada si pasan todas sus pruebas en 60 s o menos." },
    },
    labels: [
      { id: "completada", meaning: "La tarea quedó hecha según las reglas del entorno" },
      { id: "fallida", meaning: "La tarea no quedó hecha" },
    ],
    trap: "“Si pasan las pruebas, está completada.” Es correcta en el contenedor local y aprueba en el servidor corridas que se pasaron del tiempo.",
    change: "El servidor empieza a reportar el tiempo en milisegundos. Una regla que lee segundos deja de funcionar, solo ahí.",
    scopedSkill: "“En el servidor de evaluación, más de 60 s es fallida (ojo con la unidad del tiempo)”, solo para ese contexto.",
    whyItMatters: "Terminal-Bench mide si un agente realmente opera una computadora; confiar en el código de salida es el error más común.",
  },
  schemaFor: (r, rules) => (r === "A" ? "tb-local@1" : rules === "R2" ? "tb-server-ms@2" : "tb-server@1"),
  generate: (spec) => {
    const rng = new Rng(spec.seed);
    const schema = terminal.schemaFor(spec.role, spec.rulesVersion);
    const ms = schema === "tb-server-ms@2";
    const n = spec.profile === "heldout" ? rng.int(13, 18) : rng.int(9, 12);
    const kinds: ("good" | "trap" | "bad")[] = [];
    if (spec.role === "B") {
      kinds.push("good", "trap");
      for (let i = rng.int(0, 2); i > 0; i--) kinds.push("trap");
    }
    while (kinds.length < n) kinds.push(rng.next() < 0.6 ? "good" : "bad");

    const rows = rng.shuffle(kinds).map((kind) => {
      const total = rng.int(2, 8);
      const ok = kind === "bad" ? rng.int(0, total - 1) : total;
      const secs = kind === "trap" ? rng.int(75, 300) : spec.role === "B" ? rng.int(3, 50) : rng.int(3, 420);
      const label = ok === total && (spec.role === "A" || secs <= LIMIT_S) ? "completada" : "fallida";
      // the exit code is a distractor: it disagrees with the tests some of the time
      const exit = rng.next() < 0.7 ? (ok === total ? 0 : 1) : rng.pick([0, 1, 2, 127]);
      return {
        label,
        fields: {
          tarea: rng.pick(TASKS[spec.profile]),
          ultimo_comando: rng.pick(LAST),
          codigo_salida: exit,
          pruebas_ok: ok,
          pruebas_total: total,
          ...(ms ? { tiempo_ms: secs * 1000 + rng.int(0, 999) * (secs < LIMIT_S ? 1 : 0) } : { tiempo_s: secs }),
        },
      };
    });
    const batchId = batchIdFor("terminal", terminal.version, spec);
    const { items, truth } = materialize(batchId, rows);
    return { batch: { batchId, scenario: "terminal", context: CONTEXT[spec.role], schemaVersion: schema, rulesVersion: spec.rulesVersion, items }, truth };
  },
  policies: {
    naive: decide(() => false, false),
    legacy: decide((b) => role(b) === "B", false),
    reference: decide((b) => role(b) === "B", true),
  },
};
