// Translating what the models wrote (the director's reasoning, a skill and why it was written, lessons, dreams, radar
// notes) into the language the person is reading the app in. A cycle runs in one language, but the person can switch
// languages at any time; the app asks for the texts it shows in the other language, in small batches, with the light
// model of their own key, and keeps the result in the browser. It never changes what the agent itself uses: a skill
// is still applied in the words it was written in.
import { parseJsonObject } from "./agent.js";
import { HttpError } from "./http.js";

export const TRANSLATE_LIMITS = { texts: 24, chars: 2000, total: 12000 };

/** The texts to translate, cleaned and bounded. @param {unknown} raw @returns {string[]} */
export function cleanTexts(raw) {
  if (!Array.isArray(raw) || !raw.length) throw new HttpError(400, "Send the texts to translate");
  if (raw.length > TRANSLATE_LIMITS.texts) throw new HttpError(400, `At most ${TRANSLATE_LIMITS.texts} texts at a time`);
  const texts = raw.map((t) => (typeof t === "string" ? t.slice(0, TRANSLATE_LIMITS.chars) : ""));
  if (texts.some((t) => !t.trim())) throw new HttpError(400, "Every text must be a non-empty string");
  if (texts.reduce((a, t) => a + t.length, 0) > TRANSLATE_LIMITS.total) throw new HttpError(400, "Too much text at once");
  return texts;
}

export const TRANSLATE_SYSTEM =
  "You translate short texts from a web app about an AI agent that improves itself (exams, skills, a harness, lessons). " +
  "Translate faithfully and naturally, in plain words, without adding or removing anything. " +
  "Keep exactly as they are: code, identifiers (words with underscores or in backticks, like set_general or pistas_total), " +
  "field names, label values in «» or quotes (like «valida»), numbers, money, operators (==, <, <=>), model names " +
  "(muse-spark-1.3, Muse Wonder), benchmark names, line breaks and list numbering. " +
  "If a text is already in the target language, return it unchanged.";

/** @param {string[]} texts @param {"en" | "es"} to */
export function translatePrompt(texts, to) {
  const target = to === "es" ? "Spanish (Mexico)" : "English";
  return [
    `Translate each string of this JSON array into ${target}.`,
    `Answer only with JSON: {"t": [...]} with exactly ${texts.length} strings, in the same order.`,
    JSON.stringify(texts),
  ].join("\n");
}

/** The model's answer, checked: the same number of strings, none empty. @param {string} text @param {number} n */
export function parseTranslation(text, n) {
  let out;
  try {
    out = parseJsonObject(text).t;
  } catch {
    throw new HttpError(502, "The translation came back unreadable", { reason: "translate-failed" });
  }
  if (!Array.isArray(out) || out.length !== n || out.some((s) => typeof s !== "string" || !s.trim())) {
    throw new HttpError(502, "The translation came back incomplete", { reason: "translate-failed" });
  }
  return out.map((s) => s.slice(0, TRANSLATE_LIMITS.chars * 2));
}
