// The judge's bench: runs one version of the agent's core on an exam and scores it.
//   pnpm evolve:bench --core packages/agent-core --set fresh --seed 123456 --out base.json
//   pnpm evolve:bench --core packages/agent-core --set practice --mistakes --out practice.json
// Needs META_API_KEY. Each core runs in a sandboxed child process without the key; answers are scored here.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { numbered, scoreAnswers } from "../../api/_lib/agent.js";
import { materialize, runSandboxed } from "../../api/_lib/sandbox.js";
import { DEFAULT_FRESH_BATCHES, freshExam, practiceExam, type ExamScenario } from "./exam.js";
import { readCore } from "./gate.js";
import { args, metaCaller, pickModel, takeKey, type Reply, type Req } from "./meta.js";

export const MAX_CALLS = 4;
export const SCENARIO_TIMEOUT_MS = 6 * 60_000;

export type Scores = Record<string, { correct: number; total: number }>;
export type Mistake = { context: string; fields: Record<string, unknown>; truth: string; given: string | null };
export type ScenarioResult = { correct: number; total: number; contexts: Scores; calls: number; error: string | null; mistakes?: Mistake[] };
export type BenchResult = {
  core: { dir: string; version: string; strategy: string };
  set: "fresh" | "practice";
  seed: number | null;
  model: string;
  scenarios: Record<string, ScenarioResult>;
  correct: number;
  total: number;
  calls: number;
  cost: number;
  usage: { input: number; output: number; model: string };
};

/** One task through one core version, in a sandboxed child process (api/_lib/sandbox.js). */
export function runInSandbox(coreDir: string, task: unknown, call: (req: Req) => Promise<Reply>, { maxCalls = MAX_CALLS, timeoutMs = SCENARIO_TIMEOUT_MS } = {}) {
  const { files, problems } = readCore(coreDir);
  if (problems.length) return Promise.resolve({ answers: {}, calls: 0, error: problems.join("; "), version: "", strategy: "" });
  let dir: string;
  try { dir = materialize(files); } catch (err) {
    return Promise.resolve({ answers: {}, calls: 0, error: err instanceof Error ? err.message : String(err), version: "", strategy: "" });
  }
  return runSandboxed(dir, task as Record<string, unknown>, async (r) => call({ ...r, effort: r.effort === undefined ? null : r.effort }), { maxCalls, timeoutMs });
}

/** Scores one core version on every scenario of an exam (scenarios run in parallel). */
export async function runBench(o: {
  coreDir: string;
  exam: ExamScenario[];
  call: (req: Req) => Promise<Reply>;
  set: BenchResult["set"];
  seed: number | null;
  model: string;
  mistakes?: boolean;
  maxCalls?: number;
  timeoutMs?: number;
  cost?: () => number;
  usage?: () => { input: number; output: number };
}): Promise<BenchResult> {
  let version = "";
  let strategy = "";
  const scenarios: Record<string, ScenarioResult> = {};
  await Promise.all(
    o.exam.map(async (sc) => {
      const { rows, batches } = numbered(sc as never, [{ set: "exam", batches: sc.batches }]);
      const task = { scenario: { id: sc.id, title: sc.title, task: sc.task, labels: sc.labels, contexts: sc.contexts }, skills: [], batches };
      const out = await runInSandbox(o.coreDir, task, o.call, { maxCalls: o.maxCalls, timeoutMs: o.timeoutMs });
      version ||= out.version;
      strategy ||= out.strategy;
      const { scores, marked } = scoreAnswers(sc as never, rows, out.answers);
      const contexts = scores.exam ?? {};
      const sum = Object.values(contexts).reduce((a, b) => ({ correct: a.correct + b.correct, total: a.total + b.total }), { correct: 0, total: 0 });
      scenarios[sc.id] = {
        ...sum,
        contexts,
        calls: out.calls,
        error: out.error,
        ...(o.mistakes ? { mistakes: marked.filter((m) => !m.ok).map(({ context, fields, truth, given }) => ({ context, fields, truth, given })) } : {}),
      };
    }),
  );
  const all = Object.values(scenarios);
  return {
    core: { dir: o.coreDir, version, strategy },
    set: o.set,
    seed: o.seed,
    model: o.model,
    scenarios: Object.fromEntries(o.exam.map((s) => [s.id, scenarios[s.id] as ScenarioResult])),
    correct: all.reduce((n, s) => n + s.correct, 0),
    total: all.reduce((n, s) => n + s.total, 0),
    calls: all.reduce((n, s) => n + s.calls, 0),
    cost: o.cost ? Number(o.cost().toFixed(6)) : 0,
    usage: { ...(o.usage ? o.usage() : { input: 0, output: 0 }), model: o.model },
  };
}

async function main() {
  const a = args();
  const key = takeKey();
  const set = a.set === "practice" ? "practice" : "fresh";
  const seed = set === "fresh" ? Number(a.seed ?? Math.floor(Math.random() * 1e9)) : null;
  if (seed !== null && !Number.isFinite(seed)) throw new Error("--seed must be a number");
  const exam = set === "fresh" ? freshExam(seed ?? 0, Number(a.batches ?? DEFAULT_FRESH_BATCHES)) : practiceExam();
  const model = await pickModel(key, "spark");
  const { call, meter } = metaCaller(key, model, { maxUsd: Number(a["max-usd"] ?? 1) });
  const result = await runBench({ coreDir: a.core ?? "packages/agent-core", exam, call, set, seed, model, mistakes: a.mistakes === "true", cost: () => meter.cost, usage: () => ({ input: meter.input, output: meter.output }) });
  const text = JSON.stringify(result, null, 2);
  if (a.out) writeFileSync(a.out, text);
  console.log(`${result.core.version || "?"} · ${set}${seed !== null ? ` (seed ${seed})` : ""} · ${model}: ${result.correct}/${result.total} · ${result.calls} calls · $${result.cost.toFixed(4)}`);
  for (const [id, s] of Object.entries(result.scenarios)) console.log(`  ${id}: ${s.correct}/${s.total}${s.error ? ` · error: ${s.error}` : ""}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
