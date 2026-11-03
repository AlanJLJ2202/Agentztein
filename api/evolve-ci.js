// /api/evolve-ci: the evolve workflow (GitHub Actions) talking to the app about one user's run. Not for browsers.
// Every call carries `authorization: Bearer <EVOLVE_CI_SECRET>` (the same secret in Vercel and in the repo) and the
// run's one-time token, whose hash is in app.evolve_runs.
//   POST { op: "start", runId, token }   once: marks the run building and returns the user's Meta key, models,
//                                        spending cap, the hypothesis and the user's current core (null = platform)
//   POST { op: "stage", runId, token, stage }   progress for the app ("building", "judging"…)
//   POST { op: "finish", runId, token, files, changes, builder, base, head, practice, usage }
//        the server re-checks the code and the verdict itself; a version that passes becomes the user's active core
//   POST { op: "fail", runId, token, error, stage }
import { costOf } from "@skillab/research";
import { coreInfo, judge, scanFiles } from "./_lib/core-rules.js";
import { hashToken, sameSecret } from "./_lib/cores.js";
import { db } from "./_lib/db.js";
import { keyOf } from "./_lib/harnessed.js";
import { HttpError, handle, json, readJson } from "./_lib/http.js";
import { META_MODELS, pickId } from "@skillab/research";

/** Checks the CI secret and the run's token; returns the run. @param {Request} request @param {Record<string, unknown>} body @param {import("pg").Pool} pool */
async function runOf(request, body, pool) {
  const secret = process.env.EVOLVE_CI_SECRET ?? "";
  const header = request.headers.get("authorization") ?? "";
  if (secret.length < 32 || !sameSecret(header, `Bearer ${secret}`)) throw new HttpError(401, "Not the evolve workflow");
  const runId = typeof body.runId === "string" ? body.runId : "";
  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[0-9a-f-]{36}$/i.test(runId) || !token) throw new HttpError(400, "Which run?");
  const { rows } = await pool.query("SELECT * FROM app.evolve_runs WHERE id = $1", [runId]);
  const run = rows[0];
  if (!run || !sameSecret(run.token_hash, hashToken(token))) throw new HttpError(404, "That run doesn't exist");
  return run;
}

/** A bench result as sent by CI, reduced to the numbers the judge needs. @param {any} r */
function score(r) {
  if (!r || typeof r !== "object" || typeof r.scenarios !== "object" || !r.scenarios) throw new HttpError(400, "Bad bench result");
  /** @type {Record<string, { correct: number, total: number, error: string | null }>} */
  const scenarios = {};
  for (const [id, s] of Object.entries(r.scenarios)) {
    const x = /** @type {any} */ (s);
    const correct = Math.max(0, Math.trunc(Number(x?.correct) || 0));
    const total = Math.max(correct, Math.trunc(Number(x?.total) || 0));
    scenarios[id.slice(0, 40)] = { correct, total, error: x?.error ? String(x.error).slice(0, 200) : null };
  }
  const all = Object.values(scenarios);
  return {
    scenarios,
    correct: all.reduce((n, s) => n + s.correct, 0),
    total: all.reduce((n, s) => n + s.total, 0),
    seed: Number.isFinite(Number(r.seed)) ? Number(r.seed) : null,
    model: typeof r.model === "string" ? r.model.slice(0, 80) : "",
    version: typeof r.core?.version === "string" ? r.core.version.slice(0, 60) : "",
  };
}

export const POST = handle(async (request) => {
  const body = await readJson(request);
  const pool = db();
  const run = await runOf(request, body, pool);
  const setRun = (/** @type {string} */ status, /** @type {Record<string, unknown>} */ detail, extra = "", /** @type {unknown[]} */ params = []) =>
    pool.query(
      `UPDATE app.evolve_runs SET status = $2, detail = detail || $3::jsonb, updated_at = now() ${extra} WHERE id = $1`,
      [run.id, status, JSON.stringify(detail), ...params],
    );

  if (body.op === "start") {
    if (run.status !== "queued" || run.key_fetched_at) throw new HttpError(409, "This run already started");
    const k = await keyOf(pool, run.user_id);
    const wonder = META_MODELS.find((f) => f.family === "wonder");
    const ciUrl = typeof body.ciUrl === "string" && /^https:\/\/github\.com\//.test(body.ciUrl) ? body.ciUrl.slice(0, 300) : null;
    await setRun("building", { stage: "building" }, ", key_fetched_at = now(), ci_url = $4", [ciUrl]);
    let base = null;
    if (run.base_core_id) {
      const { rows } = await pool.query("SELECT id, version, files FROM app.agent_cores WHERE id = $1", [run.base_core_id]);
      if (rows[0]) base = { id: rows[0].id, version: rows[0].version, files: rows[0].files };
    }
    return json({
      key: k.key,
      executor: k.model,
      planner: (wonder && pickId(wonder, k.models)) || k.model,
      maxUsd: Number(run.max_usd),
      builder: run.builder,
      proposal: run.proposal,
      base,
    });
  }

  if (run.status !== "building") throw new HttpError(409, "This run is not building");

  if (body.op === "stage") {
    const stage = typeof body.stage === "string" ? body.stage.slice(0, 40) : "";
    await setRun("building", { stage });
    return json({ ok: true });
  }

  if (body.op === "fail") {
    await setRun("failed", { stage: typeof body.stage === "string" ? body.stage.slice(0, 40) : "failed", error: String(body.error ?? "The run failed").slice(0, 500) });
    return json({ ok: true });
  }

  if (body.op === "finish") {
    const files = body.files && typeof body.files === "object" && !Array.isArray(body.files) ? /** @type {Record<string, string>} */ (body.files) : null;
    if (!files) throw new HttpError(400, "Send the new core's files");
    // what the run spent of the user's key (bench and Forja; Muse Code's own use isn't metered here)
    const u = /** @type {any} */ (body.usage ?? {});
    const input = Math.max(0, Math.trunc(Number(u.input) || 0));
    const output = Math.max(0, Math.trunc(Number(u.output) || 0));
    const model = typeof u.model === "string" ? u.model.slice(0, 80) : "muse-spark";
    const cost = Math.max(Number(u.cost) || 0, costOf(model, input, output));
    const scan = scanFiles(files);
    const base = score(body.base);
    const head = score(body.head);
    const verdict = scan.problems.length
      ? { pass: false, reason: "rules", gain: 0, needed: 0, drops: [], problems: scan.problems.slice(0, 10) }
      : judge(base, head);
    const info = coreInfo(files);
    const changes = typeof body.changes === "string" ? body.changes.slice(0, 8000) : "";
    const builder = body.builder === "forja" ? "forja" : "muse-code";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO app.harness_runs (user_id, kind, provider, model, effort, input_tokens, output_tokens, cost_usd, outcome)
         VALUES ($1, 'evolve-ci', 'meta', $2, NULL, $3, $4, $5, 'ok')`,
        [run.user_id, model, input, output, cost],
      );
      /** @type {any} */
      let row = null;
      if (!scan.problems.length) {
        const { rows: ver } = await client.query("SELECT COALESCE(MAX(version), 0)::int AS v FROM app.agent_cores WHERE user_id = $1", [run.user_id]);
        if (verdict.pass) await client.query("UPDATE app.agent_cores SET status = 'retired', decided_at = now() WHERE user_id = $1 AND status = 'active'", [run.user_id]);
        const { rows } = await client.query(
          `INSERT INTO app.agent_cores (user_id, version, files, core_version, strategy, changes, parent_id, run_id, builder, status, verdict, decided_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now()) RETURNING id, version`,
          [run.user_id, (ver[0]?.v ?? 0) + 1, JSON.stringify(files), info.version, info.strategy, changes, run.base_core_id, run.id, builder,
            verdict.pass ? "active" : "rejected", JSON.stringify({ ...verdict, base: { correct: base.correct, total: base.total }, head: { correct: head.correct, total: head.total }, seed: head.seed, model: head.model })],
        );
        row = rows[0];
      }
      await client.query(
        `UPDATE app.evolve_runs SET status = $2, candidate_core_id = $3, cost_usd = cost_usd + $4, detail = detail || $5::jsonb, updated_at = now() WHERE id = $1`,
        [run.id, verdict.pass ? "passed" : "rejected", row?.id ?? null, cost, JSON.stringify({ stage: "done", verdict, base, head, practice: body.practice ?? null })],
      );
      await client.query("COMMIT");
      return json({ status: verdict.pass ? "passed" : "rejected", verdict, core: row });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  throw new HttpError(400, "Unknown operation");
});
