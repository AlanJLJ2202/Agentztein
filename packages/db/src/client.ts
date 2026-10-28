import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import * as schema from "./schema.js";

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../drizzle");

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  return url;
}

export function connect(url: string = databaseUrl()) {
  const pool = new pg.Pool({ connectionString: url });
  return { db: drizzle(pool, { schema }), pool };
}

export type Db = ReturnType<typeof connect>["db"];

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
