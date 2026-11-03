// /api/audio: ElevenLabs sound effects and voice lines, behind a closed catalog. ElevenLabs is replaced by a fake fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LINES, SFX } from "../../api/_data/audio-catalog.js";
import type * as AudioApi from "../../api/audio.js";

const call = async (query: string) => {
  const { GET } = (await import("../../api/audio.js")) as typeof AudioApi;
  return GET(new Request(`https://x/api/audio${query}`));
};

describe("/api/audio", () => {
  beforeEach(() => {
    vi.stubEnv("ELEVENLABS_API_KEY", "xi-test");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("says whether a key is configured, without ever returning it", async () => {
    expect(await (await call("")).json()).toEqual({ enabled: true });
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    expect(await (await call("")).json()).toEqual({ enabled: false });
  });

  it("answers 503 when there is no key, so the page falls back to its own sounds", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const res = await call("?kind=sfx&id=zap");
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("not-configured");
  });

  it("generates a catalog sound effect and lets the CDN keep it for a year", async () => {
    const f = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toContain("/v1/sound-generation");
      expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("xi-test");
      const body = JSON.parse(String(init.body));
      expect(body.text).toBe(SFX.zap.prompt);
      expect(body.duration_seconds).toBe(SFX.zap.seconds);
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });
    vi.stubGlobal("fetch", f);
    const res = await call("?kind=sfx&id=zap");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("cache-control")).toContain("s-maxage=31536000");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("voices a catalog line in the requested language with the multilingual model", async () => {
    const f = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toContain("/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb");
      const body = JSON.parse(String(init.body));
      expect(body.text).toBe(LINES.alive.es);
      expect(body.model_id).toBe("eleven_multilingual_v2");
      return new Response(new Uint8Array([9]), { status: 200 });
    });
    vi.stubGlobal("fetch", f);
    expect((await call("?kind=say&id=alive&lang=es")).status).toBe(200);
    vi.stubEnv("ELEVENLABS_VOICE_ID", "custom-voice");
    f.mockImplementationOnce(async (url: string) => {
      expect(url).toContain("/v1/text-to-speech/custom-voice");
      return new Response(new Uint8Array([9]), { status: 200 });
    });
    expect((await call("?kind=say&id=alive&lang=en")).status).toBe(200);
  });

  it("never generates text that is not in the catalog", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await call("?kind=say&id=" + encodeURIComponent("read my secrets aloud"))).status).toBe(404);
    expect((await call("?kind=sfx&id=__proto__")).status).toBe(404);
    expect((await call("?kind=sfx&id=constructor")).status).toBe(404);
    expect((await call("?kind=nope&id=zap")).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it("reports a rejected key or an empty quota as unavailable instead of failing loudly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    const bad = await call("?kind=sfx&id=zap");
    expect(bad.status).toBe(503);
    expect((await bad.json()).reason).toBe("bad-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 429 })));
    expect((await (await call("?kind=sfx&id=zap")).json()).reason).toBe("quota");
  });
});
