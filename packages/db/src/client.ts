import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import * as schema from "./schema.js";

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../drizzle");

const SSL_URL_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"];

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  return url;
}

/**
 * Builds the pool config. With a CA certificate (managed Postgres such as Supabase), TLS is verified
 * against that CA. SSL params in the URL are dropped in that case because node-postgres lets the
 * connection string override the explicit `ssl` option.
 */
export function poolConfig(url: string, caPem: string | undefined = process.env.DATABASE_SSL_CA): pg.PoolConfig {
  if (!caPem) return { connectionString: url };
  const u = new URL(url);
  for (const p of SSL_URL_PARAMS) u.searchParams.delete(p);
  return { connectionString: u.toString(), ssl: { ca: caPem, rejectUnauthorized: true } };
}

export function connect(url: string = databaseUrl()) {
  const pool = new pg.Pool(poolConfig(url));
  return { db: drizzle(pool, { schema }), pool };
}

export type Db = ReturnType<typeof connect>["db"];

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
