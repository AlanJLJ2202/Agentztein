import { createHash } from "node:crypto";

/**
 * Canonical JSON: object keys sorted recursively, no whitespace, `undefined` fields dropped.
 * Every hash in the system (skill contentHash, dataset hash, prereg hash) is sha256 over this form,
 * so the same logical value always produces the same hash regardless of key order.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error(`canonicalJson: non-finite number ${value}`);
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined) out[key] = normalize(v);
  }
  return out;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function hashCanonical(value: unknown): string {
  return sha256(canonicalJson(value));
}

export const SHA256_RE = /^[0-9a-f]{64}$/;
