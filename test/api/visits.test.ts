// Site traffic (ADR-034): what /api/track keeps from a visit, and what /api/visits shows the owners.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { closeDb } from "../../api/_lib/db.js";
import { MAX_BATCH, deviceOf, isAdmin, isBot, parseBatch, referrerHost } from "../../api/_lib/visits.js";
import { freshDatabase, hasDatabase } from "../../packages/db/test/helpers.js";
import type * as TrackApi from "../../api/track.js";
import type * as VisitsApi from "../../api/visits.js";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const V1 = "visitor0000000001";
const S1 = "session0000000001";
const req = { ua: MAC, host: "agentztein.test", country: "MX" };

describe("what a visit keeps", () => {
  it("drops bots, crawlers, link previews and scripts", () => {
    expect(isBot(MAC)).toBe(false);
    expect(isBot(IPHONE)).toBe(false);
    for (const ua of [null, "", "curl/8.4.0", "Googlebot/2.1 (+http://www.google.com/bot.html)", "facebookexternalhit/1.1", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/141.0.0.0 Safari/537.36", "WhatsApp/2.23.20.0 A", "python-requests/2.32.3"]) {
      expect(isBot(ua), String(ua)).toBe(true);
    }
  });

  it("reduces the device to phone, tablet or computer", () => {
    expect(deviceOf(IPHONE)).toBe("mobile");
    expect(deviceOf(IPAD)).toBe("tablet");
    expect(deviceOf(MAC)).toBe("desktop");
    expect(deviceOf("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36")).toBe("mobile");
  });

  it("keeps only the host of the referrer, and nothing when it is the site itself", () => {
    expect(referrerHost("https://www.linkedin.com/feed/update/urn:li:activity:123?x=secret", "agentztein.test")).toBe("linkedin.com");
    expect(referrerHost("https://agentztein.test/app/", "agentztein.test")).toBeNull();
    expect(referrerHost("http://localhost:4321/?utm_source=x", "localhost:4321")).toBeNull();
    expect(referrerHost("not a url", "agentztein.test")).toBeNull();
    expect(referrerHost(null, "agentztein.test")).toBeNull();
  });

  it("refuses bodies that aren't a visit and drops bad events one by one", () => {
    expect(parseBatch(null, req)).toBeNull();
    expect(parseBatch({ v: "short", s: S1, page: "landing", events: [] }, req)).toBeNull();
    expect(parseBatch({ v: V1, s: S1, page: "admin", events: [] }, req)).toBeNull();
    const rows = parseBatch(
      {
        v: V1,
        s: S1,
        page: "landing",
        lang: "es",
        ref: "https://t.co/abc",
        utm: { source: "linkedin", medium: "post" },
        events: [
          { e: "view" },
          { e: "section", t: "Como-Funciona" },
          { e: "section", t: "<script>" },
          { e: "drop_table" },
          { e: "leave", n: 99e9 },
          { e: "leave", n: 0 },
        ],
      },
      req,
    );
    expect(rows?.map((r) => [r.event, r.target, r.value])).toEqual([
      ["view", null, null],
      ["section", "como-funciona", null],
      ["section", null, null],
      ["leave", null, 6 * 3600 * 1000],
    ]);
    expect(rows?.[0]).toMatchObject({ referrer: "t.co", utmSource: "linkedin", utmMedium: "post", utmCampaign: null, country: "MX", device: "desktop", lang: "es" });
  });

  it("caps a batch", () => {
    const events = Array.from({ length: 200 }, () => ({ e: "lab" }));
    expect(parseBatch({ v: V1, s: S1, page: "landing", events }, req)).toHaveLength(MAX_BATCH);
  });

  it("knows the owners from ADMIN_EMAILS", () => {
    vi.stubEnv("ADMIN_EMAILS", "Alan@Example.com, ruth@example.com");
    expect(isAdmin("alan@example.com")).toBe(true);
    expect(isAdmin("RUTH@example.com")).toBe(true);
    expect(isAdmin("someone@example.com")).toBe(false);
    expect(isAdmin(null)).toBe(false);
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(isAdmin("alan@example.com")).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe.skipIf(!hasDatabase)("traffic endpoints (Postgres)", () => {
  const OWNER = { id: "8d7c2c1e-4f7e-4b8f-9d0a-0f4c1f6b9a11", email: "alan@example.com" };
  const GUEST = { id: "1b2c3d4e-0000-4000-8000-000000000002", email: "guest@example.com" };
  let who = OWNER;
  let close: () => Promise<void>;
  let dbUrl = "";
  let track: typeof TrackApi;
  let visits: typeof VisitsApi;

  beforeAll(async () => {
    const fresh = await freshDatabase();
    close = fresh.close;
    dbUrl = fresh.url;
    vi.stubEnv("DATABASE_URL", fresh.url);
    vi.stubEnv("DATABASE_SSL_CA", "");
    vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("ADMIN_EMAILS", OWNER.email);
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/auth/v1/user")) {
        const auth = new Headers(init?.headers).get("authorization");
        return auth === "Bearer good" ? Response.json(who) : new Response("", { status: 401 });
      }
      return new Response("unexpected " + url, { status: 500 });
    });
    [track, visits] = await Promise.all([import("../../api/track.js"), import("../../api/visits.js")]);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await closeDb();
    await close?.();
  });

  const beacon = (body: unknown, headers: Record<string, string> = {}) =>
    track.POST(
      new Request("https://agentztein.test/api/track", {
        method: "POST",
        headers: { "content-type": "text/plain", "user-agent": IPHONE, "x-vercel-ip-country": "MX", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
  const get = (path: string, token = "good") =>
    visits.GET(new Request("https://agentztein.test" + path, { headers: { authorization: `Bearer ${token}` } }));
  const rows = async () => {
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    try {
      return (await c.query("SELECT * FROM app.visit_events ORDER BY id")).rows;
    } finally {
      await c.end();
    }
  };

  it("stores a visit and always answers 204, even to bots and garbage", async () => {
    expect((await beacon({ v: V1, s: S1, page: "landing", ref: "https://www.google.com/", events: [{ e: "view" }, { e: "section", t: "como-funciona" }] })).status).toBe(204);
    expect((await beacon("{not json")).status).toBe(204);
    expect((await beacon({ v: V1, s: S1, page: "landing", events: [{ e: "view" }] }, { "user-agent": "curl/8.4.0" })).status).toBe(204);
    const r = await rows();
    expect(r.map((x) => x.event)).toEqual(["view", "section"]);
    expect(r[0]).toMatchObject({ visitor_id: V1, page: "landing", referrer: "google.com", country: "MX", device: "mobile", user_id: null });
  });

  it("ties a sign-in to the account only when Supabase accepts the token", async () => {
    await beacon({ v: "visitor0000000002", s: "session0000000002", page: "app", events: [{ e: "signed_in" }] }, { authorization: "Bearer forged" });
    await beacon({ v: V1, s: S1, page: "landing", events: [{ e: "cta", t: "inicio" }, { e: "leave", n: 42_000 }] });
    who = GUEST;
    await beacon({ v: V1, s: S1, page: "app", events: [{ e: "view" }, { e: "signed_in" }] }, { authorization: "Bearer good" });
    who = OWNER;
    const signed = (await rows()).filter((x) => x.event === "signed_in");
    expect(signed.map((x) => x.user_id)).toEqual([null, GUEST.id]);
  });

  it("shows the funnel to the owners and nobody else", async () => {
    who = GUEST;
    expect(await (await get("/api/visits?check=1")).json()).toEqual({ admin: false });
    expect((await get("/api/visits")).status).toBe(403);
    expect((await get("/api/visits", "bad")).status).toBe(401);
    who = OWNER;
    expect(await (await get("/api/visits?check=1")).json()).toEqual({ admin: true });

    const res = await get("/api/visits?days=7");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totals).toMatchObject({ visitors: 2, sessions: 2, medianSeconds: 42 });
    const step = (id: string) => data.funnel.find((f: { id: string }) => f.id === id)?.visitors;
    expect(step("landing")).toBe(1);
    expect(step("como-funciona")).toBe(1);
    expect(step("meta")).toBe(0);
    expect(step("cta")).toBe(1);
    expect(step("app")).toBe(2);
    expect(step("signed_in")).toBe(2);
    expect(step("key")).toBe(0);
    expect(data.referrers).toContainEqual({ name: "google.com", n: 1 });
    const mine = data.sessions.find((s: { id: string }) => s.id === S1.slice(0, 8));
    expect(mine).toMatchObject({ reached: "signed_in", signedIn: true, country: "MX", device: "mobile", referrer: "google.com" });
    expect(mine.steps).toEqual(["landing", "como-funciona", "cta", "app", "signed_in"]);
  });
});
