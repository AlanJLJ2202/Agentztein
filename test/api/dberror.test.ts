// A broken database connection must say what to fix, not "something went wrong".
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeDb, normalizeCa } from "../../api/_lib/db.js";
import { dbProblem } from "../../api/_lib/dberror.js";
import { hasDatabase } from "../../packages/db/test/helpers.js";

const PEM = "-----BEGIN CERTIFICATE-----\nMIIDxTCCAq2gAwIBAgIBADANBgkqhkiG9w0BAQsFADB\n-----END CERTIFICATE-----";

describe("database problems", () => {
  it("names the cause from the error", () => {
    expect(dbProblem(Object.assign(new Error("self-signed certificate in certificate chain"), { code: "SELF_SIGNED_CERT_IN_CHAIN" }))).toBe("ssl");
    expect(dbProblem(Object.assign(new Error("getaddrinfo ENOTFOUND db.x.supabase.co"), { code: "ENOTFOUND" }))).toBe("unreachable");
    expect(dbProblem(Object.assign(new Error("password authentication failed for user"), { code: "28P01" }))).toBe("auth");
    expect(dbProblem(new Error("Tenant or user not found"))).toBe("auth");
    expect(dbProblem(Object.assign(new Error('relation "app.user_limits" does not exist'), { code: "42P01" }))).toBe("schema");
    expect(dbProblem(new Error("DATABASE_URL is not set"))).toBe("missing");
    expect(dbProblem(Object.assign(new TypeError("Invalid URL"), { code: "ERR_INVALID_URL" }))).toBe("url");
    expect(dbProblem(new Error("boom"))).toBeNull();
  });

  it("accepts the CA pasted with quotes, literal \\n or as base64", () => {
    expect(normalizeCa(PEM)).toBe(PEM);
    expect(normalizeCa(`"${PEM.replace(/\n/g, "\\n")}"`)).toBe(PEM);
    expect(normalizeCa(PEM.replace(/\n/g, "\r\n"))).toBe(PEM);
    expect(normalizeCa(Buffer.from(PEM).toString("base64"))).toBe(PEM);
    expect(normalizeCa(undefined)).toBe("");
  });
});

describe.skipIf(!hasDatabase)("a wrong DATABASE_URL in a real request", () => {
  afterEach(async () => {
    await closeDb();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function limitsWith(url: string) {
    vi.stubEnv("DATABASE_URL", url);
    vi.stubEnv("DATABASE_SSL_CA", "");
    vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon");
    vi.stubGlobal("fetch", async () => Response.json({ id: "8d7c2c1e-4f7e-4b8f-9d0a-0f4c1f6b9a11" }));
    const { GET } = await import("../../api/limits.js");
    const res = await GET(new Request("https://x/api/limits", { headers: { authorization: "Bearer tok" } }));
    return { status: res.status, body: await res.json() };
  }

  it("reports a bad password as auth", async () => {
    const u = new URL(process.env.DATABASE_URL as string);
    u.password = "wrong-password";
    expect(await limitsWith(u.toString())).toMatchObject({ status: 503, body: { reason: "database", detail: "auth" } });
  });

  it("reports an unreachable host", async () => {
    const u = new URL(process.env.DATABASE_URL as string);
    u.port = "1";
    expect(await limitsWith(u.toString())).toMatchObject({ status: 503, body: { reason: "database", detail: "unreachable" } });
  });

  it("reports missing tables", async () => {
    const u = new URL(process.env.DATABASE_URL as string); // the admin database has no app schema
    u.pathname = "/postgres";
    expect(await limitsWith(u.toString())).toMatchObject({ status: 503, body: { reason: "database", detail: "schema" } });
  });
});
