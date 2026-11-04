// The agent's ears: Muse Voice Transcribe takes WAV only, on /v1/asr/transcribe, as multipart with a JSON `request`
// part and an `audio` part, and answers with `transcript`. Meta is replaced by a fake fetch.
import { describe, expect, it, vi } from "vitest";
import { elevenSpeak, elevenVoices, isWav, multipart, transcribe, VOICE_MODEL } from "../../api/_lib/voice.js";

/** A tiny valid 16 kHz mono 16-bit WAV (silence). */
function wav(samples = 160): ArrayBuffer {
  const b = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(b);
  const s = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF"); v.setUint32(4, 36 + samples * 2, true); s(8, "WAVE"); s(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, "data"); v.setUint32(40, samples * 2, true);
  return b;
}
const webm = () => new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...new Array(60).fill(0)]).buffer;
const text = (body: BodyInit | null | undefined) => new TextDecoder().decode(body as Uint8Array);

describe("Muse Voice Transcribe", () => {
  it("recognizes WAV and refuses browser recordings before calling Meta", async () => {
    expect(isWav(wav())).toBe(true);
    expect(isWav(webm())).toBe(false);
    const f = vi.fn();
    await expect(transcribe({ base: "https://api.meta.ai/v1", key: "k", wav: webm(), fetchImpl: f })).rejects.toMatchObject({ status: 415, extra: { reason: "bad-audio" } });
    expect(f).not.toHaveBeenCalled();
  });

  it("posts multipart to /asr/transcribe with a JSON request part and a WAV audio part, and reads `transcript`", async () => {
    const f = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.meta.ai/v1/asr/transcribe");
      const h = init.headers as Record<string, string>;
      expect(h.authorization).toBe("Bearer k");
      expect(h["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
      const body = text(init.body);
      expect(body).toContain('name="request"\r\nContent-Type: application/json');
      expect(body).toContain(`"model":"${VOICE_MODEL}"`);
      expect(body).toContain('"audioEncoding":"WAV"');
      expect(body).toContain('"languageBias":"es"');
      expect(body).toContain('name="audio"; filename="voice.wav"\r\nContent-Type: audio/wav');
      expect(body).toContain("RIFF");
      return new Response(JSON.stringify({ transcript: " enfócate en la exportación " }), { status: 200 });
    });
    expect(await transcribe({ base: "https://api.meta.ai/v1", key: "k", wav: wav(), lang: "es", fetchImpl: f as unknown as typeof fetch })).toBe("enfócate en la exportación");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("retries with fewer optional fields when Meta refuses the shape, and says Meta's reason if it never accepts", async () => {
    const shapes: string[] = [];
    const ok = vi.fn(async (_u: string, init: RequestInit) => {
      shapes.push(text(init.body).match(/\{.*\}/)?.[0] ?? "");
      return shapes.length < 3 ? new Response(JSON.stringify({ error: { message: "unknown field" } }), { status: 400 }) : new Response(JSON.stringify({ text: "hola" }));
    });
    expect(await transcribe({ base: "b", key: "k", wav: wav(), lang: "es", fetchImpl: ok as unknown as typeof fetch })).toBe("hola");
    expect(shapes.map((s) => JSON.parse(s))).toEqual([
      { model: VOICE_MODEL, audioEncoding: "WAV", mode: "PUSH_TO_TALK", languageBias: "es" },
      { model: VOICE_MODEL, audioEncoding: "WAV", mode: "PUSH_TO_TALK" },
      { model: VOICE_MODEL, audioEncoding: "WAV" },
    ]);
    const no = vi.fn(async () => new Response(JSON.stringify({ error: { message: "sample rate must be 16000 or 24000" } }), { status: 400 }));
    await expect(transcribe({ base: "b", key: "k", wav: wav(), fetchImpl: no as unknown as typeof fetch })).rejects.toMatchObject({
      message: "Meta didn't accept the audio: sample rate must be 16000 or 24000",
      extra: { reason: "bad-audio" },
    });
  });

  it("explains access, availability and empty transcripts plainly", async () => {
    const answer = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    await expect(transcribe({ base: "b", key: "k", wav: wav(), fetchImpl: answer(403) })).rejects.toMatchObject({ extra: { reason: "no-access" } });
    await expect(transcribe({ base: "b", key: "k", wav: wav(), fetchImpl: answer(404) })).rejects.toMatchObject({ extra: { reason: "unavailable" } });
    await expect(transcribe({ base: "b", key: "k", wav: wav(), fetchImpl: answer(200, { transcript: "" }) })).rejects.toMatchObject({ extra: { reason: "empty" } });
  });

  it("builds the body byte for byte: the audio bytes are untouched", () => {
    const w = wav(8);
    const { body } = multipart({ a: 1 }, w);
    const bytes = new Uint8Array(w);
    const at = body.findIndex((_, i) => body[i] === 0x52 && body[i + 1] === 0x49 && body[i + 2] === 0x46 && body[i + 3] === 0x46);
    expect([...body.slice(at, at + bytes.length)]).toEqual([...bytes]);
  });
});

describe("ElevenLabs with the person's own key", () => {
  it("checks the key by listing its voices", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ voices: [{ voice_id: "JBFqnCBsd6RMkjVDRZzb", name: "George" }, { voice_id: "bad id!", name: "x" }] })));
    expect(await elevenVoices("xi", f as unknown as typeof fetch)).toEqual({ status: "valid", voices: [{ id: "JBFqnCBsd6RMkjVDRZzb", name: "George" }] });
    expect((await elevenVoices("xi", (async () => new Response("", { status: 401 })) as unknown as typeof fetch)).status).toBe("invalid");
  });

  it("reads a text aloud with the chosen voice and says when credits run out", async () => {
    const f = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toContain("/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb");
      expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("xi");
      expect(JSON.parse(String(init.body)).text).toBe("Hola");
      return new Response(new Uint8Array([1, 2, 3]));
    });
    expect((await elevenSpeak({ key: "xi", voice: "JBFqnCBsd6RMkjVDRZzb", text: "Hola", fetchImpl: f as unknown as typeof fetch })).byteLength).toBe(3);
    await expect(elevenSpeak({ key: "xi", voice: "v", text: "Hola", fetchImpl: (async () => new Response("", { status: 402 })) as unknown as typeof fetch })).rejects.toMatchObject({ extra: { reason: "quota" } });
  });
});
