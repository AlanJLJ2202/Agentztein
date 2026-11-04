// The first screen after signing in: a live dashboard of the user's own Agentztein. The creature stands in the middle
// of it, with their real skills orbiting it and a face that says what the lab is doing; around it, the numbers that
// matter (skills, cycles, best gain, budget, radar), where its latest self-improvement cycle is, how each cycle
// scored, the latest changes and the map of what it already knows. Everything comes from /api/agent and /api/radar;
// the only illustrated parts say so.
import { useContext, useEffect, useMemo, useState } from "react";
import type { AgentState, Api, BenchScenario, HealthCheck, Job, Note, SavedKey, Scores, Skill } from "./api.js";
import { savedCap } from "./Companion.js";
import { useLive } from "./live.js";
import { EXAM_STYLE, examColor } from "./story.js";
import { SetupAlerts } from "./SetupAlerts.js";
import type { Tab } from "./App.js";
import { AgentStage, type StageChip, type StageMood, type StageScreen } from "./AgentStage.js";
import { LangContext, T, useT, type Lang, type Text } from "./i18n.js";
import { Check } from "./Logos.js";

const E = (en: string, es: string): Text => ({ en, es });

type Props = {
  name: string;
  keys: SavedKey[] | null;
  notesCount: number;
  go: (t: Tab) => void;
  client: Api;
  onKeys: (k: SavedKey[]) => void;
  onNotes: (n: number) => void;
};

/* ---------- small helpers ---------- */
// one color per exam (validated for color-blind separation); identity is always labeled too
const SC = EXAM_STYLE;
const scColor = examColor;
const sum = (s?: Scores) =>
  s ? Object.values(s).reduce((a, b) => ({ c: a.c + b.correct, t: a.t + b.total }), { c: 0, t: 0 }) : null;
const pct = (s?: Scores) => {
  const x = sum(s);
  return x && x.t ? (x.c / x.t) * 100 : null;
};
const frac = (s?: Scores) => {
  const x = sum(s);
  return x ? `${x.c}/${x.t}` : "—";
};
const RUNNING = new Set(["plan", "baseline", "propose", "validate"]);
const isRunning = (j: Job) => RUNNING.has(j.phase) && !j.state.error;

function ago(iso: string | null, lang: Lang) {
  if (!iso) return "";
  const s = (Date.parse(iso) - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const a = Math.abs(s);
  if (a < 60) return rtf.format(Math.round(s), "second");
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), "day");
  return new Date(iso).toLocaleDateString(lang, { day: "numeric", month: "short" });
}
const money = (n: number, lang: Lang) =>
  new Intl.NumberFormat(lang === "es" ? "es-MX" : "en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 10 ? 2 : 0 }).format(n);

type Lab = {
  hasKey: boolean;
  /** the exams it practices on now (one per benchmark) */
  bench: BenchScenario[];
  /** every exam, including the retired business cases, to name old skills and cycles */
  all: BenchScenario[];
  skills: Skill[];
  active: Skill[];
  candidates: Skill[];
  jobs: Job[];
  latest: Job | null;
  notes: Note[];
  agent: AgentState | null;
};

const scTitle = (lab: Lab, id: string) => lab.all.find((b) => b.id === id)?.title ?? id;
const ctxName = (lab: Lab, sc: string, ctx: string) => lab.all.find((b) => b.id === sc)?.contexts.find((c) => c.id === ctx)?.name ?? ctx;

/* ---------- what the creature says and does ---------- */
type Status = { mood: StageMood; screen: StageScreen; say: Text; cta: Text; to: Tab };

function statusOf(lab: Lab): Status {
  const j = lab.latest;
  if (!lab.hasKey)
    return {
      mood: "sleep", screen: "off", to: "brain",
      say: E("I'm asleep: I don't have a brain yet. Connect your Meta key and I'll wake up.", "Estoy dormido: todavía no tengo cerebro. Conecta tu llave de Meta y despierto."),
      cta: E("Connect its brain", "Conectarle el cerebro"),
    };
  if (j && isRunning(j)) {
    const say =
      j.phase === "plan"
        ? E("You let me decide: I'm choosing what to practice and with which model…", "Me dejaste decidir: estoy eligiendo qué practicar y con qué modelo…")
        : j.phase === "baseline"
        ? E("I'm taking the exam to see where I stand…", "Estoy presentando el examen para ver dónde estoy…")
        : j.phase === "propose"
          ? E(`I'm studying my ${j.state.mistakes.length} mistakes and writing myself a skill…`, `Estoy estudiando mis ${j.state.mistakes.length} errores y escribiéndome una habilidad…`)
          : E("I'm testing the new skill: does my score go up without breaking anything?", "Estoy probando la habilidad nueva: ¿sube mi calificación sin romper nada?");
    return { mood: "think", screen: "test", say, to: "lab", cta: E("Watch it work", "Verlo trabajar") };
  }
  if (j?.phase === "awaiting") {
    const c = j.state.candidate;
    const b = pct(j.state.before?.validation), a = pct(j.state.after);
    return {
      mood: "alert", screen: "alert", to: "agent",
      say: c && b !== null && a !== null
        ? E(`I wrote v${c.version} for “${ctxName(lab, c.scenario, c.context)}”: ${b.toFixed(0)}% → ${a.toFixed(0)}%. Do you approve it?`, `Escribí la v${c.version} para «${ctxName(lab, c.scenario, c.context)}»: ${b.toFixed(0)}% → ${a.toFixed(0)}%. ¿La apruebas?`)
        : E("A new skill is waiting for your decision.", "Una habilidad nueva espera tu decisión."),
      cta: E("Review the skill", "Revisar la habilidad"),
    };
  }
  if (j?.state.error || j?.state.outcome === "planner-failed")
    return {
      mood: "alert", screen: "sync", to: "agent",
      say: E("My last cycle got stuck. Look at what happened and try again.", "Mi último ciclo se atoró. Revisa qué pasó e inténtalo de nuevo."),
      cta: E("See what happened", "Ver qué pasó"),
    };
  if (j?.state.outcome === "approved") {
    const c = j.state.candidate;
    return {
      mood: "happy", screen: "ok", to: "agent",
      say: c
        ? E(`v${c.version} for “${ctxName(lab, c.scenario, c.context)}” is active. I know a bit more than yesterday.`, `La v${c.version} para «${ctxName(lab, c.scenario, c.context)}» ya está activa. Sé un poco más que ayer.`)
        : E("My last skill is active.", "Mi última habilidad ya está activa."),
      cta: E("Run another cycle", "Correr otro ciclo"),
    };
  }
  if (j?.state.outcome === "harness-rejected")
    return {
      mood: "idle", screen: "sync", to: "agent",
      say: E("My last try didn't improve, so the harness threw it out. Better that than getting worse.", "Mi último intento no mejoró y el arnés lo descartó. Mejor eso que empeorar."),
      cta: E("Try another cycle", "Intentar otro ciclo"),
    };
  if (j?.state.outcome === "nothing-to-learn")
    return {
      mood: "happy", screen: "ok", to: "agent",
      say: E("On my last exam I made no mistakes I could study. Try a harder scenario.", "En mi último examen no tuve errores que estudiar. Prueba otro escenario."),
      cta: E("Choose another exam", "Elegir otro examen"),
    };
  if (j?.state.outcome === "run-budget")
    return {
      mood: "idle", screen: "sync", to: "agent",
      say: E("My last cycle reached its spending cap, so I stopped. Give me a bigger cap if you want me to go further.", "Mi último ciclo llegó a su tope de gasto y me detuve. Dame un tope más alto si quieres que llegue más lejos."),
      cta: E("Adjust and try again", "Ajustar e intentar otra vez"),
    };
  if (j?.state.outcome === "rejected")
    return {
      mood: "idle", screen: "pulse", to: "agent",
      say: E("You rejected my last skill, so nothing changed. That's how it should work.", "Rechazaste mi última habilidad y nada cambió. Así debe funcionar."),
      cta: E("Run another cycle", "Correr otro ciclo"),
    };
  if (lab.notes.length === 0 && lab.jobs.length > 0)
    return {
      mood: "idle", screen: "pulse", to: "radar",
      say: E("Want ideas for my next cycle? Run the radar and I'll read what's new in AI.", "¿Quieres ideas para mi siguiente corrida? Corre el radar y leo lo nuevo en IA."),
      cta: E("Run the radar", "Correr el radar"),
    };
  return {
    mood: "idle", screen: "pulse", to: "agent",
    say: E("Ready for my first cycle: I take an exam, study my mistakes and propose a skill.", "Listo para mi primer ciclo: presento un examen, estudio mis errores y te propongo una habilidad."),
    cta: E("Start my first cycle", "Iniciar mi primer ciclo"),
  };
}

// What it explains when you tap it: the ideas behind the lab, one at a time.
const TIPS: Text[] = [
  E("Each chip orbiting me is one of your skills, in its scenario's color. The blinking ones are candidates waiting for you.", "Cada ficha que gira a mi alrededor es una de tus habilidades, del color de su escenario. Las que parpadean son candidatas que te esperan."),
  E("A skill is a short text of instructions for one situation. It isn't code and it doesn't change the model.", "Una habilidad es un texto corto de instrucciones para una situación. No es código ni cambia al modelo."),
  E("I never see the validation exam while I write a skill. That's how we know an improvement is real.", "Nunca veo el examen de validación mientras escribo una habilidad. Así sabemos que una mejora es real."),
  E("The harness throws out any skill that breaks something that already worked, even if the total goes up.", "El arnés descarta cualquier habilidad que rompa algo que ya funcionaba, aunque el total suba."),
  E("Nothing switches on without you: the harness filters, and a person decides.", "Nada se activa sin ti: el arnés filtra y una persona decide."),
  E("My weights never change. What I learn are skills, labeled with where they apply and which rules they were tested under.", "Mis pesos nunca cambian. Lo que aprendo son habilidades, etiquetadas con dónde aplican y con qué reglas se probaron."),
  E("Every call to the model counts against your monthly budget. If a step could go over it, I stop and tell you.", "Cada llamada al modelo cuenta contra tu presupuesto mensual. Si un paso pudiera rebasarlo, me detengo y te aviso."),
];

/* ---------- the dashboard ---------- */
const VIEW_KEY = "agz-view";
type View = "simple" | "full";
const savedView = (): View => { try { return localStorage.getItem(VIEW_KEY) === "full" ? "full" : "simple"; } catch { return "simple"; } };

export function Overview({ name, keys, go, client, onKeys, onNotes }: Props) {
  const t = useT();
  const lang = useContext(LangContext);
  const live = useLive();
  const agent = live.agent;
  const agentFailed = live.failed;
  const notes = live.notes;
  const [tip, setTip] = useState(-1);
  const [view, setView] = useState<View>(savedView);
  const pickView = (v: View) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };
  // what's missing for the agent to change its own code: the server checks it for real
  const [health, setHealth] = useState<HealthCheck[]>([]);
  useEffect(() => {
    client.evolve().then((s) => setHealth(s.health?.checks ?? [])).catch(() => setHealth([]));
  }, [client]);
  useEffect(() => {
    client.keys().then((r) => onKeys(r.keys)).catch(() => onKeys([]));
  }, [client, onKeys]);
  useEffect(() => { if (notes) onNotes(notes.length); }, [notes, onNotes]);

  const lab: Lab = useMemo(() => {
    const skills = agent?.skills ?? [];
    const jobs = agent?.jobs ?? [];
    return {
      hasKey: Boolean(keys?.length) || Boolean(agent?.key),
      bench: (agent?.bench ?? []).filter((b) => !b.legacy),
      all: agent?.bench ?? [],
      skills,
      active: skills.filter((s) => s.status === "active"),
      candidates: skills.filter((s) => s.status === "candidate"),
      jobs,
      latest: jobs[0] ?? null,
      notes: notes ?? [],
      agent,
    };
  }, [agent, keys, notes]);

  // a tip stays a while, then the creature goes back to telling the lab's status
  useEffect(() => {
    if (tip < 0) return;
    const id = setTimeout(() => setTip(-1), 12000);
    return () => clearTimeout(id);
  }, [tip]);

  const loading = !agent && !agentFailed;
  const status = statusOf(lab);
  const chips: StageChip[] = [
    ...lab.active.map((s) => ({ color: parseInt(scColor(s.scenario).slice(1), 16) })),
    ...lab.candidates.map((s) => ({ color: parseInt(scColor(s.scenario).slice(1), 16), candidate: true })),
  ];
  const say = loading ? E("Waking up…", "Despertando…") : tip >= 0 ? (TIPS[tip % TIPS.length] as Text) : status.say;
  const running = Boolean(lab.latest && isRunning(lab.latest));
  const [starting, setStarting] = useState(false);
  const improve = async () => {
    setStarting(true);
    try { await live.start({ auto: true, maxCost: savedCap(), lang }); go("lab"); } catch { /* the companion says why */ } finally { setStarting(false); }
  };

  return (
    <section className="dash">
      <div className="dhero">
        <AgentStage
          mood={loading ? "idle" : status.mood}
          screen={loading ? "pulse" : status.screen}
          chips={chips}
          say={t(say)}
          sayKey={`${tip}-${status.mood}-${lang}-${t(status.say).length}`}
          label={t(E("Tap Agentztein to learn how it works", "Toca a Agentztein para aprender cómo funciona"))}
          onPoke={() => setTip((n) => n + 1)}
        />
        <div className="dhero-copy">
          <div className="seg viewseg" role="tablist" aria-label={t(E("View", "Vista"))}>
            <button type="button" role="tab" aria-selected={view === "simple"} onClick={() => pickView("simple")}>{t(E("Simple", "Sencilla"))}</button>
            <button type="button" role="tab" aria-selected={view === "full"} onClick={() => pickView("full")}>{t(E("All the detail", "Todo el detalle"))}</button>
          </div>
          <img className="hero-logo" src="/img/logo.webp" alt="Agentztein" width={145} height={30} />
          <h1 className="h1">{t(T.hello)}{name ? `, ${name}` : ""}.</h1>
          <p className="lead">
            {t(E(
              "This is your Agentztein, an AI that improves itself. It practices, learns from its mistakes and asks you before it changes.",
              "Este es tu Agentztein, una IA que se mejora sola. Practica, aprende de sus errores y te pregunta antes de cambiar.",
            ))}
          </p>
          <div className="row" style={{ flexWrap: "wrap", gap: 10, marginTop: 22 }}>
            {lab.hasKey && !running && status.to === "agent" && lab.latest?.phase !== "awaiting" ? (
              <button type="button" className="btn" onClick={() => void improve()} disabled={loading || starting}>
                ✦ {t(E("Improve yourself", "Mejórate tú solo"))}
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => go(status.to)} disabled={loading}>{t(status.cta)} →</button>
            )}
            <button type="button" className="btn ghost" onClick={() => setTip((n) => n + 1)}>{t(E("Teach me something", "Enséñame algo"))}</button>
          </div>
          {lab.hasKey && !running && (
            <p className="fine" style={{ marginTop: 14 }}>
              {t(E(`“Improve yourself” lets it choose everything, with a cap of $${savedCap().toFixed(2)} for the cycle. You approve the result.`, `«Mejórate tú solo» lo deja elegir todo, con un tope de $${savedCap().toFixed(2)} por ciclo. Tú apruebas el resultado.`))}
            </p>
          )}
          {agentFailed && <p className="error small" style={{ marginTop: 14 }}>{t(E("Couldn't load the agent's data. The rest of the app still works.", "No se pudieron cargar los datos del agente. El resto de la app sigue funcionando."))}</p>}
        </div>
      </div>

      <SetupAlerts checks={health} go={go} />
      {view === "simple" ? (
        <>
          <Story lab={lab} lang={lang} go={go} />
          <BigThree lab={lab} lang={lang} />
          <Doors go={go} />
        </>
      ) : (
        <>
          <Kpis lab={lab} lang={lang} loading={loading} />
          <CycleTrack lab={lab} lang={lang} go={go} />
          <div className="dgrid">
            <ScoreChart lab={lab} lang={lang} go={go} />
            <Feed lab={lab} lang={lang} go={go} />
          </div>
          <SkillMap lab={lab} go={go} />
        </>
      )}
    </section>
  );
}

/* ---------- simple view: it tells you, in its own words ---------- */
function Story({ lab, lang, go }: { lab: Lab; lang: Lang; go: (t: Tab) => void }) {
  const t = useT();
  const ev = events(lab).slice(0, 4);
  const first = lab.jobs.length === 0;
  return (
    <section className="dcard story" aria-labelledby="story-h">
      <h2 id="story-h" className="h3">{t(E("What I've been up to", "Lo que he estado haciendo"))}</h2>
      <ol>
        {first && (
          <li className="me">
            <img src="/img/agent-ok.webp" alt="" width={36} height={54} />
            <p>{t(E("Nothing yet! When I practice, I'll tell you here what I tried and what I learned, in plain words.", "¡Nada todavía! Cuando practique, aquí te cuento qué intenté y qué aprendí, con palabras sencillas."))}</p>
          </li>
        )}
        {ev.map((e, i) => (
          <li key={i} className="me">
            {i === 0 ? <img src="/img/agent-ok.webp" alt="" width={36} height={54} /> : <span className="ico" style={{ ["--c" as string]: e.color }} aria-hidden="true">{e.icon}</span>}
            <p>
              {t(e.text)}.
              <small>{ago(e.at, lang)}</small>
            </p>
            <button type="button" className="link small" onClick={() => go(e.to)}>{t(E("See", "Ver"))}</button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function BigThree({ lab, lang }: { lab: Lab; lang: Lang }) {
  const t = useT();
  const contexts = lab.bench.flatMap((b) => b.contexts.map((c) => ({ sc: b.id, ctx: c.id })));
  const covered = (sc: string, ctx: string) => lab.active.some((s) => s.scenario === sc && s.context === ctx);
  const n = contexts.filter((c) => covered(c.sc, c.ctx)).length;
  const best = lab.jobs.reduce<number | null>((top, j) => {
    const b = pct(j.state.before?.validation), a = pct(j.state.after);
    return b !== null && a !== null && j.state.outcome === "approved" && (top === null || a - b > top) ? a - b : top;
  }, null);
  const budget = lab.agent?.budget;
  return (
    <section className="big3" aria-label={t(E("In three numbers", "En tres números"))}>
      <article>
        <p className="big">{n}<small>/{contexts.length || 10}</small></p>
        <p>{t(E("situations it already handles with a skill of its own", "situaciones que ya resuelve con una habilidad propia"))}</p>
        {contexts.length > 0 && <div className="cells">{contexts.map((c) => <i key={c.sc + c.ctx} className={covered(c.sc, c.ctx) ? "on" : ""} style={{ ["--c" as string]: covered(c.sc, c.ctx) ? scColor(c.sc) : undefined }} />)}</div>}
      </article>
      <article>
        <p className={`big${best && best > 0 ? " up" : ""}`}>{best === null ? "—" : `+${best.toFixed(0)}`}<small>{best === null ? "" : " pts"}</small></p>
        <p>{best === null ? t(E("its best approved improvement will show here", "aquí verás su mejor mejora aprobada")) : t(E("its best approved improvement on an exam it never saw", "su mejor mejora aprobada, en un examen que nunca vio"))}</p>
      </article>
      <article>
        <p className="big">{budget ? money(budget.spent, lang) : "—"}</p>
        <p>{budget ? t(E(`spent this month, out of ${money(budget.monthly, lang)} you allowed`, `gastado este mes, de ${money(budget.monthly, lang)} que le permitiste`)) : t(E("what it spends with your key", "lo que gasta con tu llave"))}</p>
        {budget && <div className="meter"><i style={{ width: `${Math.min(100, (budget.spent / Math.max(0.01, budget.monthly)) * 100)}%` }} /></div>}
      </article>
    </section>
  );
}

function Doors({ go }: { go: (t: Tab) => void }) {
  const t = useT();
  const doors: { to: Tab; icon: string; title: Text; text: Text; color: string }[] = [
    { to: "mind", icon: "✺", color: "#6d5ce8", title: E("See its brain", "Ver su cerebro"), text: E("Every dot it learned, connected, and the tools it uses.", "Cada cosa que aprendió, conectada, y las herramientas que usa.") },
    { to: "lab", icon: "⌂", color: "#0081fb", title: E("Walk into its lab", "Entrar a su laboratorio"), text: E("The 3D building: follow it from room to room while it works.", "El edificio en 3D: síguelo de cuarto en cuarto mientras trabaja.") },
    { to: "agent", icon: "▶", color: "#22b864", title: E("Put it to practice", "Ponerlo a practicar"), text: E("Choose the exam yourself, or let it decide with a spending cap.", "Elige tú el examen o déjalo decidir con un tope de gasto.") },
  ];
  return (
    <nav className="doors" aria-label={t(E("Where to go", "A dónde ir"))}>
      {doors.map((d) => (
        <button key={d.to} type="button" onClick={() => go(d.to)} style={{ ["--c" as string]: d.color }}>
          <span className="ico" aria-hidden="true">{d.icon}</span>
          <b>{t(d.title)}</b>
          <span>{t(d.text)}</span>
        </button>
      ))}
    </nav>
  );
}

/* ---------- the numbers ---------- */
function Kpis({ lab, lang, loading }: { lab: Lab; lang: Lang; loading: boolean }) {
  const t = useT();
  const contexts = lab.bench.flatMap((b) => b.contexts.map((c) => ({ sc: b.id, ctx: c.id })));
  const covered = (sc: string, ctx: string) => lab.active.some((s) => s.scenario === sc && s.context === ctx);
  const ncov = contexts.filter((c) => covered(c.sc, c.ctx)).length;
  const approved = lab.jobs.filter((j) => j.state.outcome === "approved").length;
  const blocked = lab.jobs.filter((j) => j.state.outcome === "harness-rejected").length;
  const best = lab.jobs.reduce<{ gain: number; sc: string } | null>((top, j) => {
    const b = pct(j.state.before?.validation), a = pct(j.state.after);
    return b !== null && a !== null && (!top || a - b > top.gain) ? { gain: a - b, sc: j.scenario } : top;
  }, null);
  const budget = lab.agent?.budget;
  const used = budget && budget.monthly > 0 ? Math.min(1, budget.spent / budget.monthly) : 0;
  const exp = lab.notes.filter((n) => n.verdict === "experiment").length;
  const pending = lab.notes.filter((n) => n.verdict === "experiment" && !n.decision).length;

  return (
    <section className={`kpis${loading ? " loading" : ""}`} aria-label={t(E("Key numbers", "Números clave"))}>
      <article className="kpi">
        <h3>{t(E("Active skills", "Habilidades activas"))}</h3>
        <p className="big">{lab.active.length}{lab.candidates.length > 0 && <span className="pill amber">+{lab.candidates.length} {t(E("waiting", "en espera"))}</span>}</p>
        {contexts.length > 0 && (
          <div className="cells" role="img" aria-label={t(E(`Covers ${ncov} of ${contexts.length} situations`, `Cubre ${ncov} de ${contexts.length} situaciones`))}>
            {contexts.map((c) => <i key={c.sc + c.ctx} style={{ ["--c" as string]: covered(c.sc, c.ctx) ? scColor(c.sc) : undefined }} className={covered(c.sc, c.ctx) ? "on" : ""} />)}
          </div>
        )}
        <p className="sub">{t(E(`Covers ${ncov} of ${contexts.length || 10} situations`, `Cubre ${ncov} de ${contexts.length || 10} situaciones`))}</p>
      </article>
      <article className="kpi">
        <h3>{t(E("Improvement cycles", "Ciclos de mejora"))}</h3>
        <p className="big">{lab.jobs.length}</p>
        <p className="sub">{t(E(`${approved} approved · ${blocked} thrown out by the harness`, `${approved} aprobados · ${blocked} descartados por el arnés`))}</p>
      </article>
      <article className="kpi">
        <h3>{t(E("Best gain", "Mejor mejora"))}</h3>
        <p className={`big${best && best.gain > 0 ? " up" : ""}`}>{best ? `${best.gain > 0 ? "+" : ""}${best.gain.toFixed(1)}` : "—"}<small>{best ? t(E(" pts", " pts")) : ""}</small></p>
        <p className="sub">{best ? t(E(`On validation · ${lab.bench.find((b) => b.id === best.sc)?.title ?? best.sc}`, `En validación · ${lab.bench.find((b) => b.id === best.sc)?.title ?? best.sc}`)) : t(E("No measured improvement yet", "Aún sin mejoras medidas"))}</p>
      </article>
      <article className="kpi">
        <h3>{t(E("Spent this month", "Gasto del mes"))}</h3>
        <p className="big">{budget ? money(budget.spent, lang) : "—"}{budget && <small> / {money(budget.monthly, lang)}</small>}</p>
        <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used * 100)} aria-label={t(E("Budget used", "Presupuesto usado"))}>
          <i style={{ width: `${used * 100}%` }} className={used > 0.85 ? "hot" : ""} />
        </div>
        <p className="sub">{budget ? t(E(`${budget.runs} model calls · your key, your limit`, `${budget.runs} llamadas al modelo · tu llave, tu límite`)) : t(E("Set a limit in Agent", "Pon un límite en Agente"))}</p>
      </article>
      <article className="kpi">
        <h3>{t(E("Research radar", "Radar de investigación"))}</h3>
        <p className="big">{lab.notes.length}</p>
        <p className="sub">{t(E(`stories judged · ${exp} worth an experiment${pending ? ` · ${pending} to decide` : ""}`, `historias evaluadas · ${exp} valen un experimento${pending ? ` · ${pending} por decidir` : ""}`))}</p>
      </article>
    </section>
  );
}

/* ---------- the self-development cycle, with where the latest one is ---------- */
type PhaseInfo = { short: Text; name: Text; what: Text; color: string };
const PHASES: [PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo] = [
  {
    short: E("Measures", "Se mide"), name: E("Measures itself", "Se mide"), color: "#6d5ce8",
    what: E("Before changing anything, it takes a practice exam with the skills it already has. That score is the baseline: without it nobody could tell later whether something improved.", "Antes de cambiar nada, presenta un examen de práctica con las habilidades que ya tiene. Esa calificación es la línea base: sin ella no habría forma de saber después si algo mejoró."),
  },
  {
    short: E("Research", "Investiga"), name: E("Researches", "Investiga"), color: "#ff6600",
    what: E("It reads four sources (Hacker News, arXiv, Hugging Face and GitHub) and decides which items deserve an experiment, a watch or a skip. Optional, but it gives it ideas.", "Lee cuatro fuentes (Hacker News, arXiv, Hugging Face y GitHub) y decide qué merece un experimento, vigilarse o descartarse. Es opcional, pero le da ideas."),
  },
  {
    short: E("Mistakes", "Errores"), name: E("Learns from its mistakes", "Aprende de sus errores"), color: "#f0533c",
    what: E("It takes the questions it got wrong, groups them by pattern and writes one new skill (a short text of instructions) aimed at the most common pattern.", "Toma las preguntas que falló, las agrupa por patrón y escribe una habilidad nueva (un texto corto de instrucciones) dirigida al patrón más común."),
  },
  {
    short: E("Test", "Prueba"), name: E("Tests the new skill", "Prueba la habilidad nueva"), color: "#0081fb",
    what: E("It answers a second exam it never saw, with and without the new skill. It only moves on if the score goes up and nothing that used to work now fails.", "Contesta un segundo examen que nunca vio, con y sin la habilidad nueva. Solo avanza si la calificación sube y nada de lo que ya funcionaba falla."),
  },
  {
    short: E("Activate", "Se activa"), name: E("Switches on, with your approval", "Se activa con tu aprobación"), color: "#22b864",
    what: E("If the skill passed the test and you approve it, it becomes a new active version, labeled with where it applies.", "Si la habilidad pasó la prueba y tú la apruebas, queda como una versión nueva activa, etiquetada con dónde aplica."),
  },
  {
    short: E("Update", "Al día"), name: E("Keeps up to date", "Se mantiene al día"), color: "#ffa928",
    what: E("When a scenario changes its rules, only the skills labeled for that change are tested again. The rest keep working and old versions are kept.", "Cuando un escenario cambia sus reglas, solo las habilidades etiquetadas para ese cambio se vuelven a probar. Las demás siguen funcionando y las versiones viejas se guardan."),
  },
];
type PhaseState = "done" | "now" | "wait" | "stop" | "todo" | "later";

function phaseStates(job: Job | null, notes: Note[]): { st: PhaseState[]; at: number } {
  const research: PhaseState = notes.length ? "done" : "todo";
  if (!job) return { st: ["todo", research, "todo", "todo", "todo", "later"], at: 0 };
  const o = job.state.outcome;
  const s = job.state;
  let at = 0;
  let mark: PhaseState = "now";
  if (job.phase === "baseline") at = 0;
  else if (job.phase === "propose") at = 2;
  else if (job.phase === "validate") at = 3;
  else if (job.phase === "awaiting") { at = 4; mark = "wait"; }
  else if (o === "approved") { at = 4; mark = "done"; }
  else if (o === "rejected") { at = 4; mark = "stop"; }
  else if (o === "harness-rejected") { at = 3; mark = "stop"; }
  else if (o === "nothing-to-learn") { at = 2; mark = "done"; }
  else if (o === "planner-failed") { at = 2; mark = "stop"; }
  else at = s.after ? 3 : s.candidate ? 2 : 0;
  if (s.error) mark = "stop";
  const st: PhaseState[] = [0, 1, 2, 3, 4, 5].map((i) => {
    if (i === 1) return research;
    if (i === 5) return "later";
    return i < at ? "done" : i === at ? mark : "todo";
  });
  return { st, at };
}

function CycleTrack({ lab, lang, go }: { lab: Lab; lang: Lang; go: (t: Tab) => void }) {
  const t = useT();
  const job = lab.latest;
  const { st, at } = phaseStates(job, lab.notes);
  const [sel, setSel] = useState<number | null>(null);
  const cur = sel ?? at;
  const ph = PHASES[cur] ?? PHASES[0];
  const s = job?.state;
  const before = s?.before?.validation;
  const b = pct(before), a = pct(s?.after);
  const c = s?.candidate;
  const exp = lab.notes.filter((n) => n.verdict === "experiment").length;
  const STATE: Record<PhaseState, Text> = {
    done: E("done", "listo"), now: E("working on it", "trabajando"), wait: E("waiting for you", "te espera"),
    stop: E("stopped here", "se detuvo aquí"), todo: E("not yet", "aún no"), later: E("when rules change", "cuando cambien las reglas"),
  };

  let real: Text | null = null;
  let quote: string | null = null;
  let action: { label: Text; to: Tab } | null = null;
  if (cur === 0) {
    real = s?.before
      ? E(`Baseline: ${frac(before)} right on validation (${b?.toFixed(0)}%) and ${frac(s.before.practice)} on practice.`, `Línea base: ${frac(before)} bien en validación (${b?.toFixed(0)}%) y ${frac(s.before.practice)} en práctica.`)
      : job && job.phase === "baseline"
        ? E("Taking the exam right now…", "Presentando el examen ahorita…")
        : null;
  } else if (cur === 1) {
    real = lab.notes.length
      ? E(`The radar has judged ${lab.notes.length} stories; ${exp} deserve an experiment.${c?.noteId ? " This cycle's skill was inspired by one of them." : ""}`, `El radar ha evaluado ${lab.notes.length} historias; ${exp} merecen un experimento.${c?.noteId ? " La habilidad de este ciclo se inspiró en una de ellas." : ""}`)
      : null;
    if (!lab.notes.length) action = { label: E("Run the radar", "Correr el radar"), to: "radar" };
  } else if (cur === 2) {
    real = c
      ? E(`It studied ${s?.mistakes.length ?? 0} practice mistakes and wrote v${c.version} for “${ctxName(lab, c.scenario, c.context)}”.`, `Estudió ${s?.mistakes.length ?? 0} errores de práctica y escribió la v${c.version} para «${ctxName(lab, c.scenario, c.context)}».`)
      : s?.outcome === "nothing-to-learn"
        ? E("It had no practice mistakes to study, so there was nothing to write.", "No tuvo errores de práctica que estudiar, así que no había nada que escribir.")
        : s?.outcome === "planner-failed"
          ? E("The planner couldn't write a valid skill this time.", "El planificador no logró escribir una habilidad válida esta vez.")
          : job?.phase === "propose" ? E("Studying its mistakes…", "Estudiando sus errores…") : null;
    if (c?.rationale) quote = c.rationale;
  } else if (cur === 3) {
    const v = s?.verdict;
    real = s?.after
      ? E(
          `With the new skill: ${frac(s.after)} (${a?.toFixed(0)}%) against ${frac(before)} (${b?.toFixed(0)}%) without it. ${v ? (v.reason === "improves" ? "It improves and breaks nothing → it goes to a person." : v.reason === "regression" ? "It broke something that already worked → thrown out." : "It didn't improve enough → thrown out.") : ""}`,
          `Con la habilidad nueva: ${frac(s.after)} (${a?.toFixed(0)}%) contra ${frac(before)} (${b?.toFixed(0)}%) sin ella. ${v ? (v.reason === "improves" ? "Mejora y no rompe nada → pasa a una persona." : v.reason === "regression" ? "Rompió algo que ya funcionaba → descartada." : "No mejoró lo suficiente → descartada.") : ""}`,
        )
      : job?.phase === "validate" ? E("Taking the second exam…", "Presentando el segundo examen…") : null;
  } else if (cur === 4) {
    real = job?.phase === "awaiting"
      ? E("It passed the harness and is waiting for your decision.", "Pasó el arnés y espera tu decisión.")
      : s?.outcome === "approved" ? E("You approved it: it's active now.", "La aprobaste: ya está activa.")
        : s?.outcome === "rejected" ? E("You rejected it: nothing changed.", "La rechazaste: nada cambió.") : null;
    if (job?.phase === "awaiting") action = { label: E("Approve or reject", "Aprobar o rechazar"), to: "agent" };
  } else {
    real = E("No scenario in your lab has changed its rules yet, so nothing needs re-testing.", "Ningún escenario de tu laboratorio ha cambiado sus reglas todavía, así que no hay nada que volver a probar.");
  }

  return (
    <section className="dcard cyc" aria-labelledby="cyc-h">
      <div className="dhead">
        <div>
          <p className="kicker" style={{ color: "#6d5ce8" }}>{t(E("Self-development", "Auto-desarrollo"))}</p>
          <h2 id="cyc-h" className="h2">{job ? t(E("Where its latest cycle is", "Dónde va su último ciclo")) : t(E("How it improves itself", "Cómo se mejora solo"))}</h2>
        </div>
        {job && (
          <p className="meta">
            <span className="cap"><i style={{ ["--c" as string]: scColor(job.scenario) }} />{scTitle(lab, job.scenario)}</span>
            <span>· {job.executor}</span>
            <span>· {ago(job.updatedAt, lang)}</span>
          </p>
        )}
      </div>
      <ol className="track" role="tablist" aria-label={t(E("Phases", "Fases"))}>
        {PHASES.map((p, i) => {
          const state = st[i] ?? "todo";
          return (
            <li key={i} className={`${state}${cur === i ? " sel" : ""}`} style={{ ["--c" as string]: p.color }}>
              {job && i === at && (
                <img className="pin" src={state === "stop" || state === "wait" ? "/img/agent-alert.webp" : "/img/agent-ok.webp"} alt="" width={34} height={51} />
              )}
              <button type="button" role="tab" aria-selected={cur === i} onClick={() => setSel(i)}>
                <span className="dot" aria-hidden="true">{state === "done" ? <Check size={13} /> : state === "stop" ? "✕" : i + 1}</span>
                <b>{t(p.short)}</b>
                <small>{t(STATE[state])}</small>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="pdetail" role="tabpanel" style={{ ["--c" as string]: ph.color }}>
        <div>
          <p className="small muted">{t(E(`Phase ${cur + 1} of 6`, `Fase ${cur + 1} de 6`))}</p>
          <h3 className="h3">{t(ph.name)}</h3>
          <p className="what">{t(ph.what)}</p>
        </div>
        <div className="real">
          <p className="small"><b>{job ? t(E("In your latest cycle", "En tu último ciclo")) : t(E("In your lab", "En tu laboratorio"))}</b></p>
          <p>{real ? t(real) : t(E("Nothing here yet. It fills in when you run a cycle.", "Aún nada. Se llena cuando corres un ciclo."))}</p>
          {quote && <blockquote>“{quote.length > 260 ? quote.slice(0, 257) + "…" : quote}”</blockquote>}
          {action && <button type="button" className="btn small" onClick={() => go(action.to)}>{t(action.label)}</button>}
          {!job && cur !== 1 && cur !== 5 && <button type="button" className="btn small" onClick={() => go("agent")}>{t(E("Start a cycle", "Iniciar un ciclo"))}</button>}
        </div>
      </div>
    </section>
  );
}

/* ---------- how each cycle scored: a dumbbell per cycle, baseline → with the new skill ---------- */
function ScoreChart({ lab, lang, go }: { lab: Lab; lang: Lang; go: (t: Tab) => void }) {
  const t = useT();
  const rows = lab.jobs.filter((j) => j.state.before?.validation).slice(0, 8);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <section className="dcard chart" aria-labelledby="chart-h">
      <div className="dhead">
        <div>
          <h2 id="chart-h" className="h3">{t(E("How each cycle scored", "Cómo le fue en cada ciclo"))}</h2>
          <p className="small muted">{t(E("Validation exam, % right. The exam it never sees while learning.", "Examen de validación, % de aciertos. El que nunca ve mientras aprende."))}</p>
        </div>
        <ul className="legend" aria-label={t(E("Legend", "Leyenda"))}>
          <li><i className="mk base" />{t(E("Baseline", "Línea base"))}</li>
          <li><i className="mk after" />{t(E("With the new skill", "Con la habilidad nueva"))}</li>
        </ul>
      </div>
      {rows.length === 0 ? (
        <div className="empty ghost-chart">
          <p>{t(E("Here you'll see how its score changes in each cycle: the grey dot is where it started, the blue one where the new skill took it.", "Aquí verás cómo cambia su calificación en cada ciclo: el punto gris es de dónde partió y el azul a dónde lo llevó la habilidad nueva."))}</p>
          <button type="button" className="btn small" onClick={() => go("agent")}>{t(E("Run a cycle", "Correr un ciclo"))}</button>
        </div>
      ) : (
        <div className="dumb" onMouseLeave={() => setHover(null)}>
          <div className="drow axis" aria-hidden="true">
            <span />
            <div className="dplot">{[0, 25, 50, 75, 100].map((v) => <span key={v} style={{ left: `${v}%` }}>{v}%</span>)}</div>
            <span />
          </div>
          {rows.map((j, i) => {
            const b = pct(j.state.before?.validation) ?? 0;
            const a = pct(j.state.after);
            const v = j.state.verdict;
            const tone = a === null ? "none" : v?.reason === "regression" ? "bad" : v?.pass ? "good" : "flat";
            const d = a === null ? null : a - b;
            const lo = Math.min(b, a ?? b), hi = Math.max(b, a ?? b);
            return (
              <div key={j.id} className={`drow${hover === i ? " hov" : ""}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
                aria-label={`${scTitle(lab, j.scenario)}: ${b.toFixed(0)}%${a !== null ? ` → ${a.toFixed(0)}%` : ""}`}>
                <div className="dlabel">
                  <b><i className="sw" style={{ ["--c" as string]: scColor(j.scenario) }} />{scTitle(lab, j.scenario)}</b>
                  <small>{ago(j.createdAt, lang)}</small>
                </div>
                <div className="dplot">
                  {[25, 50, 75].map((g) => <i key={g} className="grid" style={{ left: `${g}%` }} />)}
                  <i className={`dseg ${tone}`} style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
                  <i className="mk base" style={{ left: `${b}%` }} />
                  {a !== null && <i className={`mk after ${tone}`} style={{ left: `${a}%` }} />}
                  {hover === i && (
                    <div className="tip" style={{ left: `${Math.min(80, Math.max(20, a ?? b))}%` }} role="tooltip">
                      <b>{scTitle(lab, j.scenario)}</b>
                      <span>{t(E("Baseline", "Línea base"))}: {frac(j.state.before?.validation)} ({b.toFixed(0)}%)</span>
                      {a !== null && <span>{t(E("With the new skill", "Con la nueva"))}: {frac(j.state.after)} ({a.toFixed(0)}%)</span>}
                      {j.state.candidate && <span>{t(E("Skill", "Habilidad"))}: v{j.state.candidate.version} · {ctxName(lab, j.scenario, j.state.candidate.context)}</span>}
                      <span>{t(E("Executor", "Ejecutor"))}: {j.executor}</span>
                    </div>
                  )}
                </div>
                <span className={`delta ${tone}`}>
                  {d === null ? t(E("no test", "sin prueba")) : `${tone === "good" ? "✓ " : tone === "bad" ? "✕ " : "= "}${d > 0 ? "+" : ""}${d.toFixed(1)}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ---------- the latest changes, from every source ---------- */
type Ev = { at: string; icon: string; color: string; text: Text; sc?: string; to: Tab };

function events(lab: Lab): Ev[] {
  const ev: Ev[] = [];
  for (const s of lab.skills) {
    const where = ctxName(lab, s.scenario, s.context);
    ev.push({ at: s.createdAt, icon: "✎", color: "#6d5ce8", sc: s.scenario, to: "agent", text: E(`Wrote skill v${s.version} for “${where}”`, `Escribió la habilidad v${s.version} para «${where}»`) });
    if (s.decidedAt) {
      const txt =
        s.status === "active" ? E(`v${s.version} for “${where}” switched on`, `Se activó la v${s.version} para «${where}»`)
          : s.status === "retired" ? E(`v${s.version} for “${where}” retired by a newer version`, `Se retiró la v${s.version} de «${where}» por una más nueva`)
            : s.status === "rejected" ? E(`v${s.version} for “${where}” was rejected`, `Se rechazó la v${s.version} para «${where}»`) : null;
      if (txt) ev.push({ at: s.decidedAt, icon: s.status === "active" ? "✓" : s.status === "rejected" ? "✕" : "↧", color: s.status === "active" ? "#22b864" : s.status === "rejected" ? "#f0533c" : "#8a99a6", sc: s.scenario, to: "agent", text: txt });
    }
  }
  for (const j of lab.jobs) {
    ev.push({ at: j.createdAt, icon: "▶", color: "#0081fb", sc: j.scenario, to: "lab", text: E(`Started a cycle on “${scTitle(lab, j.scenario)}”`, `Inició un ciclo en «${scTitle(lab, j.scenario)}»`) });
    const o = j.state.outcome;
    if (o === "harness-rejected") ev.push({ at: j.updatedAt, icon: "⛨", color: "#f0533c", sc: j.scenario, to: "agent", text: E("The harness threw out the candidate: it didn't improve without breaking something", "El arnés descartó la candidata: no mejoró sin romper algo") });
    if (o === "nothing-to-learn") ev.push({ at: j.updatedAt, icon: "★", color: "#22b864", sc: j.scenario, to: "agent", text: E("No mistakes to study: nothing to write", "Sin errores que estudiar: nada que escribir") });
    if (j.phase === "awaiting") ev.push({ at: j.updatedAt, icon: "!", color: "#ffa928", sc: j.scenario, to: "agent", text: E("The harness passed a skill: it's waiting for you", "El arnés dejó pasar una habilidad: te está esperando") });
    if (j.state.error) ev.push({ at: j.updatedAt, icon: "!", color: "#f0533c", sc: j.scenario, to: "agent", text: E("A cycle got stuck", "Un ciclo se atoró") });
  }
  // radar runs: one entry per batch of judged stories
  const runs = new Map<string, Note[]>();
  for (const n of lab.notes) {
    const k = n.assessedAt.slice(0, 16);
    runs.set(k, [...(runs.get(k) ?? []), n]);
  }
  for (const [, ns] of runs) {
    const exp = ns.filter((n) => n.verdict === "experiment").length;
    const first = ns[0];
    if (!first) continue;
    ev.push({ at: first.assessedAt, icon: "Y", color: "#ff6600", to: "radar", text: E(`The radar judged ${ns.length} stories: ${exp} worth an experiment`, `El radar evaluó ${ns.length} historias: ${exp} valen un experimento`) });
  }
  for (const n of lab.notes) {
    if (n.decidedAt && n.decision)
      ev.push({ at: n.decidedAt, icon: n.decision === "approved" ? "✓" : "✕", color: n.decision === "approved" ? "#22b864" : "#8a99a6", to: "radar", text: n.decision === "approved" ? E(`You approved experimenting with “${n.title}”`, `Aprobaste experimentar con «${n.title}»`) : E(`You set aside “${n.title}”`, `Descartaste «${n.title}»`) });
  }
  return ev.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 9);
}

function Feed({ lab, lang, go }: { lab: Lab; lang: Lang; go: (t: Tab) => void }) {
  const t = useT();
  const ev = events(lab);
  return (
    <section className="dcard feed" aria-labelledby="feed-h">
      <h2 id="feed-h" className="h3">{t(E("Latest changes", "Últimos ajustes"))}</h2>
      {ev.length === 0 ? (
        <p className="empty">{t(E("No changes yet. Every skill it writes, every decision and every radar run will show up here.", "Aún no hay ajustes. Aquí aparecerá cada habilidad que escriba, cada decisión y cada corrida del radar."))}</p>
      ) : (
        <ol>
          {ev.map((e, i) => (
            <li key={i}>
              <button type="button" onClick={() => go(e.to)}>
                <span className="ico" style={{ ["--c" as string]: e.color }} aria-hidden="true">{e.icon}</span>
                <span className="txt">
                  {t(e.text)}
                  <small>
                    {ago(e.at, lang)}
                    {e.sc && <> · <i className="sw" style={{ ["--c" as string]: scColor(e.sc) }} />{scTitle(lab, e.sc)}</>}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ---------- what it already knows: every scenario and situation ---------- */
function SkillMap({ lab, go }: { lab: Lab; go: (t: Tab) => void }) {
  const t = useT();
  if (!lab.bench.length) return null;
  return (
    <section className="dcard smap" aria-labelledby="smap-h">
      <div className="dhead">
        <div>
          <h2 id="smap-h" className="h3">{t(E("What it already knows", "Lo que ya sabe hacer"))}</h2>
          <p className="small muted">{t(E("Each scenario has different situations. A skill only applies to its own, so learning one never breaks another.", "Cada escenario tiene situaciones distintas. Una habilidad solo aplica a la suya, así que aprender una nunca rompe otra."))}</p>
        </div>
        <button type="button" className="btn small ghost" onClick={() => go("agent")}>{t(E("Open the library", "Abrir la biblioteca"))}</button>
      </div>
      <div className="scens">
        {lab.bench.map((b) => (
          <article key={b.id} style={{ ["--c" as string]: scColor(b.id) }}>
            <header>
              <span className="badge" aria-hidden="true">{SC[b.id]?.icon ?? "◆"}</span>
              <div>
                <h3>{b.title}</h3>
                <p className="small muted">{b.industry}</p>
              </div>
            </header>
            <ul>
              {b.contexts.map((c) => {
                const act = lab.active.find((s) => s.scenario === b.id && s.context === c.id);
                const cand = lab.candidates.find((s) => s.scenario === b.id && s.context === c.id);
                return (
                  <li key={c.id}>
                    <span>{c.name}</span>
                    {act ? <span className="pill ok">v{act.version} {t(E("active", "activa"))}</span> : <span className="pill">{t(E("no skill yet", "sin habilidad"))}</span>}
                    {cand && <span className="pill amber">v{cand.version} {t(E("waiting", "en espera"))}</span>}
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
