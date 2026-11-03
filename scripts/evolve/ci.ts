// The evolve workflow's side of /api/evolve-ci: one user's run, with that user's own Meta key.
//   pnpm evolve:ci start --out <dir>     fetch the run (key → <dir>/key, masked in the logs first), its base core and idea
//   pnpm evolve:ci stage --stage judging
//   pnpm evolve:ci fail --stage build --error "…"
//   pnpm evolve:ci finish --candidate <core dir> --base base.json --head head.json [--practice p.json] [--changes CHANGES.md] [--builder forja] [--usage a.json,b.json]
// Reads EVOLVE_APP_URL, EVOLVE_RUN_ID, EVOLVE_RUN_TOKEN and EVOLVE_CI_SECRET from the environment.
import { appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalPath } from "../../api/_lib/core-rules.js";
import { CORE_DIR, readCore } from "./gate.js";
import { args } from "./meta.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function env(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is missing`);
  return v;
}

export async function callApp(op: string, body: Record<string, unknown> = {}, fetchImpl: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const app = env("EVOLVE_APP_URL").replace(/\/+$/, "");
  if (!/^https:\/\//.test(app) && !/^http:\/\/localhost[:/]/.test(app)) throw new Error("EVOLVE_APP_URL must be https");
  const res = await fetchImpl(`${app}/api/evolve-ci`, {
    method: "POST",
    headers: { authorization: `Bearer ${env("EVOLVE_CI_SECRET")}`, "content-type": "application/json" },
    body: JSON.stringify({ op, runId: env("EVOLVE_RUN_ID"), token: env("EVOLVE_RUN_TOKEN"), ...body }),
    signal: AbortSignal.timeout(30_000),
  });
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`The app answered ${res.status}: ${String(out.error ?? "")}`);
  return out;
}

function output(name: string, value: string) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

/** Writes a core given as { path: text } to a folder. */
export function writeCore(files: Record<string, string>, dir: string) {
  for (const [p, text] of Object.entries(files)) {
    const rel = normalPath(p);
    if (rel === null || typeof text !== "string") throw new Error(`bad file ${p}`);
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
}

type Usage = { input?: number; output?: number; cost?: number; model?: string };
const readUsage = (paths: string[]): Required<Usage> =>
  paths.filter((p) => p && existsSync(p)).reduce<Required<Usage>>((acc, p) => {
    const u = JSON.parse(readFileSync(p, "utf8")) as { usage?: Usage; cost?: number; model?: string };
    const x = u.usage ?? u;
    return { input: acc.input + (Number(x.input) || 0), output: acc.output + (Number(x.output) || 0), cost: acc.cost + (Number(u.cost ?? x.cost) || 0), model: acc.model || String(u.model ?? x.model ?? "") };
  }, { input: 0, output: 0, cost: 0, model: "" });

async function main() {
  const a = args();
  if (a._ === "start") {
    const out = resolve(a.out ?? "run");
    const ciUrl = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : undefined;
    const r = await callApp("start", { ciUrl });
    const key = String(r.key ?? "");
    if (!key) throw new Error("The app sent no key");
    // mask first, before anything else could print it
    console.log(`::add-mask::${key}`);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "key"), key, { mode: 0o600 });
    chmodSync(join(out, "key"), 0o600);
    const { key: _k, base, ...rest } = r as { key: string; base: { files: Record<string, string>; version: number } | null } & Record<string, unknown>;
    writeFileSync(join(out, "run.json"), JSON.stringify({ ...rest, baseVersion: base?.version ?? 0 }, null, 2));
    const p = (rest.proposal ?? {}) as Record<string, string>;
    writeFileSync(join(out, "idea.md"), [`**${p.title ?? ""}**`, p.hypothesis && `**Hipótesis.** ${p.hypothesis}`, p.plan && `**Plan.** ${p.plan}`, p.source && `**De dónde salió.** ${p.source}`].filter(Boolean).join("\n\n"));
    const coreDir = join(out, "base-core");
    if (base?.files) writeCore(base.files, coreDir);
    else cpSync(join(ROOT, CORE_DIR), coreDir, { recursive: true, filter: (s) => !s.includes("node_modules") });
    output("builder", String(rest.builder ?? "muse-code"));
    output("executor", String(rest.executor ?? ""));
    output("planner", String(rest.planner ?? ""));
    output("max_usd", String(rest.maxUsd ?? 1));
    console.log(`run ${env("EVOLVE_RUN_ID")}: base core v${base?.version ?? 0}, builder ${String(rest.builder)}, cap $${String(rest.maxUsd)}`);
    return;
  }
  if (a._ === "stage") { await callApp("stage", { stage: a.stage ?? "" }); return; }
  if (a._ === "fail") { await callApp("fail", { stage: a.stage ?? "", error: a.error ?? "The run failed" }); return; }
  if (a._ === "finish") {
    const { files, problems } = readCore(resolve(a.candidate ?? "."));
    if (problems.length) throw new Error(problems.join("; "));
    const json = (p?: string) => (p && existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
    const base = json(a.base);
    const head = json(a.head);
    const practice = json(a.practice);
    const usage = readUsage((a.usage ?? "").split(","));
    const r = await callApp("finish", {
      files,
      changes: a.changes && existsSync(a.changes) ? readFileSync(a.changes, "utf8") : "",
      builder: a.builder ?? "muse-code",
      base,
      head,
      practice: practice ? { correct: practice.correct, total: practice.total, version: practice.core?.version } : null,
      usage,
    });
    console.log(`the app says: ${String(r.status)} ${JSON.stringify(r.verdict)}`);
    return;
  }
  throw new Error("usage: ci.ts start|stage|fail|finish …");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
