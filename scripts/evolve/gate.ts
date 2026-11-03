// The merge gate for changes to the agent's own code. The rules live here, outside packages/agent-core, and the
// workflow always runs them from main, so a PR can't loosen the rules that judge it.
//   pnpm evolve:gate classify --files files.txt           → core_changed / other_changed
//   pnpm evolve:gate scan --dir <copy of the PR's agent-core>
//   pnpm evolve:gate decide --files files.txt --scan scan.json [--base base.json --head head.json] --agent true --out report.md
import { lstatSync, readdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BenchResult } from "./bench.js";
import { args } from "./meta.js";

export const CORE_DIR = "packages/agent-core/";
const EXTENSIONS = /\.(js|mjs|json|md)$/;
const MAX_CORE_BYTES = 250_000;

// ── which paths a PR touches ────────────────────────────────────────────────────────────────────

export function classify(files: string[]) {
  const clean = files.map((f) => f.trim()).filter(Boolean);
  return { core: clean.filter((f) => f.startsWith(CORE_DIR)), other: clean.filter((f) => !f.startsWith(CORE_DIR)) };
}

// ── what the core's source may contain ─────────────────────────────────────────────────────────

/** Identifiers that would reach the network, files, processes, secrets or the host's globals. */
const FORBIDDEN: [RegExp, string][] = [
  [/\bprocess\b/, "process"],
  [/\bfetch\b/, "fetch"],
  [/\brequire\s*\(/, "require()"],
  [/\bimport\s*\(/, "dynamic import()"],
  [/\bimport\.meta\b/, "import.meta"],
  [/\bglobalThis\b/, "globalThis"],
  [/\beval\s*\(/, "eval()"],
  [/\bFunction\s*\(/, "Function()"],
  [/\bconstructor\s*\.\s*constructor\b/, "constructor.constructor"],
  [/\b(XMLHttpRequest|WebSocket|EventSource|Deno|Bun|navigator|Worker|SharedArrayBuffer|Atomics)\b/, "host API"],
  [/\b__proto__\b|\bObject\.(setPrototypeOf|defineProperty)\s*\(\s*(Object|Array|String|JSON|Promise|Function)\b/, "patching built-ins"],
  [/\b[ib]_[0-9a-f]{12}\b/, "a bench record id (memorizing)"],
];

/** Code without comments, so a word in a comment doesn't trip the scan (strings stay). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/** Static imports (`import … from "x"`, `export … from "x"`, `import "x"`). */
function importsOf(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\b(?:import|export)\s+(?:[^"'`;]*?\bfrom\s*)?["']([^"']+)["']/g)) out.push(m[1] ?? "");
  return out;
}

/** Problems in one file of the core. `path` is relative to the package (e.g. "src/index.js"). */
export function scanFile(path: string, src: string): string[] {
  const problems: string[] = [];
  if (!EXTENSIONS.test(path)) return [`${path}: only .js, .mjs, .json and .md files are allowed`];
  if (!/\.(js|mjs)$/.test(path)) return problems;
  const isTest = path.startsWith("test/");
  const code = stripComments(src);
  for (const [re, what] of FORBIDDEN) if (re.test(code)) problems.push(`${path}: uses ${what}`);
  for (const spec of importsOf(code)) {
    if (isTest && /^node:(test|assert)(\/strict)?$/.test(spec)) continue;
    if (!spec.startsWith("./") && !spec.startsWith("../")) { problems.push(`${path}: imports "${spec}" (only files of this package)`); continue; }
    const target = posix.normalize(posix.join(posix.dirname(path), spec));
    if (target.startsWith("../") || target === "..") problems.push(`${path}: imports "${spec}", outside the package`);
  }
  return problems;
}

/** Scans a whole copy of the core. */
export function scanDir(dir: string): { files: string[]; problems: string[]; bytes: number } {
  const files: string[] = [];
  const problems: string[] = [];
  let bytes = 0;
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (name === "node_modules") continue;
      const full = join(d, name);
      const rel = relative(dir, full).split("\\").join("/");
      const st = lstatSync(full);
      if (st.isSymbolicLink()) { problems.push(`${rel}: symbolic links are not allowed`); continue; }
      if (st.isDirectory()) { walk(full); continue; }
      files.push(rel);
      bytes += st.size;
      problems.push(...scanFile(rel, readFileSync(full, "utf8")));
    }
  };
  walk(dir);
  if (!files.includes("src/index.js")) problems.push("src/index.js is missing");
  if (bytes > MAX_CORE_BYTES) problems.push(`the core is ${bytes} bytes (max ${MAX_CORE_BYTES})`);
  return { files, problems, bytes };
}

// ── did it get better? ──────────────────────────────────────────────────────────────────────────

/** Points the new version must gain on the whole exam: 2, or 2% of it if that is more (noise between runs). */
export const minGain = (total: number) => Math.max(2, Math.ceil(total * 0.02));
/** Points one scenario may lose before it counts as broken: 1, or 3% of it. */
export const maxDrop = (total: number) => Math.max(1, Math.ceil(total * 0.03));

export type Verdict = { pass: boolean; reason: "improves" | "no-gain" | "regression" | "broken"; gain: number; needed: number; drops: { scenario: string; drop: number; allowed: number }[] };

export function judge(base: BenchResult, head: BenchResult): Verdict {
  const gain = head.correct - base.correct;
  const needed = minGain(base.total);
  const drops = Object.entries(base.scenarios)
    .map(([id, b]) => ({ scenario: id, drop: b.correct - (head.scenarios[id]?.correct ?? 0), allowed: maxDrop(b.total) }))
    .filter((d) => d.drop > d.allowed);
  const broken = Object.values(head.scenarios).some((s) => s.error) && !Object.values(base.scenarios).some((s) => s.error);
  if (broken) return { pass: false, reason: "broken", gain, needed, drops };
  if (drops.length) return { pass: false, reason: "regression", gain, needed, drops };
  if (gain < needed) return { pass: false, reason: "no-gain", gain, needed, drops };
  return { pass: true, reason: "improves", gain, needed, drops };
}

// ── what happens to the PR ──────────────────────────────────────────────────────────────────────

/** merge: the gate merges it · human: a person decides · reject: the check fails · skip: nothing of the core changed */
export type Decision = "merge" | "human" | "reject" | "skip";

export function decide(o: { files: string[]; problems: string[]; verdict: Verdict | null; agentPr: boolean }): { decision: Decision; reasons: string[] } {
  const { core, other } = classify(o.files);
  const reasons: string[] = [];
  if (!core.length) return { decision: "skip", reasons: ["The PR doesn't touch packages/agent-core: the gate has nothing to judge."] };
  if (o.problems.length) return { decision: "reject", reasons: ["The core's code breaks the rules:", ...o.problems.map((p) => `- ${p}`)] };
  if (!o.verdict) return { decision: "reject", reasons: ["The bench did not run."] };
  if (o.verdict.reason === "regression" || o.verdict.reason === "broken") {
    return { decision: "reject", reasons: [o.verdict.reason === "broken" ? "The new core fails where the current one works." : "The new core makes a scenario worse."] };
  }
  if (other.length) reasons.push(`It also touches ${other.length} file(s) outside packages/agent-core: a person has to review it.`);
  if (!o.agentPr) reasons.push("It was not opened by the evolve workflow: its author merges it.");
  if (o.verdict.reason === "no-gain") reasons.push(`It does not improve enough (+${o.verdict.gain}; needs +${o.verdict.needed}).`);
  if (reasons.length) return { decision: "human", reasons };
  return { decision: "merge", reasons: [`It improves (+${o.verdict.gain}, needed +${o.verdict.needed}), breaks nothing and only touches the core.`] };
}

const pct = (c: number, t: number) => (t ? `${((100 * c) / t).toFixed(1)}%` : "—");

/** The PR comment. The marker lets the workflow update the same comment on every push. */
export function report(o: { decision: Decision; reasons: string[]; base: BenchResult | null; head: BenchResult | null; verdict: Verdict | null }): string {
  const title: Record<Decision, string> = {
    merge: "✅ Agent gate: passes, merging",
    human: "🟡 Agent gate: a person decides",
    reject: "⛔ Agent gate: rejected",
    skip: "⚪ Agent gate: nothing to judge",
  };
  const lines = ["<!-- agent-gate -->", `### ${title[o.decision]}`, "", ...o.reasons, ""];
  if (o.base && o.head) {
    lines.push(
      `Fresh exam generated for this run (seed \`${o.head.seed}\`, held-out profile) · model \`${o.head.model}\` · cores run without keys in isolated workers.`,
      "",
      `| Scenario | main (${o.base.core.version || "?"}) | PR (${o.head.core.version || "?"}) | Δ |`,
      "|---|---|---|---|",
      ...Object.keys(o.base.scenarios).map((id) => {
        const b = o.base?.scenarios[id];
        const h = o.head?.scenarios[id];
        const d = (h?.correct ?? 0) - (b?.correct ?? 0);
        return `| ${id} | ${b?.correct ?? 0}/${b?.total ?? 0}${b?.error ? " ⚠" : ""} | ${h?.correct ?? 0}/${h?.total ?? 0}${h?.error ? ` ⚠ ${h.error}` : ""} | ${d > 0 ? "+" : ""}${d} |`;
      }),
      `| **Total** | **${o.base.correct}/${o.base.total}** (${pct(o.base.correct, o.base.total)}) | **${o.head.correct}/${o.head.total}** (${pct(o.head.correct, o.head.total)}) | **${o.verdict && o.verdict.gain > 0 ? "+" : ""}${o.verdict?.gain ?? 0}** |`,
      "",
      `Model calls: ${o.base.calls} → ${o.head.calls} · Meta cost of this judgement: $${(o.base.cost + o.head.cost).toFixed(4)}`,
      "",
      `<details><summary>Strategy</summary>\n\n- main: ${o.base.core.strategy || "—"}\n- PR: ${o.head.core.strategy || "—"}\n</details>`,
    );
  }
  return lines.join("\n");
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────

const readJson = <T>(path: string | undefined): T | null => (path ? (JSON.parse(readFileSync(path, "utf8")) as T) : null);
const readList = (path: string | undefined) => (path ? readFileSync(path, "utf8").split("\n").map((l) => l.trim()).filter(Boolean) : []);
function output(name: string, value: string) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  console.log(`${name}=${value}`);
}

function main() {
  const a = args();
  const cmd = a._ ?? "";
  if (cmd === "classify") {
    const { core, other } = classify(readList(a.files));
    output("core_changed", String(core.length > 0));
    output("other_changed", String(other.length > 0));
    return;
  }
  if (cmd === "scan") {
    const r = scanDir(resolve(a.dir ?? CORE_DIR));
    if (a.out) writeFileSync(a.out, JSON.stringify(r, null, 2));
    for (const p of r.problems) console.log(`✗ ${p}`);
    output("clean", String(r.problems.length === 0));
    return;
  }
  if (cmd === "decide") {
    const files = readList(a.files);
    const problems = readJson<{ problems: string[] }>(a.scan)?.problems ?? [];
    const base = readJson<BenchResult>(a.base);
    const head = readJson<BenchResult>(a.head);
    const verdict = base && head ? judge(base, head) : null;
    const { decision, reasons } = decide({ files, problems, verdict, agentPr: a.agent === "true" });
    const text = report({ decision, reasons, base, head, verdict });
    if (a.out) writeFileSync(a.out, text);
    console.log(text);
    output("decision", decision);
    if (verdict) output("gain", String(verdict.gain));
    if (decision === "reject") process.exitCode = 1;
    return;
  }
  throw new Error("usage: gate.ts classify|scan|decide …");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
