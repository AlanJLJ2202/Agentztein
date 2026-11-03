// /api/evolve: each user's agent changing its own code (ADR-026, docs/EVOLVE.md). Any signed-in user with a Meta key.
//   GET                                 their core today (their own active version, or the platform's), their versions
//                                       and their runs
//   POST { op: "propose", guidance?, builder? }  Muse Wonder (their key, inside their harness) reads where their core
//                                       fails, the radar ideas they approved and their past attempts, writes one
//                                       hypothesis for a code change and starts a run
//   POST { op: "dispatch", title, idea?, builder? }  the same with their own idea, no model call
//   POST { op: "activate", coreId }     go back to one of their versions that passed the gate (rollback);
//                                       coreId null = back to the platform's core
// A run happens in GitHub Actions (evolve.yml): Muse Code (or Forja) changes a copy of their core, the judge gives
// their current core and the new one a fresh exam, and a version that improves without breaking anything becomes
// their active core. CI uses their own key, fetched once through /api/evolve-ci with the run's one-time token.
import * as core from "@skillab/agent-core";
import { META_MODELS, pickId } from "@skillab/research";
import { parseJsonObject } from "./_lib/agent.js";
import { requireUser } from "./_lib/auth.js";
import { activeCore, coreOut, newToken, runOut } from "./_lib/cores.js";
import { db } from "./_lib/db.js";
import { dispatchEvolve, githubConfig } from "./_lib/github.js";
import { evolveHealth, MIN_LEFT_USD } from "./_lib/evolve-health.js";
import { budgetOf } from "./_lib/harness.js";
import { harnessed, keyOf } from "./_lib/harnessed.js";
import { HttpError, handle, json, readJson } from "./_lib/http.js";

export const BUILDERS = ["muse-code", "forja"];
/** Most a run may spend of the user's budget (bench + Forja; Muse Code bills its own use to the same key). */
export const RUN_MAX_USD = Number(process.env.EVOLVE_MAX_USD ?? 2);
/** Runs per user per day: GitHub Actions minutes are the platform's. */
export const DAILY_RUNS = Number(process.env.EVOLVE_DAILY_RUNS ?? 3);
const BUSY = ["queued", "building"];

export const EVOLVE_SYSTEM =
  "Eres el planificador de Agentztein, un agente que se mejora a sí mismo cambiando su propio código. Tu código es un " +
  "paquete JS: una función solve(task, tools) que etiqueta registros de negocio y solo llega al modelo por " +
  "tools.model({ system, user | messages, tools, effort }) con function calling de Meta y como máximo 3 llamadas por tarea. " +
  "No tiene red, archivos ni secretos. Un juez lo examina con registros nuevos (semilla aleatoria, perfil held-out, sin skills) " +
  "y solo adopta el cambio si sube el total sin bajar ningún escenario. Propón UN cambio de código concreto y comprobable " +
  "(no una skill de texto): por ejemplo herramientas propias en JS puro (calculadora, unidades, fechas), verificación o " +
  "votación entre pasadas, cómo se arma el prompt o se lee la respuesta, o el effort por llamada. No repitas intentos que ya " +
  'fallaron. Responde SOLO con JSON: {"title": "<título corto, imperativo>", "hypothesis": "<qué debilidad ves y por qué ' +
  'este cambio la corrige>", "plan": "<pasos concretos para el constructor>", "source": "<de dónde salió la idea: errores, ' +
  'radar (id) o intento previo>"}';

/** What a run needs from the server's configuration, by name (no values). */
export function missingForRuns(env = process.env) {
  const missing = [];
  if (!githubConfig(env)) missing.push(...(githubConfig({ ...env, AGENT_GH_TOKEN: "x" }) ? ["AGENT_GH_TOKEN"] : ["AGENT_GH_TOKEN", "AGENT_GH_REPO"]));
  if ((env.EVOLVE_CI_SECRET ?? "").length < 32) missing.push("EVOLVE_CI_SECRET");
  return missing;
}

/** Where CI reports back: EVOLVE_APP_URL, else the production domain, else this request's origin. @param {Request} request */
function appUrl(request) {
  const fixed = process.env.EVOLVE_APP_URL?.trim();
  if (fixed) return fixed.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return new URL(request.url).origin;
}

/** @param {import("pg").Pool} pool @param {string} userId */
async function stateOf(pool, userId) {
  const [cores, runs] = await Promise.all([
    pool.query("SELECT * FROM app.agent_cores WHERE user_id = $1 ORDER BY version DESC LIMIT 30", [userId]),
    pool.query("SELECT * FROM app.evolve_runs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 12", [userId]),
  ]);
  const byId = new Map(cores.rows.map((r) => [r.id, r]));
  const active = cores.rows.find((r) => r.status === "active") ?? null;
  return {
    platform: { version: core.CORE_VERSION, strategy: core.STRATEGY },
    active: active ? { id: active.id, version: active.version, coreVersion: active.core_version, strategy: active.strategy } : null,
    cores: cores.rows.map((r) => coreOut(r, r.parent_id ? byId.get(r.parent_id)?.files ?? null : null)),
    runs: runs.rows.map(runOut),
  };
}

export const GET = handle(async (request) => {
  const user = await requireUser(request);
  const pool = db();
  const url = new URL(request.url);
  const coreId = url.searchParams.get("core");
  if (coreId) {
    // the code of one of the user's own versions
    if (!/^[0-9a-f-]{36}$/i.test(coreId)) throw new HttpError(400, "Which version?");
    const { rows } = await pool.query("SELECT * FROM app.agent_cores WHERE id = $1 AND user_id = $2", [coreId, user.id]);
    if (!rows[0]) throw new HttpError(404, "That version doesn't exist");
    return json({ core: coreOut(rows[0]), files: rows[0].files });
  }
  // what's missing, checked for real (and stale runs marked failed) before reading the user's state
  const health = await evolveHealth({ pool, userId: user.id });
  const limits = { maxUsd: RUN_MAX_USD, dailyRuns: DAILY_RUNS };
  const missing = missingForRuns();
  const state = health.tables
    ? await stateOf(pool, user.id)
    : { platform: { version: core.CORE_VERSION, strategy: core.STRATEGY }, active: null, cores: [], runs: [] };
  return json({ ...state, configured: missing.length === 0 && health.tables, missing, health, limits });
});

/** The planner's prompt: who the agent is today, where it fails, what was approved and what was already tried. */
export function evolvePrompt(o) {
  const parts = [
    `Versión actual de tu núcleo: ${o.version}. Estrategia: ${o.strategy}`,
    o.mistakes.length
      ? `Errores recientes del ejecutor en práctica (con la respuesta correcta):\n${o.mistakes.map((m) => `- [${m.scenario}/${m.context}] ${Object.entries(m.fields).map(([k, v]) => `${k}=${typeof v === "number" ? v : JSON.stringify(v)}`).join("; ")} → correcta: ${m.truth}; dijo: ${m.given ?? "(nada)"}`).join("\n")}`
      : "Todavía no hay ciclos con errores de práctica: propón algo que haga al núcleo más robusto en general.",
    o.ideas.length ? `Ideas del radar que la persona aprobó:\n${o.ideas.map((i) => `- [${i.id}] ${i.title}: ${i.gain}`).join("\n")}` : "",
    o.past.length ? `Intentos anteriores (no repitas los que fallaron):\n${o.past.map((p) => `- ${p.title} → ${p.status}${p.gain !== null && p.gain !== undefined ? ` (${p.gain >= 0 ? "+" : ""}${p.gain})` : ""}`).join("\n")}` : "",
    o.guidance ? `Guía de la persona: ${o.guidance}` : "",
  ];
  return parts.filter(Boolean).join("\n\n");
}

/** @param {string} text */
export function parseEvolveProposal(text) {
  const obj = parseJsonObject(text);
  const s = (/** @type {unknown} */ v, /** @type {number} */ n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const title = s(obj.title, 100);
  const hypothesis = s(obj.hypothesis, 1500);
  if (title.length < 5 || hypothesis.length < 20) throw new HttpError(502, "The planner didn't write a usable hypothesis; try again");
  return { title, hypothesis, plan: s(obj.plan, 2500), source: s(obj.source, 300) };
}

/**
 * Checks the user may start a run now and how much it may spend.
 * @param {import("pg").Pool} pool @param {string} userId
 */
async function admit(pool, userId) {
  const missing = missingForRuns();
  if (missing.length) throw new HttpError(503, `Code changes aren't set up on this server yet (${missing.join(", ")})`, { reason: "not-configured", missing });
  // the same checks the dashboard shows: refuse a run that can't work (e.g. the workflow isn't on main yet)
  const health = await evolveHealth({ pool, userId });
  const blocking = health.checks.filter((c) => c.who === "admin" && c.ok === false);
  if (blocking.length) throw new HttpError(503, `Code changes can't run yet: ${blocking.map((c) => c.title.en).join("; ")}`, { reason: "not-configured", checks: blocking });
  const [{ rows: busy }, { rows: today }, budget] = await Promise.all([
    pool.query("SELECT id FROM app.evolve_runs WHERE user_id = $1 AND status = ANY($2) AND updated_at > now() - interval '90 minutes' LIMIT 1", [userId, BUSY]),
    pool.query("SELECT count(*)::int AS n FROM app.evolve_runs WHERE user_id = $1 AND created_at > now() - interval '1 day'", [userId]),
    budgetOf(pool, userId),
  ]);
  if (busy[0]) throw new HttpError(409, "Your agent is already changing its code; wait for that run to finish", { reason: "busy" });
  if ((today[0]?.n ?? 0) >= DAILY_RUNS) throw new HttpError(429, `You can start ${DAILY_RUNS} code changes a day; try again tomorrow`, { reason: "daily-limit" });
  const left = budget.monthly - budget.spent;
  if (left < MIN_LEFT_USD) throw new HttpError(409, "Not enough budget left this month for a code change. Raise it in Brain.", { reason: "budget", ...budget });
  return { maxUsd: Math.min(RUN_MAX_USD, left) };
}

/**
 * Creates the run and starts the workflow. If GitHub refuses, the run is marked failed and the error goes up.
 * @param {Request} request @param {import("pg").Pool} pool @param {string} userId
 * @param {{ proposal: Record<string, string>, builder: string, maxUsd: number }} o
 */
async function startRun(request, pool, userId, o) {
  const cfg = githubConfig();
  if (!cfg) throw new HttpError(503, "GitHub is not connected", { reason: "not-configured" });
  const base = await activeCore(pool, userId);
  const { token, hash } = newToken();
  const { rows } = await pool.query(
    `INSERT INTO app.evolve_runs (user_id, builder, proposal, base_core_id, token_hash, max_usd, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [userId, o.builder, JSON.stringify(o.proposal), base?.id ?? null, hash, o.maxUsd.toFixed(4), JSON.stringify({ stage: "queued" })],
  );
  const run = rows[0];
  try {
    await dispatchEvolve(cfg, { runId: run.id, token, appUrl: appUrl(request), ref: process.env.EVOLVE_WORKFLOW_REF || "main" });
  } catch (err) {
    await pool.query(
      "UPDATE app.evolve_runs SET status = 'failed', detail = detail || $2::jsonb, updated_at = now() WHERE id = $1",
      [run.id, JSON.stringify({ error: err instanceof Error ? err.message : "dispatch failed", stage: "dispatch" })],
    );
    throw err;
  }
  return runOut(run);
}

export const POST = handle(async (request) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const pool = db();
  const builder = typeof body.builder === "string" && BUILDERS.includes(body.builder) ? body.builder : "muse-code";

  if (body.op === "activate") {
    const coreId = body.coreId === null ? null : typeof body.coreId === "string" ? body.coreId : undefined;
    if (coreId === undefined) throw new HttpError(400, "Which version?");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (coreId) {
        const { rows } = await client.query("SELECT * FROM app.agent_cores WHERE id = $1 AND user_id = $2 FOR UPDATE", [coreId, user.id]);
        const c = rows[0];
        if (!c) throw new HttpError(404, "That version doesn't exist");
        if (!c.verdict?.pass) throw new HttpError(409, "Only versions that passed the gate can be used");
      }
      await client.query("UPDATE app.agent_cores SET status = 'retired', decided_at = now() WHERE user_id = $1 AND status = 'active'", [user.id]);
      if (coreId) await client.query("UPDATE app.agent_cores SET status = 'active', decided_at = now() WHERE id = $1", [coreId]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return json(await stateOf(pool, user.id));
  }

  if (body.op === "dispatch") {
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 100) : "";
    const idea = typeof body.idea === "string" ? body.idea.trim().slice(0, 3000) : "";
    if (title.length < 5) throw new HttpError(400, "Give the change a title");
    await keyOf(pool, user.id); // the run will use the user's key: make sure there is one
    const { maxUsd } = await admit(pool, user.id);
    const run = await startRun(request, pool, user.id, { proposal: { title, hypothesis: idea, plan: "", source: "idea de la persona", by: "person" }, builder, maxUsd });
    return json({ run });
  }

  if (body.op === "propose") {
    const k = await keyOf(pool, user.id);
    const { maxUsd } = await admit(pool, user.id);
    const wonder = META_MODELS.find((f) => f.family === "wonder");
    const model = (wonder && pickId(wonder, k.models)) || k.model;
    if (!model) throw new HttpError(409, "Choose which model to use first", { reason: "no-model" });
    const [jobs, notes, past, own] = await Promise.all([
      pool.query("SELECT scenario, state FROM app.agent_jobs WHERE user_id = $1 AND state ? 'practice' ORDER BY created_at DESC LIMIT 12", [user.id]),
      pool.query(
        `SELECT external_id AS id, title, gain FROM app.research_notes
         WHERE user_id = $1 AND decision = 'approved' AND verdict = 'experiment' ORDER BY decided_at DESC LIMIT 5`,
        [user.id],
      ),
      pool.query("SELECT proposal, status, detail FROM app.evolve_runs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 8", [user.id]),
      activeCore(pool, user.id),
    ]);
    const seen = new Set();
    /** @type {any[]} */
    const mistakes = [];
    for (const j of jobs.rows) {
      if (seen.has(j.scenario)) continue;
      seen.add(j.scenario);
      const wrong = (Array.isArray(j.state?.practice) ? j.state.practice : []).filter((/** @type {any} */ p) => !p.ok).slice(0, 5);
      for (const m of wrong) mistakes.push({ scenario: j.scenario, ...m });
    }
    const guidance = typeof body.guidance === "string" ? body.guidance.trim().slice(0, 500) : "";
    const prompt = evolvePrompt({
      version: own ? `v${own.version} (${own.core_version})` : core.CORE_VERSION,
      strategy: own ? own.strategy : core.STRATEGY,
      mistakes,
      ideas: notes.rows,
      past: past.rows.map((r) => ({ title: r.proposal?.title ?? "?", status: r.status, gain: r.detail?.verdict?.gain ?? null })),
      guidance,
    });
    const run = await harnessed(pool, user.id, k, { kind: "evolve", model, effort: null, system: EVOLVE_SYSTEM, prompt });
    const proposal = parseEvolveProposal(run.text);
    const started = await startRun(request, pool, user.id, { proposal: { ...proposal, by: model }, builder, maxUsd: Math.max(0.2, maxUsd - run.cost) });
    return json({ run: started, proposal, cost: run.cost, model });
  }

  throw new HttpError(400, "Unknown operation");
});
