// One small Postgres pool per function instance. TLS is verified against DATABASE_SSL_CA when it is set,
// exactly like packages/db/src/client.ts (the SSL params in the URL would otherwise override it).
import pg from "pg";

const SSL_URL_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"];
/** @type {pg.Pool | null} */
let pool = null;

export function db() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const ca = process.env.DATABASE_SSL_CA;
  /** @type {pg.PoolConfig} */
  let config = { connectionString: url };
  if (ca) {
    const u = new URL(url);
    for (const p of SSL_URL_PARAMS) u.searchParams.delete(p);
    config = { connectionString: u.toString(), ssl: { ca, rejectUnauthorized: true } };
  }
  pool = new pg.Pool({ ...config, max: 3, idleTimeoutMillis: 10_000 });
  return pool;
}

/** Closes the pool (tests; a function instance simply ends). */
export async function closeDb() {
  const p = pool;
  pool = null;
  await p?.end();
}
