// The words and pieces the whole app uses to tell what the agent is doing: each tool it can pick up (name, icon,
// color, the room of the 3D lab where it happens) and one plain sentence per step of a cycle's trace.
import type { Job, TraceEntry } from "./api.js";
import type { Text } from "./i18n.js";

export const E = (en: string, es: string): Text => ({ en, es });

export type ToolId = "director" | "radar" | "exam" | "grader" | "planner" | "library" | "harness" | "human" | "voice" | "image" | "code";
export type ToolInfo = { name: Text; does: Text; icon: string; color: string; room: string };

export const TOOLS: Record<ToolId, ToolInfo> = {
  director: { name: E("Director · Muse Wonder", "Director · Muse Wonder"), does: E("decides what to work on and with which model", "decide en qué trabajar y con qué modelo"), icon: "✦", color: "#6d5ce8", room: "cuna" },
  radar: { name: E("News radar", "Radar de noticias"), does: E("reads what's new in AI for ideas", "lee lo nuevo en IA para sacar ideas"), icon: "Y", color: "#ff6600", room: "research" },
  exam: { name: E("Exam · Muse Spark", "Examen · Muse Spark"), does: E("answers the exam questions", "contesta las preguntas del examen"), icon: "✓", color: "#0081fb", room: "exam" },
  grader: { name: E("Grader", "Calificador"), does: E("checks the answers it can't see", "revisa las respuestas que el agente no ve"), icon: "#", color: "#16a394", room: "exam" },
  planner: { name: E("Planner · Muse Wonder", "Planificador · Muse Wonder"), does: E("studies the mistakes and writes a skill", "estudia los errores y escribe una habilidad"), icon: "✎", color: "#9b5de5", room: "taller" },
  library: { name: E("Skill library", "Biblioteca de habilidades"), does: E("keeps every version, nothing is erased", "guarda cada versión, nada se borra"), icon: "◈", color: "#8a7dff", room: "taller" },
  harness: { name: E("Harness", "Arnés"), does: E("checks it improves and breaks nothing", "revisa que mejore y no rompa nada"), icon: "⛨", color: "#22b864", room: "cuna" },
  human: { name: E("You", "Tú"), does: E("approve or reject", "apruebas o rechazas"), icon: "☺", color: "#e8a200", room: "cuna" },
  voice: { name: E("Muse Voice", "Muse Voice"), does: E("hears what you tell it", "escucha lo que le dices"), icon: "◖", color: "#3ccf6e", room: "cuna" },
  image: { name: E("Muse Image", "Muse Image"), does: E("draws an emblem per skill", "dibuja un emblema por habilidad"), icon: "◐", color: "#e8682f", room: "taller" },
  code: { name: E("Its own code · Muse Code", "Su propio código · Muse Code"), does: E("rewrites its core, behind a judge", "reescribe su núcleo, con un juez"), icon: "{}", color: "#1c2b33", room: "taller" },
};
export const toolOf = (id: string): ToolInfo => TOOLS[id as ToolId] ?? TOOLS.exam;

/** Where each exam happens in the 3D lab (the building's rooms). */
export const EXAM_ROOM: Record<string, string> = { manufactura: "terminal", devoluciones: "web", mensajes: "arc", envios: "horizon" };
export const ROOM_NAME: Record<string, Text> = {
  cuna: E("the cradle", "la cuna"),
  research: E("the science lab", "el laboratorio científico"),
  taller: E("the central workshop", "el taller central"),
  terminal: E("the machine room", "la sala de máquinas"),
  web: E("the detective's library", "la biblioteca del detective"),
  arc: E("the game room", "la sala de juegos"),
  horizon: E("the time observatory", "el observatorio del tiempo"),
};
export const roomFor = (e: { tool: string }, scenario: string) => {
  const r = toolOf(e.tool).room;
  return r === "exam" ? EXAM_ROOM[scenario] ?? "cuna" : r;
};

export const RUNNING_PHASES = ["plan", "baseline", "propose", "validate"];
export const isRunning = (j: Job | null | undefined) => Boolean(j && RUNNING_PHASES.includes(j.phase) && !j.state.error);

/** One plain sentence, in its own voice, for a step of the trace. */
export function say(e: TraceEntry, job: Job): Text {
  const m = e.model ? ` (${e.model})` : "";
  switch (e.tool) {
    case "director":
      if (e.note === "handed-over") return E("You let me decide. Let me think what's worth it…", "Me dejaste decidir. Déjame pensar qué conviene…");
      return e.note ? E(`Decided: ${e.note}`, `Decidí: ${e.note}`) : E("I made a plan.", "Ya tengo un plan.");
    case "exam":
      return E(`I answered the exam${m}.`, `Contesté el examen${m}.`);
    case "grader":
      return E(`Graded: ${e.note ?? "?"} right.`, `Calificación: ${e.note ?? "?"} correctas.`);
    case "radar":
      return E(`I looked at ${e.note ?? "some"} ideas from the radar.`, `Revisé ${e.note ?? "algunas"} ideas del radar.`);
    case "planner":
      return E(`I studied my mistakes and wrote a new skill${m}.`, `Estudié mis errores y escribí una habilidad nueva${m}.`);
    case "library":
      return E(`I filed it in the library as a candidate: ${e.note ?? ""}.`, `La guardé en la biblioteca como candidata: ${e.note ?? ""}.`);
    case "harness":
      if (e.note === "improves") return E("The harness let it through: it improves and breaks nothing!", "¡El arnés la dejó pasar: mejora y no rompe nada!");
      if (e.note === "regression") return E("The harness threw it out: it broke something that worked.", "El arnés la descartó: rompió algo que funcionaba.");
      if (e.note === "run-budget") return E(`I reached this cycle's spending cap ($${(job.state.maxCost ?? 0).toFixed(2)}) and stopped.`, `Llegué al tope de gasto de este ciclo ($${(job.state.maxCost ?? 0).toFixed(2)}) y me detuve.`);
      return E("The harness threw it out: it didn't improve enough.", "El arnés la descartó: no mejoró lo suficiente.");
    case "human":
      return e.note === "started" ? E("You started a cycle. Here I go!", "Iniciaste un ciclo. ¡Allá voy!") : E("Your turn: do you approve it?", "Te toca: ¿la apruebas?");
    default:
      return E("Working…", "Trabajando…");
  }
}

/** What the agent is about to do next, while a step runs (the trace only has what already happened). */
export function nextUp(job: Job): { tool: ToolId; text: Text } | null {
  switch (job.phase) {
    case "plan": return { tool: "director", text: E("Deciding what to work on…", "Decidiendo en qué trabajar…") };
    case "baseline": return { tool: "exam", text: E("Taking the exam to see where I stand…", "Presentando el examen para ver dónde estoy…") };
    case "propose": return { tool: "planner", text: E("Studying my mistakes…", "Estudiando mis errores…") };
    case "validate": return { tool: "exam", text: E("Taking the exam again with the new skill…", "Presentando el examen otra vez con la habilidad nueva…") };
    case "awaiting": return { tool: "human", text: E("Waiting for your decision.", "Esperando tu decisión.") };
    default: return null;
  }
}
