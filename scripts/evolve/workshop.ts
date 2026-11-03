// The workshop: a separate folder where the builder (Muse Code, or Forja as fallback) works on a copy of the
// agent's core. It holds only what the builder needs: the core, the practice set with its answers, the latest
// practice mistakes, a brief and a script to try the core. The exams the judge uses, the scorer and the rest of
// the repo are not there. Only the core comes back.
//   pnpm evolve:workshop prepare --out <dir> [--idea idea.md] [--practice practice.json]
//   pnpm evolve:workshop apply --from <dir>
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { numbered } from "../../api/_lib/agent.js";
import type { BenchResult } from "./bench.js";
import { practiceExam } from "./exam.js";
import { CORE_DIR, minGain } from "./gate.js";
import { args } from "./meta.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const COPYABLE = /\.(js|mjs|json|md)$/;

/** Copies the core's files (no node_modules, no links, only allowed extensions). Returns their paths. */
export function copyCore(from: string, to: string): string[] {
  const copied: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = join(d, name);
      const st = lstatSync(full);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { walk(full); continue; }
      const rel = relative(from, full);
      if (!COPYABLE.test(rel)) continue;
      mkdirSync(dirname(join(to, rel)), { recursive: true });
      cpSync(full, join(to, rel));
      copied.push(rel.split("\\").join("/"));
    }
  };
  walk(from);
  return copied.sort();
}

/** The practice set as the core receives it, plus the answers, for tools/try.mjs. */
export function practiceTasks() {
  return practiceExam().map((sc) => {
    const { rows, batches } = numbered(sc as never, [{ set: "practice", batches: sc.batches }]);
    return {
      task: { scenario: { id: sc.id, title: sc.title, task: sc.task, labels: sc.labels, contexts: sc.contexts }, skills: [], batches },
      truth: Object.fromEntries(rows.map((r) => [r.n, r.truth])),
      context: Object.fromEntries(rows.map((r) => [r.n, r.context])),
    };
  });
}

const fieldLine = (f: Record<string, unknown>) => Object.entries(f).map(([k, v]) => `${k}=${typeof v === "number" ? v : JSON.stringify(v)}`).join("; ");

export function brief(o: { idea: string; practice: BenchResult | null; coreVersion: string; strategy: string; examSize: number }): string {
  const p = o.practice;
  const results = p
    ? [
        `Resultado de tu versión actual (${p.core.version || o.coreVersion}) en el set de práctica, con \`${p.model}\`: **${p.correct}/${p.total}**.`,
        "",
        ...Object.entries(p.scenarios).map(([id, s]) => {
          const ms = (s.mistakes ?? []).slice(0, 6).map((m) => `  - [${m.context}] ${fieldLine(m.fields)} → correcta: \`${m.truth}\`; tú dijiste: \`${m.given ?? "(nada)"}\``);
          return [`- **${id}**: ${s.correct}/${s.total}${s.error ? ` (error: ${s.error})` : ""}`, ...ms].join("\n");
        }),
      ].join("\n")
    : "No se midió la práctica en esta corrida. Corre `node tools/try.mjs` para verla.";
  return `# Brief para el constructor de Agentztein

Eres el constructor de **Agentztein**, un agente que se mejora a sí mismo modificando su propio código.
Trabajas en esta carpeta. Tu cuerpo es \`agent-core/\`: es lo único que se conserva al terminar. Todo lo demás de
esta carpeta se descarta, y fuera de ella no hay nada que te sirva.

## Objetivo

Que \`agent-core\` etiquete mejor registros de negocio que **nunca ha visto**. El juez del PR genera un examen
nuevo con una semilla aleatoria (4 escenarios, unas ${o.examSize} filas, perfil *held-out*), corre la versión de
\`main\` y la tuya en workers sin llaves, y solo fusiona tu cambio si sube al menos ${minGain(o.examSize)} aciertos en
total y ningún escenario baja. Memorizar registros no sirve: el examen no existe todavía.

## La hipótesis de esta corrida

${o.idea.trim() || "Ninguna en particular: encuentra la debilidad más grande en tus errores de práctica y corrígela en código."}

## Dónde estás hoy

- Versión: \`${o.coreVersion}\`
- Estrategia: ${o.strategy}

${results}

## Qué puedes cambiar (ideas, no obligaciones)

- Cómo armas el prompt y cómo lees la respuesta (\`agent-core/src/\`).
- Herramientas propias con *function calling* de Meta: por ejemplo, una calculadora, conversión de unidades o
  diferencias de fechas, escritas en JS puro dentro del paquete. Pasa \`tools\` en \`tools.model({...})\`, ejecuta
  tú la llamada y devuelve el resultado con un mensaje \`{ role: "tool", tool_call_id, content }\`.
- Varias pasadas (verificar, votar, separar por lote) sin pasarte de **3 llamadas al modelo por tarea** (la app
  da 3 y el juez 4; si te pasas, la llamada falla).
- \`effort\` de razonamiento por llamada (\`minimal\` … \`xhigh\`).
- Las skills del usuario (\`task.skills\`) son reglas aprendidas: síguelas cuando existan. En el examen del juez
  no hay skills, así que tu código tiene que rendir también sin ellas.

## Reglas (el juez las revisa; si no se cumplen, rechaza el PR)

Lee \`agent-core/README.md\`. En corto: solo \`.js/.mjs/.json/.md\` dentro de \`agent-core/\`; nada de \`fetch\`,
\`process\`, \`require\`, \`import()\` dinámico, \`eval\`, \`Function\`, \`globalThis\` ni imports de fuera del paquete;
las pruebas solo importan \`node:test\` y \`node:assert\`; nunca ids de registros.

## Cómo trabajar

1. Lee \`agent-core/README.md\`, \`agent-core/src/\` y \`agent-core/test/\`.
2. Haz **un** cambio con una hipótesis clara. Mejor uno pequeño que funcione que uno grande que no.
3. \`node --test agent-core/test/*.test.mjs\` tiene que quedar en verde (agrega pruebas para lo nuevo).
4. Prueba con el modelo real: \`node tools/try.mjs\` (usa META_API_KEY, cuesta centavos; máximo 3 veces).
5. Sube \`CORE_VERSION\` y actualiza \`STRATEGY\` en \`agent-core/src/index.js\`.
6. Escribe \`CHANGES.md\` en esta carpeta: primera línea = título corto del PR; luego **Hipótesis**,
   **Qué cambié**, **Evidencia** (lo que dio \`try.mjs\` antes y después) y **Riesgos**.
`;
}

const TRY = `// Tries agent-core on the practice set with the real model. Usage: node tools/try.mjs [scenario]
// Needs META_API_KEY. Prints the score per scenario and a few mistakes. Same call limit as the app (3 per task).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const here = new URL("..", import.meta.url);
const cfg = JSON.parse(readFileSync(new URL("config.json", here), "utf8"));
const tasks = JSON.parse(readFileSync(new URL("practice.json", here), "utf8"));
const key = process.env.META_API_KEY;
if (!key) { console.error("META_API_KEY is missing"); process.exit(1); }
const only = process.argv[2];
const core = await import(pathToFileURL(new URL("agent-core/src/index.js", here).pathname).href + "?t=" + Date.now());

async function call(req) {
  const messages = req.messages ?? [{ role: "system", content: req.system ?? "" }, { role: "user", content: req.user ?? "" }];
  const body = { model: cfg.model, messages, ...(req.tools?.length ? { tools: req.tools.map((t) => ({ type: "function", function: t })) } : {}), ...(req.effort ? { reasoning_effort: req.effort } : {}) };
  const res = await fetch("https://api.meta.ai/v1/chat/completions", { method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error("Meta answered " + res.status + ": " + (await res.text()).slice(0, 300));
  const j = await res.json();
  const m = j.choices?.[0]?.message ?? {};
  const raw = Array.isArray(m.tool_calls) ? m.tool_calls : [];
  return {
    text: typeof m.content === "string" ? m.content : "",
    toolCalls: raw.map((c) => ({ id: String(c.id ?? ""), name: String(c.function?.name ?? ""), arguments: typeof c.function?.arguments === "string" ? c.function.arguments : JSON.stringify(c.function?.arguments ?? {}) })),
    message: { role: "assistant", content: typeof m.content === "string" && m.content ? m.content : null, ...(raw.length ? { tool_calls: raw } : {}) },
  };
}

let correct = 0, total = 0;
for (const t of tasks) {
  if (only && t.task.scenario.id !== only) continue;
  let calls = 0;
  const tools = Object.freeze({ maxCalls: 3, model: async (req) => { if (++calls > 3) throw new Error("used up 3 model calls"); return call(req); } });
  let answers = {};
  try { answers = (await core.solve(structuredClone(t.task), tools))?.answers ?? {}; } catch (e) { console.log(t.task.scenario.id + ": core error: " + e.message); }
  const ns = Object.keys(t.truth);
  const wrong = ns.filter((n) => answers[n] !== t.truth[n]);
  correct += ns.length - wrong.length; total += ns.length;
  console.log(t.task.scenario.id + ": " + (ns.length - wrong.length) + "/" + ns.length + " · " + calls + " calls");
  for (const n of wrong.slice(0, 4)) console.log("  #" + n + " [" + t.context[n] + "] right: " + t.truth[n] + " · yours: " + (answers[n] ?? "(none)"));
}
console.log("TOTAL " + correct + "/" + total);
`;

export function prepare(o: { out: string; idea: string; practice: BenchResult | null; model: string }) {
  rmSync(o.out, { recursive: true, force: true });
  mkdirSync(join(o.out, "tools"), { recursive: true });
  copyCore(join(ROOT, CORE_DIR), join(o.out, "agent-core"));
  const src = readFileSync(join(ROOT, CORE_DIR, "src/index.js"), "utf8");
  const coreVersion = /CORE_VERSION\s*=\s*"([^"]+)"/.exec(src)?.[1] ?? "?";
  const strategy = /STRATEGY\s*=\s*\n?\s*"([^"]+)"/.exec(src)?.[1] ?? "—";
  writeFileSync(join(o.out, "practice.json"), JSON.stringify(practiceTasks()));
  writeFileSync(join(o.out, "config.json"), JSON.stringify({ model: o.model }, null, 2));
  writeFileSync(join(o.out, "tools/try.mjs"), TRY);
  writeFileSync(join(o.out, "package.json"), JSON.stringify({ name: "agentztein-workshop", private: true, type: "module" }, null, 2));
  writeFileSync(join(o.out, "BRIEF.md"), brief({ idea: o.idea, practice: o.practice, coreVersion, strategy, examSize: 4 * 6 * 15 }));
  // AGENTS.md is the file coding agents read on their own; it points at the brief.
  writeFileSync(join(o.out, "AGENTS.md"), "Lee BRIEF.md: ahí está tu tarea, tus reglas y cómo probar. Solo se conserva agent-core/ y CHANGES.md.\n");
}

/** Puts the workshop's core back into the repo (replacing packages/agent-core). Returns the files it wrote. */
export function apply(from: string): string[] {
  const src = join(from, "agent-core");
  if (!existsSync(join(src, "src/index.js"))) throw new Error("The workshop has no agent-core/src/index.js");
  const dest = join(ROOT, CORE_DIR);
  rmSync(join(dest, "src"), { recursive: true, force: true });
  rmSync(join(dest, "test"), { recursive: true, force: true });
  return copyCore(src, dest);
}

function main() {
  const a = args();
  if (a._ === "prepare") {
    if (!a.out) throw new Error("--out <dir>");
    const practice = a.practice && existsSync(a.practice) ? (JSON.parse(readFileSync(a.practice, "utf8")) as BenchResult) : null;
    const idea = a.idea && existsSync(a.idea) ? readFileSync(a.idea, "utf8") : "";
    prepare({ out: resolve(a.out), idea, practice, model: a.model ?? practice?.model ?? process.env.META_MODEL ?? "muse-spark-1.1" });
    console.log(`workshop ready in ${a.out}`);
    return;
  }
  if (a._ === "apply") {
    if (!a.from) throw new Error("--from <dir>");
    const files = apply(resolve(a.from));
    console.log(`applied ${files.length} files to ${CORE_DIR}`);
    return;
  }
  throw new Error("usage: workshop.ts prepare|apply …");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
