// Agentztein works only with Meta's models. Users bring their own key for the Meta Model API
// (https://api.meta.ai/v1, OpenAI-compatible; it replaced the Llama API, retired on 6 Jul 2026).
// Every call uses the signed-in user's key, never ours.
import { HttpError } from "./http.js";

/**
 * @typedef {object} Provider
 * @property {string} label
 * @property {string} keysUrl Where the user creates a key
 * @property {string} base OpenAI-compatible base URL
 * @property {string} fallbackModel Used when the provider doesn't list its models
 */

/** @type {Record<string, Provider>} */
export const PROVIDERS = {
  meta: { label: "Meta Model API · Muse", keysUrl: "https://dev.meta.ai/", base: "https://api.meta.ai/v1", fallbackModel: "muse-spark-1.1" },
};

/** @param {unknown} id @returns {id is keyof typeof PROVIDERS} */
export const isProvider = (id) => typeof id === "string" && Object.hasOwn(PROVIDERS, id);

const NOT_CHAT = /(embed|whisper|tts|moderation|image|audio|realtime|transcribe|guard)/i;
const MUSE = /^muse-spark-(\d+)\.(\d+)$/;

/**
 * The newest standard Muse Spark the key can use. "-contributor" tiers are cheaper but Meta may train on
 * their data, so they are never picked by default (the user can still choose one).
 * @param {string} provider @param {string[]} models
 */
export function defaultModel(provider, models) {
  const muse = models
    .map((m) => [m, MUSE.exec(m)])
    .filter((x) => x[1])
    .sort((a, b) => Number(b[1][1]) - Number(a[1][1]) || Number(b[1][2]) - Number(a[1][2]));
  if (muse[0]) return muse[0][0];
  return models.find((m) => !/contributor/.test(m)) ?? PROVIDERS[provider]?.fallbackModel ?? null;
}

/** @param {number} status */
function statusError(status) {
  if (status === 401 || status === 403) return new HttpError(400, "Meta rejected this key", { reason: "invalid" });
  if (status === 429) return new HttpError(429, "Meta is rate limiting this key; try again in a minute");
  return new HttpError(502, `Meta answered with an error (${status})`);
}

/**
 * Checks the key with Meta and lists the models it can use.
 * `unverified` means Meta could not be reached or doesn't list models: the key may still be fine.
 * @param {string} provider
 * @param {string} key
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ status: "valid", models: string[] } | { status: "invalid" } | { status: "unverified" }>}
 */
export async function verifyKey(provider, key, fetchImpl = fetch) {
  const p = PROVIDERS[provider];
  if (!p) return { status: "unverified" };
  try {
    const res = await fetchImpl(`${p.base}/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
    if (res.status === 401 || res.status === 403) return { status: "invalid" };
    if (!res.ok) return { status: "unverified" };
    const body = await res.json();
    const ids = (Array.isArray(body?.data) ? body.data : [])
      .map((/** @type {any} */ m) => String(m?.id ?? "").replace(/^(models|meta)\//, ""))
      .filter((/** @type {string} */ id) => id && !NOT_CHAT.test(id));
    return { status: "valid", models: [...new Set(ids)].slice(0, 100) };
  } catch {
    return { status: "unverified" };
  }
}

/**
 * One request to the user's Meta model. Returns the text of the reply.
 * @param {{ provider: string, key: string, model: string, system: string, user: string, effort?: string | null, timeoutMs?: number, fetchImpl?: typeof fetch }} req
 */
export async function complete({ provider, key, model, system, user, effort = "low", timeoutMs = 55_000, fetchImpl = fetch }) {
  const p = PROVIDERS[provider];
  if (!p) throw new HttpError(400, "Unknown provider");
  // Sorting headlines is light work: ask Muse Spark for a low reasoning effort (minimal … xhigh). If a model
  // doesn't take the parameter, retry once without it.
  const send = (effort) => fetchImpl(`${p.base}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], ...(effort ? { reasoning_effort: effort } : {}) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  let res;
  try {
    res = await send(effort);
    if (res.status === 400 && effort) res = await send(null);
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") throw new HttpError(504, "The model took too long; try a lower effort or a faster model");
    throw new HttpError(502, "Could not reach Meta");
  }
  if (!res.ok) throw statusError(res.status);
  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new HttpError(502, "The model returned an empty answer");
  // real token counts when Meta reports them; otherwise a rough estimate (about 4 characters per token)
  const usage = {
    input: Number(body?.usage?.prompt_tokens) || Math.ceil((system.length + user.length) / 4),
    output: Number(body?.usage?.completion_tokens) || Math.ceil(text.length / 4),
  };
  return { text, usage };
}
