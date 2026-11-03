// The /api functions, called the way Vercel calls them: with a Web Request, returning a Response.
// External services (Supabase Auth, model providers, Hacker News) are replaced by a fake fetch.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hintOf, open, seal } from "../../api/_lib/crypto.js";
import { requireUser } from "../../api/_lib/auth.js";
import { closeDb } from "../../api/_lib/db.js";
import { complete, defaultModel, verifyKey } from "../../api/_lib/providers.js";
import { freshDatabase, hasDatabase } from "../../packages/db/test/helpers.js";
import type * as ConfigApi from "../../api/config.js";
import type * as KeysApi from "../../api/keys.js";
import type * as RadarApi from "../../api/radar.js";
import type * as LimitsApi from "../../api/limits.js";
import pg from "pg";

const SECRET = "x".repeat(40);
const USER = { id: "8d7c2c1e-4f7e-4b8f-9d0a-0f4c1f6b9a11", email: "alan@example.com" };
const OTHER = { id: "1b2c3d4e-0000-4000-8000-000000000002", email: "ruth@example.com" };

describe("key encryption", () => {
  it("round-trips and is bound to the user and provider", () => {
    const sealed = seal("sk-test-1234567890abcd", { userId: USER.id, provider: "meta", secret: SECRET });
    expect(sealed).not.toContain("sk-test");
    expect(open(sealed, { userId: USER.id, provider: "meta", secret: SECRET })).toBe("sk-test-1234567890abcd");
    expect(() => open(sealed, { userId: OTHER.id, provider: "meta", secret: SECRET })).toThrow();
    expect(() => open(sealed, { userId: USER.id, provider: "other", secret: SECRET })).toThrow();
    expect(() => open(sealed, { userId: USER.id, provider: "meta", secret: "y".repeat(40) })).toThrow();
    expect(hintOf("sk-test-1234567890abcd")).toBe("…abcd");
  });

  it("refuses a short server secret", () => {
    expect(() => seal("k", { userId: USER.id, provider: "meta", secret: "short" })).toThrow(/32/);
  });
});

describe("sign-in check", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co/");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon");
  });

  it("asks Supabase who owns the token", async () => {
    const f = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://proj.supabase.co/auth/v1/user");
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
      return Response.json(USER);
    });
    const req = new Request("https://x/api/keys", { headers: { authorization: "Bearer tok" } });
    await expect(requireUser(req, f as unknown as typeof fetch)).resolves.toEqual(USER);
  });

  it("rejects missing and expired tokens", async () => {
    await expect(requireUser(new Request("https://x/api/keys"))).rejects.toMatchObject({ status: 401 });
    const f = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const req = new Request("https://x/api/keys", { headers: { authorization: "Bearer old" } });
    await expect(requireUser(req, f)).rejects.toMatchObject({ status: 401 });
  });
});

describe("Meta provider", () => {
  it("lists chat models and spots rejected keys", async () => {
    const seen: string[] = [];
    const ok = (async (u: string) => {
      seen.push(u);
      return Response.json({ data: [{ id: "muse-spark-1.1" }, { id: "muse-spark-1.3" }, { id: "muse-spark-1.3-contributor" }, { id: "embed-1" }] });
    }) as unknown as typeof fetch;
    await expect(verifyKey("meta", "mk-good", ok)).resolves.toEqual({ status: "valid", models: ["muse-spark-1.1", "muse-spark-1.3", "muse-spark-1.3-contributor"] });
    expect(seen[0]).toBe("https://api.meta.ai/v1/models");
    const bad = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    await expect(verifyKey("meta", "mk-bad", bad)).resolves.toEqual({ status: "invalid" });
    const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    await expect(verifyKey("meta", "k", down)).resolves.toEqual({ status: "unverified" });
  });

  it("picks the newest standard Muse Spark, never a contributor tier by default", () => {
    expect(defaultModel("meta", ["muse-spark-1.1", "muse-spark-1.10", "muse-spark-1.3-contributor", "muse-spark-1.2"])).toBe("muse-spark-1.10");
    expect(defaultModel("meta", ["muse-spark-1.3-contributor"])).toBe("muse-spark-1.1");
    expect(defaultModel("meta", [])).toBe("muse-spark-1.1");
  });

  it("only offers Meta", async () => {
    await expect(complete({ provider: "openai", key: "k", model: "x", system: "s", user: "u" })).rejects.toMatchObject({ status: 400 });
  });
});

describe.skipIf(!hasDatabase)("endpoints (Postgres)", () => {
  let close: () => Promise<void>;
  let keys: typeof KeysApi;
  let radar: typeof RadarApi;
  let config: typeof ConfigApi;
  let limits: typeof LimitsApi;
  let dbUrl = "";
  const calls: Array<{ url: string; body?: unknown }> = [];
  let who = USER;

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
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ url, body });
      if (url.endsWith("/auth/v1/user")) return Response.json(who);
      if (url === "https://api.meta.ai/v1/models") {
        const auth = new Headers(init?.headers).get("authorization");
        return auth === "Bearer mk-meta-good-key-00001" ? Response.json({ data: [{ id: "muse-spark-1.2" }] }) : new Response("", { status: 401 });
      }
      if (url.startsWith("https://hn.algolia.com/")) {
        return Response.json({ hits: [
          { objectID: "501", title: "A terminal agent that reads errors", points: 200, num_comments: 40, url: "https://ex.com/t", created_at: "2026-11-01T00:00:00Z" },
          { objectID: "502", title: "New LLM tops a leaderboard", points: 150, num_comments: 90, url: "https://ex.com/l", created_at: "2026-11-01T00:00:00Z" },
        ] });
      }
      if (url === "https://api.meta.ai/v1/chat/completions") {
        return Response.json({ choices: [{ message: { content: JSON.stringify({ items: [
          { id: "501", capability: "terminal", verdict: "experiment", gain: "Fewer stuck builds", cost: "A day of runs", why: "Concrete and testable" },
          { id: "502", capability: "none", verdict: "watch", gain: "Maybe a better brain", cost: "Unknown", why: "Self-reported score" },
          { id: "999", capability: "code", verdict: "experiment", gain: "x", cost: "x", why: "not in the batch" },
        ] }) } }], usage: { prompt_tokens: 2000, completion_tokens: 800 } });
      }
      return new Response("unexpected " + url, { status: 500 });
    });
    [keys, radar, config, limits] = await Promise.all([import("../../api/keys.js"), import("../../api/radar.js"), import("../../api/config.js"), import("../../api/limits.js")]);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await closeDb();
    await close?.();
  });

  const req = (path: string, method = "GET", body?: unknown) =>
    new Request("https://agentztein.test" + path, {
      method,
      headers: { authorization: "Bearer tok", "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  it("reports that it is configured", async () => {
    const res = await config.GET(new Request("https://agentztein.test/api/config"));
    expect(await res.json()).toMatchObject({ ready: true, missing: [], supabaseUrl: "https://proj.supabase.co" });
  });

  it("requires a session", async () => {
    const res = await keys.GET(new Request("https://agentztein.test/api/keys"));
    expect(res.status).toBe(401);
  });

  it("refuses to triage before a key is connected", async () => {
    const res = await radar.POST(req("/api/radar", "POST", {}));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: "no-key" });
  });

  it("verifies, encrypts and lists a key without ever returning it", async () => {
    const bad = await keys.POST(req("/api/keys", "POST", { provider: "meta", key: "mk-meta-bad-key-000001" }));
    expect(bad.status).toBe(400);
    const res = await keys.POST(req("/api/keys", "POST", { provider: "meta", key: "mk-meta-good-key-00001" }));
    expect(res.status).toBe(201);
    const saved = await res.json();
    expect(saved).toMatchObject({ verified: true, key: { provider: "meta", hint: "…0001", model: "muse-spark-1.2", models: ["muse-spark-1.2"] } });
    const list = await (await keys.GET(req("/api/keys"))).json();
    expect(JSON.stringify(list)).not.toContain("mk-meta-good");
    expect(list.keys).toHaveLength(1);
    expect(list.providers.map((p: { id: string }) => p.id)).toEqual(["meta"]);
  });

  it("keeps each user's keys private", async () => {
    who = OTHER;
    const list = await (await keys.GET(req("/api/keys"))).json();
    expect(list.keys).toEqual([]);
    who = USER;
  });

  it("changes the model and validates input", async () => {
    expect((await keys.PATCH(req("/api/keys", "PATCH", { provider: "meta", model: "muse-spark-1.3" }))).status).toBe(200);
    expect((await keys.PATCH(req("/api/keys", "PATCH", { provider: "openai", model: "gpt-5" }))).status).toBe(400);
    expect((await keys.POST(req("/api/keys", "POST", { provider: "acme", key: "k".repeat(30) }))).status).toBe(400);
  });

  it("reads Hacker News, triages with the user's key and remembers the notes", async () => {
    const res = await radar.POST(req("/api/radar", "POST", { lang: "es", effort: "medium" }));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toMatchObject({ read: 2, provider: "meta", model: "muse-spark-1.3" });
    expect(out.notes.map((n: { id: string; verdict: string }) => [n.id, n.verdict])).toEqual([["501", "experiment"], ["502", "watch"]]);
    const chat = calls.find((c) => c.url.endsWith("/chat/completions"));
    expect(chat?.body).toMatchObject({ model: "muse-spark-1.3", reasoning_effort: "medium" });
    expect(JSON.stringify(chat?.body)).toContain("Spanish");

    const again = await radar.POST(req("/api/radar", "POST", {}));
    expect(again.status).toBe(429);

    const history = await (await radar.GET(req("/api/radar"))).json();
    expect(history.notes).toHaveLength(2);
    expect(history.notes[0]).toMatchObject({ discussionUrl: "https://news.ycombinator.com/item?id=501", capability: "terminal", decision: null });
    // the harness logged the call with Meta's real token counts: 2000 × $1.25 + 800 × $4.25 per million
    expect(out.cost).toBeCloseTo(0.0059, 6);
    const spend = await (await limits.GET(req("/api/limits"))).json();
    expect(spend).toMatchObject({ monthly: 5, runs: 1 });
    expect(spend.spent).toBeCloseTo(0.0059, 6);
  });

  it("keeps the harness log append-only", async () => {
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    await expect(c.query("UPDATE app.harness_runs SET cost_usd = 0")).rejects.toThrow(/append-only/);
    await expect(c.query("DELETE FROM app.harness_runs")).rejects.toThrow(/append-only/);
    await c.end();
  });

  it("refuses a run that could go over the budget", async () => {
    expect((await limits.PUT(req("/api/limits", "PUT", { monthly: 0.1 }))).status).toBe(400);
    const set = await limits.PUT(req("/api/limits", "PUT", { monthly: 0.5 }));
    expect((await set.json()).monthly).toBe(0.5);
    // pretend we already spent most of it (a new log row: the log is append-only)
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    await c.query("INSERT INTO app.harness_runs (user_id, kind, provider, model, input_tokens, output_tokens, cost_usd, outcome) VALUES ($1, 'radar', 'meta', 'muse-spark-1.3', 1, 1, 0.49, 'ok')", [USER.id]);
    await c.query("UPDATE app.research_notes SET created_at = now() - interval '2 minutes' WHERE user_id = $1", [USER.id]);
    await c.end();
    const before = calls.filter((x) => x.url.endsWith("/chat/completions")).length;
    const res = await radar.POST(req("/api/radar", "POST", {}));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: "budget" });
    expect(calls.filter((x) => x.url.endsWith("/chat/completions")).length).toBe(before); // Meta was never called
    await limits.PUT(req("/api/limits", "PUT", { monthly: 5 }));
  });

  it("records the person's decision on an idea", async () => {
    expect((await radar.PATCH(req("/api/radar", "PATCH", { id: "501", decision: "maybe" }))).status).toBe(400);
    expect((await radar.PATCH(req("/api/radar", "PATCH", { id: "nope", decision: "approved" }))).status).toBe(404);
    const res = await radar.PATCH(req("/api/radar", "PATCH", { id: "501", decision: "approved" }));
    expect(res.status).toBe(200);
    expect((await res.json()).note).toMatchObject({ id: "501", decision: "approved" });
    who = OTHER;
    expect((await radar.PATCH(req("/api/radar", "PATCH", { id: "501", decision: "rejected" }))).status).toBe(404);
    who = USER;
  });

  it("forgets a key", async () => {
    expect((await keys.DELETE(req("/api/keys?provider=meta", "DELETE"))).status).toBe(200);
    const list = await (await keys.GET(req("/api/keys"))).json();
    expect(list.keys).toEqual([]);
  });
});
