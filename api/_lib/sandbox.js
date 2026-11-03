// Runs one version of the agent's core in a sandboxed child process. Used by the app for a user's own evolved
// core (code the agent wrote, so it can't be trusted inside the function that holds everyone's keys) and by the
// judge in CI for every version it compares.
//
// The child is a fresh `node` with the permission model: it may read only its own folder (no other files, no
// /proc, no child processes, no workers), its environment is empty, and its only way to a model is to ask the
// parent over IPC. The parent meters every call (limit, cleanRequest) and talks to Meta with the key the child
// never sees. Whatever the child returns is read only as `{ answers }`.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { normalPath, scanFiles } from "./core-rules.js";
import { cleanRequest } from "./solver.js";

const RUNNER = `// written by api/_lib/sandbox.js
const pending = new Map();
let next = 0;
process.on("message", (m) => {
  if (!m || m.type !== "reply") return;
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  if (m.error) p.reject(new Error(m.error)); else p.resolve(m.reply);
});
let version = "", strategy = "";
const done = (msg) => process.send(msg, () => process.exit(0));
try {
  const task = await new Promise((resolve) => process.once("message", (m) => resolve(m.task)));
  const core = await import("./core/src/index.js");
  version = String(core.CORE_VERSION ?? "");
  strategy = String(core.STRATEGY ?? "").slice(0, 600);
  const tools = Object.freeze({
    maxCalls: Number(process.argv[2]) || 3,
    model: (req) => new Promise((resolve, reject) => {
      const id = next++;
      pending.set(id, { resolve, reject });
      process.send({ type: "call", id, req: JSON.parse(JSON.stringify(req ?? null)) });
    }),
  });
  const out = await core.solve(task, tools);
  done({ type: "done", out: JSON.parse(JSON.stringify(out ?? {})), version, strategy });
} catch (err) {
  done({ type: "error", error: String(err && err.message || err).slice(0, 500), version, strategy });
}
`;

/** Node flags for the permission model (stable as --permission since Node 22.13; older 22.x needs --experimental-permission). */
function permissionFlag() {
  const [maj, min] = process.versions.node.split(".").map(Number);
  return (maj ?? 0) > 22 || ((maj ?? 0) === 22 && (min ?? 0) >= 13) ? "--permission" : "--experimental-permission";
}

/**
 * Writes a core given as { path: text } to its own folder under the temp dir (once per content) and returns it.
 * Refuses a core that breaks the rules.
 * @param {Record<string, string>} files
 */
export function materialize(files) {
  const { problems } = scanFiles(files);
  if (problems.length) throw new Error(`This core breaks the rules: ${problems.slice(0, 3).join("; ")}`);
  const hash = createHash("sha256").update(JSON.stringify(Object.entries(files).sort())).digest("hex").slice(0, 24);
  const dir = join(tmpdir(), "agentztein-cores", hash);
  // always (re)written: what runs is exactly the version from the database, even if something touched the folder
  for (const [p, text] of Object.entries(files)) {
    const rel = normalPath(p);
    if (rel === null) throw new Error(`bad path ${p}`);
    const full = join(dir, "core", rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  writeFileSync(join(dir, "package.json"), '{"type":"module"}');
  writeFileSync(join(dir, "runner.mjs"), RUNNER);
  return dir;
}

/**
 * Runs a materialized core on one task.
 * @param {string} dir  a folder made by materialize() (or one with runner.mjs and core/)
 * @param {Record<string, unknown>} task
 * @param {(req: ReturnType<typeof cleanRequest>) => Promise<{ text: string, toolCalls: unknown[], message: unknown }>} call
 * @param {{ maxCalls?: number, timeoutMs?: number }} [opts]
 * @returns {Promise<{ answers: Record<string, string>, calls: number, error: string | null, version: string, strategy: string }>}
 */
export function runSandboxed(dir, task, call, { maxCalls = 3, timeoutMs = 110_000 } = {}) {
  return new Promise((resolve) => {
    let calls = 0;
    let finished = false;
    let stderr = "";
    const child = spawn(
      process.execPath,
      [permissionFlag(), `--allow-fs-read=${dir}`, "--max-old-space-size=256", join(dir, "runner.mjs"), String(maxCalls)],
      { cwd: dir, env: {}, stdio: ["ignore", "ignore", "pipe", "ipc"] },
    );
    /** @param {{ answers: Record<string, string>, error: string | null, version: string, strategy: string }} o */
    const finish = (o) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve({ ...o, calls });
    };
    const timer = setTimeout(() => finish({ answers: {}, error: `timed out after ${Math.round(timeoutMs / 1000)} s`, version: "", strategy: "" }), timeoutMs);
    child.stderr?.on("data", (b) => { if (stderr.length < 4000) stderr += String(b); });
    child.on("message", async (/** @type {any} */ m) => {
      if (m?.type === "call") {
        try {
          if (calls >= maxCalls) throw new Error(`The core used up its ${maxCalls} model calls`);
          calls++;
          const reply = await call(cleanRequest(m.req));
          if (child.connected) child.send({ type: "reply", id: m.id, reply: { text: reply.text, toolCalls: reply.toolCalls ?? [], message: reply.message } });
        } catch (err) {
          if (child.connected) child.send({ type: "reply", id: m.id, error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }
      if (m?.type !== "done" && m?.type !== "error") return;
      /** @type {Record<string, string>} */
      const answers = {};
      const raw = m.out?.answers && typeof m.out.answers === "object" ? m.out.answers : {};
      for (const [n, v] of Object.entries(raw)) if (typeof v === "string") answers[n] = v;
      finish({ answers, error: m.type === "error" ? String(m.error ?? "failed") : null, version: String(m.version ?? ""), strategy: String(m.strategy ?? "") });
    });
    child.on("error", (err) => finish({ answers: {}, error: err.message, version: "", strategy: "" }));
    child.on("exit", (code) => finish({ answers: {}, error: `the core exited (${code})${stderr ? `: ${stderr.split("\n").find((l) => l.includes("Error")) ?? ""}` : ""}`.slice(0, 500), version: "", strategy: "" }));
    child.send({ task });
  });
}
