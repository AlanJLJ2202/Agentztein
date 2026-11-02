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

const SECRET = "x".repeat(40);
const USER = { id: "8d7c2c1e-4f7e-4b8f-9d0a-0f4c1f6b9a11", email: "alan@example.com" };
const OTHER = { id: "1b2c3d4e-0000-4000-8000-000000000002", email: "ruth@example.com" };

describe("key encryption", () => {
  it("round-trips and is bound to the user and provider", () => {
    const sealed = seal("sk-test-1234567890abcd", { userId: USER.id, provider: "openai", secret: SECRET });
    expect(sealed).not.toContain("sk-test");
    expect(open(sealed, { userId: USER.id, provider: "openai", secret: SECRET })).toBe("sk-test-1234567890abcd");
    expect(() => open(sealed, { userId: OTHER.id, provider: "openai", secret: SECRET })).toThrow();
    expect(() => open(sealed, { userId: USER.id, provider: "meta", secret: SECRET })).toThrow();
    expect(() => open(sealed, { userId: USER.id, provider: "openai", secret: "y".repeat(40) })).toThrow();
    expect(hintOf("sk-test-1234567890abcd")).toBe("…abcd");
  });

  it("refuses a short server secret", () => {
    expect(() => seal("k", { userId: USER.id, provider: "openai", secret: "short" })).toThrow(/32/);
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

describe("providers", () => {
  it("lists chat models and spots rejected keys", async () => {
    const ok = (async () => Response.json({ data: [{ id: "text-embedding-3" }, { id: "gpt-5" }, { id: "gpt-5-mini" }] })) as unknown as typeof fetch;
    await expect(verifyKey("openai", "sk-good", ok)).resolves.toEqual({ status: "valid", models: ["gpt-5", "gpt-5-mini"] });
    const bad = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    await expect(verifyKey("openai", "sk-bad", bad)).resolves.toEqual({ status: "invalid" });
    const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    await expect(verifyKey("meta", "k", down)).resolves.toEqual({ status: "unverified" });
  });

  it("talks to Claude through the SDK with low effort and the refusal fallback", async () => {
    const seen: Array<{ url: string; headers: Headers; body: Record<string, unknown> | null }> = [];
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      seen.push({ url, headers: new Headers(init?.headers), body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
      if (url.includes("/v1/models")) return Response.json({ data: [{ id: "claude-opus-5-5", type: "model" }], has_more: false, first_id: null, last_id: null });
      return Response.json({ id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: '{"items":[]}' }], usage: { input_tokens: 1, output_tokens: 1 } });
    });
    try {
      await expect(verifyKey("anthropic", "sk-ant-test")).resolves.toEqual({ status: "valid", models: ["claude-opus-5-5"] });
      await expect(complete({ provider: "anthropic", key: "sk-ant-test", model: "claude-opus-5-5", system: "s", user: "u" })).resolves.toBe('{"items":[]}');
      const call = seen.find((c) => c.url.includes("/v1/messages"));
      expect(call?.url.startsWith("https://api.anthropic.com/")).toBe(true);
      expect(call?.headers.get("x-api-key") ?? call?.headers.get("authorization")).toContain("sk-ant-test");
      expect(call?.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
      expect(call?.body).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", output_config: { effort: "low" } });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("picks a sensible default model", () => {
    expect(defaultModel("anthropic", ["claude-haiku-5-5", "claude-opus-5-5"])).toBe("claude-opus-5-5");
    expect(defaultModel("gemini", ["models/x", "gemini-3-flash", "gemini-3-pro"])).toBe("gemini-3-pro");
    expect(defaultModel("openai", [])).toBeNull();
  });
});

describe.skipIf(!hasDatabase)("endpoints (Postgres)", () => {
  let close: () => Promise<void>;
  let keys: typeof KeysApi;
  let radar: typeof RadarApi;
  let config: typeof ConfigApi;
  const calls: Array<{ url: string; body?: unknown }> = [];
  let who = USER;

  beforeAll(async () => {
    const fresh = await freshDatabase();
    close = fresh.close;
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
      if (url === "https://api.openai.com/v1/models") {
        const auth = new Headers(init?.headers).get("authorization");
        return auth === "Bearer sk-openai-good-key-0001" ? Response.json({ data: [{ id: "gpt-5" }] }) : new Response("", { status: 401 });
      }
      if (url.startsWith("https://hn.algolia.com/")) {
        return Response.json({ hits: [
          { objectID: "501", title: "A terminal agent that reads errors", points: 200, num_comments: 40, url: "https://ex.com/t", created_at: "2026-11-01T00:00:00Z" },
          { objectID: "502", title: "New LLM tops a leaderboard", points: 150, num_comments: 90, url: "https://ex.com/l", created_at: "2026-11-01T00:00:00Z" },
        ] });
      }
      if (url === "https://api.openai.com/v1/chat/completions") {
        return Response.json({ choices: [{ message: { content: JSON.stringify({ items: [
          { id: "501", capability: "terminal", verdict: "experiment", gain: "Fewer stuck builds", cost: "A day of runs", why: "Concrete and testable" },
          { id: "502", capability: "none", verdict: "watch", gain: "Maybe a better brain", cost: "Unknown", why: "Self-reported score" },
          { id: "999", capability: "code", verdict: "experiment", gain: "x", cost: "x", why: "not in the batch" },
        ] }) } }] });
      }
      return new Response("unexpected " + url, { status: 500 });
    });
    [keys, radar, config] = await Promise.all([import("../../api/keys.js"), import("../../api/radar.js"), import("../../api/config.js")]);
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
    const bad = await keys.POST(req("/api/keys", "POST", { provider: "openai", key: "sk-openai-bad-key-00001" }));
    expect(bad.status).toBe(400);
    const res = await keys.POST(req("/api/keys", "POST", { provider: "openai", key: "sk-openai-good-key-0001" }));
    expect(res.status).toBe(201);
    const saved = await res.json();
    expect(saved).toMatchObject({ verified: true, key: { provider: "openai", hint: "…0001", model: "gpt-5", models: ["gpt-5"] } });
    const list = await (await keys.GET(req("/api/keys"))).json();
    expect(JSON.stringify(list)).not.toContain("sk-openai-good");
    expect(list.keys).toHaveLength(1);
    expect(list.providers.map((p: { id: string }) => p.id)).toContain("anthropic");
  });

  it("keeps each user's keys private", async () => {
    who = OTHER;
    const list = await (await keys.GET(req("/api/keys"))).json();
    expect(list.keys).toEqual([]);
    who = USER;
  });

  it("changes the model and validates input", async () => {
    expect((await keys.PATCH(req("/api/keys", "PATCH", { provider: "openai", model: "gpt-5-mini" }))).status).toBe(200);
    expect((await keys.PATCH(req("/api/keys", "PATCH", { provider: "meta", model: "llama" }))).status).toBe(404);
    expect((await keys.POST(req("/api/keys", "POST", { provider: "acme", key: "k".repeat(30) }))).status).toBe(400);
  });

  it("reads Hacker News, triages with the user's key and remembers the notes", async () => {
    const res = await radar.POST(req("/api/radar", "POST", { lang: "es" }));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toMatchObject({ read: 2, provider: "openai", model: "gpt-5-mini" });
    expect(out.notes.map((n: { id: string; verdict: string }) => [n.id, n.verdict])).toEqual([["501", "experiment"], ["502", "watch"]]);
    const chat = calls.find((c) => c.url.endsWith("/chat/completions"));
    expect(chat?.body).toMatchObject({ model: "gpt-5-mini" });
    expect(JSON.stringify(chat?.body)).toContain("Spanish");

    const again = await radar.POST(req("/api/radar", "POST", {}));
    expect(again.status).toBe(429);

    const history = await (await radar.GET(req("/api/radar"))).json();
    expect(history.notes).toHaveLength(2);
    expect(history.notes[0]).toMatchObject({ discussionUrl: "https://news.ycombinator.com/item?id=501", capability: "terminal" });
  });

  it("forgets a key", async () => {
    expect((await keys.DELETE(req("/api/keys?provider=openai", "DELETE"))).status).toBe(200);
    const list = await (await keys.GET(req("/api/keys"))).json();
    expect(list.keys).toEqual([]);
  });
});
