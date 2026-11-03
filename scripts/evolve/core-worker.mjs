// Runs one version of the agent's core (packages/agent-core) in its own worker thread, for the judge.
// The worker gets an empty environment (no keys), its own globals (it can't patch the scorer's) and a single way
// out: `tools.model`, which asks the parent. The parent meters every call, talks to Meta and scores the answers.
import { parentPort, workerData } from "node:worker_threads";
import { pathToFileURL } from "node:url";

if (!parentPort) throw new Error("core-worker must run as a worker thread");
const port = parentPort;
/** @type {Map<number, { resolve: (v: unknown) => void, reject: (e: Error) => void }>} */
const pending = new Map();
let next = 0;
port.on("message", (/** @type {any} */ m) => {
  if (m?.type !== "reply") return;
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  if (m.error) p.reject(new Error(m.error));
  else p.resolve(m.reply);
});

let version = "";
let strategy = "";
try {
  const core = await import(pathToFileURL(workerData.entry).href);
  version = String(core.CORE_VERSION ?? "");
  strategy = String(core.STRATEGY ?? "").slice(0, 400);
  const tools = Object.freeze({
    maxCalls: workerData.maxCalls,
    model: (/** @type {unknown} */ req) =>
      new Promise((resolve, reject) => {
        const id = next++;
        pending.set(id, { resolve, reject });
        port.postMessage({ type: "call", id, req: JSON.parse(JSON.stringify(req ?? null)) });
      }),
  });
  const out = await core.solve(workerData.task, tools);
  port.postMessage({ type: "done", out: JSON.parse(JSON.stringify(out ?? {})), version, strategy });
} catch (err) {
  port.postMessage({ type: "error", error: String(err instanceof Error ? err.message : err).slice(0, 500), version, strategy });
}
