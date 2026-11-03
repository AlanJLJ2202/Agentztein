// Reading the model's reply.

/** Pulls the first JSON object out of a model reply (tolerates code fences and prose around it). @param {string} text */
export function parseJsonObject(text) {
  const clean = text.replace(/```(?:json)?/g, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not answer with JSON");
  return JSON.parse(clean.slice(start, end + 1));
}

/**
 * The labels in a reply, by row number. Anything unreadable becomes "no answer" (the host scores it as wrong).
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseAnswers(text) {
  /** @type {any} */
  let obj;
  try {
    obj = parseJsonObject(text);
  } catch {
    return {};
  }
  const raw = obj && typeof obj.answers === "object" && obj.answers ? obj.answers : obj;
  /** @type {Record<string, string>} */
  const out = {};
  for (const [n, v] of Object.entries(raw ?? {})) if (typeof v === "string") out[n] = v.trim();
  return out;
}
