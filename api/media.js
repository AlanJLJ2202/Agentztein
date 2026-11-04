// /api/media: Meta's other model families, used by the agent with the user's own key.
//   POST ?kind=voice   body: the recorded audio as 16 kHz mono WAV (≤ 2 min; the app converts it). Muse Voice
//                      Transcribe turns it into text: what the person tells the agent (see _lib/voice.js).
//   POST ?kind=speak   { text, voice? } the agent's answer read aloud by ElevenLabs with the person's own key.
//   POST ?kind=image   { skillId } Muse Image draws an emblem for a skill the agent wrote.
// Both are new on the Meta Model API and not every key has them yet: errors say so plainly. Each call goes
// through the same harness (budget check first, append-only log after).
import { requireUser } from "./_lib/auth.js";
import { open } from "./_lib/crypto.js";
import { db } from "./_lib/db.js";
import { budgetOf } from "./_lib/harness.js";
import { HttpError, handle, json, readJson } from "./_lib/http.js";
import { PROVIDERS } from "./_lib/providers.js";
import { elevenSpeak, transcribe, VOICE_MODEL } from "./_lib/voice.js";

export { VOICE_MODEL };
export const IMAGE_MODEL = "muse-image-1.0";
const VOICE_USD_PER_MIN = 0.003; // $3 per 1,000 minutes
const IMAGE_USD_ESTIMATE = 0.04; // not published yet: a conservative estimate per image
const MAX_AUDIO_BYTES = 4_000_000; // two minutes of 16 kHz mono 16-bit WAV is about 3.8 MB
const MAX_SPEAK_CHARS = 800;
// "George", one of ElevenLabs' premade voices, when the person hasn't picked one
const DEFAULT_ELEVEN_VOICE = "JBFqnCBsd6RMkjVDRZzb";

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
  if (!audio.byteLength) throw new HttpError(400, "No audio received", { reason: "empty" });
  if (audio.byteLength > MAX_AUDIO_BYTES) throw new HttpError(413, "Keep it under two minutes");
  const seconds = Math.min(120, Math.max(1, Number(url.searchParams.get("seconds")) || 60));
  const cost = (seconds / 60) * VOICE_USD_PER_MIN;
  await guard(pool, user.id, cost);
  const k = await keyOf(pool, user.id);
  const lang = url.searchParams.get("lang") === "es" ? "es" : url.searchParams.get("lang") === "en" ? "en" : undefined;
  const text = await transcribe({ base: PROVIDERS.meta?.base ?? "", key: k.key, wav: audio, lang });
  await log(pool, user.id, "voice", VOICE_MODEL, cost);
  return json({ text: text.slice(0, 500), model: VOICE_MODEL, cost });
}

/**
 * Reads the agent's answer aloud with ElevenLabs and the person's own key (Meta has no voice model). The mp3 goes
 * straight back; it is billed to their ElevenLabs account, not to the Meta budget.
 * @param {Request} request
 */
async function speak(request) {
  const user = await requireUser(request);
  const body = await readJson(request);
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_SPEAK_CHARS) : "";
  if (!text) throw new HttpError(400, "Nothing to say");
  const { rows } = await db().query("SELECT secret, model FROM app.provider_keys WHERE user_id = $1 AND provider = 'elevenlabs' LIMIT 1", [user.id]);
  if (!rows[0]) throw new HttpError(409, "Connect your ElevenLabs key first", { reason: "no-voice-key" });
  const key = open(rows[0].secret, { userId: user.id, provider: "elevenlabs" });
  const wanted = typeof body.voice === "string" && /^[A-Za-z0-9]{8,40}$/.test(body.voice) ? body.voice : null;
  const audio = await elevenSpeak({ key, voice: wanted ?? rows[0].model ?? DEFAULT_ELEVEN_VOICE, text });
  return new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
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
  if (kind === "speak") return speak(request);
  throw new HttpError(400, "Unknown media kind");
});
