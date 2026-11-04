// The director: when the person lets the agent decide, Muse Wonder (with the user's key) chooses what this cycle
// works on and with which tools, inside the cycle's spending cap. It sees where each scenario stands, which Meta
// families the key can use (with what they cost and whether they see images), the cap, the approved radar ideas and
// the last outcomes. It answers a plan the server checks: a real scenario, a family the key has, an effort that
// family takes. It can also propose capabilities the lab doesn't use yet (seeing images, drawing, listening); those
// stay proposals for a person to read, nothing runs on its own.
import { costOf, EFFORTS, META_MODELS, pickId } from "@skillab/research";
import { numbered, parseJsonObject } from "./agent.js";
import { MAX_OUTPUT_TOKENS } from "./harness.js";

/** Tools the plan may name, in the order a cycle can use them. */
export const PLAN_TOOLS = ["dream", "memory", "radar", "exam", "planner", "library", "harness", "human", "image", "voice", "code"];
export const CAPABILITIES = ["vision", "image", "voice", "code", "web", "memory"];

/**
 * Rough cost of one improvement cycle on a scenario with a given executor and planner: two exams (practice +
 * validation, then validation again) and one planner call. An estimate, shown with "≈"; the real cap is enforced
 * call by call.
 * @param {any} sc @param {string} executor @param {string} planner
 */
export function estimateCycle(sc, executor, planner) {
  const first = numbered(sc, [{ set: "practice", batches: sc.sets.practice }, { set: "validation", batches: sc.sets.validation }]);
  const second = numbered(sc, [{ set: "validation", batches: sc.sets.validation }]);
  const outFor = (/** @type {number} */ rows) => rows * 8 + 300;
  const exam1 = costOf(executor, Math.ceil(first.text.length / 4) + 900, outFor(first.rows.length));
  const exam2 = costOf(executor, Math.ceil(second.text.length / 4) + 900, outFor(second.rows.length));
  const plan = costOf(planner, Math.ceil((first.text.length * 0.8) / 4) + 1500, 1500);
  return Math.round((exam1 + exam2 + plan) * 10000) / 10000;
}

/** The worst case the harness reserves for one call: what a cap must at least allow. */
export const worstCall = (/** @type {string} */ model, /** @type {number} */ inputTokens) => costOf(model, inputTokens, MAX_OUTPUT_TOKENS);

export const DIRECTOR_SYSTEM =
  "Eres el director de Agentztein, un agente que se mejora a sí mismo escribiéndose habilidades. Decides el siguiente " +
  "ciclo: en qué escenario trabajar, con qué modelo de Meta presentar los exámenes y con qué esfuerzo, dentro del tope de " +
  "gasto por ciclo. Prefiere el escenario donde hay más que ganar y el modelo más barato que pueda lograrlo; sube de modelo " +
  "solo si los intentos anteriores con uno barato no mejoraron. Nunca pases el tope. Además, si ves que una capacidad que el " +
  "laboratorio aún no usa ayudaría (ver imágenes, dibujar, escuchar voz, escribir código, buscar en la web, memoria), " +
  "propónla con honestidad: qué haría, con qué modelo y por qué; no la inventes si no aporta. Responde SOLO con JSON.";

/**
 * @param {{ bench: any[], standing: { id: string, validation: number | null, skills: number, last: string | null }[],
 *   families: { family: string, name: string, id: string, usd: [number, number], sees: boolean, effort: boolean, cycle: Record<string, number> }[],
 *   cap: number, ideas: { title: string }[], guidance: string, lang: string, memory?: string }} o
 * `memory` is its consolidated lessons (api/_lib/memory.js), already cut to the director's budget.
 */
export function directorPrompt(o) {
  const parts = [
    `Tope de gasto de este ciclo: $${o.cap.toFixed(2)} USD.`,
    `Escenarios (id · título · % de aciertos en validación del último ciclo · habilidades activas · último resultado):\n${o.standing
      .map((s) => {
        const b = o.bench.find((x) => x.id === s.id);
        return `- ${s.id} · ${b?.title ?? s.id} · ${s.validation === null ? "sin medir" : `${s.validation.toFixed(0)}%`} · ${s.skills} · ${s.last ?? "nunca"}`;
      })
      .join("\n")}`,
    `Modelos de Meta en la llave (familia · id · USD por millón entrada/salida · ve imágenes · niveles de esfuerzo · costo aprox. de un ciclo por escenario):\n${o.families
      .map((f) => `- ${f.family} · ${f.id} · $${f.usd[0]}/$${f.usd[1]} · ${f.sees ? "sí" : "no"} · ${f.effort ? "sí" : "no"} · ${Object.entries(f.cycle).map(([k, v]) => `${k}≈$${v.toFixed(3)}`).join(", ")}`)
      .join("\n")}`,
    "Herramientas que el ciclo puede usar: dream (antes de decidir, digiere los ciclos terminados en lecciones), memory (el planificador lee esas lecciones), radar (ideas aprobadas de Hacker News), exam (el ejecutor presenta el examen), planner (escribe la habilidad), library (guarda versiones), harness (decide si pasa), human (la persona aprueba), image (Muse Image dibuja), voice (Muse Voice escucha), code (el agente cambia su propio código, en otra pestaña).",
    "Capacidades que puedes proponer: vision, image, voice, code, web, memory.",
  ];
  if (o.memory) parts.push(`Lo que recuerdas (lecciones que consolidaste al soñar; úsalas para no repetir lo que ya no funcionó):\n${o.memory}`);
  if (o.ideas.length) parts.push(`Ideas aprobadas en el radar:\n${o.ideas.map((i) => `- ${i.title}`).join("\n")}`);
  if (o.guidance) parts.push(`Guía de la persona: ${o.guidance}`);
  parts.push(
    `Escribe "why", "steps[].why" y "proposals[].idea/why" en ${o.lang === "es" ? "español, con palabras sencillas" : "plain English"}, en una o dos frases cada uno.`,
    'Formato: {"scenario": "<id>", "executor": "<familia>", "effort": "<minimal|low|medium|high|xhigh|null>", "why": "...", ' +
      '"steps": [{"tool": "<herramienta>", "why": "..."}], "proposals": [{"capability": "<capacidad>", "model": "<familia o nombre>", "idea": "...", "why": "..."}]}',
  );
  return parts.join("\n\n");
}

/**
 * Reads and checks the director's plan. Anything it can't use falls back to a safe choice and says so.
 * @param {string} reply
 * @param {{ scenarios: string[], families: { family: string, id: string, effort: boolean, cycle: Record<string, number> }[], cap: number, fallback: { scenario: string, family: string } }} ctx
 */
export function parseDirection(reply, ctx) {
  /** @type {any} */
  let obj = {};
  const fixes = [];
  try {
    obj = parseJsonObject(reply);
  } catch {
    fixes.push("unreadable");
  }
  const str = (/** @type {unknown} */ v, n = 400) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  let scenario = str(obj.scenario, 40);
  if (!ctx.scenarios.includes(scenario)) { fixes.push("scenario"); scenario = ctx.fallback.scenario; }
  let fam = ctx.families.find((f) => f.family === str(obj.executor, 40) || f.id === str(obj.executor, 80));
  if (!fam) { fixes.push("executor"); fam = ctx.families.find((f) => f.family === ctx.fallback.family) ?? ctx.families[0]; }
  // never over the cap: if its pick doesn't fit, the cheapest family that does
  if (fam && (fam.cycle[scenario] ?? 0) > ctx.cap) {
    const fits = [...ctx.families].filter((f) => (f.cycle[scenario] ?? Infinity) <= ctx.cap).sort((a, b) => (a.cycle[scenario] ?? 0) - (b.cycle[scenario] ?? 0))[0];
    if (fits) { fixes.push("over-cap"); fam = fits; }
  }
  const wanted = str(obj.effort, 10);
  const effort = fam?.effort ? (/** @type {readonly string[]} */ (EFFORTS).includes(wanted) ? wanted : "medium") : null;
  const steps = (Array.isArray(obj.steps) ? obj.steps : [])
    .map((/** @type {any} */ s) => ({ tool: str(s?.tool, 20), why: str(s?.why, 240) }))
    .filter((/** @type {{ tool: string }} */ s) => PLAN_TOOLS.includes(s.tool))
    .slice(0, 8);
  const proposals = (Array.isArray(obj.proposals) ? obj.proposals : [])
    .map((/** @type {any} */ p) => ({ capability: str(p?.capability, 20), model: str(p?.model, 60), idea: str(p?.idea, 300), why: str(p?.why, 300) }))
    .filter((/** @type {{ capability: string, idea: string }} */ p) => CAPABILITIES.includes(p.capability) && p.idea)
    .slice(0, 3);
  return {
    scenario,
    family: fam?.family ?? ctx.fallback.family,
    executor: fam?.id ?? "",
    effort,
    why: str(obj.why, 400),
    steps: steps.length ? steps : [{ tool: "exam", why: "" }, { tool: "planner", why: "" }, { tool: "exam", why: "" }, { tool: "harness", why: "" }, { tool: "human", why: "" }],
    proposals,
    estimate: fam?.cycle[scenario] ?? null,
    fixes,
  };
}

/** The families the director may choose from: the ones this key can use. @param {string[]} models */
export function usableFamilies(models) {
  return META_MODELS.filter((f) => f.family !== "spark-contributor") // never pick a model Meta may train on by itself
    .map((f) => ({ ...f, id: pickId(f, models) }))
    .filter((f) => Boolean(f.id));
}
