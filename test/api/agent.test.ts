// The agent's real improvement loop against a fake Meta that behaves like a model which only gets
// context B right once it has the skill the planner wrote. Answers are scored on the server.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { EVALSET } from "../../api/_data/evalset.js";
import { harnessVerdict, numbered, parseJsonObject, scenarioOf, scoreAnswers } from "../../api/_lib/agent.js";
import { closeDb } from "../../api/_lib/db.js";
import { freshDatabase, hasDatabase } from "../../packages/db/test/helpers.js";
import { buildEvalset } from "../../scripts/evalset.js";
import type * as AgentApi from "../../api/agent.js";
import type * as KeysApi from "../../api/keys.js";
import type * as LimitsApi from "../../api/limits.js";
import type * as TalkApi from "../../api/talk.js";

const SECRET = "x".repeat(40);
const USER = { id: "8d7c2c1e-4f7e-4b8f-9d0a-0f4c1f6b9a11", email: "alan@example.com" };
const SC = "codigo";

describe("the bench", () => {
  it("is generated from the scenarios and up to date", () => {
    expect(JSON.parse(JSON.stringify(buildEvalset()))).toEqual(EVALSET);
  });

  it("numbers rows and scores answers per set and context", () => {
    const sc = scenarioOf(SC);
    if (!sc) throw new Error("missing scenario");
    const { rows, text } = numbered(sc, [{ set: "practice", batches: sc.sets.practice.slice(0, 1) }]);
    expect(text).toContain("1. ");
    const all = Object.fromEntries(rows.map((r) => [r.n, r.truth]));
    const { scores, answered } = scoreAnswers(sc, rows, "```json\n" + JSON.stringify({ answers: all }) + "\n```");
    const ctx = rows[0]?.context ?? "";
    expect(answered).toBe(rows.length);
    expect(scores.practice?.[ctx]).toEqual({ correct: rows.length, total: rows.length });
    expect(scoreAnswers(sc, rows, "no json").answered).toBe(0);
    expect(() => parseJsonObject("nothing")).toThrow();
  });

  it("only passes a skill that clearly helps its context and hurts no other", () => {
    const before = { A: { correct: 30, total: 30 }, B: { correct: 10, total: 30 } };
    expect(harnessVerdict(before, { A: { correct: 30, total: 30 }, B: { correct: 28, total: 30 } }, "B").pass).toBe(true);
    expect(harnessVerdict(before, { A: { correct: 30, total: 30 }, B: { correct: 11, total: 30 } }, "B").reason).toBe("no-gain");
    expect(harnessVerdict(before, { A: { correct: 25, total: 30 }, B: { correct: 28, total: 30 } }, "B").reason).toBe("regression");
  });
});

describe.skipIf(!hasDatabase)("agent loop (Postgres)", () => {
  let close: (() => Promise<void>) | undefined;
  let agent: typeof AgentApi;
  let keys: typeof KeysApi;
  let limits: typeof LimitsApi;
  let talk: typeof TalkApi;
  let dbUrl = "";
  const chats: Array<{ model: string; system: string; prompt: string }> = [];

  const sc = scenarioOf(SC);
  if (!sc) throw new Error("missing scenario");
  const [ctxA, ctxB] = sc.contexts.map((c) => c.id);
  // what the fake model "knows": the right label for every record, by the exact line the prompt shows
  const truthByLine = new Map<string, string>();
  for (const set of Object.values(sc.sets)) {
    const { rows, text } = numbered(sc, [{ set: "x", batches: set }]);
    const lines = text.split("\n").filter((l) => /^\d+\. /.test(l));
    lines.forEach((l, i) => truthByLine.set(l.replace(/^\d+\. /, ""), rows[i]?.truth ?? ""));
  }
  const wrong = (label: string) => sc.labels.find((l) => l.id !== label)?.id ?? label;

  function fakeExecutor(prompt: string) {
    const learned = new RegExp(`\\[${ctxB}\\] skill v\\d+:\\n[^\\n]*REGLA-OK`).test(prompt);
    const answers: Record<string, string> = {};
    let ctx = "";
    for (const line of prompt.split("\n")) {
      const lote = /^Lote \d+ · contexto (\S+)/.exec(line);
      if (lote) ctx = lote[1] ?? "";
      const row = /^(\d+)\. (.*)$/.exec(line);
      if (!row) continue;
      const truth = truthByLine.get(row[2] ?? "") ?? "";
      answers[row[1] ?? ""] = ctx === ctxB && !learned ? wrong(truth) : truth;
    }
    return JSON.stringify({ answers });
  }

  beforeAll(async () => {
    const fresh = await freshDatabase();
    close = fresh.close;
    dbUrl = fresh.url;
    vi.stubEnv("DATABASE_URL", fresh.url);
    vi.stubEnv("DATABASE_SSL_CA", "");
    vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("KEYS_ENCRYPTION_SECRET", SECRET);
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/auth/v1/user")) return Response.json(USER);
      if (url === "https://api.meta.ai/v1/models") return Response.json({ data: [{ id: "muse-spark-1.3" }, { id: "muse-wonder-1.0" }] });
      if (url === "https://api.meta.ai/v1/chat/completions") {
        const body = JSON.parse(String(init?.body));
        const system = body.messages[0].content as string;
        const prompt = body.messages[1].content as string;
        chats.push({ model: body.model, system, prompt });
        const content = system.startsWith("You translate")
          ? JSON.stringify({ t: (JSON.parse(prompt.split("\n").at(-1) ?? "[]") as string[]).map((x) => `EN: ${x}`) })
          : system.includes("soñando")
          ? JSON.stringify(prompt.includes("Todavía no recuerdas nada")
            ? {
              keep: [], rewrite: [], forget: [], summary: "Soñé con mis primeros ciclos.",
              add: [
                { scope: `${SC}:${ctxB}`, kind: "rule", text: "En esta situación la cobertura nunca puede bajar.", evidence: ["c1"] },
                { scope: "global", kind: "dead-end", text: "Escribir para un contexto de otro examen siempre falla.", evidence: ["c2"] },
                { scope: "global", kind: "rule", text: "El registro i_0123456789ab siempre es rechazar." },
              ],
            }
            : { keep: ["m2"], rewrite: [{ id: "m1", text: "En esta situación la cobertura nunca puede bajar, ni por un punto." }], forget: [], add: [], summary: "Afiné una regla." })
          : system.includes("planificador")
          ? JSON.stringify({ context: ctxB, instructions: "REGLA-OK: en este repositorio la cobertura no puede bajar.", rationale: "Los rechazos bajan la cobertura", noteId: null })
          : system.includes("director de Agentztein")
            ? JSON.stringify({ scenario: "investigacion", executor: "spark", effort: "high", why: "Ahí hay más que ganar.", steps: [{ tool: "exam", why: "medirme" }], proposals: [{ capability: "vision", model: "spark", idea: "Ver fotos de los paquetes", why: "Las devoluciones traen fotos" }] })
            : system.startsWith("Eres Agentztein")
              ? JSON.stringify({ say: system.includes("Habilidades activas: ninguna") ? "Aún no sé nada." : "Ya sé algo.", action: "auto-cycle" })
              : fakeExecutor(prompt);
        return Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 4000, completion_tokens: 700 } });
      }
      return new Response("unexpected " + url, { status: 500 });
    });
    [agent, keys, limits, talk] = await Promise.all([import("../../api/agent.js"), import("../../api/keys.js"), import("../../api/limits.js"), import("../../api/talk.js")]);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await closeDb();
    await close?.();
  });

  const req = (method = "GET", body?: unknown) =>
    new Request("https://agentztein.test/api/agent", {
      method,
      headers: { authorization: "Bearer tok", "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const post = async (body: unknown) => {
    const res = await agent.POST(req("POST", body));
    return { status: res.status, body: await res.json() };
  };

  it("needs a key", async () => {
    expect((await post({ op: "start", scenario: SC })).body).toMatchObject({ reason: "no-key" });
  });

  it("learns a scoped skill, passes the harness and waits for a person", async () => {
    const saved = await keys.POST(new Request("https://agentztein.test/api/keys", {
      method: "POST",
      headers: { authorization: "Bearer tok", "content-type": "application/json" },
      body: JSON.stringify({ provider: "meta", key: "mk-meta-good-key-00001" }),
    }));
    expect(saved.status).toBe(201);

    const overview = await (await agent.GET(req())).json();
    // the benchmark-style exams first; the first business cases stay listed (retired) so old skills still read
    expect(overview.bench.filter((b: { legacy: boolean }) => !b.legacy).map((b: { id: string }) => b.id)).toEqual(["codigo", "terminal", "razonamiento", "web", "investigacion"]);
    expect(overview.bench.find((b: { id: string }) => b.id === "terminal")).toMatchObject({ benchmark: "Terminal-Bench", room: "terminal" });
    expect(overview.bench.filter((b: { legacy: boolean }) => b.legacy).map((b: { id: string }) => b.id)).toEqual(["manufactura", "devoluciones", "mensajes", "envios"]);
    expect((await post({ op: "start", scenario: "manufactura" })).body).toMatchObject({ reason: "legacy" });
    expect(JSON.stringify(overview.bench)).not.toContain("truth");
    expect(overview.families.find((f: { family: string }) => f.family === "wonder").id).toBe("muse-wonder-1.0");

    const start = await post({ op: "start", scenario: SC, effort: "low" });
    expect(start.status).toBe(200);
    // the planner defaults to Muse Wonder when the key has it; the executor is the user's chosen model
    expect(start.body.job).toMatchObject({ phase: "baseline", executor: "muse-spark-1.3", planner: "muse-wonder-1.0", effort: "low" });
    const jobId = start.body.job.id;
    expect((await post({ op: "start", scenario: SC })).body).toMatchObject({ reason: "busy" });

    const s1 = await post({ op: "step", jobId });
    expect(s1.body.job.phase).toBe("propose");
    const before = s1.body.job.state.before.validation;
    expect(before[ctxA ?? ""].correct).toBe(before[ctxA ?? ""].total);
    expect(before[ctxB ?? ""].correct).toBe(0);
    expect(s1.body.job.state.mistakes.length).toBeGreaterThan(0);

    const s2 = await post({ op: "step", jobId });
    expect(s2.body.job.phase).toBe("validate");
    expect(s2.body.job.state.candidate).toMatchObject({ context: ctxB, version: 1, status: "candidate", model: "muse-wonder-1.0" });
    expect(chats.at(-1)?.model).toBe("muse-wonder-1.0");

    const s3 = await post({ op: "step", jobId });
    expect(s3.body.job.phase).toBe("awaiting");
    expect(s3.body.job.state.verdict).toMatchObject({ pass: true, reason: "improves", target: ctxB });

    const decided = await post({ op: "decide", skillId: s2.body.job.state.candidate.id, decision: "approved" });
    expect(decided.body.skill).toMatchObject({ status: "active", version: 1 });

    // three model calls, all logged by the harness
    const spend = await (await limits.GET(new Request("https://agentztein.test/api/limits", { headers: { authorization: "Bearer tok" } }))).json();
    expect(spend.runs).toBe(3);
  });

  it("keeps skill versions frozen", async () => {
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    await expect(c.query("UPDATE app.agent_skills SET instructions = 'x'")).rejects.toThrow(/new version/);
    await expect(c.query("DELETE FROM app.agent_skills")).rejects.toThrow(/append-only/);
    await c.end();
  });

  it("takes the sealed exam with and without its skills", async () => {
    const withSkills = await post({ op: "exam", scenario: SC });
    const bare = await post({ op: "exam", scenario: SC, bare: true });
    const b = ctxB ?? "";
    expect(withSkills.body.scores[b].correct).toBe(withSkills.body.scores[b].total);
    expect(bare.body.scores[b].correct).toBe(0);
  });

  it("rejects a candidate that doesn't help, without asking anyone", async () => {
    const start = await post({ op: "start", scenario: "terminal" });
    const jobId = start.body.job.id;
    let job = start.body.job;
    while (["baseline", "propose", "validate"].includes(job.phase)) job = (await post({ op: "step", jobId })).body.job;
    // the fake planner writes for codigo's context, which doesn't exist in terminal
    expect(job).toMatchObject({ phase: "done", state: { outcome: "planner-failed" } });
  });

  it("lets the director choose the scenario, model and effort, and traces every step", async () => {
    const start = await post({ op: "start", auto: true, maxCost: 1, lang: "es" });
    expect(start.body.job).toMatchObject({ phase: "plan", planner: "muse-wonder-1.0", state: { auto: true, maxCost: 1 } });
    const jobId = start.body.job.id;
    const planned = (await post({ op: "step", jobId })).body.job;
    expect(planned).toMatchObject({ phase: "baseline", scenario: "investigacion", executor: "muse-spark-1.3", effort: "high" });
    expect(planned.state.plan).toMatchObject({ why: "Ahí hay más que ganar.", proposals: [{ capability: "vision" }] });
    let job = planned;
    while (["plan", "baseline", "propose", "validate"].includes(job.phase)) job = (await post({ op: "step", jobId })).body.job;
    const tools = job.state.trace.map((e: { tool: string }) => e.tool);
    expect(tools.slice(0, 4)).toEqual(["director", "director", "exam", "grader"]);
    expect(tools).toContain("planner");
    expect(job.state.trace.find((e: { tool: string; model?: string }) => e.tool === "exam").model).toBe("muse-spark-1.3");
  });

  it("stops a cycle at its own cap, before calling Meta, and leaves nothing waiting", async () => {
    const start = await post({ op: "start", scenario: "web", maxCost: 0.05 });
    const jobId = start.body.job.id;
    const s1 = await post({ op: "step", jobId });
    expect(s1.body.job.phase).toBe("propose");
    const n = chats.length;
    // Muse Wonder's worst case doesn't fit in what is left of $0.05
    const s2 = await post({ op: "step", jobId });
    expect(s2.status).toBe(200);
    expect(s2.body.job).toMatchObject({ phase: "done", state: { outcome: "run-budget" } });
    expect(chats.length).toBe(n);
  });

  it("dreams on its finished cycles before deciding, and the director and planner read what it remembers", async () => {
    expect((await (await agent.GET(req())).json()).memory).toMatchObject({ active: [], dreams: [], undigested: 4, dreamAfter: 3 });
    const start = await post({ op: "start", auto: true, maxCost: 1, lang: "es" });
    expect(start.body.job.phase).toBe("dream");
    const jobId = start.body.job.id;
    const dreamt = (await post({ op: "step", jobId })).body.job;
    expect(dreamt.phase).toBe("plan");
    expect(dreamt.state.trace.at(-1)).toMatchObject({ tool: "dream", model: "muse-wonder-1.0", note: "4" });
    // the lesson that named a concrete record was dropped
    expect(dreamt.state.dream).toMatchObject({ jobs: 4, summary: "Soñé con mis primeros ciclos.", stats: { added: 2, fixes: ["add"] } });
    // the dream reread each cycle as one line, never a validation or sealed answer
    const dreamPrompt = chats.at(-1)?.prompt ?? "";
    expect(dreamPrompt).toContain("c4 · ");
    expect(dreamPrompt).not.toContain("truth");

    let job = dreamt;
    while (["dream", "plan", "baseline", "propose", "validate"].includes(job.phase)) job = (await post({ op: "step", jobId })).body.job;
    const director = chats.find((c) => c.system.includes("director de Agentztein") && c.prompt.includes("Lo que recuerdas"));
    expect(director?.prompt).toContain("Escribir para un contexto de otro examen siempre falla.");
    // the planner worked on investigacion: it got the lab-wide lesson, not codigo's
    const planner = chats.filter((c) => c.system.includes("planificador")).at(-1)?.prompt ?? "";
    expect(planner).toContain("[dead-end · global]");
    expect(planner).not.toContain("cobertura nunca");
    expect(job.state.trace.map((e: { tool: string }) => e.tool)).toContain("memory");

    const overview = await (await agent.GET(req())).json();
    expect(overview.memory.undigested).toBe(1);
    expect(overview.memory.dreams).toHaveLength(1);
    const rule = overview.memory.active.find((m: { kind: string }) => m.kind === "rule");
    expect(rule).toMatchObject({ scope: `${SC}:${ctxB}`, strength: 2, pinned: false });

    // a person pins one lesson and forgets the other
    expect((await post({ op: "memory", id: rule.id, action: "pin" })).body.memory.pinned).toBe(true);
    const deadEnd = overview.memory.active.find((m: { kind: string }) => m.kind === "dead-end");
    expect((await post({ op: "memory", id: deadEnd.id, action: "forget" })).body.memory.status).toBe("forgotten");

    // dreaming again on demand: the pinned rule is not rewritten, only found to still hold
    const again = await post({ op: "dream", lang: "es" });
    expect(again.status).toBe(200);
    expect(again.body.dream).toMatchObject({ jobs: 1, summary: "Afiné una regla.", stats: { rewritten: 0, strengthened: 1 } });
    expect(again.body.memory).toEqual([expect.objectContaining({ id: rule.id, strength: 3, pinned: true })]);
    expect((await post({ op: "dream" })).body).toMatchObject({ reason: "nothing-to-dream" });
    expect((await post({ op: "memory", id: deadEnd.id, action: "pin" })).status).toBe(404);

    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    await expect(c.query("UPDATE app.agent_memories SET text = 'x'")).rejects.toThrow(/supersedes/);
    await expect(c.query("DELETE FROM app.agent_memories")).rejects.toThrow(/append-only/);
    await expect(c.query("DELETE FROM app.agent_dreams")).rejects.toThrow(/append-only/);
    await c.end();
  });

  it("talks as itself, knowing the lab, and only suggests actions", async () => {
    const res = await talk.POST(new Request("https://agentztein.test/api/talk", {
      method: "POST",
      headers: { authorization: "Bearer tok", "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "¿Qué sabes?" }], lang: "es", tab: "overview" }),
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ say: "Ya sé algo.", action: "auto-cycle", model: "muse-spark-1.3" });
  });

  it("translates what the models wrote into the reader's language, inside the harness", async () => {
    const n = chats.length;
    const r = await post({ op: "translate", to: "en", texts: ["Ahí hay más que ganar.", "Para set_general marca «valida»."] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ texts: ["EN: Ahí hay más que ganar.", "EN: Para set_general marca «valida»."], model: "muse-spark-1.3" });
    expect(chats.length).toBe(n + 1);
    expect(chats.at(-1)?.prompt).toContain("into English");
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    const { rows } = await c.query("SELECT kind FROM app.harness_runs WHERE kind = 'translate'");
    await c.end();
    expect(rows.length).toBe(1);
    expect((await post({ op: "translate", to: "fr", texts: ["hola"] })).status).toBe(400);
    expect((await post({ op: "translate", to: "en", texts: Array(30).fill("hola") })).status).toBe(400);
  });

  it("refuses a step that could go over the budget, before calling Meta", async () => {
    await limits.PUT(new Request("https://agentztein.test/api/limits", {
      method: "PUT",
      headers: { authorization: "Bearer tok", "content-type": "application/json" },
      body: JSON.stringify({ monthly: 0.5 }),
    }));
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    await c.query(`INSERT INTO app.harness_runs (user_id, kind, provider, model, input_tokens, output_tokens, cost_usd, outcome)
      VALUES ($1, 'eval', 'meta', 'x', 0, 0, 0.49, 'ok')`, [USER.id]);
    await c.end();
    const n = chats.length;
    const start = await post({ op: "start", scenario: "razonamiento" });
    const step = await post({ op: "step", jobId: start.body.job.id });
    expect(step.status).toBe(409);
    expect(step.body.reason).toBe("budget");
    expect(chats.length).toBe(n);
  });
});
