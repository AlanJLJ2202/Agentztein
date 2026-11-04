// How Agentztein hears you and how it answers out loud, with the person's choice remembered on this device.
//   Ears:  Muse Voice Transcribe (your Meta key, ~$0.003/min) or the browser's own speech recognition (free; Chrome,
//          Edge and Safari have it).
//   Voice: the browser's own voice (free, on your device; you pick which one and how fast), ElevenLabs with your own
//          key (more natural, billed to your ElevenLabs account), or silent. Meta has no voice model, so Muse can
//          listen but can't speak.
import { useCallback, useEffect, useState } from "react";
import type { Lang } from "./i18n.js";

export type VoiceOut = "browser" | "eleven" | "off";
export type Ear = "meta" | "browser";
export type VoicePrefs = { out: VoiceOut; browserVoice: string; rate: number; ear: Ear; readTyped: boolean };

const KEY = "agz-voice";
const DEFAULTS: VoicePrefs = { out: "browser", browserVoice: "", rate: 1, ear: "meta", readTyped: false };

export function loadPrefs(): VoicePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<VoicePrefs>;
    return {
      out: raw.out === "eleven" || raw.out === "off" ? raw.out : "browser",
      browserVoice: typeof raw.browserVoice === "string" ? raw.browserVoice : "",
      rate: typeof raw.rate === "number" && raw.rate >= 0.6 && raw.rate <= 1.6 ? raw.rate : 1,
      ear: raw.ear === "browser" ? "browser" : "meta",
      readTyped: raw.readTyped === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

const listeners = new Set<(p: VoicePrefs) => void>();
export function savePrefs(p: VoicePrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ }
  listeners.forEach((f) => f(p));
}

/** The voice preferences, shared live between Settings and the companion. */
export function useVoicePrefs(): [VoicePrefs, (patch: Partial<VoicePrefs>) => void] {
  const [p, setP] = useState(loadPrefs);
  useEffect(() => {
    listeners.add(setP);
    return () => { listeners.delete(setP); };
  }, []);
  const update = useCallback((patch: Partial<VoicePrefs>) => savePrefs({ ...loadPrefs(), ...patch }), []);
  return [p, update];
}

/** The browser's voices for a language, best first (local and "natural"/"premium" voices sound better). */
export function useBrowserVoices(lang: Lang): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const read = () => {
      const all = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang));
      const score = (v: SpeechSynthesisVoice) => (/natural|premium|enhanced|neural|google/i.test(v.name) ? 2 : 0) + (/es-MX|es-US|en-US/i.test(v.lang) ? 1 : 0);
      setVoices(all.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name)));
    };
    read();
    speechSynthesis.addEventListener("voiceschanged", read);
    return () => speechSynthesis.removeEventListener("voiceschanged", read);
  }, [lang]);
  return voices;
}

let playing: HTMLAudioElement | null = null;

/** Stops whatever it is saying. */
export function hush() {
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  if (playing) { playing.pause(); playing = null; }
}

/** Reads a text with the browser's own voice. */
export function speakBrowser(text: string, lang: Lang, prefs: Pick<VoicePrefs, "browserVoice" | "rate">): Promise<void> {
  return new Promise((resolve) => {
    const synth = typeof speechSynthesis === "undefined" ? null : speechSynthesis;
    if (!synth) return resolve();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const want = lang === "es" ? ["es-MX", "es-US", "es"] : ["en-US", "en"];
    u.voice = voices.find((v) => v.voiceURI === prefs.browserVoice) ?? want.map((w) => voices.find((v) => v.lang.startsWith(w))).find(Boolean) ?? null;
    u.lang = u.voice?.lang ?? want[0] ?? "en-US";
    u.rate = prefs.rate;
    u.pitch = 1.05;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
  });
}

/** Plays an mp3 and waits until it ends. */
export function playAudio(mp3: Blob): Promise<void> {
  return new Promise((resolve) => {
    hush();
    const url = URL.createObjectURL(mp3);
    const a = new Audio(url);
    playing = a;
    const done = () => { URL.revokeObjectURL(url); if (playing === a) playing = null; resolve(); };
    a.onended = done;
    a.onerror = done;
    a.onpause = done;
    void a.play().catch(done);
  });
}

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
const Recognizer = (): (new () => Recognition) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
export const browserCanListen = () => typeof window !== "undefined" && Recognizer() !== null;

/**
 * Listens once with the browser's own speech recognition and returns what it understood (null if nobody spoke).
 * `cancel.stop` ends it early.
 */
export function listenBrowser(lang: Lang, cancel: { stop?: () => void }, onSpeech?: () => void): Promise<string | null> {
  const R = Recognizer();
  if (!R) return Promise.reject(new Error("no-recognition"));
  return new Promise((resolve, reject) => {
    const r = new R();
    r.lang = lang === "es" ? "es-MX" : "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    let text = "";
    let failed = "";
    r.onresult = (e) => {
      onSpeech?.();
      text = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" ").trim();
    };
    r.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") failed = e.error; };
    r.onend = () => (failed ? reject(new Error(failed)) : resolve(text || null));
    cancel.stop = () => { failed = ""; text = ""; r.abort(); };
    r.start();
  });
}
