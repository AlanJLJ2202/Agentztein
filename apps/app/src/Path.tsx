// "Your path": a bar under the header, on every tab, that never assumes anything. It says which step you're on, what
// it is in plain words, why it matters, and gives one button to do it. All the steps are one tap away, each marked
// done, now or later. When the basics are done it says so and steps aside (it can be brought back from the header).
import { useContext, useEffect, useState } from "react";
import type { SavedKey } from "./api.js";
import type { Tab } from "./App.js";
import { savedCap } from "./Companion.js";
import { LangContext, useT, type Text } from "./i18n.js";
import { useLive } from "./live.js";
import { E, isRunning } from "./story.js";

const HIDE_KEY = "agz-path-hidden";
export const PATH_FLAGS = { budget: "agz-path-budget", talked: "agz-path-talked", graph: "agz-path-graph" } as const;
const flag = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
/** Marks a step done from anywhere in the app (saving the budget, talking to it, opening a cycle's network). */
export function markPath(k: keyof typeof PATH_FLAGS) {
  try { localStorage.setItem(PATH_FLAGS[k], "1"); } catch { /* private mode */ }
  dispatchEvent(new Event("agz-path"));
}

type Step = { alt?: { label: Text; act: () => void }; id: string; title: Text; what: Text; why: Text; cta: Text; done: boolean; optional?: boolean; act: () => void | Promise<void>; tab: Tab };

export function Path({ tab, go, keys }: { tab: Tab; go: (t: Tab, anchor?: string) => void; keys: SavedKey[] | null }) {
  const t = useT();
  const lang = useContext(LangContext);
  const live = useLive();
  const [, bump] = useState(0);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => flag(HIDE_KEY));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const on = () => { bump((n) => n + 1); setHidden(flag(HIDE_KEY)); };
    addEventListener("agz-path", on);
    addEventListener("storage", on);
    return () => { removeEventListener("agz-path", on); removeEventListener("storage", on); };
  }, []);

  const a = live.agent;
  if (!a) return null;
  const jobs = a.jobs;
  const hasKey = Boolean(a.key) || Boolean(keys?.some((k) => k.provider === "meta"));
  const ran = jobs.length > 0;
  const finished = jobs.some((j) => !isRunning(j) && j.phase !== "awaiting");
  const waiting = jobs[0]?.phase === "awaiting";
  const decided = jobs.some((j) => j.state.outcome === "approved" || j.state.outcome === "rejected") || (finished && !waiting);
  const running = jobs[0] ? isRunning(jobs[0]) : false;

  const steps: Step[] = [
    {
      id: "key", tab: "brain", done: hasKey,
      title: E("Connect its brain", "Conecta su cerebro"),
      what: E("Agentztein thinks with Meta's models. Paste your Meta Model API key (you create it at dev.meta.ai). It's saved encrypted and only you use it.", "Agentztein piensa con los modelos de Meta. Pega tu llave de la Meta Model API (la creas en dev.meta.ai). Se guarda cifrada y solo tú la usas."),
      why: E("Without a key it can't think, talk or practice.", "Sin llave no puede pensar, platicar ni practicar."),
      cta: E("Go to Settings and paste the key", "Ir a Ajustes y pegar la llave"),
      act: () => go("brain"),
    },
    {
      id: "budget", tab: "brain", done: hasKey && (flag(PATH_FLAGS.budget) || ran),
      title: E("Set how much it can spend", "Pon cuánto puede gastar"),
      what: E(`Choose a monthly limit in Settings (it starts at $${a.budget.monthly.toFixed(2)}). Every call to the model counts against it.`, `Elige un límite al mes en Ajustes (empieza en $${a.budget.monthly.toFixed(2)}). Cada llamada al modelo cuenta contra él.`),
      why: E("It never goes over: if a step could, it stops and tells you.", "Nunca se pasa: si un paso pudiera rebasarlo, se detiene y te avisa."),
      cta: E("Looks good like this", "Así está bien"),
      act: () => markPath("budget"),
      alt: { label: E("Change it in Settings", "Cambiarlo en Ajustes"), act: () => go("brain") },
    },
    {
      id: "run", tab: "agent", done: ran,
      title: E("Start its first cycle", "Inicia su primera corrida"),
      what: E(`One button: it picks an exam and a model by itself, takes the exam, studies its mistakes and writes itself a skill. Cap for this cycle: $${savedCap().toFixed(2)}.`, `Un botón: él elige un examen y un modelo, presenta el examen, estudia sus errores y se escribe una habilidad. Tope de esta corrida: $${savedCap().toFixed(2)}.`),
      why: E("That's how it improves. It takes a few minutes; you can keep browsing.", "Así es como mejora. Tarda unos minutos; puedes seguir navegando."),
      cta: E("Start the cycle now", "Iniciar la corrida ahora"),
      act: async () => {
        setBusy(true);
        try { await live.start({ auto: true, maxCost: savedCap(), lang }); go("agent", "corrida"); } catch { go("agent"); } finally { setBusy(false); }
      },
    },
    {
      id: "watch", tab: "agent", done: finished || flag(PATH_FLAGS.graph),
      title: E("Watch it work", "Míralo trabajar"),
      what: E("Each cycle draws itself as a network: every call to the model, every tool and what each gave back, with the cost against the cap. It grows live.", "Cada corrida se dibuja como una red: cada llamada al modelo, cada herramienta y lo que devolvió, con el costo contra el tope. Crece en vivo."),
      why: E("So you see exactly what it did and what it spent, step by step.", "Para que veas exactamente qué hizo y cuánto gastó, paso a paso."),
      cta: E("Open the cycle's network", "Abrir la red de la corrida"),
      act: () => { markPath("graph"); go("agent", "corrida"); },
    },
    {
      id: "decide", tab: "agent", done: decided,
      title: E("Decide", "Decide"),
      what: waiting
        ? E("It wrote a skill and the harness passed it. Read it and approve it or reject it.", "Escribió una habilidad y el arnés la aprobó. Léela y apruébala o recházala.")
        : E("When the harness passes a skill, you decide whether it stays. If the harness throws it out, there's nothing to decide: run another cycle.", "Cuando el arnés aprueba una habilidad, tú decides si se queda. Si el arnés la descarta, no hay nada que decidir: corre otra."),
      why: E("Nothing changes in the agent without you.", "Nada cambia en el agente sin ti."),
      cta: waiting ? E("Review and decide", "Revisar y decidir") : E("See the result", "Ver el resultado"),
      act: () => go("agent"),
    },
    {
      id: "talk", tab: tab, done: flag(PATH_FLAGS.talked), optional: true,
      title: E("Talk to it", "Platícale"),
      what: E("Tap the robot in the corner and ask anything, typing or out loud. It answers short, and can read its answers aloud with your browser's voice.", "Toca al robot de la esquina y pregúntale lo que sea, escribiendo o en voz alta. Contesta corto y puede leer sus respuestas con la voz de tu navegador."),
      why: E("The easiest way to understand what it's doing.", "La forma más fácil de entender qué está haciendo."),
      cta: E("Open the chat", "Abrir la plática"),
      act: () => { dispatchEvent(new Event("agz-open-companion")); },
    },
  ];

  const essentials = steps.filter((s) => !s.optional);
  const doneCount = steps.filter((s) => s.done).length;
  const allBasics = essentials.every((s) => s.done);
  const current = steps.find((s) => !s.done) ?? null;
  // while a cycle runs, the honest next step is to watch it
  const now = running && !flag(PATH_FLAGS.graph) ? steps.find((s) => s.id === "watch") ?? current : current;

  if (hidden && !open) return null;

  return (
    <div className={`path${allBasics ? " done" : ""}`} role="region" aria-label={t(E("Your path", "Tu camino"))}>
      <div className="wrap">
        <div className="path-bar">
          <ol className="path-dots" aria-hidden="true">
            {steps.map((s) => <li key={s.id} className={s.done ? "ok" : s === now ? "now" : ""} />)}
          </ol>
          {now && !allBasics ? (
            <div className="path-now">
              <p className="path-k">{t(E(`Step ${steps.indexOf(now) + 1} of ${steps.length}`, `Paso ${steps.indexOf(now) + 1} de ${steps.length}`))}{running ? ` · ${t(E("a cycle is running", "hay una corrida en curso"))}` : ""}</p>
              <p><b>{t(now.title)}.</b> {t(now.what)}</p>
            </div>
          ) : (
            <div className="path-now">
              <p className="path-k">{t(E(`${doneCount} of ${steps.length} done`, `${doneCount} de ${steps.length} listos`))}</p>
              <p><b>{t(E("You know the basics.", "Ya sabes lo básico."))}</b> {t(E("Next ideas: run the radar for AI news, walk into the 3D lab, or let it change its own code.", "Siguientes ideas: corre el radar de noticias de IA, entra al laboratorio 3D o deja que cambie su propio código."))}</p>
            </div>
          )}
          <div className="path-act">
            {now && !allBasics && (
              <button type="button" className="btn small" onClick={() => void now.act()} disabled={busy || (now.id === "run" && !hasKey)}>
                {busy && <span className="spin light" aria-hidden="true" />}{t(now.cta)} →
              </button>
            )}
            {now && !allBasics && now.alt && <button type="button" className="link small" onClick={now.alt.act}>{t(now.alt.label)}</button>}
            <button type="button" className="link small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? t(E("Hide steps", "Ocultar pasos")) : t(E("All the steps", "Todos los pasos"))}
            </button>
            {allBasics && (
              <button type="button" className="link small" onClick={() => { try { localStorage.setItem(HIDE_KEY, "1"); } catch { /* */ } setHidden(true); setOpen(false); }}>
                {t(E("Hide the guide", "Ocultar la guía"))}
              </button>
            )}
          </div>
        </div>
        {open && (
          <ol className="path-list">
            {steps.map((s, i) => (
              <li key={s.id} className={s.done ? "ok" : s === now ? "now" : ""}>
                <span className="num" aria-hidden="true">{s.done ? "✓" : i + 1}</span>
                <div>
                  <b>{t(s.title)}{s.optional ? <em> · {t(E("optional", "opcional"))}</em> : null}</b>
                  <p>{t(s.what)}</p>
                  <p className="why">{t(E("Why: ", "Para qué: "))}{t(s.why)}</p>
                </div>
                {!s.done && <button type="button" className={`btn small${s === now ? "" : " ghost"}`} onClick={() => void s.act()} disabled={busy}>{t(s.cta)}</button>}
                {s.done && <span className="st">{t(E("done", "listo"))}</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/** Brings the guide back (from the header). */
export function showPath() {
  try { localStorage.removeItem(HIDE_KEY); } catch { /* private mode */ }
  dispatchEvent(new Event("agz-path"));
}
