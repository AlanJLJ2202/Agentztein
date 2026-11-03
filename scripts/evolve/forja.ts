// Forja: the fallback builder. If Muse Code can't run in the runner, this small coding agent does the same job
// with Meta's function calling: it reads BRIEF.md and edits the workshop's agent-core with five tools. It can only
// write inside agent-core/ (and CHANGES.md), and it runs the core's tests and tools/try.mjs, nothing else.
//   pnpm evolve:forja --dir <workshop> [--max-turns 40] [--max-usd 2]
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { args, metaCaller, pickModel, takeKey, type Reply, type Req } from "./meta.js";

const run = promisify(execFile);

export const FORJA_TOOLS = [
  { name: "list_files", description: "Lists the files under a folder of the workshop.", parameters: { type: "object", properties: { path: { type: "string", description: "Folder, e.g. agent-core" } }, required: ["path"] } },
  { name: "read_file", description: "Reads a text file of the workshop.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "write_file", description: "Writes a whole file. Only under agent-core/ or CHANGES.md.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
  { name: "run", description: "Runs one check: 'test' (node --test of the core) or 'try' (the core on the practice set with the real model; costs cents, at most 3 times).", parameters: { type: "object", properties: { what: { type: "string", enum: ["test", "try"] } }, required: ["what"] } },
  { name: "finish", description: "Call it when CHANGES.md is written and the tests pass.", parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] } },
];

const SYSTEM = `You are Forja, the builder of Agentztein, an agent that improves itself by changing its own code.
Work only through the tools. Read BRIEF.md first and follow it exactly. Make one focused change in agent-core/src with a
clear hypothesis, add or update tests in agent-core/test, run "test" until green, use "try" to measure (at most 3 times),
bump CORE_VERSION and STRATEGY, write CHANGES.md (first line = short PR title; then Hipótesis, Qué cambié, Evidencia,
Riesgos, in Spanish), then call finish. Never write outside agent-core/ or CHANGES.md.`;

/** A path inside the workshop, or an error. `write` limits it to agent-core/ and CHANGES.md. */
export function safePath(root: string, p: string, write = false): string {
  const full = resolve(root, String(p ?? ""));
  const rel = relative(root, full);
  if (rel.startsWith("..") || rel === "" && write) throw new Error("outside the workshop");
  if (write && !(rel === "CHANGES.md" || rel.startsWith(`agent-core${sep}`))) throw new Error("you may only write under agent-core/ or CHANGES.md");
  return full;
}

export async function tool(root: string, name: string, input: Record<string, unknown>, state: { tries: number }, key: string): Promise<string> {
  if (name === "list_files") {
    const dir = safePath(root, String(input.path ?? "."));
    const out: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        if (n === "node_modules" || n.startsWith(".")) continue;
        const f = join(d, n);
        if (statSync(f).isDirectory()) walk(f);
        else out.push(relative(root, f));
      }
    };
    walk(dir);
    return out.slice(0, 200).join("\n") || "(empty)";
  }
  if (name === "read_file") {
    const f = safePath(root, String(input.path ?? ""));
    if (!existsSync(f)) return "no such file";
    const text = readFileSync(f, "utf8");
    return text.length > 60_000 ? `${text.slice(0, 60_000)}\n… (cut)` : text;
  }
  if (name === "write_file") {
    const f = safePath(root, String(input.path ?? ""), true);
    const content = String(input.content ?? "");
    if (content.length > 120_000) return "too long";
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, content);
    return `wrote ${relative(root, f)} (${content.length} chars)`;
  }
  if (name === "run") {
    const what = input.what === "try" ? "try" : "test";
    if (what === "try" && ++state.tries > 3) return "try already used 3 times";
    const files = what === "test" ? readdirSync(join(root, "agent-core/test")).filter((f) => f.endsWith(".test.mjs")).map((f) => join("agent-core/test", f)) : [];
    const cmd = what === "test" ? ["--test", ...files] : ["tools/try.mjs"];
    try {
      // The code being run was written by the model: the tests get no key (try.mjs gets it, as it calls the
      // model), and in CI it all runs as an unprivileged user that can't read the repo (FORJA_RUN_AS).
      const vars = [`PATH=${process.env.PATH ?? ""}`, ...(what === "try" ? [`META_API_KEY=${key}`] : [])];
      const as = process.env.FORJA_RUN_AS;
      const [bin, argv] = as
        ? ["sudo", ["-n", "-u", as, "env", "-i", ...vars, `HOME=/home/${as}`, process.execPath, ...cmd]]
        : [process.execPath, cmd];
      const env: NodeJS.ProcessEnv = as ? { PATH: process.env.PATH } : { PATH: process.env.PATH, HOME: process.env.HOME, ...(what === "try" ? { META_API_KEY: key } : {}) };
      const { stdout, stderr } = await run(bin, argv as string[], { cwd: root, timeout: what === "try" ? 600_000 : 120_000, env, maxBuffer: 4_000_000 });
      return `${stdout}${stderr}`.slice(-6000) || "ok";
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message: string };
      return `FAILED\n${`${e.stdout ?? ""}${e.stderr ?? ""}` || e.message}`.slice(-6000);
    }
  }
  return `unknown tool ${name}`;
}

export async function forja(o: { dir: string; call: (req: Req) => Promise<Reply>; key: string; maxTurns?: number; log?: (s: string) => void }) {
  const root = resolve(o.dir);
  const log = o.log ?? (() => {});
  const messages: Record<string, unknown>[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `The brief:\n\n${readFileSync(join(root, "BRIEF.md"), "utf8")}` },
  ];
  const state = { tries: 0 };
  for (let turn = 0; turn < (o.maxTurns ?? 40); turn++) {
    const reply = await o.call({ messages, tools: FORJA_TOOLS, effort: "high" });
    messages.push(reply.message);
    if (!reply.toolCalls.length) {
      messages.push({ role: "user", content: "Use the tools. When you are done, call finish." });
      continue;
    }
    for (const c of reply.toolCalls) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(c.arguments || "{}"); } catch { /* bad arguments: the tool reports it */ }
      if (c.name === "finish") {
        log(`finish: ${String(input.summary ?? "")}`);
        return { finished: true, turns: turn + 1, summary: String(input.summary ?? "") };
      }
      let result: string;
      try { result = await tool(root, c.name, input, state, o.key); } catch (err) { result = `error: ${err instanceof Error ? err.message : String(err)}`; }
      log(`${c.name}(${JSON.stringify(input).slice(0, 120)}) → ${result.split("\n")[0]?.slice(0, 120)}`);
      messages.push({ role: "tool", tool_call_id: c.id, content: result });
    }
  }
  return { finished: false, turns: o.maxTurns ?? 40, summary: "" };
}

async function main() {
  const a = args();
  const key = takeKey();
  const model = await pickModel(key, "wonder").catch(() => pickModel(key, "spark"));
  const { call, meter } = metaCaller(key, model, { maxUsd: Number(a["max-usd"] ?? 2), timeoutMs: 180_000 });
  console.log(`Forja with ${model}`);
  const out = await forja({ dir: a.dir ?? ".", call, key, maxTurns: Number(a["max-turns"] ?? 40), log: (s) => console.log(s) });
  console.log(`${out.finished ? "finished" : "stopped"} after ${out.turns} turns · ${meter.calls} calls · $${meter.cost.toFixed(4)}`);
  if (a["usage-out"]) writeFileSync(a["usage-out"], JSON.stringify({ usage: { input: meter.input, output: meter.output }, cost: meter.cost, model }));
  if (!out.finished) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
