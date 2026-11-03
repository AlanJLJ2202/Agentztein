// Each user's agent changing its own code, from the app's side: Meta function calling in the provider, the host
// that runs the core, /api/evolve (a run per user, with their own key) and /api/evolve-ci (what the workflow
// fetches and reports). GitHub and Meta are a fake fetch; the workflow's calls are made here by hand.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as core from "@skillab/agent-core";
import { closeDb } from "../../api/_lib/db.js";
import { resetHealthCache } from "../../api/_lib/evolve-health.js";
import { githubConfig } from "../../api/_lib/github.js";
import { complete } from "../../api/_lib/providers.js";
import { cleanRequest, runCore } from "../../api/_lib/solver.js";
import { freshDatabase, hasDatabase } from "../../packages/db/test/helpers.js";
import { readCore } from "../../scripts/evolve/gate.js";
import type * as AgentApi from "../../api/agent.js";
import type * as EvolveApi from "../../api/evolve.js";
import type * as EvolveCiApi from "../../api/evolve-ci.js";
import type * as KeysApi from "../../api/keys.js";
import pg from "pg";

const SECRET = "x".repeat(40);
const CI_SECRET = "c".repeat(40);
const USER = { id: "8d7c2c1e-4f7e-4b8f-9d0a-0f4c1f6b9a11", email: "alan@example.com" };
const OTHER = { id: "1b2c3d4e-0000-4000-8000-000000000002", email: "ruth@example.com" };

describe("Meta function calling", () => {
  it("offers tools, returns the calls and the assistant turn for the next step", async () => {
    let sent: Record<string, unknown> = {};
    const f = (async (_u: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return Response.json({ choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "calc", arguments: '{"x":2}' } }] } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
    }) as unknown as typeof fetch;
    const tools = [{ name: "calc", description: "adds", parameters: { type: "object", properties: { x: { type: "number" } } } }];
    const r = await complete({ provider: "meta", key: "k", model: "muse-spark-1.3", messages: [{ role: "user", content: "2+2" }], tools, effort: null, fetchImpl: f });
    expect(sent.tools).toEqual([{ type: "function", function: tools[0] }]);
    expect(sent.messages).toEqual([{ role: "user", content: "2+2" }]);
    expect(r.toolCalls).toEqual([{ id: "c1", name: "calc", arguments: '{"x":2}' }]);
    expect(r.message).toMatchObject({ role: "assistant", content: null, tool_calls: [{ id: "c1" }] });
    expect(r.text).toBe("");
  });
});

describe("the host of the agent's core", () => {
  it("only lets well-formed chat requests through", () => {
    expect(cleanRequest({ system: "s", user: "u", effort: "high" })).toMatchObject({ system: "s", user: "u", effort: "high" });
    expect(cleanRequest({ user: "u", effort: "max" }).effort).toBeUndefined();
    expect(() => cleanRequest({ system: "s" })).toThrow(/user/);
    expect(() => cleanRequest({ messages: [{ role: "root", content: "x" }] })).toThrow(/role/);
    expect(() => cleanRequest({ user: "x".repeat(500_000) })).toThrow(/too long/);
    expect(() => cleanRequest({ user: "u", tools: [{ name: "bad name!" }] })).toThrow(/tool name/);
  });

  it("runs the core with a call limit and reads only its answers", async () => {
    const task = { scenario: { id: "s", title: "t", task: "Etiqueta", labels: [{ id: "a", meaning: "A" }], contexts: [{ id: "c", name: "C" }] }, skills: [], batches: [{ context: "c", rows: [{ n: "1", fields: { x: 1 } }] }] };
    let n = 0;
    const out = await runCore(core, task, async () => { n++; return { text: '{"answers": {"1": "a"}}', toolCalls: [], message: {} }; });
    expect(out).toEqual({ answers: { 1: "a" }, calls: 1, notes: "" });
    const greedy = { solve: async (_t: unknown, tools: { model: (r: unknown) => Promise<unknown> }) => { for (;;) await tools.model({ user: "x" }); } };
    await expect(runCore(greedy, task, async () => ({ text: "", toolCalls: [], message: {} }), { maxCalls: 2 })).rejects.toThrow(/2 model calls/);
    expect(n).toBe(1);
  });

  it("reads the GitHub config from AGENT_GH_REPO or Vercel's repo", () => {
    expect(githubConfig({ AGENT_GH_TOKEN: "t", VERCEL_GIT_REPO_OWNER: "o", VERCEL_GIT_REPO_SLUG: "r" })).toEqual({ token: "t", repo: "o/r" });
    expect(githubConfig({ AGENT_GH_TOKEN: "t", AGENT_GH_REPO: "bad repo" })).toBeNull();
  });
});

const bench = (scores: Record<string, [number, number]>, version = "core@1") => ({
  core: { version }, seed: 99, model: "muse-spark-1.3",
  scenarios: Object.fromEntries(Object.entries(scores).map(([id, [c, t]]) => [id, { correct: c, total: t, error: null }])),
  usage: { input: 1000, output: 200 }, cost: 0.01,
});

describe.skipIf(!hasDatabase)("/api/evolve and /api/evolve-ci (Postgres)", () => {
  let close: (() => Promise<void>) | undefined;
  let dbUrl = "";
  let evolve: typeof EvolveApi;
  let ci: typeof EvolveCiApi;
  let keys: typeof KeysApi;
  let agent: typeof AgentApi;
  let who = USER;
  let workflowSecret = false;
  const dispatches: Array<{ url: string; body: { ref: string; inputs: { run_id: string; token: string; app_url: string } } }> = [];
  const chats: Array<{ model: string; messages: { content: string }[] }> = [];
  const platform = readCore("packages/agent-core").files;
  const improved = { ...platform, "src/index.js": (platform["src/index.js"] ?? "").replace('"core@1"', '"core@2"').replace("Una sola llamada", "Dos pasadas") };

  beforeAll(async () => {
    const fresh = await freshDatabase();
    close = fresh.close;
    dbUrl = fresh.url;
    vi.stubEnv("DATABASE_URL", fresh.url);
    vi.stubEnv("DATABASE_SSL_CA", "");
    vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("KEYS_ENCRYPTION_SECRET", SECRET);
    vi.stubEnv("AGENT_GH_TOKEN", "");
    vi.stubEnv("AGENT_GH_REPO", "AlanJLJ2202/Agentztein");
    vi.stubEnv("EVOLVE_CI_SECRET", "");
    vi.stubEnv("EVOLVE_APP_URL", "https://agentztein.test");
    vi.stubEnv("EVOLVE_DAILY_RUNS", "10");
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/auth/v1/user")) return Response.json(who);
      if (url === "https://api.meta.ai/v1/models") return Response.json({ data: [{ id: "muse-spark-1.3" }, { id: "muse-wonder-1.0" }] });
      if (url === "https://api.meta.ai/v1/chat/completions") {
        const body = JSON.parse(String(init?.body));
        chats.push(body);
        const planner = String(body.messages[0]?.content ?? "").includes("planificador");
        const content = planner
          ? JSON.stringify({ title: "Calculadora para tolerancias", hypothesis: "Falla al restar medidas con decimales; una herramienta calc en JS lo hace exacto.", plan: "Agregar tools.calc", source: "errores de práctica" })
          : JSON.stringify({ answers: { 1: "aceptar" } });
        return Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 3000, completion_tokens: 400 } });
      }
      const repoApi = "https://api.github.com/repos/AlanJLJ2202/Agentztein";
      if (url === repoApi || url === `${repoApi}/actions/workflows/evolve.yml`) return Response.json({ ok: true });
      if (url === `${repoApi}/actions/secrets/EVOLVE_CI_SECRET`) return workflowSecret ? Response.json({ name: "EVOLVE_CI_SECRET" }) : new Response("{}", { status: 404 });
      if (url === "https://api.github.com/repos/AlanJLJ2202/Agentztein/actions/workflows/evolve.yml/dispatches") {
        dispatches.push({ url, body: JSON.parse(String(init?.body)) });
        return new Response(null, { status: 204 });
      }
      return new Response("unexpected " + url, { status: 500 });
    });
    [evolve, ci, keys, agent] = await Promise.all([import("../../api/evolve.js"), import("../../api/evolve-ci.js"), import("../../api/keys.js"), import("../../api/agent.js")]);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await closeDb();
    await close?.();
  });

  const req = (method = "GET", body?: unknown, path = "/api/evolve") =>
    new Request("https://agentztein.test" + path, { method, headers: { authorization: "Bearer tok", "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const post = async (body: unknown) => { const r = await evolve.POST(req("POST", body)); return { status: r.status, body: await r.json() }; };
  const state = async () => (await evolve.GET(req())).json();
  const ciCall = async (body: Record<string, unknown>, secret = CI_SECRET) => {
    const r = await ci.POST(new Request("https://agentztein.test/api/evolve-ci", { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify(body) }));
    return { status: r.status, body: await r.json() };
  };
  const saveKey = async () => {
    const r = await keys.POST(new Request("https://agentztein.test/api/keys", { method: "POST", headers: { authorization: "Bearer tok", "content-type": "application/json" }, body: JSON.stringify({ provider: "meta", key: "mk-meta-good-key-00001" }) }));
    expect(r.status).toBe(201);
  };

  it("tells the dashboard exactly what is missing, and who fixes it", async () => {
    const failing = (s: { health: { checks: { id: string; ok: boolean | null; who: string }[] } }) => s.health.checks.filter((c) => c.ok === false).map((c) => `${c.who}:${c.id}`);
    let s = await state();
    expect(s).toMatchObject({ configured: false, missing: ["AGENT_GH_TOKEN", "EVOLVE_CI_SECRET"], platform: { version: core.CORE_VERSION }, active: null, cores: [], runs: [] });
    expect(failing(s)).toEqual(["admin:gh-token", "admin:ci-secret-vercel", "you:meta-key"]);
    vi.stubEnv("AGENT_GH_TOKEN", "ghp_test");
    vi.stubEnv("EVOLVE_CI_SECRET", CI_SECRET);
    s = await state();
    expect(failing(s)).toEqual(["admin:ci-secret-github", "you:meta-key"]);
    expect(s.health.checks.find((c: { id: string }) => c.id === "ci-secret-github").fix.es).toContain("EVOLVE_CI_SECRET");
    expect((await post({ op: "dispatch", title: "Votar entre dos pasadas" })).body.reason).toBe("no-key");
    workflowSecret = true;
    resetHealthCache(); // the GitHub checks are cached for 5 minutes
    expect(failing(await state())).toEqual(["you:meta-key"]);
    expect((await state()).configured).toBe(true);
  });

  it("any user with their own key starts a run; CI gets that user's key once", async () => {
    expect((await post({ op: "dispatch", title: "Votar entre dos pasadas" })).body.reason).toBe("no-key");
    await saveKey();
    const { status, body } = await post({ op: "dispatch", title: "Votar entre dos pasadas", idea: "Dos llamadas y desempate", builder: "forja" });
    expect(status).toBe(200);
    expect(body.run).toMatchObject({ status: "queued", builder: "forja", proposal: { title: "Votar entre dos pasadas" } });
    const d = dispatches.at(-1);
    expect(d?.body.ref).toBe("main");
    expect(d?.body.inputs).toMatchObject({ run_id: body.run.id, app_url: "https://agentztein.test" });
    expect((await post({ op: "dispatch", title: "Otra idea más" })).body.reason).toBe("busy");

    const token = d?.body.inputs.token ?? "";
    expect((await ciCall({ op: "start", runId: body.run.id, token }, "wrong".repeat(10))).status).toBe(401);
    expect((await ciCall({ op: "start", runId: body.run.id, token: "nope" })).status).toBe(404);
    const start = await ciCall({ op: "start", runId: body.run.id, token, ciUrl: "https://github.com/AlanJLJ2202/Agentztein/actions/runs/1" });
    expect(start.status).toBe(200);
    expect(start.body).toMatchObject({ key: "mk-meta-good-key-00001", executor: "muse-spark-1.3", planner: "muse-wonder-1.0", builder: "forja", base: null });
    expect((await ciCall({ op: "start", runId: body.run.id, token })).status).toBe(409);
    const db = new pg.Client({ connectionString: dbUrl });
    await db.connect();
    const { rows } = await db.query("SELECT token_hash, status FROM app.evolve_runs WHERE id = $1", [body.run.id]);
    await db.end();
    expect(rows[0].status).toBe("building");
    expect(rows[0].token_hash).not.toContain(token);
  });

  it("a version that improves becomes the user's active core, and their exams run it sandboxed", async () => {
    const run = (await state()).runs[0];
    const token = dispatches.at(-1)?.body.inputs.token ?? "";
    const base = bench({ manufactura: [50, 90], envios: [60, 90] });
    const head = bench({ manufactura: [58, 90], envios: [61, 90] }, "core@2");
    const fin = await ciCall({ op: "finish", runId: run.id, token, files: improved, changes: "Dos pasadas\n\nHipótesis…", builder: "forja", base, head, usage: { input: 5000, output: 900, cost: 0.03, model: "muse-spark-1.3" } });
    expect(fin.body).toMatchObject({ status: "passed", verdict: { pass: true, gain: 9 }, core: { version: 1 } });
    const s = await state();
    expect(s.active).toMatchObject({ version: 1, coreVersion: "core@2", strategy: expect.stringContaining("Dos pasadas") });
    expect(s.runs[0]).toMatchObject({ status: "passed", costUsd: 0.03, verdict: { pass: true } });
    expect(s.cores[0]).toMatchObject({ version: 1, status: "active", builder: "forja", changes: expect.stringContaining("Dos pasadas") });
    const code = await (await evolve.GET(req("GET", undefined, `/api/evolve?core=${s.cores[0].id}`))).json();
    expect(code.files["src/index.js"]).toContain("core@2");

    // the user's exam now runs their own core, in the sandbox
    const exam = await agent.POST(req("POST", { op: "exam", scenario: "manufactura" }, "/api/agent"));
    expect(exam.status).toBe(200);
    expect((await exam.json()).core).toBe("v1 · core@2");

    // another user still has the platform's core and can't see this one
    who = OTHER;
    expect((await state()).active).toBeNull();
    expect((await evolve.GET(req("GET", undefined, `/api/evolve?core=${s.cores[0].id}`))).status).toBe(404);
    who = USER;
  });

  it("Muse Wonder proposes the next change from the user's own core; a regression is rejected", async () => {
    const { status, body } = await post({ op: "propose", guidance: "piensa en las tolerancias" });
    expect(status).toBe(200);
    expect(body).toMatchObject({ model: "muse-wonder-1.0", proposal: { title: "Calculadora para tolerancias" }, run: { status: "queued", builder: "muse-code" } });
    const planner = chats.findLast((c) => c.model === "muse-wonder-1.0");
    expect(planner?.messages[1]?.content).toContain("v1 (core@2)");
    expect(planner?.messages[1]?.content).toContain("Votar entre dos pasadas → passed (+9)");
    const token = dispatches.at(-1)?.body.inputs.token ?? "";
    const start = await ciCall({ op: "start", runId: body.run.id, token });
    expect(start.body.base).toMatchObject({ version: 1, files: { "src/index.js": expect.stringContaining("core@2") } });
    const worse = { ...improved, "src/index.js": (improved["src/index.js"] ?? "").replace('"core@2"', '"core@3"') };
    const fin = await ciCall({ op: "finish", runId: body.run.id, token, files: worse, builder: "muse-code", base: bench({ manufactura: [58, 90], envios: [61, 90] }), head: bench({ manufactura: [70, 90], envios: [50, 90] }) });
    expect(fin.body).toMatchObject({ status: "rejected", verdict: { reason: "regression" } });
    const s = await state();
    expect(s.active.version).toBe(1);
    expect(s.cores.map((c: { version: number; status: string }) => `${c.version}:${c.status}`)).toEqual(["2:rejected", "1:active"]);
  });

  it("refuses code that breaks the rules even if CI says it passed", async () => {
    const { body } = await post({ op: "dispatch", title: "Atajo prohibido" });
    const token = dispatches.at(-1)?.body.inputs.token ?? "";
    await ciCall({ op: "start", runId: body.run.id, token });
    const evil = { ...improved, "src/index.js": "export const k = process.env;\nexport async function solve() { return { answers: {} }; }" };
    const fin = await ciCall({ op: "finish", runId: body.run.id, token, files: evil, base: bench({ a: [1, 10] }), head: bench({ a: [10, 10] }) });
    expect(fin.body).toMatchObject({ status: "rejected", verdict: { reason: "rules" }, core: null });
    expect((await state()).active.version).toBe(1);
  });

  it("the user can go back to the platform's core or to a version that passed", async () => {
    let s = await state();
    const v1 = s.cores.find((c: { version: number }) => c.version === 1);
    const v2 = s.cores.find((c: { version: number }) => c.version === 2);
    expect((await post({ op: "activate", coreId: v2.id })).status).toBe(409);
    s = (await post({ op: "activate", coreId: null })).body;
    expect(s.active).toBeNull();
    s = (await post({ op: "activate", coreId: v1.id })).body;
    expect(s.active.version).toBe(1);
  });

  it("a run the workflow never picked up is marked failed, and the dashboard says why", async () => {
    const db = new pg.Client({ connectionString: dbUrl });
    await db.connect();
    await db.query(
      `INSERT INTO app.evolve_runs (user_id, builder, proposal, token_hash, max_usd, created_at, updated_at)
       VALUES ($1, 'forja', '{"title":"Atorada"}', 'h', 1, now() - interval '20 minutes', now() - interval '20 minutes')`,
      [USER.id],
    );
    await db.end();
    const s = await state();
    expect(s.runs.find((r: { proposal: { title: string } }) => r.proposal.title === "Atorada")).toMatchObject({ status: "failed", error: expect.stringContaining("evolve.yml is on main") });
  });

  it("logs what the runs spent in the user's harness", async () => {
    const db = new pg.Client({ connectionString: dbUrl });
    await db.connect();
    const { rows } = await db.query("SELECT kind, count(*)::int AS n FROM app.harness_runs WHERE user_id = $1 GROUP BY kind ORDER BY kind", [USER.id]);
    await db.end();
    expect(rows).toEqual(expect.arrayContaining([{ kind: "evolve-ci", n: 3 }, { kind: "evolve", n: 1 }, { kind: "exam", n: 1 }]));
  });
});
