// /api/evolve: the agent changing its own code (ADR-026, docs/EVOLVE.md).
//   GET                              its lineage: agent-vN tags, evolve PRs with the gate's verdict, ideas in progress
//   POST { op: "propose", guidance? }  Muse Wonder (with the user's key, inside the harness) reads the core's strategy,
//                                   the latest practice mistakes, approved radar ideas and past attempts, writes one
//                                   hypothesis for a code change and opens an "evolve" issue → GitHub Actions builds
//                                   it with Muse Code, the gate judges it and merges it if it earns it
//   POST { op: "dispatch", title, idea }  the same with a person's own idea, no model call
// Opening issues spends the project's Meta key in CI, so only EVOLVE_ADMINS may do it.
import * as core from "@skillab/agent-core";
import { META_MODELS, pickId } from "@skillab/research";
import { parseJsonObject } from "./_lib/agent.js";
import { requireUser } from "./_lib/auth.js";
import { db } from "./_lib/db.js";
import { builderOf, EVOLVE_LABEL, gateOf, gh, githubConfig, isAdmin } from "./_lib/github.js";
import { harnessed, keyOf } from "./_lib/harnessed.js";
import { HttpError, handle, json, readJson } from "./_lib/http.js";

export const EVOLVE_SYSTEM =
  "Eres el planificador de Agentztein, un agente que se mejora a sí mismo cambiando su propio código. Tu código vive en " +
  "packages/agent-core: una función solve(task, tools) que etiqueta registros de negocio y solo llega al modelo por " +
  "tools.model({ system, user | messages, tools, effort }) con function calling de Meta y como máximo 3 llamadas por tarea. " +
  "No tiene red, archivos ni secretos. Un juez la examina con registros nuevos (semilla aleatoria, perfil held-out, sin skills) " +
  "y solo fusiona el cambio si sube el total sin bajar ningún escenario. Propón UN cambio de código concreto y comprobable " +
  "(no una skill de texto): por ejemplo herramientas propias en JS puro (calculadora, unidades, fechas), verificación o " +
  "votación entre pasadas, cómo se arma el prompt o se lee la respuesta, o el effort por llamada. No repitas intentos que ya " +
  'fallaron. Responde SOLO con JSON: {"title": "<título corto, imperativo>", "hypothesis": "<qué debilidad ves y por qué ' +
  'este cambio la corrige>", "plan": "<pasos concretos para el constructor>", "source": "<de dónde salió la idea: errores, ' +
  'radar (id) o intento previo>"}';

/** @param {any} pr @param {any} gate */
const prOut = (pr, gate) => ({
  number: pr.number,
  title: pr.title,
  url: pr.html_url,
  state: pr.merged_at ? "merged" : pr.state,
  createdAt: pr.created_at,
  mergedAt: pr.merged_at ?? null,
  builder: builderOf(pr.body),
  gate,
});

/** What came of the agent's attempts, from GitHub. @param {{ token: string, repo: string }} cfg */
async function lineage(cfg) {
  const [pulls, issues, tags] = await Promise.all([
    gh(cfg, `issues?labels=${EVOLVE_LABEL}&state=all&per_page=30&sort=created&direction=desc`),
    gh(cfg, `issues?labels=${EVOLVE_LABEL}&state=open&per_page=10`),
    gh(cfg, "git/matching-refs/tags/agent-v").catch(() => []),
  ]);
  const prNumbers = (/** @type {any[]} */ (pulls)).filter((i) => i.pull_request).slice(0, 8).map((i) => i.number);
  const prs = await Promise.all(
    prNumbers.map(async (n) => {
      const [pr, comments] = await Promise.all([gh(cfg, `pulls/${n}`), gh(cfg, `issues/${n}/comments?per_page=50`)]);
      const gateComment = [...(/** @type {any[]} */ (comments))].reverse().find((c) => String(c.body ?? "").startsWith("<!-- agent-gate -->"));
      return prOut(pr, gateOf(gateComment?.body));
    }),
  );
  const ideas = (/** @type {any[]} */ (issues))
    .filter((i) => !i.pull_request)
    .map((i) => ({ number: i.number, title: i.title, url: i.html_url, createdAt: i.created_at, comments: i.comments }));
  const versions = (/** @type {any[]} */ (tags))
    .map((t) => ({ tag: String(t.ref).replace("refs/tags/", ""), sha: String(t.object?.sha ?? "").slice(0, 7) }))
    .sort((a, b) => Number(b.tag.slice(7)) - Number(a.tag.slice(7)));
  return { prs, ideas, versions };
}

export const GET = handle(async (request) => {
  const user = await requireUser(request);
  const cfg = githubConfig();
  const base = { core: { version: core.CORE_VERSION, strategy: core.STRATEGY }, canDispatch: isAdmin(user.email) && Boolean(cfg) };
  if (!cfg) return json({ ...base, configured: false, missing: ["AGENT_GH_TOKEN", ...(githubConfig({ ...process.env, AGENT_GH_TOKEN: "x" }) ? [] : ["AGENT_GH_REPO"])], prs: [], ideas: [], versions: [] });
  return json({ ...base, configured: true, repo: cfg.repo, ...(await lineage(cfg)) });
});

/** The body of an evolve issue: what the builder reads as "the hypothesis of this run". */
export function issueBody(o) {
  return [
    o.hypothesis && `**Hipótesis.** ${o.hypothesis}`,
    o.plan && `**Plan.** ${o.plan}`,
    o.source && `**De dónde salió.** ${o.source}`,
    "",
    `---\nPropuesto por ${o.by}. Al etiquetarse \`${EVOLVE_LABEL}\`, el workflow \`evolve\` lo construye con Muse Code (Meta) en \`packages/agent-core\` y abre un PR; \`agent-gate\` lo examina con un examen nuevo y lo fusiona solo si mejora sin romper nada.`,
  ].filter((x) => x !== undefined && x !== "").join("\n\n");
}

/** @param {{ token: string, repo: string }} cfg @param {string} title @param {string} body */
async function openIssue(cfg, title, body) {
  await gh(cfg, "labels", { method: "POST", body: { name: EVOLVE_LABEL, color: "6d5ce8", description: "Agentztein changing its own code" } }).catch(() => null);
  const issue = await gh(cfg, "issues", { method: "POST", body: { title: title.slice(0, 120), body, labels: [EVOLVE_LABEL] } });
  return { number: issue.number, url: issue.html_url, title: issue.title };
}

/** The planner's prompt: who the agent is today, where it fails, what was approved and what was already tried. */
export function evolvePrompt(o) {
  const parts = [
    `Versión actual del núcleo: ${o.version}. Estrategia: ${o.strategy}`,
    o.mistakes.length
      ? `Errores recientes del ejecutor en práctica (con la respuesta correcta):\n${o.mistakes.map((m) => `- [${m.scenario}/${m.context}] ${Object.entries(m.fields).map(([k, v]) => `${k}=${typeof v === "number" ? v : JSON.stringify(v)}`).join("; ")} → correcta: ${m.truth}; dijo: ${m.given ?? "(nada)"}`).join("\n")}`
      : "Todavía no hay ciclos con errores de práctica: propón algo que haga al núcleo más robusto en general.",
    o.ideas.length ? `Ideas del radar que una persona aprobó:\n${o.ideas.map((i) => `- [${i.id}] ${i.title}: ${i.gain}`).join("\n")}` : "",
    o.past.length ? `Intentos anteriores (no los repitas si fallaron):\n${o.past.map((p) => `- ${p.title} → ${p.state}${p.gate?.decision ? ` (gate: ${p.gate.decision}${p.gate.gain !== null ? `, ${p.gate.gain >= 0 ? "+" : ""}${p.gate.gain}` : ""})` : ""}`).join("\n")}` : "",
    o.guidance ? `Guía de la persona: ${o.guidance}` : "",
  ];
  return parts.filter(Boolean).join("\n\n");
}

/** @param {string} text */
export function parseEvolveProposal(text) {
  const obj = parseJsonObject(text);
  const s = (/** @type {unknown} */ v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const title = s(obj.title, 100);
  const hypothesis = s(obj.hypothesis, 1500);
  if (title.length < 5 || hypothesis.length < 20) throw new HttpError(502, "The planner didn't write a usable hypothesis; try again");
  return { title, hypothesis, plan: s(obj.plan, 2500), source: s(obj.source, 300) };
}

export const POST = handle(async (request) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const cfg = githubConfig();
  if (!cfg) throw new HttpError(503, "GitHub is not connected yet (AGENT_GH_TOKEN, AGENT_GH_REPO)", { reason: "not-configured" });
  if (!isAdmin(user.email)) throw new HttpError(403, "Only the lab's admins can send the agent to change its code (EVOLVE_ADMINS)", { reason: "not-admin" });
  const by = user.email ?? "a person";

  if (body.op === "dispatch") {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const idea = typeof body.idea === "string" ? body.idea.trim().slice(0, 3000) : "";
    if (title.length < 5) throw new HttpError(400, "Give the change a title");
    return json({ issue: await openIssue(cfg, title, issueBody({ hypothesis: idea, by: `${by} (idea propia)` })) });
  }

  if (body.op === "propose") {
    const pool = db();
    const k = await keyOf(pool, user.id);
    const wonder = META_MODELS.find((f) => f.family === "wonder");
    const model = (wonder && pickId(wonder, k.models)) || k.model;
    if (!model) throw new HttpError(409, "Choose which model to use first", { reason: "no-model" });
    const [jobs, notes, past] = await Promise.all([
      pool.query("SELECT scenario, state FROM app.agent_jobs WHERE user_id = $1 AND state ? 'practice' ORDER BY created_at DESC LIMIT 12", [user.id]),
      pool.query(
        `SELECT external_id AS id, title, gain FROM app.research_notes
         WHERE user_id = $1 AND decision = 'approved' AND verdict = 'experiment' ORDER BY decided_at DESC LIMIT 5`,
        [user.id],
      ),
      lineage(cfg).then((l) => l.prs).catch(() => []),
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
    const prompt = evolvePrompt({ version: core.CORE_VERSION, strategy: core.STRATEGY, mistakes, ideas: notes.rows, past, guidance });
    const run = await harnessed(pool, user.id, k, { kind: "evolve", model, effort: null, system: EVOLVE_SYSTEM, prompt });
    const proposal = parseEvolveProposal(run.text);
    const issue = await openIssue(cfg, proposal.title, issueBody({ ...proposal, by: `Muse Wonder (\`${model}\`) para ${by}` }));
    return json({ issue, proposal, cost: run.cost, model });
  }

  throw new HttpError(400, "Unknown operation");
});
