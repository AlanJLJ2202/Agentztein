// /api/audio: sound effects and the agent's voice, made by ElevenLabs. The key stays on the server.
//   GET /api/audio                      → { enabled }: does this deployment have an ElevenLabs key?
//   GET /api/audio?kind=sfx&id=zap      → mp3 of a sound effect (Sound Effects API)
//   GET /api/audio?kind=say&id=alive&lang=es → mp3 of a spoken line (Text to Speech API)
// Only ids written in _data/audio-catalog.js are generated, and every answer is cached by the CDN for a
// year, so each sound is paid for once, not once per visitor. Without a key it answers 503 and the page
// falls back to the sounds it synthesises itself, so nothing breaks.
import { LINES, SFX } from "./_data/audio-catalog.js";
import { HttpError, handle, json } from "./_lib/http.js";

const API = "https://api.elevenlabs.io/v1";
// "George", one of ElevenLabs' premade voices (works on every plan). Set ELEVENLABS_VOICE_ID to use another.
const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";
const VOICE_MODEL = "eleven_multilingual_v2";

const key = () => (process.env.ELEVENLABS_API_KEY ?? "").trim();

/** @param {Response} res */
function upstreamError(res) {
  if (res.status === 401 || res.status === 403) return new HttpError(503, "The ElevenLabs key was rejected", { reason: "bad-key" });
  if (res.status === 402 || res.status === 429) return new HttpError(503, "ElevenLabs is out of quota or rate limited", { reason: "quota" });
  return new HttpError(502, `ElevenLabs answered with an error (${res.status})`);
}

/** @param {ArrayBuffer} audio */
const mp3 = (audio) =>
  new Response(audio, {
    status: 200,
    headers: {
      "content-type": "audio/mpeg",
      // generated once, then served from the CDN (and the browser) for a year
      "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
    },
  });

/** @param {string} id */
async function sfx(id) {
  const def = Object.hasOwn(SFX, id) ? SFX[id] : null;
  if (!def) throw new HttpError(404, "Unknown sound");
  let res;
  try {
    res = await fetch(`${API}/sound-generation?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": key(), "content-type": "application/json" },
      body: JSON.stringify({ text: def.prompt, duration_seconds: def.seconds, prompt_influence: 0.5 }),
      signal: AbortSignal.timeout(40_000),
    });
  } catch {
    throw new HttpError(502, "Could not reach ElevenLabs");
  }
  if (!res.ok) throw upstreamError(res);
  return mp3(await res.arrayBuffer());
}

/** @param {string} id @param {string} lang */
async function say(id, lang) {
  const line = Object.hasOwn(LINES, id) ? LINES[id] : null;
  if (!line) throw new HttpError(404, "Unknown line");
  const voice = (process.env.ELEVENLABS_VOICE_ID ?? "").trim() || DEFAULT_VOICE;
  let res;
  try {
    res = await fetch(`${API}/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": key(), "content-type": "application/json" },
      body: JSON.stringify({
        text: lang === "es" ? line.es : line.en,
        model_id: VOICE_MODEL,
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(40_000),
    });
  } catch {
    throw new HttpError(502, "Could not reach ElevenLabs");
  }
  if (!res.ok) throw upstreamError(res);
  return mp3(await res.arrayBuffer());
}

export const GET = handle(async (request) => {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  if (!kind) return json({ enabled: Boolean(key()) });
  if (!key()) throw new HttpError(503, "Voice and sound effects aren't set up on this deployment", { reason: "not-configured" });
  const id = url.searchParams.get("id") ?? "";
  if (kind === "sfx") return sfx(id);
  if (kind === "say") return say(id, url.searchParams.get("lang") === "es" ? "es" : "en");
  throw new HttpError(400, "Unknown audio kind");
});
