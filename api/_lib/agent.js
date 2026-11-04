// The agent's improvement loop, one model call per step so it fits a serverless function:
//   baseline  the executor answers the practice and validation sets with its active skills
//   propose   the planner reads the practice mistakes (with the right answers) and writes a new skill version
//   validate  the executor answers the validation set again, now with the candidate skill
//   verdict   the harness compares both runs; a candidate that passes waits for a person, one that fails is rejected
// The answers live only here (api/_data/evalset.js): the model never sees validation or sealed answers.
// How the executor answers is the agent's own code (packages/agent-core, run through ./solver.js); how it is
// scored stays here, out of the agent's reach.
import { EVALSET } from "../_data/evalset.js";

export const PHASES = /** @type {const} */ (["baseline", "propose", "validate", "awaiting", "done"]);
export const MAX_INSTRUCTIONS = 1500;

/** @typedef {{ context: string, items: { id: string, fields: Record<string, unknown> }[], truth: string[] }} Batch */
/** @typedef {{ id: string, title: string, industry: string, benchmark?: string | null, room?: string, legacy?: boolean, task: string, labels: { id: string, meaning: string }[], contexts: { id: string, name: string }[], sets: Record<"practice" | "validation" | "sealed", Batch[]> }} Scenario */
/** @typedef {{ context: string, version: number, instructions: string }} SkillText */
/** @typedef {Record<string, { correct: number, total: number }>} Scores */

/** @returns {Scenario | null} @param {unknown} id */
export function scenarioOf(id) {
  if (typeof id !== "string" || !Object.hasOwn(EVALSET.scenarios, id)) return null;
  return /** @type {Scenario} */ (/** @type {any} */ (EVALSET.scenarios)[id]);
}

/** Public description of the bench (no items, no answers). */
export function benchSummary() {
  return Object.values(EVALSET.scenarios).map((/** @type {any} */ s) => ({
    id: s.id,
    title: s.title,
    industry: s.industry,
    benchmark: s.benchmark ?? null,
    room: s.room ?? "cuna",
    legacy: Boolean(s.legacy),
    task: s.task,
    labels: s.labels,
    contexts: s.contexts,
    sizes: Object.fromEntries(Object.entries(s.sets).map(([k, v]) => [k, /** @type {Batch[]} */ (v).reduce((n, b) => n + b.items.length, 0)])),
  }));
}

/** @param {unknown} v */
const fieldText = (v) => (typeof v === "number" ? String(v) : JSON.stringify(v));

/**
 * Flattens batches into numbered rows, so the model answers short numbers instead of opaque ids.
 * @param {Scenario} sc @param {{ set: string, batches: Batch[] }[]} groups
 */
export function numbered(sc, groups) {
  /** @type {{ n: string, set: string, context: string, truth: string, fields: Record<string, unknown> }[]} */
  const rows = [];
  /** @type {{ context: string, rows: { n: string, fields: Record<string, unknown> }[] }[]} */
  const batches = [];
  const lines = [];
  for (const g of groups) {
    for (const b of g.batches) {
      const ctx = sc.contexts.find((c) => c.id === b.context);
      lines.push(`\nLote ${batches.length + 1} · contexto ${b.context} (${ctx?.name ?? b.context})`);
      const out = { context: b.context, rows: /** @type {{ n: string, fields: Record<string, unknown> }[]} */ ([]) };
      b.items.forEach((it, i) => {
        const n = String(rows.length + 1);
        rows.push({ n, set: g.set, context: b.context, truth: b.truth[i] ?? "", fields: it.fields });
        out.rows.push({ n, fields: it.fields });
        lines.push(`${n}. ${Object.entries(it.fields).map(([k, v]) => `${k}=${fieldText(v)}`).join("; ")}`);
      });
      batches.push(out);
    }
  }
  // `batches` is what the agent's core receives: the same rows without the set or the answer
  return { rows, batches, text: lines.join("\n") };
}

/** @param {Scenario} sc @param {SkillText[]} skills */
function skillBlock(sc, skills) {
  return sc.contexts
    .map((c) => {
      const s = skills.find((k) => k.context === c.id);
      return s ? `[${c.id}] skill v${s.version}:\n${s.instructions}` : `[${c.id}] sin skill todavía.`;
    })
    .join("\n\n");
}

/** Pulls the first JSON object out of a model reply (tolerates code fences and prose around it). */
export function parseJsonObject(/** @type {string} */ text) {
  const clean = text.replace(/```(?:json)?/g, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not answer with JSON");
  return JSON.parse(clean.slice(start, end + 1));
}

/**
 * Scores the executor's answers per set and context. Unanswered rows count as wrong.
 * `reply` is the model's raw text or the answers the agent's core already read from it.
 * @param {Scenario} sc @param {ReturnType<typeof numbered>["rows"]} rows @param {string | Record<string, unknown>} reply
 */
export function scoreAnswers(sc, rows, reply) {
  /** @type {Record<string, unknown>} */
  let answers = {};
  if (reply && typeof reply === "object") {
    answers = reply;
  } else {
    try {
      const obj = parseJsonObject(String(reply));
      answers = obj && typeof obj.answers === "object" && obj.answers ? obj.answers : obj;
    } catch {
      answers = {};
    }
  }
  const allowed = new Set(sc.labels.map((l) => l.id));
  /** @type {Record<string, Scores>} */
  const scores = {};
  const marked = rows.map((r) => {
    const raw = answers[r.n];
    const given = typeof raw === "string" && allowed.has(raw.trim()) ? raw.trim() : null;
    const ok = given === r.truth;
    const s = (scores[r.set] ??= {});
    const cell = (s[r.context] ??= { correct: 0, total: 0 });
    cell.total++;
    if (ok) cell.correct++;
    return { ...r, given, ok };
  });
  return { scores, marked, answered: marked.filter((m) => m.given).length };
}

export const PLANNER_SYSTEM =
  "Eres el planificador de Agentztein. Mejoras a tu propio ejecutor escribiéndole skills: instrucciones cortas y operativas, " +
  "cada una con alcance de un solo contexto. Recibes sus errores en el set de práctica junto con la respuesta correcta. " +
  "Deduce la regla real a partir de los campos (umbrales, fechas, fórmulas, palabras clave) y escríbela para que se aplique mecánicamente " +
  "a registros nuevos. Nunca memorices ids ni registros concretos: la skill se prueba con otros registros que no ves. " +
  'Responde SOLO con JSON: {"context": "<id del contexto>", "instructions": "<la skill completa>", "rationale": "<qué patrón viste y por qué>", "noteId": "<id de la idea del radar que usaste o null>"}';

/** Practice mistakes per context. @param {Scenario} sc @param {{ context: string, ok: boolean }[]} practice */
const errorsByContext = (sc, practice) => new Map(sc.contexts.map((c) => [c.id, practice.filter((r) => r.context === c.id && !r.ok).length]));

/** The context with the most practice mistakes: where the planner should write. @param {Scenario} sc @param {{ context: string, ok: boolean }[]} practice */
export function targetOf(sc, practice) {
  return [...errorsByContext(sc, practice).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? sc.contexts[0]?.id ?? "";
}

/**
 * `memory` is the block of lessons it consolidated while dreaming (api/_lib/memory.js), already cut to its budget.
 * @param {Scenario} sc
 * @param {SkillText[]} skills
 * @param {ReturnType<typeof scoreAnswers>["marked"]} practice
 * @param {{ id: string, title: string, gain: string }[]} ideas
 * @param {string} guidance
 */
export function plannerPrompt(sc, skills, practice, ideas, guidance, memory = "") {
  const errorsBy = errorsByContext(sc, practice);
  const target = targetOf(sc, practice);
  const rowLine = (/** @type {typeof practice[number]} */ r) =>
    `- ${Object.entries(r.fields).map(([k, v]) => `${k}=${fieldText(v)}`).join("; ")} → correcta: ${r.truth}; el ejecutor dijo: ${r.given ?? "(nada)"}${r.ok ? " (bien)" : " (MAL)"}`;
  const parts = [
    `Tarea del ejecutor: ${sc.task}`,
    `Etiquetas:\n${sc.labels.map((l) => `- ${l.id}: ${l.meaning}`).join("\n")}`,
    `Contextos: ${sc.contexts.map((c) => `${c.id} (${c.name})`).join(", ")}`,
    `Skills activas hoy:\n${skillBlock(sc, skills)}`,
    `Errores en práctica por contexto: ${[...errorsBy.entries()].map(([c, n]) => `${c}=${n}`).join(", ")}. Enfócate en ${target} salvo que la guía humana diga otra cosa.`,
    ...sc.contexts.map((c) => `Práctica del contexto ${c.id} (todas, con la respuesta correcta):\n${practice.filter((r) => r.context === c.id).map(rowLine).join("\n")}`),
  ];
  if (ideas.length) parts.push(`Ideas que una persona aprobó en el radar de investigación (úsalas solo si ayudan):\n${ideas.map((i) => `- [${i.id}] ${i.title}: ${i.gain}`).join("\n")}`);
  if (memory) parts.push(`Lo que recuerdas de ciclos anteriores (lecciones que consolidaste al soñar; no repitas un dead-end, parte de las rule):\n${memory}`);
  if (guidance) parts.push(`Guía de la persona: ${guidance}`);
  parts.push(`Si ya existe una skill para ese contexto, reescríbela completa como versión nueva. Máximo ${MAX_INSTRUCTIONS} caracteres.`);
  return { prompt: parts.join("\n\n"), target };
}

/** @param {Scenario} sc @param {string} reply */
export function parseProposal(sc, reply) {
  const obj = parseJsonObject(reply);
  const context = typeof obj.context === "string" ? obj.context.trim() : "";
  if (!sc.contexts.some((c) => c.id === context)) throw new Error("The planner chose a context that doesn't exist");
  const instructions = typeof obj.instructions === "string" ? obj.instructions.trim().slice(0, MAX_INSTRUCTIONS) : "";
  if (instructions.length < 20) throw new Error("The planner wrote an empty skill");
  const rationale = typeof obj.rationale === "string" ? obj.rationale.trim().slice(0, 600) : "";
  const noteId = typeof obj.noteId === "string" && obj.noteId && obj.noteId !== "null" ? obj.noteId.slice(0, 40) : null;
  return { context, instructions, rationale: rationale || "—", noteId };
}

/**
 * The harness gate: the candidate must clearly improve the context it was written for and must not make
 * any other context worse (beyond one item of run-to-run noise).
 * @param {Scores} before @param {Scores} after @param {string} target
 */
export function harnessVerdict(before, after, target) {
  const deltas = Object.fromEntries(
    Object.keys({ ...before, ...after }).map((c) => [c, (after[c]?.correct ?? 0) - (before[c]?.correct ?? 0)]),
  );
  const gain = deltas[target] ?? 0;
  const left = (before[target]?.total ?? 0) - (before[target]?.correct ?? 0);
  const needed = Math.max(1, Math.min(2, left));
  const hurt = Object.entries(deltas).filter(([c, d]) => c !== target && d < -1);
  const pass = gain >= needed && hurt.length === 0;
  const reason = pass ? "improves" : gain < needed ? "no-gain" : "regression";
  return { pass, reason, target, deltas, needed };
}
