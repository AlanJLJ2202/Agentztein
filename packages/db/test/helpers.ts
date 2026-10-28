import pg from "pg";
import { connect, runMigrations, type Db } from "../src/index.js";

export const hasDatabase = Boolean(process.env.DATABASE_URL);

/** Creates a throwaway database, migrates it, and returns a client plus a cleanup function. */
export async function freshDatabase(): Promise<{ db: Db; url: string; close: () => Promise<void> }> {
  const adminUrl = process.env.DATABASE_URL as string;
  const name = `skillab_test_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const { db, pool } = connect(url.toString());
  await runMigrations(db);

  return {
    db,
    url: url.toString(),
    close: async () => {
      await pool.end();
      const a = new pg.Client({ connectionString: adminUrl });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS ${name}`);
      await a.end();
    },
  };
}
