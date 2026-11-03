// One small Postgres pool per function instance. TLS is verified against DATABASE_SSL_CA when it is set,
// exactly like packages/db/src/client.ts (the SSL params in the URL would otherwise override it).
import pg from "pg";
import { dbProblem } from "./dberror.js";

const SSL_URL_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"];
/** @type {pg.Pool | null} */
let pool = null;

export function db() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const ca = normalizeCa(process.env.DATABASE_SSL_CA);
  /** @type {pg.PoolConfig} */
  let config = { connectionString: url };
  if (ca) {
    const u = new URL(url);
    for (const p of SSL_URL_PARAMS) u.searchParams.delete(p);
    config = { connectionString: u.toString(), ssl: { ca, rejectUnauthorized: true } };
  }
  pool = new pg.Pool({ ...config, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 8_000 });
  return pool;
}

/**
 * The CA certificate as pasted in Vercel: tolerates surrounding quotes, literal "\n" instead of line
 * breaks, Windows line endings and a base64-encoded PEM.
 * @param {string | undefined} raw
 */
export function normalizeCa(raw) {
  let ca = (raw ?? "").trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
  if (ca && !ca.includes("-----BEGIN")) {
    try {
      const decoded = Buffer.from(ca, "base64").toString("utf8");
      if (decoded.includes("-----BEGIN")) ca = decoded.trim();
    } catch {
      /* not base64 */
    }
  }
  return ca;
}

/** Can the app's tables be reached? Returns null when fine, or the problem. */
export async function dbHealth() {
  try {
    const { rows } = await db().query("SELECT to_regclass('app.agent_skills') IS NOT NULL AS ok");
    return rows[0]?.ok ? null : /** @type {const} */ ("schema");
  } catch (err) {
    return dbProblem(err) ?? "unreachable";
  }
}

/** Closes the pool (tests; a function instance simply ends). */
export async function closeDb() {
  const p = pool;
  pool = null;
  await p?.end();
}
