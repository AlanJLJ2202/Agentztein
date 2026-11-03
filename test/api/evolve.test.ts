// The agent changing its own code, from the app's side: Meta function calling in the provider, the host that runs
// the core, and /api/evolve (lineage from GitHub, Muse Wonder's hypothesis → an "evolve" issue).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as core from "@skillab/agent-core";
import { closeDb } from "../../api/_lib/db.js";
import { builderOf, gateOf, githubConfig, isAdmin } from "../../api/_lib/github.js";
import { complete } from "../../api/_lib/providers.js";
import { cleanRequest, runCore } from "../../api/_lib/solver.js";
import { freshDatabase, hasDatabase } from "../../packages/db/test/helpers.js";
import type * as EvolveApi from "../../api/evolve.js";
import type * as KeysApi from "../../api/keys.js";

const SECRET = "x".repeat(40);
const USER = { id: "8d7c2c1e-4f7e-4b8f-9d0a-0f4c1f6b9a11", email: "Alan@Example.com" };

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
});

describe("GitHub helpers", () => {
  it("reads the config, the admins and the gate's comment", () => {
    expect(githubConfig({ AGENT_GH_TOKEN: "t", VERCEL_GIT_REPO_OWNER: "o", VERCEL_GIT_REPO_SLUG: "r" })).toEqual({ token: "t", repo: "o/r" });
    expect(githubConfig({ AGENT_GH_TOKEN: "t", AGENT_GH_REPO: "bad repo" })).toBeNull();
    expect(isAdmin("alan@example.com", { EVOLVE_ADMINS: " Alan@Example.com ,x@y.z" })).toBe(true);
    expect(isAdmin("ruth@example.com", { EVOLVE_ADMINS: "alan@example.com" })).toBe(false);
    expect(isAdmin("alan@example.com", {})).toBe(false);
    const body = "<!-- agent-gate -->\n### ✅ Agent gate: passes, merging\n\n| **Total** | **110/180** (61.1%) | **123/180** (68.3%) | **+13** |";
    expect(gateOf(body)).toEqual({ decision: "merge", base: { correct: 110, total: 180 }, head: { correct: 123, total: 180 }, gain: 13 });
    expect(gateOf("hello")).toBeNull();
    expect(builderOf("<!-- evolve:run=123 builder=muse-code -->\n…")).toBe("muse-code");
  });
});

describe.skipIf(!hasDatabase)("/api/evolve (Postgres)", () => {
  let close: (() => Promise<void>) | undefined;
  let evolve: typeof EvolveApi;
  let keys: typeof KeysApi;
  type Sent = { title?: string; labels?: string[]; body?: string };
  const github: Array<{ method: string; url: string; body?: Sent }> = [];
  const chats: Array<{ model: string; messages: { content: string }[] }> = [];

  beforeAll(async () => {
    const fresh = await freshDatabase();
    close = fresh.close;
    vi.stubEnv("DATABASE_URL", fresh.url);
    vi.stubEnv("DATABASE_SSL_CA", "");
    vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("KEYS_ENCRYPTION_SECRET", SECRET);
    vi.stubEnv("AGENT_GH_TOKEN", "");
    vi.stubEnv("AGENT_GH_REPO", "AlanJLJ2202/Agentztein");
    vi.stubEnv("EVOLVE_ADMINS", "alan@example.com");
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/auth/v1/user")) return Response.json(USER);
      if (url === "https://api.meta.ai/v1/models") return Response.json({ data: [{ id: "muse-spark-1.3" }, { id: "muse-wonder-1.0" }] });
      if (url === "https://api.meta.ai/v1/chat/completions") {
        const body = JSON.parse(String(init?.body));
        chats.push(body);
        return Response.json({ choices: [{ message: { content: JSON.stringify({ title: "Calculadora para tolerancias", hypothesis: "Falla al restar medidas con decimales; una herramienta calc en JS lo hace exacto.", plan: "Agregar tools.calc", source: "errores de práctica" }) } }], usage: { prompt_tokens: 3000, completion_tokens: 400 } });
      }
      if (url.startsWith("https://api.github.com/")) {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
        github.push({ method, url, body });
        const repo = "https://api.github.com/repos/AlanJLJ2202/Agentztein/";
        if (url === `${repo}labels`) return Response.json({}, { status: 422 });
        if (method === "POST" && url === `${repo}issues`) return Response.json({ number: 7, html_url: "https://github.com/AlanJLJ2202/Agentztein/issues/7", title: body?.title }, { status: 201 });
        if (url.startsWith(`${repo}issues?labels=evolve&state=all`)) return Response.json([{ number: 9, pull_request: {} }, { number: 7, title: "Idea" }]);
        if (url.startsWith(`${repo}issues?labels=evolve&state=open`)) return Response.json([{ number: 7, title: "Idea", html_url: "u7", created_at: "2026-11-03T00:00:00Z", comments: 1 }]);
        if (url === `${repo}git/matching-refs/tags/agent-v`) return Response.json([{ ref: "refs/tags/agent-v1", object: { sha: "abcdef123" } }, { ref: "refs/tags/agent-v2", object: { sha: "1234567aa" } }]);
        if (url === `${repo}pulls/9`) return Response.json({ number: 9, title: "evolve: votar", html_url: "u9", state: "closed", merged_at: "2026-11-03T10:00:00Z", created_at: "2026-11-03T09:00:00Z", body: "<!-- evolve:run=1 builder=muse-code -->" });
        if (url.startsWith(`${repo}issues/9/comments`)) return Response.json([{ body: "<!-- agent-gate -->\n### ✅ Agent gate: passes, merging\n| **Total** | **100/180** (55.6%) | **112/180** (62.2%) | **+12** |" }]);
      }
      return new Response("unexpected " + url, { status: 500 });
    });
    [evolve, keys] = await Promise.all([import("../../api/evolve.js"), import("../../api/keys.js")]);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await closeDb();
    await close?.();
  });

  const req = (method = "GET", body?: unknown) =>
    new Request("https://agentztein.test/api/evolve", { method, headers: { authorization: "Bearer tok", "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });

  it("says what is missing before GitHub is connected", async () => {
    const res = await evolve.GET(req());
    const body = await res.json();
    expect(body).toMatchObject({ configured: false, canDispatch: false, missing: ["AGENT_GH_TOKEN"], core: { version: core.CORE_VERSION } });
    expect((await evolve.POST(req("POST", { op: "dispatch", title: "Algo", idea: "x" }))).status).toBe(503);
  });

  it("shows the lineage: versions, PRs with the gate's verdict and ideas in progress", async () => {
    vi.stubEnv("AGENT_GH_TOKEN", "ghp_test");
    const body = await (await evolve.GET(req())).json();
    expect(body.configured).toBe(true);
    expect(body.canDispatch).toBe(true);
    expect(body.versions).toEqual([{ tag: "agent-v2", sha: "1234567" }, { tag: "agent-v1", sha: "abcdef1" }]);
    expect(body.prs).toEqual([expect.objectContaining({ number: 9, state: "merged", builder: "muse-code", gate: { decision: "merge", base: { correct: 100, total: 180 }, head: { correct: 112, total: 180 }, gain: 12 } })]);
    expect(body.ideas).toEqual([expect.objectContaining({ number: 7, title: "Idea" })]);
    expect(github.every((g) => g.url.startsWith("https://api.github.com/repos/AlanJLJ2202/Agentztein/"))).toBe(true);
  });

  it("opens an evolve issue with a person's idea, only for admins", async () => {
    const res = await evolve.POST(req("POST", { op: "dispatch", title: "Votar entre dos pasadas", idea: "Dos llamadas y desempate" }));
    expect(res.status).toBe(200);
    const issue = github.find((g) => g.method === "POST" && g.url.endsWith("/issues"));
    expect(issue?.body).toMatchObject({ title: "Votar entre dos pasadas", labels: ["evolve"] });
    expect(issue?.body?.body).toContain("Dos llamadas y desempate");
    vi.stubEnv("EVOLVE_ADMINS", "someone@else.com");
    expect((await evolve.POST(req("POST", { op: "dispatch", title: "Otra", idea: "x" }))).status).toBe(403);
    vi.stubEnv("EVOLVE_ADMINS", "alan@example.com");
  });

  it("lets Muse Wonder propose the change, inside the harness, and files it", async () => {
    expect((await (await evolve.POST(req("POST", { op: "propose" }))).json()).reason).toBe("no-key");
    const saved = await keys.POST(new Request("https://agentztein.test/api/keys", {
      method: "POST",
      headers: { authorization: "Bearer tok", "content-type": "application/json" },
      body: JSON.stringify({ provider: "meta", key: "mk-meta-good-key-00001" }),
    }));
    expect(saved.status).toBe(201);
    github.length = 0;
    const res = await evolve.POST(req("POST", { op: "propose", guidance: "piensa en las tolerancias" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ model: "muse-wonder-1.0", issue: { number: 7 }, proposal: { title: "Calculadora para tolerancias" } });
    expect(chats.at(-1)?.model).toBe("muse-wonder-1.0");
    expect(chats.at(-1)?.messages[0]?.content).toContain("packages/agent-core");
    expect(chats.at(-1)?.messages[1]?.content).toContain("piensa en las tolerancias");
    expect(chats.at(-1)?.messages[1]?.content).toContain("evolve: votar → merged (gate: merge, +12)");
    const issue = github.find((g) => g.method === "POST" && g.url.endsWith("/issues"));
    expect(issue?.body?.body).toContain("**Hipótesis.** Falla al restar");
    expect(issue?.body?.body).toContain("Muse Wonder (`muse-wonder-1.0`)");
  });
});
