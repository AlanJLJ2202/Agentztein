// The Google sign-in check talks to Supabase the way a browser would, with no secrets.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { googleClientId, googleSetup, resetGoogleSetup } from "../../api/_lib/google.js";

const ID = "123456789012-abcdef0123456789.apps.googleusercontent.com";

function fakeSupabase({ enabled = true, clientId = ID }: { enabled?: boolean; clientId?: string } = {}) {
  const seen: string[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    seen.push(url);
    expect(new Headers(init?.headers).get("apikey")).toBe("anon");
    if (url === "https://proj.supabase.co/auth/v1/settings") return Response.json({ external: { google: enabled, email: true } });
    if (url.startsWith("https://proj.supabase.co/auth/v1/authorize?provider=google")) {
      expect(init?.redirect).toBe("manual");
      return new Response(null, { status: 302, headers: { location: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=code` } });
    }
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
  return { f, seen };
}

describe("Google sign-in setup", () => {
  beforeEach(() => {
    resetGoogleSetup();
    vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("GOOGLE_CLIENT_ID", ID);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("accepts only real OAuth client ids", () => {
    expect(googleClientId()).toBe(ID);
    vi.stubEnv("GOOGLE_CLIENT_ID", "not-an-id");
    expect(googleClientId()).toBe("");
  });

  it("is ok when Supabase's Google provider uses the same client as the button", async () => {
    const { f, seen } = fakeSupabase();
    await expect(googleSetup(f)).resolves.toEqual({ status: "ok", enabled: true, supabaseClientId: ID });
    await googleSetup(f); // cached
    expect(seen).toHaveLength(2);
  });

  it("spots a provider that is off, a different client and a missing client id", async () => {
    await expect(googleSetup(fakeSupabase({ enabled: false }).f, { fresh: true })).resolves.toMatchObject({ status: "disabled" });
    const other = "999999999999-zzzz.apps.googleusercontent.com";
    await expect(googleSetup(fakeSupabase({ clientId: other }).f, { fresh: true })).resolves.toMatchObject({ status: "mismatch", supabaseClientId: other });
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    await expect(googleSetup(fakeSupabase().f, { fresh: true })).resolves.toMatchObject({ status: "no-client-id" });
  });

  it("says unknown, without caching, when Supabase can't be reached", async () => {
    const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    await expect(googleSetup(down)).resolves.toMatchObject({ status: "unknown" });
    await expect(googleSetup(fakeSupabase().f)).resolves.toMatchObject({ status: "ok" });
  });
});
