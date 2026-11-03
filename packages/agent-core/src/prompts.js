// How the executor sees a task: its system prompt and how the records are laid out.

export const EXECUTOR_SYSTEM =
  "Eres el ejecutor de Agentztein. Etiquetas registros de negocio, uno por uno, con exactamente una de las etiquetas permitidas. " +
  "Si hay una skill activa para el contexto de un lote, síguela al pie de la letra: la escribió el propio agente y la aprobó una persona. " +
  "Sin skill, decide con tu mejor criterio. Responde SOLO con JSON: {\"answers\": {\"1\": \"etiqueta\", \"2\": \"etiqueta\", ...}} con todos los números.";

/** @param {unknown} v */
export const fieldText = (v) => (typeof v === "number" ? String(v) : JSON.stringify(v));

/** @param {import("./index.js").Task} task */
export function skillBlock(task) {
  return task.scenario.contexts
    .map((c) => {
      const s = task.skills.find((k) => k.context === c.id);
      return s ? `[${c.id}] skill v${s.version}:\n${s.instructions}` : `[${c.id}] sin skill todavía.`;
    })
    .join("\n\n");
}

/** The records, batch by batch, each row with its short number. @param {import("./index.js").Task} task */
export function rowsText(task) {
  /** @type {string[]} */
  const lines = [];
  task.batches.forEach((b, i) => {
    const ctx = task.scenario.contexts.find((c) => c.id === b.context);
    lines.push(`\nLote ${i + 1} · contexto ${b.context} (${ctx?.name ?? b.context})`);
    for (const r of b.rows) lines.push(`${r.n}. ${Object.entries(r.fields).map(([k, v]) => `${k}=${fieldText(v)}`).join("; ")}`);
  });
  return lines.join("\n");
}

/** @param {import("./index.js").Task} task */
export function executorPrompt(task) {
  const sc = task.scenario;
  return [
    `Tarea: ${sc.task}`,
    `Etiquetas permitidas:\n${sc.labels.map((l) => `- ${l.id}: ${l.meaning}`).join("\n")}`,
    `Skills activas por contexto:\n${skillBlock(task)}`,
    `Registros:${rowsText(task)}`,
    "Responde solo el JSON con una etiqueta para cada número.",
  ].join("\n\n");
}
