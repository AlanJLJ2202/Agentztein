import { connect, runMigrations } from "./client.js";

const { db, pool } = connect();
try {
  await runMigrations(db);
  console.log("migrations applied");
} finally {
  await pool.end();
}
