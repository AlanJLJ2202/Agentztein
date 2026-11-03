/* Sound for the whole page: effects, footsteps and the agent's voice.
   Where it comes from, in order:
     1. ElevenLabs, through /api/audio (the key never reaches the browser; every clip is cached by the CDN).
     2. If that isn't set up (no key, offline, a static preview), sounds the browser synthesises itself, so the
        lab is never silent. Spoken lines have no synthetic fallback: the speech bubble still shows them.
   Browsers only allow audio after the visitor does something, so sound switches on at their first tap or key
   (unless they muted it before) and the speaker button on the page turns it on and off. */
import { LINES, SFX_IDS } from "../../../api/_data/audio-catalog.js";

const KEY = "agz-sound";
const store = {
  get() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); } catch { /* private window */ } },
};

let out = null; // where the synthesised sounds go for the current call (set by sfx to apply a volume)
let ctx = null, master = null, sfxBus = null, voiceBus = null;
let enabled = false, unlocked = false, lang = "en";
let remote = null; // null = not checked yet, true = ElevenLabs answers, false = use the synthesised sounds
let voiceSrc = null;
const buffers = new Map(); // "sfx:zap" / "say:alive:es" → AudioBuffer, or null when it can't be had
const pending = new Map();
const listeners = new Set();
const lastPlay = new Map();

const emit = () => listeners.forEach((f) => f(enabled));
const rand = (a, b) => a + Math.random() * (b - a);

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55;
  voiceBus = ctx.createGain(); voiceBus.gain.value = 1;
  sfxBus.connect(comp); voiceBus.connect(comp); comp.connect(master); master.connect(ctx.destination);
  return ctx;
}

/* ---------- ElevenLabs clips (through /api/audio) ---------- */
async function checkRemote() {
  if (remote !== null) return remote;
  try {
    const r = await fetch("/api/audio", { cache: "no-store" });
    remote = r.ok && (r.headers.get("content-type") || "").includes("json") ? Boolean((await r.json()).enabled) : false;
  } catch { remote = false; }
  return remote;
}
function clip(name, url) {
  if (buffers.has(name)) return Promise.resolve(buffers.get(name));
  if (pending.has(name)) return pending.get(name);
  const p = (async () => {
    if (!(await checkRemote()) || !ctx) return null;
    try {
      const r = await fetch(url);
      if (!r.ok) { if (r.status === 503) remote = false; else buffers.set(name, null); return null; }
      const buf = await ctx.decodeAudioData(await r.arrayBuffer());
      buffers.set(name, buf);
      return buf;
    } catch { return null; } finally { pending.delete(name); }
  })();
  pending.set(name, p);
  return p;
}
const sfxClip = (id) => clip(`sfx:${id}`, `/api/audio?kind=sfx&id=${encodeURIComponent(id)}`);
const lineClip = (id) => clip(`say:${id}:${lang}`, `/api/audio?kind=say&id=${encodeURIComponent(id)}&lang=${lang}`);

function playBuffer(buf, { bus = sfxBus, rate = 1, gain = 1, when = 0 } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = buf; s.playbackRate.value = rate;
  const g = ctx.createGain(); g.gain.value = gain;
  s.connect(g); g.connect(bus);
  s.start(ctx.currentTime + when);
  return s;
}

/* ---------- synthesised fallbacks ---------- */
let noiseBuf = null;
function noise() {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function tone(type, f0, f1, t0, dur, vol = 0.3, attack = 0.005) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(out || sfxBus);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function hiss(t0, dur, { type = "bandpass", f0 = 1000, f1 = f0, q = 1, vol = 0.3, attack = 0.004 } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noise(); s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(out || sfxBus);
  s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
}
const SYNTH = {
  step() { const t = ctx.currentTime, p = rand(0.85, 1.15); hiss(t, 0.06, { type: "lowpass", f0: 900 * p, q: 0.5, vol: 0.12 }); tone("sine", 95 * p, 55, t, 0.08, 0.1); },
  chirps() { const t = ctx.currentTime; for (let i = 0, n = 3 + Math.floor(rand(0, 4)); i < n; i++) tone("sine", rand(900, 2600), rand(900, 2600), t + i * rand(0.05, 0.11), 0.05, 0.05, 0.004); },
  tick() { const t = ctx.currentTime; tone("triangle", 1800, 1200, t, 0.03, 0.06, 0.002); },
  bubble() { const t = ctx.currentTime, f = rand(300, 700); tone("sine", f, f * 2.2, t, 0.09, 0.07, 0.01); },
  zap() { const t = ctx.currentTime; for (let i = 0; i < 14; i++) hiss(t + i * 0.09 + rand(0, 0.04), rand(0.03, 0.09), { type: "highpass", f0: rand(1500, 4500), vol: rand(0.2, 0.55) }); tone("sawtooth", 70, 420, t, 1.3, 0.16, 0.05); tone("square", 50, 50, t, 1.4, 0.07); },
  awake() { const t = ctx.currentTime; tone("sine", 110, 520, t, 0.9, 0.3, 0.05); tone("triangle", 220, 1040, t, 0.9, 0.12, 0.05); tone("sine", 784, 784, t + 0.95, 0.35, 0.25); tone("sine", 1175, 1175, t + 1.1, 0.5, 0.25); },
  door() { const t = ctx.currentTime; hiss(t, 0.55, { f0: 400, f1: 3200, q: 1.2, vol: 0.35, attack: 0.08 }); tone("sine", 180, 90, t, 0.4, 0.12); },
  interact() { const t = ctx.currentTime; tone("sine", 660, 660, t, 0.1, 0.28); tone("sine", 990, 990, t + 0.07, 0.16, 0.28); },
  success() { const t = ctx.currentTime; [523, 659, 784, 1047].forEach((f, i) => tone("triangle", f, f, t + i * 0.09, 0.4, 0.26)); },
  fail() { const t = ctx.currentTime; tone("square", 150, 120, t, 0.18, 0.18); tone("square", 150, 110, t + 0.24, 0.26, 0.18); },
  pickup() { const t = ctx.currentTime; tone("square", 988, 988, t, 0.08, 0.14); tone("square", 1319, 1319, t + 0.08, 0.3, 0.14); },
  chip() { const t = ctx.currentTime; tone("triangle", 1500, 700, t, 0.05, 0.3); hiss(t, 0.04, { f0: 3500, q: 2, vol: 0.3 }); tone("sine", 440, 880, t + 0.06, 0.2, 0.2); },
  jet() { const t = ctx.currentTime; hiss(t, 0.7, { type: "lowpass", f0: 500, f1: 2600, q: 0.7, vol: 0.5, attack: 0.05 }); tone("sawtooth", 60, 180, t, 0.6, 0.1, 0.05); },
  alarm() { const t = ctx.currentTime; for (let i = 0; i < 4; i++) { tone("square", 720, 720, t + i * 0.38, 0.17, 0.2); tone("square", 960, 960, t + i * 0.38 + 0.19, 0.17, 0.2); } },
  shield() { const t = ctx.currentTime; tone("sine", 180, 760, t, 1.1, 0.26, 0.1); tone("triangle", 184, 770, t, 1.1, 0.16, 0.1); tone("sine", 1500, 2400, t + 0.5, 0.6, 0.06); },
  shieldhit() { const t = ctx.currentTime; hiss(t, 0.25, { type: "highpass", f0: 2500, vol: 0.55 }); tone("sine", 90, 40, t, 0.4, 0.55); tone("sawtooth", 600, 100, t, 0.3, 0.12); },
};

/* ---------- public ---------- */
/** Plays a sound effect by id (see api/_data/audio-catalog.js). Cheap to call every frame it matters. */
function sfx(id, { rate = 1, gain = 1, every = 0 } = {}) {
  if (!enabled || !ctx || ctx.state !== "running") return;
  const now = performance.now();
  if (every && now - (lastPlay.get(id) ?? -1e9) < every) return;
  lastPlay.set(id, now);
  const buf = buffers.get(`sfx:${id}`);
  if (buf) { playBuffer(buf, { rate, gain }); return; }
  if (SFX_IDS.includes(id) && !buffers.has(`sfx:${id}`)) sfxClip(id); // fetch it for next time
  if (!SYNTH[id]) return;
  if (gain === 1) { SYNTH[id](); return; }
  out = ctx.createGain(); out.gain.value = gain; out.connect(sfxBus);
  try { SYNTH[id](); } finally { out = null; }
}

/** Says a line from the catalog out loud. Waits up to ~3 s for the first-ever generation, then gives up. */
async function say(id) {
  if (!enabled || !ctx || !LINES[id]) return;
  const asked = performance.now();
  const buf = await lineClip(id);
  if (!buf || !enabled || performance.now() - asked > 3200) return;
  try { voiceSrc?.stop(); } catch { /* already over */ }
  voiceSrc = playBuffer(buf, { bus: voiceBus });
}

function prefetch() {
  // after the first gesture, warm up the effects in the background so they're ready by the time they're needed
  checkRemote().then((ok) => { if (ok) SFX_IDS.forEach((id, i) => setTimeout(() => sfxClip(id), 300 + i * 250)); });
}
async function enable() {
  if (!ensureContext()) return false;
  try { await ctx.resume(); } catch { /* needs a gesture */ }
  unlocked = true; enabled = true;
  store.set("on");
  prefetch();
  emit();
  return true;
}
function disable() {
  enabled = false; store.set("off");
  try { voiceSrc?.stop(); } catch { /* already over */ }
  emit();
}

// the first tap or key anywhere turns sound on, unless the visitor muted it before
const firstGesture = (ev) => {
  if (unlocked) return;
  if (ev.target?.closest?.("#sndBtn")) return; // the speaker button decides for itself
  if (store.get() === "off") return;
  enable();
};
window.addEventListener("pointerdown", firstGesture, { capture: true });
window.addEventListener("keydown", firstGesture, { capture: true });

/** The jetpack's steady roar while it burns: level 0 (off) to 1 (full thrust). Called every frame. */
let jetNode = null;
function jetLoop(level) {
  if (!enabled || !ctx || ctx.state !== "running") { if (jetNode) jetNode.g.gain.value = 0; return; }
  if (!jetNode) {
    const src = ctx.createBufferSource(); src.buffer = noise(); src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 600;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(sfxBus); src.start();
    jetNode = { g, f };
  }
  jetNode.g.gain.setTargetAtTime(level * 0.2, ctx.currentTime, 0.06);
  jetNode.f.frequency.setTargetAtTime(500 + level * 1000, ctx.currentTime, 0.1);
}

/** Lets other modules (the music) share the audio context and its master volume. */
export const audio = () => (ctx ? { ctx, out: master } : null);

export const sound = {
  jet: jetLoop,
  sfx,
  say,
  setLanguage(l) { lang = l === "es" ? "es" : "en"; },
  /** Footsteps: call while the agent walks; it paces itself. */
  step() { sfx("step", { rate: rand(0.92, 1.1), gain: rand(0.3, 0.42), every: 140 }); },
  get on() { return enabled; },
  toggle() { return enabled ? (disable(), false) : enable(); },
  onChange(f) { listeners.add(f); return () => listeners.delete(f); },
};
