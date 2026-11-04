// What the models wrote, in the language the person reads. A cycle runs in one language (the director's reasoning,
// a skill and why it was written, its lessons and dreams, the radar's notes), but the app can be switched at any time.
// `mt(text)` returns the text as is when it is already in the app's language (or too short to tell), the translation
// when there is one, and otherwise the original while it asks /api/agent { op: "translate" } for it: texts are batched,
// translated once with the light model of the person's key (inside the harness: budget and log), and kept in this
// browser. A skill is still applied in the words it was written in; only how it reads changes.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, type Api, type Job, type TraceEntry } from "./api.js";
import type { Lang } from "./i18n.js";

export type MtFn = <S extends string | null | undefined>(text: S) => S;
type Mt = { mt: MtFn; pending: number; off: string | null };

const BATCH = { texts: 20, chars: 9000, one: 2000 };
const STORE_MAX = 600;
const storeKey = (lang: Lang) => `agz-mt-v1:${lang}`;

const ES = new Set("de la el que y en los las para con por una un es no se del su sus más si como lo al ya pero este esta hay sin ni porque cada todas todos también solo cuando muy".split(" "));
const EN = new Set("the and of to is in for with it that on its by this are from not if as be has have was all only when each also but no at or an".split(" "));

/** Which language a text is in, by its common words and its accents; null when it is too short to tell. */
export function guessLang(text: string): Lang | null {
  const words = text.toLowerCase().match(/[a-záéíóúñü]+/g) ?? [];
  if (words.length < 3) return null;
  let es = 0;
  let en = 0;
  for (const w of words) {
    if (ES.has(w)) es++;
    if (EN.has(w)) en++;
  }
  es += (text.match(/[áéíóúñ¿¡]/gi) ?? []).length * 0.5;
  if (es >= 1.5 && es > en * 1.5) return "es";
  if (en >= 1.5 && en > es * 1.5) return "en";
  return null;
}

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(36)}.${s.length}`;
}
function readStore(lang: Lang): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(storeKey(lang)) ?? "{}") as Record<string, string>; } catch { return {}; }
}
function writeStore(lang: Lang, all: Record<string, string>) {
  const keys = Object.keys(all);
  const kept = keys.length > STORE_MAX ? Object.fromEntries(keys.slice(-STORE_MAX).map((k) => [k, all[k] ?? ""])) : all;
  try { localStorage.setItem(storeKey(lang), JSON.stringify(kept)); } catch { /* private mode or full: it stays in memory */ }
}

const same: MtFn = (s) => s;
const MtContext = createContext<Mt>({ mt: same, pending: 0, off: null });
export const useMt = () => useContext(MtContext);

export function TranslateProvider({ client, lang, children }: { client: Api; lang: Lang; children: React.ReactNode }) {
  const cache = useRef<Record<Lang, Record<string, string> | null>>({ en: null, es: null });
  const queue = useRef(new Map<string, { lang: Lang; text: string }>());
  const asked = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState(0);
  const [off, setOff] = useState<string | null>(null);
  const offRef = useRef<string | null>(null);
  const langRef = useRef(lang);
  langRef.current = lang;

  const store = (l: Lang) => (cache.current[l] ??= readStore(l));

  const flush = useCallback(async () => {
    timer.current = null;
    if (busy.current || offRef.current) return;
    const l = langRef.current;
    const batch: string[] = [];
    let chars = 0;
    for (const [k, v] of queue.current) {
      if (v.lang !== l) { queue.current.delete(k); continue; }
      if (batch.length >= BATCH.texts || chars + v.text.length > BATCH.chars) break;
      batch.push(v.text);
      chars += v.text.length;
      queue.current.delete(k);
    }
    if (!batch.length) return;
    busy.current = true;
    setPending(batch.length + queue.current.size);
    try {
      const r = await client.agentOp<{ texts: string[] }>({ op: "translate", to: l, texts: batch });
      const all = store(l);
      batch.forEach((t, i) => { const out = r.texts[i]; if (out) all[hash(t)] = out; });
      writeStore(l, all);
      setVersion((v) => v + 1);
    } catch (err) {
      // without a key or budget there is no point asking again in this visit; the originals stay on screen
      if (err instanceof ApiError && ["no-key", "no-model", "budget"].includes(err.reason ?? "")) {
        offRef.current = err.message;
        setOff(err.message);
      }
    } finally {
      busy.current = false;
      setPending(queue.current.size);
      if (queue.current.size && !offRef.current) timer.current = setTimeout(() => void flush(), 50);
    }
  }, [client]);

  const mt = useCallback<MtFn>(<S extends string | null | undefined>(text: S): S => {
    if (!text) return text;
    const from = guessLang(text);
    if (!from || from === lang) return text;
    const hit = store(lang)[hash(text)];
    if (hit) return hit as S;
    const id = `${lang}:${hash(text)}`;
    if (!offRef.current && text.length <= BATCH.one && !asked.current.has(id)) {
      asked.current.add(id);
      queue.current.set(id, { lang, text });
      if (!timer.current) timer.current = setTimeout(() => void flush(), 120);
    }
    return text;
    // `version` is a dependency on purpose: a new translation arrived, so the same text now reads differently
  }, [lang, version, flush]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const value = useMemo(() => ({ mt, pending, off }), [mt, pending, off]);
  return <MtContext.Provider value={value}>{children}</MtContext.Provider>;
}

/** A trace step with the model's words translated (the director's note is its reasoning). */
export const mtEntry = (e: TraceEntry, mt: MtFn): TraceEntry =>
  e.tool === "director" && e.note && e.note !== "handed-over" ? { ...e, note: mt(e.note) } : e;

/** A cycle with everything the models wrote in it translated. */
export function mtJob(job: Job, mt: MtFn): Job {
  if (mt === same) return job;
  const s = job.state;
  return {
    ...job,
    state: {
      ...s,
      plan: s.plan && {
        ...s.plan,
        why: mt(s.plan.why),
        steps: s.plan.steps.map((x) => ({ ...x, why: mt(x.why) })),
        proposals: s.plan.proposals.map((p) => ({ ...p, idea: mt(p.idea), why: mt(p.why) })),
      },
      candidate: s.candidate && {
        ...s.candidate,
        rationale: mt(s.candidate.rationale),
        instructions: mt(s.candidate.instructions),
        parentInstructions: mt(s.candidate.parentInstructions),
      },
      dream: s.dream && { ...s.dream, summary: mt(s.dream.summary) },
      trace: s.trace?.map((e) => mtEntry(e, mt)),
    },
  };
}

/** A line that says the model's words are being translated, or why they couldn't be. */
export function MtStatus({ lang }: { lang: Lang }) {
  const { pending, off } = useMt();
  if (off) return <p className="fine mt-status">{lang === "es" ? "No pude traducir lo que escribió el modelo; lo ves en su idioma original." : "Couldn't translate what the model wrote; you see it in its original language."} ({off})</p>;
  if (!pending) return null;
  return <p className="fine mt-status" role="status"><span className="spin" aria-hidden="true" /> {lang === "es" ? "Traduciendo lo que escribió el modelo…" : "Translating what the model wrote…"}</p>;
}
