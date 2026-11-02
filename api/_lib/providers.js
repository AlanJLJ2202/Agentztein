// The model providers a user can bring their own key for. Claude goes through the official Anthropic SDK;
// the others expose OpenAI-style endpoints. Every call uses the signed-in user's key, never ours.
import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./http.js";

/**
 * @typedef {object} Provider
 * @property {string} label
 * @property {string} keysUrl Where the user creates a key
 * @property {string} [base] OpenAI-compatible base URL
 * @property {RegExp[]} prefer Default-model preferences, first match wins
 */

/** @type {Record<string, Provider>} */
export const PROVIDERS = {
  anthropic: { label: "Anthropic · Claude", keysUrl: "https://console.anthropic.com/settings/keys", prefer: [/^claude-opus-5-5$/, /^claude-opus/, /^claude-sonnet/] },
  meta: { label: "Meta · Llama API", keysUrl: "https://llama.developer.meta.com/", base: "https://api.llama.com/compat/v1", prefer: [/maverick/i, /llama-4/i, /llama/i] },
  openai: { label: "OpenAI", keysUrl: "https://platform.openai.com/api-keys", base: "https://api.openai.com/v1", prefer: [/^gpt-5(\.\d+)?$/, /^gpt-5/, /^gpt-4\.1$/] },
  gemini: { label: "Google · Gemini", keysUrl: "https://aistudio.google.com/apikey", base: "https://generativelanguage.googleapis.com/v1beta/openai", prefer: [/gemini-[\d.]+-pro$/, /pro/, /flash/] },
  openrouter: { label: "OpenRouter", keysUrl: "https://openrouter.ai/keys", base: "https://openrouter.ai/api/v1", prefer: [/^anthropic\/claude-opus/, /^meta-llama\//, /^openai\/gpt-5/] },
};

/** @param {unknown} id @returns {id is keyof typeof PROVIDERS} */
export const isProvider = (id) => typeof id === "string" && Object.hasOwn(PROVIDERS, id);

/** Current Claude models that take `effort` and the server-side refusal fallback. */
const CLAUDE_CURRENT = /^claude-(fable-5-1|opus-5-5|opus-5|sonnet-5-5)$/;
const CLAUDE_EFFORT = /^claude-(fable-5(-1)?|opus-5(-5)?|opus-4-[678]|sonnet-5(-5)?|haiku-5-5)$/;
const NOT_CHAT = /(embed|whisper|tts|dall-e|moderation|image|audio|realtime|transcribe|search|vision-preview|aqa|imagen|veo)/i;

/** @param {string} provider @param {string[]} models */
export function defaultModel(provider, models) {
  for (const re of PROVIDERS[provider]?.prefer ?? []) {
    const hit = models.find((m) => re.test(m));
    if (hit) return hit;
  }
  return models[0] ?? null;
}

/** Only the user's key, sent only to Anthropic: no server environment variable can redirect or add to it. */
/** @param {string} key */
const anthropic = (key) => new Anthropic({ apiKey: key, authToken: null, baseURL: "https://api.anthropic.com", maxRetries: 1, timeout: 55_000 });

/** @param {number} status */
function statusError(status) {
  if (status === 401 || status === 403) return new HttpError(400, "The provider rejected this key", { reason: "invalid" });
  if (status === 429) return new HttpError(429, "The provider is rate limiting this key; try again in a minute");
  return new HttpError(502, `The provider answered with an error (${status})`);
}

/**
 * Checks the key against the provider and lists the models it can use.
 * `unverified` means the provider could not be reached: the key may still be fine.
 * @param {string} provider
 * @param {string} key
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ status: "valid", models: string[] } | { status: "invalid" } | { status: "unverified" }>}
 */
export async function verifyKey(provider, key, fetchImpl = fetch) {
  try {
    if (provider === "anthropic") {
      /** @type {string[]} */
      const models = [];
      for await (const m of anthropic(key).models.list({ limit: 100 })) models.push(m.id);
      return { status: "valid", models };
    }
    const p = PROVIDERS[provider];
    if (!p?.base) return { status: "unverified" };
    if (provider === "openrouter") {
      const check = await fetchImpl(`${p.base}/key`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
      if (check.status === 401 || check.status === 403) return { status: "invalid" };
      if (!check.ok) return { status: "unverified" };
    }
    const res = await fetchImpl(`${p.base}/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
    if (res.status === 401 || res.status === 403) return { status: "invalid" };
    if (!res.ok) return { status: "unverified" };
    const body = await res.json();
    const ids = (Array.isArray(body?.data) ? body.data : [])
      .map((/** @type {any} */ m) => String(m?.id ?? "").replace(/^models\//, ""))
      .filter((/** @type {string} */ id) => id && !NOT_CHAT.test(id));
    return { status: "valid", models: [...new Set(ids)].slice(0, 300) };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return { status: "invalid" };
    return { status: "unverified" };
  }
}

/**
 * One request to the user's model. Returns the text of the reply.
 * @param {{ provider: string, key: string, model: string, system: string, user: string, fetchImpl?: typeof fetch }} req
 */
export async function complete({ provider, key, model, system, user, fetchImpl = fetch }) {
  if (provider === "anthropic") return completeClaude(key, model, system, user);
  const p = PROVIDERS[provider];
  if (!p?.base) throw new HttpError(400, "Unknown provider");
  const res = await fetchImpl(`${p.base}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok) throw statusError(res.status);
  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new HttpError(502, "The model returned an empty answer");
  return text;
}

/** @param {string} key @param {string} model @param {string} system @param {string} user */
async function completeClaude(key, model, system, user) {
  const client = anthropic(key);
  /** @type {any} */
  const params = { model, max_tokens: 8000, system, messages: [{ role: "user", content: user }] };
  // Sorting headlines is light work: low effort keeps it fast and cheap on the current models.
  if (CLAUDE_EFFORT.test(model)) params.output_config = { effort: "low" };
  try {
    const msg = CLAUDE_CURRENT.test(model)
      ? // If a safety classifier declines, the API retries on a suitable model within the same call.
        await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : await client.messages.create(params);
    if (msg.stop_reason === "refusal") throw new HttpError(422, "The model declined to answer this batch");
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    if (!text.trim()) throw new HttpError(502, "The model returned an empty answer");
    return text;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw statusError(401);
    if (err instanceof Anthropic.RateLimitError) throw statusError(429);
    if (err instanceof Anthropic.NotFoundError) throw new HttpError(400, `This key can't use the model ${model}`);
    if (err instanceof Anthropic.APIError) throw statusError(err.status ?? 502);
    throw new HttpError(502, "Could not reach Anthropic");
  }
}
