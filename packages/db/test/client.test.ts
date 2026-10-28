import { describe, expect, it } from "vitest";
import { poolConfig } from "../src/client.js";

describe("poolConfig", () => {
  const url = "postgres://u:p@db.example.com:5432/postgres?sslmode=require&application_name=skillab";

  it("passes the URL through untouched without a CA", () => {
    expect(poolConfig(url, undefined)).toEqual({ connectionString: url });
  });

  it("verifies TLS against the given CA and drops SSL params that would override it", () => {
    const cfg = poolConfig(url, "-----BEGIN CERTIFICATE-----\nX\n-----END CERTIFICATE-----");
    expect(cfg.ssl).toEqual({ ca: expect.stringContaining("BEGIN CERTIFICATE"), rejectUnauthorized: true });
    const parsed = new URL(cfg.connectionString as string);
    expect(parsed.searchParams.has("sslmode")).toBe(false);
    expect(parsed.searchParams.get("application_name")).toBe("skillab");
  });
});
