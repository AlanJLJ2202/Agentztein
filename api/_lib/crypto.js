// API keys are stored encrypted with AES-256-GCM. The key is derived from KEYS_ENCRYPTION_SECRET and each
// ciphertext is bound to its user and provider (additional data), so rows can't be swapped between users.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** @param {string} [secret] */
function keyFrom(secret = process.env.KEYS_ENCRYPTION_SECRET ?? "") {
  if (secret.length < 32) throw new Error("KEYS_ENCRYPTION_SECRET must be at least 32 characters");
  return createHash("sha256").update(secret, "utf8").digest();
}

const aad = (/** @type {string} */ userId, /** @type {string} */ provider) => Buffer.from(`${userId}:${provider}`, "utf8");

/**
 * @param {string} plain
 * @param {{ userId: string, provider: string, secret?: string }} ctx
 */
export function seal(plain, { userId, provider, secret }) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  c.setAAD(aad(userId, provider));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

/**
 * @param {string} sealed
 * @param {{ userId: string, provider: string, secret?: string }} ctx
 */
export function open(sealed, { userId, provider, secret }) {
  const [v, iv, tag, ct] = sealed.split(":");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unknown secret format");
  const d = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64"));
  d.setAAD(aad(userId, provider));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}

/** Last four characters, shown so the user recognises the key. @param {string} key */
export const hintOf = (key) => `…${key.slice(-4)}`;
