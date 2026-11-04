// Agentztein goes with you through the whole app: it lives in the corner, says in plain words what each screen is
// for (once per visit), tells what it is doing while a cycle runs, and you can open it to talk, by text or out loud.
// Out loud is a hands-free loop: it listens until you stop talking, Muse Voice Transcribe (or the browser's own
// recognition, if you prefer) turns that into text, it answers with your Meta model (/api/talk) and reads the answer
// aloud with the voice you chose in Settings (the browser's, or ElevenLabs with your key); then it listens again.
// Typed messages can be read aloud too, and every answer has a play button.
// It may suggest one action (start a cycle where it decides everything, or open a screen): only a button you press
// does it.
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type Api } from "./api.js";
import type { Tab } from "./App.js";
import { type Lang, type Text, useT } from "./i18n.js";
import { mtEntry, mtJob, useMt } from "./translate.js";
import { useLive } from "./live.js";
import { E, isRunning, nextUp, say } from "./story.js";
import { markPath } from "./Path.js";
import { browserCanListen, hush, listenBrowser, playAudio, speakBrowser, useVoicePrefs } from "./voice.js";

const INTRO: Partial<Record<Tab, Text>> = {
  overview: E("This is your board. At a glance: what I know, what I'm doing and how much I've improved. Tap me if you want to talk.", "Este es tu tablero. De un vistazo: qué sé, qué estoy haciendo y cuánto he mejorado. Tócame si quieres platicar."),
  mind: E("This is my brain from the inside: every dot is something I learned, and every line how it connects. When I work, the tools I pick up light up.", "Este es mi cerebro por dentro: cada punto es algo que aprendí y cada línea, cómo se conecta. Cuando trabajo, se encienden las herramientas que uso."),
  lab: E("Come into my lab! When I'm working I walk to the room where each step happens, and you can follow me.", "¡Pásale a mi laboratorio! Cuando trabajo camino al cuarto donde pasa cada paso, y me puedes seguir."),
  agent: E("Here you put me to practice. If you're not sure what to pick, let me decide: just give me a spending cap.", "Aquí me pones a practicar. Si no sabes qué elegir, deja que yo decida: solo ponme un tope de gasto."),
  evolve: E("Here I change my own code, not just my notes. A judge always checks me first.", "Aquí cambio mi propio código, no solo mis notas. Siempre me revisa un juez primero."),
  radar: E("Here I read AI news and decide which ideas are worth trying.", "Aquí leo noticias de IA y decido qué ideas vale la pena probar."),
  brain: E("Here you connect my brain (your Meta key) and choose how much I can spend each month.", "Aquí conectas mi cerebro (tu llave de Meta) y eliges cuánto puedo gastar al mes."),
};
const TAB_NAME: Record<string, Text> = {
  overview: E("Home", "Inicio"), mind: E("Brain", "Cerebro"), lab: E("3D lab", "Laboratorio 3D"), agent: E("Agent", "Agente"),
  evolve: E("Its code", "Su código"), radar: E("Radar", "Radar"), brain: E("Settings", "Ajustes"),
};
const CHIPS: Text[] = [
  E("What are you doing?", "¿Qué estás haciendo?"),
  E("Explain this screen to me", "Explícame esta pantalla"),
  E("Improve yourself", "Mejórate tú solo"),
];
export const CAP_KEY = "agz-run-cap";
export function savedCap() {
  try { const v = Number(localStorage.getItem(CAP_KEY)); return Number.isFinite(v) && v > 0 ? v : 0.5; } catch { return 0.5; }
}

type Msg = { role: "user" | "assistant"; content: string; action?: string | null; cost?: number };
type VoiceState = "off" | "listening" | "hearing" | "thinking" | "speaking";

/** Listens until the person stops talking (about 1.2 s of silence) and returns the recording, or null if nobody spoke. */
async function hear(onLevel: (n: number) => void, onSpeech: () => void, cancel: { stop?: () => void }): Promise<{ blob: Blob; seconds: number } | null> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize);
  const mr = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  mr.ondataavailable = (e) => chunks.push(e.data);
  const t0 = Date.now();
  let spoke = false, lastVoice = 0, timer = 0;
  return new Promise((resolve) => {
    const finish = () => {
      clearInterval(timer);
      if (mr.state !== "inactive") mr.stop();
    };
    cancel.stop = () => { spoke = false; finish(); };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
      onLevel(0);
      resolve(spoke ? { blob: new Blob(chunks, { type: mr.mimeType || "audio/webm" }), seconds: (Date.now() - t0) / 1000 } : null);
    };
    mr.start(250);
    timer = window.setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      onLevel(Math.min(1, rms * 12));
      const now = Date.now();
      if (rms > 0.025) { if (!spoke) onSpeech(); spoke = true; lastVoice = now; }
      if (spoke && now - lastVoice > 1200) finish();
      if (!spoke && now - t0 > 15_000) finish(); // nobody spoke: listen again from a fresh start
      if (now - t0 > 60_000) finish();
    }, 100);
  });
}

export function Companion({ tab, go, client, lang }: { tab: Tab; go: (t: Tab) => void; client: Api; lang: Lang }) {
  const t = useT();
  const live = useLive();
  const { mt } = useMt();
  const [bubble, setBubble] = useState<{ text: string; mood: "ok" | "alert" | "think"; key: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem("agz-companion") === "off"; } catch { return false; } });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [voice, setVoice] = useState<VoiceState>("off");
  const [level, setLevel] = useState(0);
  const [earHint, setEarHint] = useState(false);
  const voiceOn = useRef(false);
  const cancel = useRef<{ stop?: () => void }>({});
  const listRef = useRef<HTMLDivElement>(null);
  const keyOk = Boolean(live.agent?.key);
  const [prefs, setPrefs] = useVoicePrefs();
  const [note, setNote] = useState("");

  /** Says a text with the chosen voice; if ElevenLabs fails it falls back to the browser and says why. */
  const speak = useCallback(async (text: string) => {
    if (prefs.out === "off") return;
    if (prefs.out === "eleven") {
      try {
        await playAudio(await client.speak(text));
        return;
      } catch (err) {
        setNote(t(E(`ElevenLabs didn't answer (${(err as Error).message}); I used the browser's voice.`, `ElevenLabs no respondió (${(err as Error).message}); usé la voz del navegador.`)));
      }
    }
    await speakBrowser(text, lang, prefs);
  }, [prefs, client, lang, t]);

  const show = useCallback((text: string, mood: "ok" | "alert" | "think" = "ok") => setBubble({ text, mood, key: Date.now() }), []);
  useEffect(() => {
    if (!bubble || open) return;
    const id = setTimeout(() => setBubble(null), Math.min(14_000, 4000 + bubble.text.length * 55));
    return () => clearTimeout(id);
  }, [bubble, open]);

  // what this screen is for, once per visit
  useEffect(() => {
    const intro = INTRO[tab];
    if (!intro) return;
    const k = `agz-intro-${tab}`;
    try { if (sessionStorage.getItem(k)) return; } catch { /* private mode */ }
    const id = setTimeout(() => {
      try { sessionStorage.setItem(k, "1"); } catch { /* private mode */ }
      show(t(intro));
    }, 700);
    return () => clearTimeout(id);
  }, [tab, t, show]);

  // what it is doing, step by step
  useEffect(() => {
    const b = live.beat;
    if (b) show(t(b.entry ? say(mtEntry(b.entry, mt), mtJob(b.job, mt)) : b.text), b.bad ? "alert" : b.tool === "human" ? "alert" : "think");
    // mt is left out on purpose: a translation arriving later must not pop the same bubble again
  }, [live.beat, t, show]);

  // the guide's "Talk to it" step opens the chat
  useEffect(() => {
    const on = () => { setHidden(false); setOpen(true); setBubble(null); };
    addEventListener("agz-open-companion", on);
    return () => removeEventListener("agz-open-companion", on);
  }, []);

  useEffect(() => { listRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }); }, [msgs, busy]);

  const doAction = async (action: string) => {
    if (action === "auto-cycle") {
      try {
        await live.start({ auto: true, maxCost: savedCap(), lang });
        go("lab");
      } catch (err) { setError((err as Error).message); }
      return;
    }
    if (action === "dream") {
      try {
        const r = await client.agentOp<{ dream: { summary: string } | null }>({ op: "dream", lang });
        setMsgs((m) => [...m, { role: "assistant", content: r.dream?.summary || t(E("I dreamt, but nothing changed in what I remember.", "Soñé, pero no cambió nada de lo que recuerdo.")) }]);
      } catch (err) { setError((err as Error).message); }
      return;
    }
    if (action.startsWith("open:")) go(action.slice(5) as Tab);
  };

  /** The error in plain words, by its reason. */
  const explain = (err: unknown): string => {
    const reason = err instanceof ApiError ? err.reason : undefined;
    const msg = (err as Error).message;
    switch (reason) {
      case "budget": return t(E("Your monthly budget is used up. Raise it in Settings.", "Se acabó tu presupuesto del mes. Súbelo en Ajustes."));
      case "no-access": case "unavailable": return t(E("Your Meta key can't use Muse Voice Transcribe yet. Switch to the browser's ears below.", "Tu llave de Meta aún no puede usar Muse Voice Transcribe. Cambia al oído del navegador aquí abajo."));
      case "bad-audio": return t(E(`Meta didn't accept the recording (${msg}). Try again, or use the browser's ears.`, `Meta no aceptó la grabación (${msg}). Intenta otra vez o usa el oído del navegador.`));
      case "empty": return t(E("I didn't catch any words. Try again a bit closer to the mic.", "No alcancé a entender palabras. Intenta otra vez un poco más cerca del micrófono."));
      case "rate": return t(E("Meta asks to wait a minute. Try again shortly.", "Meta pide esperar un minuto. Intenta en un momento."));
      case "no-key": return t(E("Connect your Meta key in Settings first.", "Primero conecta tu llave de Meta en Ajustes."));
      default: return msg;
    }
  };

  const ask = async (text: string, spoken = false): Promise<string | null> => {
    const q = text.trim();
    if (!q || busy) return null;
    setError("");
    setNote("");
    markPath("talked");
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const r = await client.talk(next.map(({ role, content }) => ({ role, content })), lang, tab);
      setMsgs([...next, { role: "assistant", content: r.say, action: r.action, cost: r.cost }]);
      if (!open && !spoken) show(r.say);
      if (!spoken && prefs.readTyped) void speak(r.say);
      return r.say;
    } catch (err) {
      setError(explain(err));
      return null;
    } finally {
      setBusy(false);
    }
  };

  // the hands-free loop: listen → transcribe → answer → speak → listen again
  const loop = async () => {
    setError("");
    while (voiceOn.current) {
      setVoice("listening");
      let text: string | null = null;
      if (prefs.ear === "browser" && browserCanListen()) {
        try {
          text = await listenBrowser(lang, cancel.current, () => setVoice("hearing"));
        } catch (err) {
          setError((err as Error).message === "not-allowed"
            ? t(E("I can't hear you: allow the microphone for this site.", "No te escucho: permite el micrófono para este sitio."))
            : t(E(`The browser couldn't listen (${(err as Error).message}).`, `El navegador no pudo escuchar (${(err as Error).message}).`)));
          break;
        }
        if (!voiceOn.current) break;
        if (!text) continue;
      } else {
        let rec: { blob: Blob; seconds: number } | null = null;
        try {
          rec = await hear(setLevel, () => setVoice("hearing"), cancel.current);
        } catch {
          setError(t(E("I can't hear you: allow the microphone for this site.", "No te escucho: permite el micrófono para este sitio.")));
          break;
        }
        if (!voiceOn.current) break;
        if (!rec) continue;
        setVoice("thinking");
        try {
          text = (await client.transcribe(rec.blob, rec.seconds, lang)).text;
        } catch (err) {
          setError(explain(err));
          setEarHint(browserCanListen());
          break;
        }
      }
      setVoice("thinking");
      const reply = await ask(text, true);
      if (!reply || !voiceOn.current) break;
      setVoice("speaking");
      await speak(reply);
    }
    voiceOn.current = false;
    setVoice("off");
    setLevel(0);
  };
  const toggleVoice = () => {
    if (voiceOn.current) {
      voiceOn.current = false;
      cancel.current.stop?.();
      hush();
      setVoice("off");
      return;
    }
    setEarHint(false);
    voiceOn.current = true;
    void loop();
  };
  useEffect(() => () => { voiceOn.current = false; cancel.current.stop?.(); }, []);

  const job = live.job;
  const working = isRunning(job) && live.driving;
  const waiting = job?.phase === "awaiting";
  const mood = waiting || bubble?.mood === "alert" ? "alert" : working || voice === "thinking" ? "think" : "ok";
  const now = job ? nextUp(job) : null;

  if (hidden)
    return (
      <button type="button" className="comp-pill" onClick={() => { setHidden(false); try { localStorage.removeItem("agz-companion"); } catch { /* */ } }}>
        <img src="/img/agent-ok.webp" alt="" width={20} height={30} /> Agentztein
      </button>
    );

  const voiceLabel: Record<VoiceState, Text> = {
    off: E("Talk out loud", "Hablar en voz alta"),
    listening: E("I'm listening…", "Te escucho…"),
    hearing: E("Go on…", "Sigue…"),
    thinking: E("Thinking…", "Pensando…"),
    speaking: E("Speaking… (tap to stop)", "Hablando… (toca para parar)"),
  };

  return (
    <div className={`comp${open ? " open" : ""}`}>
      {open && (
        <section className="comp-panel" aria-label={t(E("Talk with Agentztein", "Platica con Agentztein"))}>
          <header>
            <img src={mood === "alert" ? "/img/agent-alert.webp" : "/img/agent-ok.webp"} alt="" width={30} height={45} />
            <div>
              <img className="wm" src="/img/logo.webp" alt="Agentztein" width={78} height={16} />
              <small>{working && now ? t(now.text) : voice !== "off" ? t(voiceLabel[voice]) : t(E(`With you in ${t(TAB_NAME[tab] ?? E("the app", "la app"))}`, `Contigo en ${t(TAB_NAME[tab] ?? E("the app", "la app"))}`))}</small>
            </div>
            <button type="button" className="x" aria-label={t(E("Close", "Cerrar"))} onClick={() => setOpen(false)}>×</button>
          </header>
          <div className="comp-msgs" ref={listRef} aria-live="polite">
            {msgs.length === 0 && (
              <p className="comp-hello">
                {keyOk
                  ? t(E("Ask me anything about the lab, or tap “Talk out loud” and just speak. I answer in short, plain words.", "Pregúntame lo que quieras del laboratorio, o toca «Hablar en voz alta» y nada más habla. Contesto corto y sencillo."))
                  : t(E("To talk I need my brain: connect your Meta key first.", "Para platicar necesito mi cerebro: primero conecta tu llave de Meta."))}
              </p>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`cm ${m.role}`}>
                <p>{m.content}</p>
                {m.role === "assistant" && prefs.out !== "off" && (
                  <button type="button" className="cm-play" onClick={() => void speak(m.content)} aria-label={t(E("Listen to this answer", "Escuchar esta respuesta"))} >▶ {t(E("Listen", "Escuchar"))}</button>
                )}
                {m.action && m.role === "assistant" && (
                  <button type="button" className="btn small" onClick={() => void doAction(m.action ?? "")}>
                    {m.action === "auto-cycle"
                      ? t(E(`Yes, improve yourself (cap $${savedCap().toFixed(2)})`, `Sí, mejórate tú solo (tope $${savedCap().toFixed(2)})`))
                      : m.action === "dream"
                      ? t(E("Yes, dream on it", "Sí, duerme y ordénalo"))
                      : t(E(`Open ${t(TAB_NAME[m.action.slice(5)] ?? E("it", "eso"))}`, `Abrir ${t(TAB_NAME[m.action.slice(5)] ?? E("it", "eso"))}`))}
                  </button>
                )}
              </div>
            ))}
            {busy && <div className="cm assistant"><p className="dots" aria-label="…"><i /><i /><i /></p></div>}
          </div>
          {error && (
            <div className="error small comp-err" role="alert">
              <p>{error}</p>
              {earHint && prefs.ear === "meta" && (
                <button type="button" className="btn small ghost" onClick={() => { setPrefs({ ear: "browser" }); setError(""); setEarHint(false); }}>
                  {t(E("Use the browser's ears (free)", "Usar el oído del navegador (gratis)"))}
                </button>
              )}
            </div>
          )}
          {note && <p className="fine">{note}</p>}
          {keyOk ? (
            <>
              <div className="comp-chips">
                {CHIPS.map((c, i) => <button key={i} type="button" className="chip" onClick={() => void ask(t(c))} disabled={busy}>{t(c)}</button>)}
              </div>
              <form className="comp-in" onSubmit={(e) => { e.preventDefault(); void ask(input); }}>
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t(E("Write to it…", "Escríbele…"))} maxLength={1000} aria-label={t(E("Message", "Mensaje"))} />
                <button type="submit" className="btn small" disabled={busy || !input.trim()}>{t(E("Send", "Enviar"))}</button>
              </form>
              <button type="button" className={`talk ${voice}`} onClick={toggleVoice} aria-pressed={voice !== "off"} style={{ ["--lvl" as string]: String(level) }}>
                <span className="mic" aria-hidden="true" />
                {t(voiceLabel[voice])}
              </button>
              <div className="comp-voice">
                <label className="tog">
                  <input type="checkbox" checked={prefs.readTyped} onChange={(e) => setPrefs({ readTyped: e.target.checked })} disabled={prefs.out === "off"} />
                  {t(E("Read typed answers aloud too", "Leer en voz alta también lo que escribo"))}
                </label>
                <button type="button" className="link small" onClick={() => go("brain")}>{t(E("Voice settings", "Ajustes de voz"))} →</button>
              </div>
              <p className="fine">
                {prefs.ear === "browser"
                  ? t(E("Your browser listens (free). ", "Tu navegador te escucha (gratis). "))
                  : t(E("Your voice goes to Muse Voice Transcribe (your Meta key). ", "Tu voz va a Muse Voice Transcribe (tu llave de Meta). "))}
                {t(E("The answer comes from your Meta model and ", "La respuesta sale de tu modelo de Meta y "))}
                {prefs.out === "eleven"
                  ? t(E("ElevenLabs reads it with your key.", "ElevenLabs la lee con tu llave."))
                  : prefs.out === "off"
                    ? t(E("stays silent.", "no se lee en voz alta."))
                    : t(E("your browser reads it aloud.", "tu navegador la lee en voz alta."))}
              </p>
            </>
          ) : (
            <button type="button" className="btn small" onClick={() => go("brain")}>{t(E("Connect my brain", "Conectar mi cerebro"))}</button>
          )}
        </section>
      )}
      {!open && bubble && (
        <p key={bubble.key} className={`comp-bubble ${bubble.mood}`} role="status">
          {bubble.text}
          <button type="button" aria-label={t(E("Dismiss", "Cerrar"))} onClick={() => setBubble(null)}>×</button>
        </p>
      )}
      <div className="comp-me">
        {!open && <button type="button" className="comp-hide" aria-label={t(E("Hide Agentztein", "Ocultar a Agentztein"))} onClick={() => { setHidden(true); try { localStorage.setItem("agz-companion", "off"); } catch { /* */ } }}>–</button>}
        <button type="button" className={`comp-avatar ${mood}${voice !== "off" ? " voice" : ""}`} onClick={() => { setOpen((o) => !o); setBubble(null); }}
          aria-expanded={open} aria-label={t(E("Talk with Agentztein", "Platica con Agentztein"))} style={{ ["--lvl" as string]: String(level) }}>
          <img src={mood === "alert" ? "/img/agent-alert.webp" : "/img/agent-ok.webp"} alt="" width={64} height={96} />
          {working && <span className="gear" aria-hidden="true">⚙</span>}
        </button>
      </div>
    </div>
  );
}
