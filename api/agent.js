// /api/agent: the agent improving itself, for real, with the user's own Meta key.
//   GET                                  the bench, the agent's skills, recent cycles, the key's Meta families, budget
//   POST { op: "start", scenario, executor?, planner?, effort?, guidance? }   opens an improvement cycle
//   POST { op: "step", jobId }           runs the cycle's next phase (one model call; the app calls it in a loop)
//   POST { op: "decide", skillId, decision }   a person approves or rejects a candidate that passed the harness
//   POST { op: "retire", skillId }       takes an active skill out of use (rollback)
//   POST { op: "exam", scenario, bare? } the sealed held-out exam, with the active skills (or none, to compare)
import * as core from "@skillab/agent-core";
import { EFFORTS, familyOf, META_MODELS, pickId } from "@skillab/research";
import {
  benchSummary,
  harnessVerdict,
  numbered,
  parseProposal,
  PLANNER_SYSTEM,
  plannerPrompt,
  scenarioOf,
  scoreAnswers,
} from "./_lib/agent.js";
import { requireUser } from "./_lib/auth.js";
import { db } from "./_lib/db.js";
import { budgetOf } from "./_lib/harness.js";
import { harnessed, keyOf, MODEL_TIMEOUT_MS } from "./_lib/harnessed.js";
import { HttpError, handle, json, readJson } from "./_lib/http.js";
import { publicScenario, runCore } from "./_lib/solver.js";

const RUNNING = ["baseline", "propose", "validate"];
const MODEL_ID = /^[A-Za-z0-9._:/-]{2,80}$/;
/** Model calls the agent's core may make in one exam inside the app (the function has 120 s in total). */
const CORE_MAX_CALLS = 3;

/** @param {any} r */
const skillOut = (r) => ({
  id: r.id,
  scenario: r.scenario,
  context: r.context,
  version: r.version,
  instructions: r.instructions,
  rationale: r.rationale,
  parentId: r.parent_id,
  model: r.model,
  noteId: r.note_id,
  jobId: r.job_id,
  status: r.status,
  verdict: r.verdict,
  createdAt: r.created_at,
  decidedAt: r.decided_at,
});

/** @param {any} r */
const jobOut = (r) => {
  const { practice, running, ...state } = r.state ?? {};
  const mistakes = Array.isArray(practice) ? practice.filter((/** @type {any} */ p) => !p.ok).slice(0, 8) : [];
  return {
    id: r.id,
    scenario: r.scenario,
    executor: r.executor,
    planner: r.planner,
    effort: r.effort,
    phase: r.phase,
    running: Boolean(running),
    state: { ...state, mistakes },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
};

/** @param {import("pg").Pool} pool @param {string} userId @param {string} scenario */
async function activeSkills(pool, userId, scenario) {
  const { rows } = await pool.query(
    "SELECT * FROM app.agent_skills WHERE user_id = $1 AND scenario = $2 AND status = 'active' ORDER BY context",
    [userId, scenario],
  );
  return rows.map((r) => ({ id: r.id, context: r.context, version: r.version, instructions: r.instructions }));
}

/**
 * The executor takes an exam: the agent's own core (packages/agent-core) answers, every model call it makes goes
 * through the harness, and the answers are scored here with the truth the core never sees.
 * @param {import("pg").Pool} pool @param {string} userId @param {Awaited<ReturnType<typeof keyOf>>} k
 * @param {{ kind: string, model: string, effort: string | null, sc: any, skills: { context: string, version: number, instructions: string }[], groups: { set: string, batches: any[] }[] }} exam
 */
async function takeExam(pool, userId, k, exam) {
  const { rows, batches } = numbered(exam.sc, exam.groups);
  const deadline = Date.now() + MODEL_TIMEOUT_MS;
  let cost = 0;
  const task = { scenario: publicScenario(exam.sc), skills: exam.skills, batches };
  let out;
  try {
    out = await runCore(core, task, async (req) => {
      const effort = req.effort === undefined ? exam.effort : effortFor(exam.model, req.effort, exam.effort ?? "medium");
      const run = await harnessed(pool, userId, k, {
        kind: exam.kind, model: exam.model, effort, system: req.system, prompt: req.user, messages: req.messages, tools: req.tools,
        timeoutMs: Math.max(5_000, deadline - Date.now()),
      });
      cost += run.cost;
      return run;
    }, { maxCalls: CORE_MAX_CALLS });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, `The agent's core failed: ${err instanceof Error ? err.message : "unknown error"}`, { reason: "core" });
  }
  return { ...scoreAnswers(exam.sc, rows, out.answers), rows, cost, calls: out.calls, core: core.CORE_VERSION };
}

/** @param {string} model @param {unknown} wanted @param {string} fallback */
function effortFor(model, wanted, fallback) {
  const fam = familyOf(model);
  if (fam && !fam.effort) return null;
  return typeof wanted === "string" && /** @type {readonly string[]} */ (EFFORTS).includes(wanted) ? wanted : fallback;
}

export const GET = handle(async (request) => {
  const user = await requireUser(request);
  const pool = db();
  const [skills, jobs, keys, budget] = await Promise.all([
    pool.query("SELECT * FROM app.agent_skills WHERE user_id = $1 ORDER BY scenario, context, version DESC", [user.id]),
    pool.query("SELECT * FROM app.agent_jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 12", [user.id]),
    pool.query("SELECT model, models FROM app.provider_keys WHERE user_id = $1 AND provider = 'meta' LIMIT 1", [user.id]),
    budgetOf(pool, user.id),
  ]);
  const key = keys.rows[0];
  const models = key && Array.isArray(key.models) ? key.models.map(String) : [];
  // which Meta families this key can use: the agent picks its planner and executor from these
  const families = META_MODELS.map((f) => ({ family: f.family, name: f.name, id: key ? pickId(f, models) : null }));
  return json({
    bench: benchSummary(),
    skills: skills.rows.map(skillOut),
    jobs: jobs.rows.map(jobOut),
    key: key ? { model: key.model, models } : null,
    families,
    budget,
  });
});

/** @param {Request} request */
async function post(request) {
  const user = await requireUser(request);
  const body = await readJson(request);
  const pool = db();
  const op = body.op;

  if (op === "start") {
    const sc = scenarioOf(body.scenario);
    if (!sc) throw new HttpError(400, "Choose one of the bench scenarios");
    const k = await keyOf(pool, user.id);
    const executor = typeof body.executor === "string" && MODEL_ID.test(body.executor) ? body.executor : k.model;
    if (!executor) throw new HttpError(409, "Choose which model to use first", { reason: "no-model" });
    const wonder = META_MODELS.find((f) => f.family === "wonder");
    const planner = typeof body.planner === "string" && MODEL_ID.test(body.planner)
      ? body.planner
      : (wonder && pickId(wonder, k.models)) || executor;
    const effort = effortFor(executor, body.effort, "medium");
    const guidance = typeof body.guidance === "string" ? body.guidance.trim().slice(0, 500) : "";
    const { rows: busy } = await pool.query(
      `SELECT * FROM app.agent_jobs WHERE user_id = $1 AND phase = ANY($2) AND updated_at > now() - interval '15 minutes' LIMIT 1`,
      [user.id, RUNNING],
    );
    if (busy[0]) throw new HttpError(409, "A cycle is already running; finish it first", { reason: "busy", job: jobOut(busy[0]) });
    const { rows } = await pool.query(
      `INSERT INTO app.agent_jobs (user_id, scenario, executor, planner, effort, phase, state)
       VALUES ($1, $2, $3, $4, $5, 'baseline', $6) RETURNING *`,
      [user.id, sc.id, executor, planner, effort, JSON.stringify({ guidance, cost: 0 })],
    );
    return json({ job: jobOut(rows[0]) });
  }

  if (op === "step") {
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new HttpError(400, "Which cycle?");
    // take the job: only one step runs at a time (a stuck step frees itself after 3 minutes)
    const { rows: taken } = await pool.query(
      `UPDATE app.agent_jobs SET state = state || '{"running": true}'::jsonb, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND phase = ANY($3)
         AND (NOT COALESCE((state->>'running')::boolean, false) OR updated_at < now() - interval '3 minutes')
       RETURNING *`,
      [jobId, user.id, RUNNING],
    );
    const job = taken[0];
    if (!job) {
      const { rows } = await pool.query("SELECT * FROM app.agent_jobs WHERE id = $1 AND user_id = $2", [jobId, user.id]);
      if (!rows[0]) throw new HttpError(404, "That cycle doesn't exist");
      return json({ job: jobOut(rows[0]) });
    }
    const save = async (/** @type {string} */ phase, /** @type {Record<string, unknown>} */ state) => {
      const { running: _r, ...rest } = state;
      const { rows } = await pool.query(
        "UPDATE app.agent_jobs SET phase = $2, state = $3, updated_at = now() WHERE id = $1 RETURNING *",
        [job.id, phase, JSON.stringify(rest)],
      );
      return rows[0];
    };
    /** @type {Record<string, any>} */
    const state = { ...job.state, error: null };
    try {
      const next = await runPhase(pool, user.id, job, state);
      return json({ job: jobOut(await save(next, state)) });
    } catch (err) {
      state.error = err instanceof Error ? err.message : "failed";
      await save(job.phase, state);
      throw err;
    }
  }

  if (op === "decide") {
    const skillId = typeof body.skillId === "string" ? body.skillId : "";
    const decision = body.decision === "approved" || body.decision === "rejected" ? body.decision : null;
    if (!skillId || !decision) throw new HttpError(400, "Send the skill and your decision");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT * FROM app.agent_skills WHERE id = $1 AND user_id = $2 AND status = 'candidate' FOR UPDATE",
        [skillId, user.id],
      );
      const s = rows[0];
      if (!s) throw new HttpError(404, "That candidate isn't waiting for a decision");
      if (decision === "approved" && !s.verdict?.pass) throw new HttpError(409, "The harness did not pass this skill");
      if (decision === "approved") {
        await client.query(
          "UPDATE app.agent_skills SET status = 'retired', decided_at = now() WHERE user_id = $1 AND scenario = $2 AND context = $3 AND status = 'active'",
          [user.id, s.scenario, s.context],
        );
      }
      const { rows: out } = await client.query(
        "UPDATE app.agent_skills SET status = $2, decided_at = now() WHERE id = $1 RETURNING *",
        [skillId, decision === "approved" ? "active" : "rejected"],
      );
      if (s.job_id) {
        await client.query(
          `UPDATE app.agent_jobs SET phase = 'done', state = state || $2::jsonb, updated_at = now() WHERE id = $1 AND user_id = $3`,
          [s.job_id, JSON.stringify({ outcome: decision }), user.id],
        );
      }
      await client.query("COMMIT");
      return json({ skill: skillOut(out[0]) });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  if (op === "retire") {
    const skillId = typeof body.skillId === "string" ? body.skillId : "";
    const { rows } = await pool.query(
      "UPDATE app.agent_skills SET status = 'retired', decided_at = now() WHERE id = $1 AND user_id = $2 AND status = 'active' RETURNING *",
      [skillId, user.id],
    );
    if (!rows[0]) throw new HttpError(404, "That skill isn't active");
    return json({ skill: skillOut(rows[0]) });
  }

  if (op === "exam") {
    const sc = scenarioOf(body.scenario);
    if (!sc) throw new HttpError(400, "Choose one of the bench scenarios");
    const k = await keyOf(pool, user.id);
    const model = typeof body.executor === "string" && MODEL_ID.test(body.executor) ? body.executor : k.model;
    if (!model) throw new HttpError(409, "Choose which model to use first", { reason: "no-model" });
    const skills = body.bare ? [] : await activeSkills(pool, user.id, sc.id);
    const effort = effortFor(model, body.effort, "medium");
    const run = await takeExam(pool, user.id, k, { kind: "exam", model, effort, sc, skills, groups: [{ set: "sealed", batches: sc.sets.sealed }] });
    return json({ scenario: sc.id, bare: Boolean(body.bare), skills: skills.map((s) => ({ context: s.context, version: s.version })), scores: run.scores.sealed ?? {}, answered: run.answered, total: run.rows.length, cost: run.cost, model, core: run.core });
  }

  throw new HttpError(400, "Unknown operation");
}

/**
 * Runs the job's current phase and returns the next one. Mutates `state`.
 * @param {import("pg").Pool} pool @param {string} userId @param {any} job @param {Record<string, any>} state
 */
async function runPhase(pool, userId, job, state) {
  const sc = scenarioOf(job.scenario);
  if (!sc) throw new HttpError(400, "This cycle's scenario no longer exists");
  const k = await keyOf(pool, userId);
  const active = await activeSkills(pool, userId, sc.id);
  const spend = (/** @type {number} */ c) => { state.cost = Number(state.cost ?? 0) + c; };

  if (job.phase === "baseline") {
    const run = await takeExam(pool, userId, k, {
      kind: "eval", model: job.executor, effort: job.effort, sc, skills: active,
      groups: [{ set: "practice", batches: sc.sets.practice }, { set: "validation", batches: sc.sets.validation }],
    });
    spend(run.cost);
    const { scores, marked, answered, rows } = run;
    state.core = run.core;
    state.skillsUsed = active.map((s) => ({ context: s.context, version: s.version }));
    state.before = { practice: scores.practice ?? {}, validation: scores.validation ?? {}, answered, total: rows.length };
    state.practice = marked.filter((m) => m.set === "practice").map(({ context, fields, truth, given, ok }) => ({ context, fields, truth, given, ok }));
    const perfect = marked.every((m) => m.ok);
    if (perfect) state.outcome = "nothing-to-learn";
    return perfect ? "done" : "propose";
  }

  if (job.phase === "propose") {
    const { rows: ideas } = await pool.query(
      `SELECT external_id AS id, title, gain FROM app.research_notes
       WHERE user_id = $1 AND decision = 'approved' AND verdict = 'experiment' ORDER BY decided_at DESC LIMIT 5`,
      [userId],
    );
    const { prompt } = plannerPrompt(sc, active, state.practice ?? [], ideas, String(state.guidance ?? ""));
    const effort = effortFor(job.planner, "high", "high");
    const run = await harnessed(pool, userId, k, { kind: "propose", model: job.planner, effort, system: PLANNER_SYSTEM, prompt });
    spend(run.cost);
    let proposal;
    try {
      proposal = parseProposal(sc, run.text);
    } catch (err) {
      state.outcome = "planner-failed";
      state.detail = err instanceof Error ? err.message : "unreadable";
      return "done";
    }
    const noteId = proposal.noteId && ideas.some((i) => i.id === proposal.noteId) ? proposal.noteId : null;
    const { rows: ver } = await pool.query(
      "SELECT COALESCE(MAX(version), 0)::int AS v FROM app.agent_skills WHERE user_id = $1 AND scenario = $2 AND context = $3",
      [userId, sc.id, proposal.context],
    );
    const parent = active.find((s) => s.context === proposal.context);
    const { rows } = await pool.query(
      `INSERT INTO app.agent_skills (user_id, scenario, context, version, instructions, rationale, parent_id, model, note_id, job_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [userId, sc.id, proposal.context, (ver[0]?.v ?? 0) + 1, proposal.instructions, proposal.rationale, parent?.id ?? null, job.planner, noteId, job.id],
    );
    state.candidate = { ...skillOut(rows[0]), parentInstructions: parent?.instructions ?? null };
    return "validate";
  }

  if (job.phase === "validate") {
    const cand = state.candidate;
    if (!cand) throw new HttpError(409, "This cycle has no candidate");
    const skills = [...active.filter((s) => s.context !== cand.context), { context: cand.context, version: cand.version, instructions: cand.instructions }];
    const run = await takeExam(pool, userId, k, { kind: "eval", model: job.executor, effort: job.effort, sc, skills, groups: [{ set: "validation", batches: sc.sets.validation }] });
    spend(run.cost);
    const { scores } = run;
    const after = scores.validation ?? {};
    const verdict = { ...harnessVerdict(state.before?.validation ?? {}, after, cand.context), before: state.before?.validation ?? {}, after };
    state.after = after;
    state.verdict = verdict;
    await pool.query(
      `UPDATE app.agent_skills SET verdict = $2, status = CASE WHEN $3 THEN status ELSE 'rejected' END,
         decided_at = CASE WHEN $3 THEN decided_at ELSE now() END WHERE id = $1`,
      [cand.id, JSON.stringify(verdict), verdict.pass],
    );
    if (!verdict.pass) state.outcome = "harness-rejected";
    return verdict.pass ? "awaiting" : "done";
  }

  throw new HttpError(409, "Nothing left to run in this cycle");
}

export const POST = handle(post);
