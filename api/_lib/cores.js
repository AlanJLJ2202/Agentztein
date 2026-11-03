// Each user's own versions of the agent's core (app.agent_cores) and the runs that build them (app.evolve_runs).
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** The user's active core, or null (then the platform's core runs). @param {import("pg").Pool | import("pg").PoolClient} pool @param {string} userId */
export async function activeCore(pool, userId) {
  const { rows } = await pool.query(
    "SELECT * FROM app.agent_cores WHERE user_id = $1 AND status = 'active' ORDER BY version DESC LIMIT 1",
    [userId],
  );
  return rows[0] ?? null;
}

/** @param {any} r @param {Record<string, string> | null} [parentFiles] */
export function coreOut(r, parentFiles = null) {
  const files = /** @type {Record<string, string>} */ (r.files ?? {});
  const changed = parentFiles
    ? Object.keys({ ...files, ...parentFiles }).filter((p) => files[p] !== parentFiles[p]).sort()
    : Object.keys(files).sort();
  return {
    id: r.id,
    version: r.version,
    coreVersion: r.core_version,
    strategy: r.strategy,
    changes: r.changes,
    parentId: r.parent_id,
    runId: r.run_id,
    builder: r.builder,
    status: r.status,
    verdict: r.verdict,
    changed,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  };
}

/** @param {any} r */
export function runOut(r) {
  const d = r.detail ?? {};
  return {
    id: r.id,
    status: r.status,
    builder: r.builder,
    proposal: r.proposal,
    baseCoreId: r.base_core_id,
    candidateCoreId: r.candidate_core_id,
    maxUsd: Number(r.max_usd),
    costUsd: Number(r.cost_usd),
    stage: d.stage ?? null,
    verdict: d.verdict ?? null,
    base: d.base ?? null,
    head: d.head ?? null,
    error: d.error ?? null,
    ciUrl: r.ci_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** A one-time token for a run: the value goes to the workflow, only its hash is stored. */
export function newToken() {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}

/** @param {string} token */
export const hashToken = (token) => createHash("sha256").update(token).digest("hex");

/** Constant-time comparison of two secrets. @param {string} a @param {string} b */
export function sameSecret(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
