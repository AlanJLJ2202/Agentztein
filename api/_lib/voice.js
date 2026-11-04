// The agent's ears and voice.
//
// Ears: Muse Voice Transcribe (muse-voice-transcribe-1.0) on the Meta Model API. Its file route is
// POST /v1/asr/transcribe and it takes WAV only (16-bit mono PCM at 16 or 24 kHz), as a multipart body with a JSON
// `request` part and an `audio` part; the text comes back as `transcript`. The OpenAI-style /audio/transcriptions
// route is not there, and browser recordings (webm/opus, mp4/aac) are refused: that was the "Meta answered with an
// error (400)". The app converts every recording to 16 kHz mono WAV before sending it (apps/app/src/wav.ts).
//
// Voice: Meta has no text-to-speech model, so the answer is read aloud either by the browser (free, on the device)
// or by ElevenLabs with the person's own key (a more natural voice, billed to their ElevenLabs account).
import { HttpError } from "./http.js";

export const VOICE_MODEL = "muse-voice-transcribe-1.0";
export const ELEVEN_API = "https://api.elevenlabs.io/v1";
export const ELEVEN_MODEL = "eleven_multilingual_v2";

/** A RIFF/WAVE header: the only audio Muse Voice Transcribe takes. @param {ArrayBuffer} buf */
export function isWav(buf) {
  if (buf.byteLength < 44) return false;
  const b = new Uint8Array(buf, 0, 12);
  const s = (/** @type {number} */ i, /** @type {number} */ n) => String.fromCharCode(...b.slice(i, i + n));
  return s(0, 4) === "RIFF" && s(8, 4) === "WAVE";
}

/**
 * The multipart body, written by hand so each part is exactly what the route expects: `request` as JSON with no
 * filename, `audio` as a WAV file.
 * @param {Record<string, unknown>} request @param {ArrayBuffer} wav
 */
export function multipart(request, wav) {
  const boundary = `----agentztein${crypto.randomUUID().replace(/-/g, "")}`;
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="request"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(request)}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="voice.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.byteLength + wav.byteLength + tail.byteLength);
  body.set(head, 0);
  body.set(new Uint8Array(wav), head.byteLength);
  body.set(tail, head.byteLength + wav.byteLength);
  return { body, type: `multipart/form-data; boundary=${boundary}` };
}

/** Meta's own words about a refusal, short, when it sends them. @param {Response} res */
async function metaMessage(res) {
  try {
    const raw = await res.text();
    try {
      const j = JSON.parse(raw);
      const m = j?.error?.message ?? j?.message ?? j?.detail ?? j?.error;
      if (typeof m === "string") return m.slice(0, 180);
    } catch {
      /* not JSON */
    }
    return raw.trim().slice(0, 180);
  } catch {
    return "";
  }
}

/**
 * Turns a WAV recording into text with Muse Voice Transcribe. If Meta refuses the request shape (400), it tries
 * again with fewer optional fields (first without the language hint, then without the mode) before giving up.
 * @param {{ base: string, key: string, wav: ArrayBuffer, lang?: string, fetchImpl?: typeof fetch }} req
 * @returns {Promise<string>}
 */
export async function transcribe({ base, key, wav, lang, fetchImpl = fetch }) {
  if (!isWav(wav)) throw new HttpError(415, "Muse Voice Transcribe only takes WAV audio (16 kHz mono)", { reason: "bad-audio" });
  const plain = { model: VOICE_MODEL, audioEncoding: "WAV" };
  const shapes = [
    { ...plain, mode: "PUSH_TO_TALK", ...(lang ? { languageBias: lang } : {}) },
    { ...plain, mode: "PUSH_TO_TALK" },
    plain,
  ].filter((s, i, all) => all.findIndex((x) => JSON.stringify(x) === JSON.stringify(s)) === i);
  let res;
  let said = "";
  for (const shape of shapes) {
    const { body, type } = multipart(shape, wav);
    try {
      res = await fetchImpl(`${base}/asr/transcribe`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": type },
        body,
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      throw new HttpError(502, "Could not reach Meta", { reason: "unreachable" });
    }
    if (res.status !== 400) break;
    said = await metaMessage(res);
  }
  if (!res) throw new HttpError(502, "Could not reach Meta", { reason: "unreachable" });
  if (res.status === 401 || res.status === 403) throw new HttpError(400, "Your Meta key doesn't have access to Muse Voice Transcribe yet", { reason: "no-access" });
  if (res.status === 404) throw new HttpError(501, "Muse Voice Transcribe isn't available on your Meta account yet", { reason: "unavailable" });
  if (res.status === 429) throw new HttpError(429, "Meta is rate limiting this key; try again in a minute", { reason: "rate" });
  if (res.status === 400) throw new HttpError(502, `Meta didn't accept the audio${said ? `: ${said}` : ""}`, { reason: "bad-audio" });
  if (!res.ok) {
    const why = await metaMessage(res);
    throw new HttpError(502, `Meta answered with an error (${res.status})${why ? `: ${why}` : ""}`, { reason: "meta" });
  }
  const out = await res.json().catch(() => ({}));
  const text = String(out?.transcript ?? out?.text ?? out?.results?.[0]?.transcript ?? "").trim();
  if (!text) throw new HttpError(422, "I didn't catch any words. Try again a bit closer to the mic.", { reason: "empty" });
  return text;
}

/** Checks an ElevenLabs key and lists its voices. @param {string} key @param {typeof fetch} [fetchImpl] */
export async function elevenVoices(key, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(`${ELEVEN_API}/voices`, { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(10_000) });
  } catch {
    return { status: /** @type {const} */ ("unverified"), voices: [] };
  }
  if (res.status === 401) return { status: /** @type {const} */ ("invalid"), voices: [] };
  if (!res.ok) return { status: /** @type {const} */ ("unverified"), voices: [] };
  const body = await res.json().catch(() => ({}));
  const voices = (Array.isArray(body?.voices) ? body.voices : [])
    .map((/** @type {any} */ v) => ({ id: String(v?.voice_id ?? ""), name: String(v?.name ?? "").slice(0, 60) }))
    .filter((/** @type {{ id: string }} */ v) => /^[A-Za-z0-9]{8,40}$/.test(v.id))
    .slice(0, 60);
  return { status: /** @type {const} */ ("valid"), voices };
}

/**
 * Reads a text aloud with ElevenLabs, with the person's own key. Returns mp3 bytes.
 * @param {{ key: string, voice: string, text: string, fetchImpl?: typeof fetch }} req
 */
export async function elevenSpeak({ key, voice, text, fetchImpl = fetch }) {
  let res;
  try {
    res = await fetchImpl(`${ELEVEN_API}/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: ELEVEN_MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true } }),
      signal: AbortSignal.timeout(40_000),
    });
  } catch {
    throw new HttpError(502, "Could not reach ElevenLabs", { reason: "unreachable" });
  }
  if (res.status === 401 || res.status === 403) throw new HttpError(400, "ElevenLabs rejected your key", { reason: "invalid" });
  if (res.status === 402 || res.status === 429) throw new HttpError(429, "Your ElevenLabs account is out of credits or rate limited", { reason: "quota" });
  if (!res.ok) throw new HttpError(502, `ElevenLabs answered with an error (${res.status})`, { reason: "eleven" });
  return res.arrayBuffer();
}
