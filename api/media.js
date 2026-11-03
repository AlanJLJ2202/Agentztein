// /api/media: Meta's other model families, used by the agent with the user's own key.
//   POST ?kind=voice   body: the recorded audio (≤ 2 min). Muse Voice Transcribe turns it into text: the person
//                      tells the agent what to focus on, and that guidance reaches the planner.
//   POST ?kind=image   { skillId } Muse Image draws an emblem for a skill the agent wrote.
// Both are new on the Meta Model API and not every key has them yet: errors say so plainly. Each call goes
// through the same harness (budget check first, append-only log after).
import { requireUser } from "./_lib/auth.js";
import { open } from "./_lib/crypto.js";
import { db } from "./_lib/db.js";
import { budgetOf } from "./_lib/harness.js";
import { HttpError, handle, json, readJson } from "./_lib/http.js";
import { PROVIDERS } from "./_lib/providers.js";

export const VOICE_MODEL = "muse-voice-transcribe-1.0";
export const IMAGE_MODEL = "muse-image-1.0";
const VOICE_USD_PER_MIN = 0.003; // $3 per 1,000 minutes
const IMAGE_USD_ESTIMATE = 0.04; // not published yet: a conservative estimate per image
const MAX_AUDIO_BYTES = 4_000_000;

/** @param {import("pg").Pool} pool @param {string} userId */
async function keyOf(pool, userId) {
  const { rows } = await pool.query("SELECT provider, secret, models FROM app.provider_keys WHERE user_id = $1 AND provider = 'meta' LIMIT 1", [userId]);
  if (!rows[0]) throw new HttpError(409, "Connect your Meta key first", { reason: "no-key" });
  return { provider: rows[0].provider, key: open(rows[0].secret, { userId, provider: rows[0].provider }) };
}

/** @param {import("pg").Pool} pool @param {string} userId @param {number} cost */
async function guard(pool, userId, cost) {
  const budget = await budgetOf(pool, userId);
  if (budget.spent + cost > budget.monthly) throw new HttpError(409, "This could go over your monthly budget", { reason: "budget", ...budget });
}

/** @param {import("pg").Pool} pool @param {string} userId @param {string} kind @param {string} model @param {number} cost */
const log = (pool, userId, kind, model, cost) =>
  pool.query(
    `INSERT INTO app.harness_runs (user_id, kind, provider, model, effort, input_tokens, output_tokens, cost_usd, outcome)
     VALUES ($1, $2, 'meta', $3, NULL, 0, 0, $4, 'ok')`,
    [userId, kind, model, cost],
  );

/** @param {number} status @param {string} what */
function metaError(status, what) {
  if (status === 401 || status === 403) return new HttpError(400, `Your Meta key doesn't have access to ${what} yet`, { reason: "no-access" });
  if (status === 404) return new HttpError(501, `${what} isn't available on your Meta account yet`, { reason: "unavailable" });
  if (status === 429) return new HttpError(429, "Meta is rate limiting this key; try again in a minute");
  return new HttpError(502, `Meta answered with an error (${status})`);
}

/** @param {Request} request @param {URL} url */
async function voice(request, url) {
  const user = await requireUser(request);
  const pool = db();
  const audio = await request.arrayBuffer();
  if (!audio.byteLength) throw new HttpError(400, "No audio received");
  if (audio.byteLength > MAX_AUDIO_BYTES) throw new HttpError(413, "Keep it under two minutes");
  const seconds = Math.min(120, Math.max(1, Number(url.searchParams.get("seconds")) || 60));
  const cost = (seconds / 60) * VOICE_USD_PER_MIN;
  await guard(pool, user.id, cost);
  const k = await keyOf(pool, user.id);
  const base = PROVIDERS.meta?.base ?? "";
  const type = request.headers.get("content-type") || "audio/webm";
  const form = () => {
    const f = new FormData();
    f.append("file", new Blob([audio], { type }), `voice.${type.includes("wav") ? "wav" : type.includes("mp4") ? "m4a" : "webm"}`);
    f.append("model", VOICE_MODEL);
    if (url.searchParams.get("lang") === "es") f.append("language", "es");
    return f;
  };
  const send = (/** @type {string} */ path) => fetch(`${base}${path}`, { method: "POST", headers: { authorization: `Bearer ${k.key}` }, body: form(), signal: AbortSignal.timeout(45_000) });
  let res;
  try {
    // OpenAI-compatible route first, then Meta's own ASR route
    res = await send("/audio/transcriptions");
    if (res.status === 404) res = await send("/asr/transcribe");
  } catch {
    throw new HttpError(502, "Could not reach Meta");
  }
  if (!res.ok) throw metaError(res.status, "Muse Voice Transcribe");
  const body = await res.json().catch(() => ({}));
  const text = String(body?.text ?? body?.transcript ?? body?.results?.[0]?.transcript ?? "").trim();
  if (!text) throw new HttpError(502, "Meta returned an empty transcript");
  await log(pool, user.id, "voice", VOICE_MODEL, cost);
  return json({ text: text.slice(0, 500), model: VOICE_MODEL, cost });
}

/** @param {Request} request */
async function image(request) {
  const user = await requireUser(request);
  const pool = db();
  const body = await readJson(request);
  const skillId = typeof body.skillId === "string" ? body.skillId : "";
  const { rows } = await pool.query("SELECT scenario, context, version, instructions FROM app.agent_skills WHERE id = $1 AND user_id = $2", [skillId, user.id]);
  const skill = rows[0];
  if (!skill) throw new HttpError(404, "That skill doesn't exist");
  await guard(pool, user.id, IMAGE_USD_ESTIMATE);
  const k = await keyOf(pool, user.id);
  const prompt =
    `A minimal flat emblem, like an embroidered lab patch, for a learned work rule. Scenario: ${skill.scenario}, ` +
    `context: ${skill.context}, version ${skill.version}. The rule: ${String(skill.instructions).slice(0, 300)}. ` +
    "Two or three colors, bold simple shapes, centered, no text, no letters, plain background.";
  let res;
  try {
    res = await fetch(`${PROVIDERS.meta?.base}/images/generations`, {
      method: "POST",
      headers: { authorization: `Bearer ${k.key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: IMAGE_MODEL, prompt, n: 1, size: "1024x1024", response_format: "b64_json" }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch {
    throw new HttpError(502, "Could not reach Meta");
  }
  if (!res.ok) throw metaError(res.status, "Muse Image");
  const out = await res.json().catch(() => ({}));
  const item = out?.data?.[0] ?? {};
  const src = item.b64_json ? `data:image/png;base64,${item.b64_json}` : typeof item.url === "string" ? item.url : "";
  if (!src) throw new HttpError(502, "Meta returned no image");
  await log(pool, user.id, "image", IMAGE_MODEL, IMAGE_USD_ESTIMATE);
  return json({ image: src, model: IMAGE_MODEL, cost: IMAGE_USD_ESTIMATE });
}

export const POST = handle(async (request) => {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  if (kind === "voice") return voice(request, url);
  if (kind === "image") return image(request);
  throw new HttpError(400, "Unknown media kind");
});
