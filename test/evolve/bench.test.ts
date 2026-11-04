// The judge's bench and the builder's workshop, with a fake Meta: fresh exams, each core in a sandboxed process without keys,
// the call limit, and Forja editing a copy of the core with function calling.
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runBench, runInSandbox } from "../../scripts/evolve/bench.js";
import { freshExam, freshSeed, practiceExam } from "../../scripts/evolve/exam.js";
import { forja, safePath } from "../../scripts/evolve/forja.js";
import type { Reply, Req } from "../../scripts/evolve/meta.js";
import { args, takeKey } from "../../scripts/evolve/meta.js";
import { brief, copyCore, prepare, practiceTasks } from "../../scripts/evolve/workshop.js";
import { EVALSET } from "../../api/_data/evalset.js";

const CORE = resolve("packages/agent-core");
const reply = (text: string): Reply => ({ text, toolCalls: [], message: { role: "assistant", content: text } });

/** A fake model that knows the truth of an exam and gets every `every`-th row right. */
function oracle(exam: ReturnType<typeof freshExam>, every: number) {
  const calls: Req[] = [];
  const call = async (req: Req) => {
    calls.push(req);
    const prompt = req.user ?? "";
    const sc = exam.find((s) => prompt.includes(s.task));
    let n = 0;
    const answers: Record<string, string> = {};
    for (const b of sc?.batches ?? []) for (const t of b.truth) { n++; answers[String(n)] = n % every === 0 ? t : "?"; }
    return reply(JSON.stringify({ answers }));
  };
  return { call, calls };
}

describe("fresh exams", () => {
  it("are new records in their own seed range, the same for the same seed", () => {
    const a = freshExam(123, 2);
    const b = freshExam(123, 2);
    const c = freshExam(124, 2);
    expect(a.map((s) => s.id)).toEqual(["codigo", "terminal", "razonamiento", "web", "investigacion"]);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(c));
    // never one of the bench's records
    const known = new Set(JSON.stringify(EVALSET).match(/i_[0-9a-f]{12}/g));
    for (const s of a) for (const bt of s.batches) for (const it of bt.items) expect(known.has(it.id)).toBe(false);
    expect(new Set(a[0]?.batches.map((x) => x.context)).size).toBe(2);
    expect(freshSeed(123, "codigo", 0) % 1_000_000).toBeGreaterThanOrEqual(500_000);
    expect(practiceExam()[0]?.batches.length).toBe(4);
  });
});

describe("the bench", () => {
  it("runs the real core in a worker and scores it with answers it never saw", async () => {
    const exam = freshExam(5, 2);
    const { call, calls } = oracle(exam, 2);
    const r = await runBench({ coreDir: CORE, exam, call, set: "fresh", seed: 5, model: "fake", mistakes: true });
    expect(r.core.version).toMatch(/^core@/);
    expect(calls).toHaveLength(5);
    expect(calls[0]?.user).not.toMatch(/truth|i_[0-9a-f]{12}/);
    expect(r.total).toBe(exam.reduce((n, s) => n + s.batches.reduce((m, b) => m + b.items.length, 0), 0));
    expect(r.correct).toBeGreaterThan(r.total * 0.3);
    expect(r.correct).toBeLessThan(r.total * 0.7);
    expect(r.scenarios.codigo?.mistakes?.length).toBeGreaterThan(0);
  });

  it("enforces the core's call limit and survives a crash, a hang or a core that breaks the rules", async () => {
    const dir = mkdtempSync(join(tmpdir(), "core-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/index.js"), `export const CORE_VERSION = "core@x";
export async function solve(task, tools) {
  if (task.scenario.id === "crash") throw new Error("boom");
  if (task.scenario.id === "hang") await new Promise(() => {});
  for (let i = 0; i < 9; i++) { try { await tools.model({ user: "hola" }); } catch (e) { return { answers: { "1": "ok" }, notes: e.message }; } }
  return { answers: {} };
}`);
    let n = 0;
    const out = await runInSandbox(dir, { scenario: { id: "ok" } }, async () => { n++; return reply("x"); }, { maxCalls: 2 });
    expect(n).toBe(2);
    expect(out).toMatchObject({ calls: 2, answers: { 1: "ok" }, version: "core@x", error: null });
    expect((await runInSandbox(dir, { scenario: { id: "crash" } }, async () => reply("x"))).error).toBe("boom");
    expect((await runInSandbox(dir, { scenario: { id: "hang" } }, async () => reply("x"), { timeoutMs: 1500 })).error).toMatch(/timed out/);
    writeFileSync(join(dir, "src/index.js"), "export const k = process.env;");
    expect((await runInSandbox(dir, { scenario: { id: "ok" } }, async () => reply("x"))).error).toMatch(/uses process/);
  });
});

describe("Meta in CI", () => {
  it("takes the key out of the environment", () => {
    const env: NodeJS.ProcessEnv = { META_API_KEY: " LLM_abc " };
    expect(takeKey(env)).toBe("LLM_abc");
    expect(env.META_API_KEY).toBeUndefined();
    expect(() => takeKey({})).toThrow(/META_API_KEY/);
    expect(args(["decide", "--files", "f.txt", "--agent", "true", "--mistakes"])).toEqual({ _: "decide", files: "f.txt", agent: "true", mistakes: "true" });
  });
});

describe("the workshop", () => {
  it("holds only the core, the practice set, a brief and a way to try", () => {
    const out = mkdtempSync(join(tmpdir(), "ws-"));
    prepare({ out, idea: "**Votar entre dos pasadas**", practice: null, model: "muse-spark-1.3" });
    for (const f of ["agent-core/src/index.js", "agent-core/README.md", "practice.json", "BRIEF.md", "AGENTS.md", "tools/try.mjs", "config.json"]) expect(existsSync(join(out, f)), f).toBe(true);
    expect(existsSync(join(out, "api"))).toBe(false);
    const b = readFileSync(join(out, "BRIEF.md"), "utf8");
    expect(b).toContain("Votar entre dos pasadas");
    expect(b).toMatch(/core@\d/);
    const tasks = practiceTasks();
    expect(tasks).toHaveLength(5);
    expect(JSON.stringify(tasks[0]?.task)).not.toContain("truth");
    expect(Object.keys(tasks[0]?.truth ?? {}).length).toBeGreaterThan(10);
    // the practice set only: no validation or sealed record reaches the workshop
    const sealed = (JSON.stringify((EVALSET.scenarios as Record<string, { sets: { sealed: unknown } }>).codigo?.sets.sealed).match(/"repositorio":"[^"]+"/g) ?? []).slice(0, 3);
    expect(sealed).toHaveLength(3);
    expect(sealed.some((m) => readFileSync(join(out, "practice.json"), "utf8").includes(m))).toBe(false);
  });

  it("puts the practice mistakes in the brief", () => {
    const text = brief({
      idea: "",
      coreVersion: "core@1",
      strategy: "una llamada",
      examSize: 360,
      practice: { core: { dir: "", version: "core@1", strategy: "" }, set: "practice", seed: null, model: "muse-spark-1.3", correct: 30, total: 40, calls: 4, cost: 0.01,
        scenarios: { envios: { correct: 5, total: 9, contexts: {}, calls: 1, error: null, mistakes: [{ context: "local", fields: { peso: 3 }, truth: "tarifa_a", given: "tarifa_b" }] } } },
    });
    expect(text).toContain("**30/40**");
    expect(text).toContain("[local] peso=3 → correcta: `tarifa_a`; tú dijiste: `tarifa_b`");
    expect(text).toContain("sube al menos 8 aciertos");
  });

  it("copies only allowed files back", () => {
    const from = mkdtempSync(join(tmpdir(), "from-"));
    mkdirSync(join(from, "src"));
    mkdirSync(join(from, "node_modules"));
    writeFileSync(join(from, "src/index.js"), "x");
    writeFileSync(join(from, "src/run.sh"), "rm -rf /");
    writeFileSync(join(from, "node_modules/a.js"), "x");
    const to = mkdtempSync(join(tmpdir(), "to-"));
    expect(copyCore(from, to)).toEqual(["src/index.js"]);
  });
});

describe("Forja", () => {
  it("writes only inside agent-core or CHANGES.md", () => {
    const root = "/tmp/ws";
    expect(safePath(root, "agent-core/src/index.js", true)).toBe("/tmp/ws/agent-core/src/index.js");
    expect(safePath(root, "CHANGES.md", true)).toBe("/tmp/ws/CHANGES.md");
    expect(() => safePath(root, "BRIEF.md", true)).toThrow(/only write/);
    expect(() => safePath(root, "../repo/api/agent.js")).toThrow(/outside/);
    expect(() => safePath(root, "/etc/passwd")).toThrow(/outside/);
  });

  it("edits the core through Muse's function calling and stops at finish", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-"));
    prepare({ out: dir, idea: "", practice: null, model: "fake" });
    const script = [
      { name: "read_file", arguments: { path: "agent-core/src/index.js" } },
      { name: "write_file", arguments: { path: "agent-core/src/extra.js", content: "export const two = 2;\n" } },
      { name: "write_file", arguments: { path: "BRIEF.md", content: "hacked" } },
      { name: "run", arguments: { what: "test" } },
      { name: "write_file", arguments: { path: "CHANGES.md", content: "Agrega extra\n\nHipótesis…" } },
      { name: "finish", arguments: { summary: "listo" } },
    ];
    const seen: string[] = [];
    let i = 0;
    const call = async (req: Req): Promise<Reply> => {
      const last = (req.messages ?? []).at(-1) as { role: string; content: string } | undefined;
      if (last?.role === "tool") seen.push(last.content);
      const step = script[i++] ?? { name: "finish", arguments: { summary: "" } };
      const tc = { id: `c${i}`, name: step.name, arguments: JSON.stringify(step.arguments) };
      return { text: "", toolCalls: [tc], message: { role: "assistant", content: null, tool_calls: [{ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.arguments } }] } };
    };
    const out = await forja({ dir, call, key: "k", maxTurns: 10 });
    expect(out).toMatchObject({ finished: true, summary: "listo", turns: 6 });
    expect(seen[0]).toContain("CORE_VERSION");
    expect(readFileSync(join(dir, "agent-core/src/extra.js"), "utf8")).toBe("export const two = 2;\n");
    expect(seen[2]).toMatch(/only write/);
    expect(readFileSync(join(dir, "BRIEF.md"), "utf8")).not.toBe("hacked");
    expect(seen[3]).toMatch(/pass 4/);
  });
});
