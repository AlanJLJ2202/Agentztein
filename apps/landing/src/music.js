/* Ambient music, made in the browser: three beats you can switch between. Nothing to download, so it starts
   instantly and loops forever. Each beat is a little band: drums, a bass, a chord pad and a plucked melody, played
   by a scheduler that looks a fraction of a second ahead so the timing never wobbles.
   It follows the sound switch (no sound, no music) and has its own on/off and beat selector. */
import { audio, sound } from "./sound.js";

const KEY = "agz-music", BEAT_KEY = "agz-beat";
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private window */ } },
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* Each beat: tempo, a root note, one chord per bar (semitones from the root), a 16-step drum grid and a melody scale. */
const BEATS = [
  {
    id: "chill", name: { en: "Lab Chill", es: "Lab Chill" }, bpm: 84, root: 57, swing: 0.06,
    chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [3, 7, 10, 14], [-2, 2, 5, 9]], bass: [0, -4, 3, -2],
    kick: "1000001001000000", snare: "0000100000001000", hat: "1010101010101011", scale: [0, 3, 5, 7, 10, 12, 15],
    arp: 0, pad: 0.5, lead: 0.28,
  },
  {
    id: "drive", name: { en: "Neon Drive", es: "Neon Drive" }, bpm: 112, root: 50, swing: 0,
    chords: [[0, 3, 7, 12], [-4, 0, 3, 8], [-9, -5, -2, 3], [-7, -3, 0, 5]], bass: [0, -4, -9, -7],
    kick: "1000100010001000", snare: "0000100000001000", hat: "0010001000100010", scale: [0, 3, 7, 10, 12, 15, 19],
    arp: 1, pad: 0.35, lead: 0.2,
  },
  {
    id: "space", name: { en: "Deep Space", es: "Espacio profundo" }, bpm: 68, root: 52, swing: 0,
    chords: [[0, 7, 11, 14], [-3, 4, 7, 11], [-5, 2, 7, 9], [-7, 0, 4, 9]], bass: [0, -3, -5, -7],
    kick: "1000000000100000", snare: "0000000000000000", hat: "0000100000001000", scale: [0, 2, 7, 9, 11, 14, 16],
    arp: 0, pad: 0.7, lead: 0.34,
  },
];

let wanted = store.get(KEY) !== "off";
let beatIx = Math.max(0, BEATS.findIndex((b) => b.id === store.get(BEAT_KEY)));
let bus = null, timer = 0, step = 0, next = 0, running = false, delay = null;
const listeners = new Set();
const emit = () => listeners.forEach((f) => f({ on: wanted, playing: running, beat: BEATS[beatIx] }));

/* ---------- instruments ---------- */
const env = (g, t0, a, peak, dur) => {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
};
function osc(ctx, type, f, t0, dur, peak, { attack = 0.01, detune = 0, to = null, filter = 0, dest = bus } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0); o.detune.value = detune;
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  env(g, t0, attack, peak, dur);
  let node = o;
  if (filter) { const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = filter; o.connect(lp); node = lp; }
  node.connect(g); g.connect(dest);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
let noiseBuf = null;
function burst(ctx, t0, dur, peak, type, freq, q = 1) {
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); env(g, t0, 0.002, peak, dur);
  s.connect(f); f.connect(g); g.connect(bus);
  s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
}
const kick = (c, t) => { osc(c, "sine", 130, t, 0.28, 0.9, { to: 42, attack: 0.002 }); };
const snare = (c, t, soft) => { burst(c, t, 0.14, soft ? 0.18 : 0.3, "bandpass", 1800, 0.8); osc(c, "triangle", 190, t, 0.1, 0.16, { to: 120, attack: 0.002 }); };
const hat = (c, t, open) => burst(c, t, open ? 0.12 : 0.04, open ? 0.07 : 0.05, "highpass", 7000);

/* ---------- the scheduler ---------- */
function playStep(c, b, n, t) {
  const s = n % 16, bar = Math.floor(n / 16), chord = b.chords[bar % b.chords.length];
  if (b.kick[s] === "1") kick(c, t);
  if (b.snare[s] === "1") snare(c, t, b.id === "chill");
  if (b.hat[s] === "1") hat(c, t, s % 4 === 2);
  const stepDur = 60 / b.bpm / 4;
  if (s === 0) {
    // the chord pad: a slow swell for the whole bar
    chord.forEach((m, i) => { const f = mtof(b.root + 12 + m); [-7, 7].forEach((d) => osc(c, "sawtooth", f, t, stepDur * 16, b.pad * 0.045, { attack: stepDur * 5, detune: d + i, filter: 900 })); });
  }
  // the bass: root on the first beat, a push on the "and" of three
  const bassNote = b.root - 12 + b.bass[bar % b.bass.length];
  if (s === 0 || s === 10 || (b.id === "drive" && s % 4 === 2)) osc(c, "sawtooth", mtof(bassNote), t, stepDur * (b.id === "drive" ? 1.6 : 3.2), 0.2, { attack: 0.01, filter: 380 });
  // the melody: a quiet plucked arpeggio (drive) or sparse notes (chill, space)
  if (b.arp) { if (s % 2 === 0) { const m = chord[(s / 2) % chord.length] + 12; osc(c, "triangle", mtof(b.root + 12 + m), t, stepDur * 1.8, 0.07, { attack: 0.005 }); } }
  else if ((s === 4 || s === 11 || s === 14) && Math.random() < 0.6) {
    const m = b.scale[Math.floor(Math.random() * b.scale.length)] + 12;
    osc(c, "sine", mtof(b.root + 12 + m), t, stepDur * 4, b.lead * 0.2, { attack: 0.01 });
  }
}
function tick() {
  const a = audio(); if (!a || !running) return;
  const b = BEATS[beatIx], stepDur = 60 / b.bpm / 4;
  while (next < a.ctx.currentTime + 0.18) {
    const swing = step % 2 ? b.swing * stepDur : 0;
    playStep(a.ctx, b, step, next + swing);
    next += stepDur; step++;
  }
}
function begin() {
  const a = audio(); if (!a || running || !wanted || !sound.on) return;
  const { ctx, out } = a;
  bus = ctx.createGain(); bus.gain.value = 0;
  // a soft echo gives the pad some air
  const d = ctx.createDelay(1); d.delayTime.value = 0.36; const fb = ctx.createGain(); fb.gain.value = 0.32; const wet = ctx.createGain(); wet.gain.value = 0.35;
  bus.connect(d); d.connect(fb); fb.connect(d); d.connect(wet);
  const master = ctx.createGain(); master.gain.value = 0.34;
  bus.connect(master); wet.connect(master); master.connect(out);
  bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
  delay = { master };
  running = true; step = 0; next = ctx.currentTime + 0.1;
  timer = setInterval(tick, 25);
  emit();
}
function halt() {
  if (!running) return;
  running = false; clearInterval(timer);
  const a = audio();
  if (a && bus) { bus.gain.cancelScheduledValues(a.ctx.currentTime); bus.gain.linearRampToValueAtTime(0, a.ctx.currentTime + 0.4); const old = bus, m = delay?.master; setTimeout(() => { try { old.disconnect(); m?.disconnect(); } catch { /* gone */ } }, 700); }
  bus = null; emit();
}

// music follows the sound switch and the visitor's own music preference
sound.onChange((on) => { if (on && wanted) begin(); else halt(); });

export const music = {
  get on() { return wanted; },
  get beat() { return BEATS[beatIx]; },
  beats: BEATS,
  toggle() { wanted = !wanted; store.set(KEY, wanted ? "on" : "off"); if (wanted) begin(); else halt(); emit(); return wanted; },
  /** Switches to the next beat (starting the music if it was off). */
  next() {
    beatIx = (beatIx + 1) % BEATS.length; store.set(BEAT_KEY, BEATS[beatIx].id);
    if (!wanted) { wanted = true; store.set(KEY, "on"); }
    if (running) { halt(); setTimeout(begin, 450); } else begin();
    emit();
  },
  onChange(f) { listeners.add(f); return () => listeners.delete(f); },
};
