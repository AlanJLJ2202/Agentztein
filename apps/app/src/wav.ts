// Muse Voice Transcribe only takes WAV: 16-bit mono PCM at 16 kHz (or 24 kHz). Browsers record webm/opus (Chrome,
// Firefox) or mp4/aac (Safari), so every recording is decoded and re-written here before it leaves the page.
// Two minutes of speech come out at about 3.8 MB.

const RATE = 16_000;

/** Decodes any recording the browser made and returns it as 16 kHz mono 16-bit WAV. */
export async function toWav16k(recording: Blob): Promise<Blob> {
  if (/wav/i.test(recording.type) && (await looksLikeWav16kMono(recording))) return recording;
  const data = await recording.arrayBuffer();
  const Ctx: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(data.slice(0));
  } finally {
    void ctx.close();
  }
  const frames = Math.max(1, Math.ceil(decoded.duration * RATE));
  const off = new OfflineAudioContext(1, frames, RATE);
  const src = off.createBufferSource();
  src.buffer = decoded; // the offline context mixes the channels down to mono and resamples
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return encodeWav(rendered.getChannelData(0), RATE);
}

/** 16-bit PCM WAV from mono float samples. */
export function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true); // PCM chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); // bytes per second
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0, o = 44; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

async function looksLikeWav16kMono(b: Blob) {
  const h = new DataView(await b.slice(0, 44).arrayBuffer());
  return h.byteLength >= 44 && h.getUint16(22, true) === 1 && [16_000, 24_000].includes(h.getUint32(24, true)) && h.getUint16(34, true) === 16;
}
