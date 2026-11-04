// /api/talk: talk with your Agentztein. It answers as itself, in plain words and short sentences (the app reads them
// aloud), knowing the state of your lab: its skills, its last cycle, your budget, the radar. It can suggest one
// action (open a tab, or start a cycle where it decides everything itself); the app only does it if you press the
// button. Every message goes through the same harness as the rest: your key, your monthly budget, logged.
//   POST { messages: [{ role: "user" | "assistant", content }], lang?, tab? }   → { say, action, cost, model }
import { familyOf, META_MODELS, pickId } from "@skillab/research";
import { benchSummary, parseJsonObject } from "./_lib/agent.js";
import { requireUser } from "./_lib/auth.js";
import { db } from "./_lib/db.js";
import { budgetOf } from "./_lib/harness.js";
import { harnessed, keyOf } from "./_lib/harnessed.js";
import { HttpError, handle, json, readJson } from "./_lib/http.js";
import { activeMemories, BUDGETS, DREAM_AFTER, markUsed, recall, undigested } from "./_lib/memory.js";

const MAX_TURNS = 12;
const MAX_CHARS = 1000;
export const TALK_ACTIONS = ["none", "auto-cycle", "dream", "open:overview", "open:mind", "open:lab", "open:agent", "open:evolve", "open:radar", "open:brain"];

/** @param {unknown} raw */
export function cleanTurns(raw) {
  if (!Array.isArray(raw)) throw new HttpError(400, "Send the conversation as a list of messages");
  const turns = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: /** @type {"user" | "assistant"} */ (m.role), content: m.content.trim().slice(0, MAX_CHARS) }));
  if (!turns.length || turns[turns.length - 1]?.role !== "user") throw new HttpError(400, "The last message must be yours");
  return turns;
}

/** Reads the model's reply: JSON with what to say and an optional action; plain text is said as it is. @param {string} text */
export function readReply(text) {
  try {
    const obj = parseJsonObject(text);
    const say = typeof obj.say === "string" ? obj.say.trim() : "";
    const action = typeof obj.action === "string" && TALK_ACTIONS.includes(obj.action) && obj.action !== "none" ? obj.action : null;
    if (say) return { say: say.slice(0, 700), action };
  } catch {
    /* plain text */
  }
  return { say: text.replace(/```[a-z]*|```/g, "").trim().slice(0, 700) || "…", action: null };
}

/** What it knows about the person's lab, in a few lines. @param {import("pg").Pool} pool @param {string} userId */
async function labSummary(pool, userId) {
  const [skills, jobs, notes, budget, memories, pending, dreams] = await Promise.all([
    pool.query("SELECT scenario, context, version FROM app.agent_skills WHERE user_id = $1 AND status = 'active'", [userId]),
    pool.query("SELECT scenario, executor, phase, state FROM app.agent_jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3", [userId]),
    pool.query("SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE verdict = 'experiment')::int AS e FROM app.research_notes WHERE user_id = $1", [userId]),
    budgetOf(pool, userId),
    activeMemories(pool, userId),
    undigested(pool, userId),
    pool.query("SELECT created_at, summary FROM app.agent_dreams WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1", [userId]),
  ]);
  const all = benchSummary();
  const memory = recall(memories, { budget: BUDGETS.talk });
  await markUsed(pool, memory.ids);
  const lastDream = dreams.rows[0];
  const bench = all.filter((b) => !b.legacy);
  const title = (/** @type {string} */ id) => all.find((b) => b.id === id)?.title ?? id;
  const frac = (/** @type {any} */ s) => {
    const t = Object.values(s ?? {}).reduce((/** @type {{ c: number, t: number }} */ a, /** @type {any} */ b) => ({ c: a.c + b.correct, t: a.t + b.total }), { c: 0, t: 0 });
    return t.t ? `${t.c}/${t.t}` : "—";
  };
  const lines = [
    `Exámenes (cada uno al estilo de un benchmark de frontera): ${bench.map((b) => `${b.title}, estilo ${b.benchmark} (${b.contexts.map((c) => c.name).join(", ")})`).join("; ")}.`,
    `Habilidades activas: ${skills.rows.length ? skills.rows.map((s) => `${title(s.scenario)} · ${s.context} v${s.version}`).join("; ") : "ninguna todavía"}.`,
    `Últimos ciclos: ${jobs.rows.length ? jobs.rows.map((j) => `${title(j.scenario)} con ${j.executor}: fase ${j.phase}${j.state?.outcome ? `, resultado ${j.state.outcome}` : ""}, validación antes ${frac(j.state?.before?.validation)}${j.state?.after ? ` y con la candidata ${frac(j.state.after)}` : ""}`).join(" | ") : "ninguno todavía"}.`,
    `Radar: ${notes.rows[0]?.n ?? 0} historias evaluadas, ${notes.rows[0]?.e ?? 0} valen un experimento.`,
    `Presupuesto del mes: gastado $${budget.spent.toFixed(2)} de $${budget.monthly.toFixed(2)}.`,
    `Memoria: ${memories.length} lecciones activas; ${pending} ciclos terminados sin digerir (sueña solo al llegar a ${DREAM_AFTER}); ${lastDream ? `soñó por última vez el ${new Date(lastDream.created_at).toISOString().slice(0, 10)}: ${lastDream.summary}` : "nunca ha soñado"}.`,
    ...(memory.text ? [`Lo que más recuerdas:\n${memory.text}`] : []),
  ];
  return lines.join("\n");
}

/** @param {string} lang @param {string} lab @param {string} tab */
export function talkSystem(lang, lab, tab) {
  return (
    "Eres Agentztein, un agente de IA armado por piezas como Frankenstein, con el cerebro de Meta (los modelos Muse). " +
    "Te mejoras a ti mismo: presentas exámenes, estudias tus errores, te escribes habilidades (textos cortos de instrucciones) " +
    "y un arnés junto con la persona deciden si se quedan. También puedes cambiar tu propio código en otra pestaña. " +
    "Hablas con la persona dueña de este laboratorio. Habla como un compañero amable y curioso, en primera persona, con " +
    "palabras sencillas para alguien que no es técnico; usa ejemplos cotidianos. Responde en 1 a 3 frases cortas, porque se " +
    "leen en voz alta: sin listas, sin markdown, sin emojis. No inventes números: usa solo los del estado del laboratorio. " +
    `Responde en ${lang === "es" ? "español de México" : "English"}.\n\n` +
    `Estado del laboratorio:\n${lab}\n\nLa persona está viendo la pestaña: ${tab}.\n\n` +
    'Responde SOLO con JSON: {"say": "<lo que dices>", "action": "<una de: none, auto-cycle, dream, open:overview, open:mind, open:lab, ' +
    'open:agent, open:evolve, open:radar, open:brain>"}. Usa auto-cycle solo si la persona te pide mejorarte o practicar y no hay ' +
    "un ciclo corriendo; dream si te pide ordenar o consolidar lo que aprendiste y hay ciclos sin digerir; open:<pestaña> si le ayudaría verla. La app le pide confirmación antes de hacer cualquier acción."
  );
}

export const POST = handle(async (request) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const turns = cleanTurns(body.messages);
  const lang = body.lang === "es" ? "es" : "en";
  const tab = typeof body.tab === "string" ? body.tab.slice(0, 20) : "overview";
  const pool = db();
  const k = await keyOf(pool, user.id);
  // a conversation is light work: the everyday model of the key, with little reasoning
  const spark = META_MODELS.find((f) => f.family === "spark");
  const model = k.model && familyOf(k.model)?.family !== "wonder" ? k.model : (spark && pickId(spark, k.models)) || k.model;
  if (!model) throw new HttpError(409, "Choose which model to use first", { reason: "no-model" });
  const system = talkSystem(lang, await labSummary(pool, user.id), tab);
  const effort = familyOf(model)?.effort === false ? null : "low";
  const run = await harnessed(pool, user.id, k, { kind: "talk", model, effort, messages: [{ role: "system", content: system }, ...turns], timeoutMs: 45_000 });
  return json({ ...readReply(run.text), cost: run.cost, model });
});
