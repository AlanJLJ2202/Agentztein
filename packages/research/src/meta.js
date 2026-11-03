// Meta's models that Agentztein can think with, through the Meta Model API (https://api.meta.ai/v1).
// Checked 3 Nov 2026 against Meta's announcements and model listings; prices in USD per million tokens
// (input / output). Entries marked `unconfirmed` come only from third-party listings.

/** @param {string} en @param {string} es */
const E = (en, es) => ({ en, es });

/**
 * @typedef {object} MetaModel
 * @property {string} family
 * @property {string} name
 * @property {RegExp} match Model ids of this family
 * @property {string} fallbackId Id to use when the key doesn't list its models
 * @property {{ en: string, es: string }} role
 * @property {string} price
 * @property {[number, number]} usd USD per million tokens, input and output
 * @property {boolean} [unconfirmed]
 * @property {boolean} sees Takes images, video or PDFs as input
 * @property {boolean} effort Takes reasoning_effort (minimal … xhigh)
 * @property {{ en: string, es: string }} [note]
 */

/** @type {MetaModel[]} */
export const META_MODELS = [
  {
    family: "wonder", name: "Muse Wonder", match: /^muse-wonder/, fallbackId: "muse-wonder-1.0",
    role: E("The most capable: long agent tasks and hard benchmarks.", "El más capaz: tareas largas de agente y benchmarks difíciles."),
    price: "$4 / $20", usd: [4, 20], sees: true, effort: false,
    note: E("Always reasons at full depth; no effort levels.", "Siempre razona a fondo; no tiene niveles de esfuerzo."),
  },
  {
    family: "spark", name: "Muse Spark", match: /^muse-spark-\d+\.\d+$/, fallbackId: "muse-spark-1.1",
    role: E("Balanced: everyday thinking, research and sorting the news.", "Equilibrado: pensar a diario, investigar y ordenar noticias."),
    price: "$1.25 / $4.25", usd: [1.25, 4.25], sees: true, effort: true,
  },
  {
    family: "spark-contributor", name: "Muse Spark · contributor", match: /^muse-spark-.*-contributor$/, fallbackId: "muse-spark-1.3-contributor",
    role: E("Much cheaper, in exchange for Meta being allowed to train on what you send.", "Mucho más barato, a cambio de que Meta pueda entrenar con lo que mandes."),
    price: "$0.10 / $0.20", usd: [0.1, 0.2], sees: true, effort: true, unconfirmed: true,
  },
  {
    family: "glimmer", name: "Muse Glimmer", match: /glimmer/, fallbackId: "muse-glimmer",
    role: E("Light and open (30B, sees images): also runs on your own computer.", "Ligero y abierto (30B, ve imágenes): también corre en tu computadora."),
    price: "$0.30 / $1.20", usd: [0.3, 1.2], sees: true, effort: false, unconfirmed: true,
  },
  {
    family: "spark-open", name: "Muse Spark Open", match: /spark-open/, fallbackId: "muse-spark-open",
    role: E("Open weights (816B, 42B active), tuned for code.", "Pesos abiertos (816B, 42B activos), afinado para código."),
    price: "$1.25 / $4.25", usd: [1.25, 4.25], sees: true, effort: true, unconfirmed: true,
  },
];

export const EFFORTS = /** @type {const} */ (["minimal", "low", "medium", "high", "xhigh"]);

/** The catalog entry a model id belongs to, or null. @param {string | null | undefined} id */
export const familyOf = (id) => (id ? META_MODELS.find((m) => m.match.test(id)) ?? null : null);

/**
 * The best id of a family among the models a key can use (newest version first), or its fallback when the
 * key didn't list models. Null when the key lists models but none of this family.
 * @param {MetaModel} fam @param {string[]} available
 */
export function pickId(fam, available) {
  if (!available.length) return fam.fallbackId;
  const ids = available.filter((id) => fam.match.test(id));
  if (!ids.length) return null;
  /** @param {string} id @returns {[number, number]} */
  const ver = (id) => { const m = /(\d+)\.(\d+)/.exec(id); return m ? [Number(m[1]), Number(m[2])] : [0, 0]; };
  return ids.sort((a, b) => { const [a1, a2] = ver(a), [b1, b2] = ver(b); return b1 - a1 || b2 - a2; })[0] ?? null;
}

/**
 * What a call costs in USD. Unknown models are priced like the most expensive one, so a budget never
 * underestimates.
 * @param {string | null | undefined} model @param {number} inputTokens @param {number} outputTokens
 */
export function costOf(model, inputTokens, outputTokens) {
  const fam = familyOf(model);
  const [i, o] = fam ? fam.usd : [4, 20];
  return (inputTokens * i + outputTokens * o) / 1_000_000;
}
