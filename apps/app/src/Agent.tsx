// The agent improving itself, for real: it takes an exam with the user's Meta key, studies its mistakes,
// writes itself a new skill version, re-takes the exam with it, and the harness decides whether a person
// should even be asked. Nothing changes the agent without that person's approval.
import { EFFORTS, familyOf } from "@skillab/research";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type AgentState, type Api, type Exam, type Job, type Scores, type Skill } from "./api.js";
import type { Tab } from "./App.js";
import { useT, type Lang, type Text } from "./i18n.js";
import { MetaMark } from "./Logos.js";
import { CAP_KEY, savedCap } from "./Companion.js";
import { useLive } from "./live.js";
import { Memory } from "./Memory.js";
import { RunGraph } from "./RunGraph.js";

const E = (en: string, es: string): Text => ({ en, es });
const L = {
  kicker: E("Real cycle · your Meta key", "Ciclo real · tu llave de Meta"),
  title: E("The agent improves itself", "El agente se mejora a sí mismo"),
  lead: E(
    "It takes an exam it can't see the answers to, studies its own mistakes, writes itself a new skill, takes the exam again and shows you the result. The harness throws out anything that doesn't help; what helps waits for your approval.",
    "Presenta un examen cuyas respuestas no ve, estudia sus propios errores, se escribe una habilidad nueva, vuelve a presentar el examen y te muestra el resultado. El arnés descarta lo que no ayuda; lo que ayuda espera tu aprobación.",
  ),
  families: E("Meta families on your key", "Familias de Meta en tu llave"),
  roles: {
    wonder: E("plans: writes the skills", "planifica: escribe las habilidades"),
    spark: E("executes: takes the exams", "ejecuta: presenta los exámenes"),
    "spark-contributor": E("cheaper executor", "ejecutor más barato"),
    glimmer: E("light executor", "ejecutor ligero"),
    "spark-open": E("open weights", "pesos abiertos"),
    voice: E("listens: your voice becomes guidance", "escucha: tu voz se vuelve guía"),
    image: E("draws: an emblem per skill", "dibuja: un emblema por habilidad"),
  } as Record<string, Text>,
  available: E("on your key", "en tu llave"),
  notListed: E("not listed", "no aparece"),
  tryIt: E("try it", "pruébalo"),
  scenario: E("Exam", "Examen"),
  executor: E("Executor", "Ejecutor"),
  planner: E("Planner", "Planificador"),
  effort: E("Executor effort", "Esfuerzo del ejecutor"),
  guidance: E("Your guidance (optional)", "Tu guía (opcional)"),
  guidancePh: E("e.g. focus on the export line; the unit matters", "p. ej. enfócate en la línea de exportación; la unidad importa"),
  speak: E("Dictate", "Dictar"),
  stop: E("Stop", "Detener"),
  transcribing: E("Transcribing…", "Transcribiendo…"),
  start: E("Start a cycle", "Iniciar un ciclo"),
  running: E("Working…", "Trabajando…"),
  resume: E("Continue", "Continuar"),
  needKey: E("Connect your Meta key in Settings first.", "Primero conecta tu llave de Meta en Ajustes."),
  modeMine: E("I choose", "Yo elijo"),
  modeAuto: E("Let it decide", "Que él decida"),
  autoLead: E(
    "Muse Wonder looks at where it fails most, which Meta models your key has and what each would cost, and picks the exam, the model and the effort by itself. It can also propose new abilities (seeing images, listening…). It never goes over the cap.",
    "Muse Wonder mira dónde falla más, qué modelos de Meta tiene tu llave y cuánto costaría cada uno, y elige solo el examen, el modelo y el esfuerzo. También puede proponer habilidades nuevas (ver imágenes, escuchar…). Nunca pasa del tope.",
  ),
  cap: E("Spending cap for this cycle (USD)", "Tope de gasto de este ciclo (USD)"),
  capHelp: E("If a step could go over it, the cycle stops cleanly. Your monthly budget still applies.", "Si un paso pudiera pasarlo, el ciclo se detiene limpio. Tu presupuesto mensual sigue aplicando."),
  planTitle: E("What it decided", "Lo que decidió"),
  proposals: E("It proposes", "Propone"),
  proposalNote: E("Proposals only: nothing new switches on without a person.", "Solo propuestas: nada nuevo se enciende sin una persona."),
  capability: { vision: E("See images", "Ver imágenes"), image: E("Draw", "Dibujar"), voice: E("Listen", "Escuchar"), code: E("Change its code", "Cambiar su código"), web: E("Search the web", "Buscar en la web"), memory: E("Remember more", "Recordar más") } as Record<string, Text>,
  watch: E("Watch it in 3D", "Verlo en 3D"),
  phases: [
    { id: "plan", t: E("Decides", "Decide"), d: E("only when you let it choose; it may dream first", "solo si lo dejas elegir; antes puede soñar") },
    { id: "baseline", t: E("First exam", "Primer examen"), d: E("practice + validation, with today's skills", "práctica + validación, con las habilidades de hoy") },
    { id: "propose", t: E("Writes a skill", "Escribe una habilidad"), d: E("the planner studies the practice mistakes", "el planificador estudia los errores de práctica") },
    { id: "validate", t: E("Exam again", "Examen de nuevo"), d: E("validation, now with the candidate", "validación, ahora con la candidata") },
    { id: "awaiting", t: E("Your decision", "Tu decisión"), d: E("only if the harness passed it", "solo si el arnés la aprobó") },
  ],
  before: E("before", "antes"),
  after: E("with the candidate", "con la candidata"),
  practice: E("practice", "práctica"),
  validation: E("validation (answers hidden from the model)", "validación (respuestas ocultas al modelo)"),
  mistakes: E("Some of its practice mistakes", "Algunos de sus errores de práctica"),
  said: E("said", "dijo"),
  right: E("right", "correcta"),
  candidate: E("Candidate skill", "Habilidad candidata"),
  forCtx: E("for", "para"),
  why: E("Why", "Por qué"),
  diffNew: E("new version", "versión nueva"),
  verdictPass: E("The harness passed it: it clearly improves its context and doesn't hurt the other.", "El arnés la aprobó: mejora claramente su contexto y no empeora el otro."),
  verdictNoGain: E("Rejected by the harness: it didn't improve its context enough.", "Rechazada por el arnés: no mejoró lo suficiente su contexto."),
  verdictRegression: E("Rejected by the harness: it made another context worse.", "Rechazada por el arnés: empeoró otro contexto."),
  approve: E("Approve: the agent starts using it", "Aprobar: el agente empieza a usarla"),
  reject: E("Reject", "Rechazar"),
  outcome: {
    "nothing-to-learn": E("Perfect score: nothing to learn here.", "Calificación perfecta: no hay nada que aprender aquí."),
    "planner-failed": E("The planner's answer wasn't a usable skill. Nothing changed.", "La respuesta del planificador no fue una habilidad usable. No cambió nada."),
    "harness-rejected": E("The harness threw this candidate out. Nothing changed.", "El arnés descartó esta candidata. No cambió nada."),
    approved: E("Approved: the agent now uses this skill.", "Aprobada: el agente ya usa esta habilidad."),
    rejected: E("You rejected it. Nothing changed.", "La rechazaste. No cambió nada."),
    "run-budget": E("It reached this cycle's spending cap and stopped. Nothing changed.", "Llegó al tope de gasto de este ciclo y se detuvo. No cambió nada."),
  } as Record<string, Text>,
  cost: E("this cycle", "este ciclo"),
  skills: E("Its skills (versioned, never erased)", "Sus habilidades (versionadas, nunca se borran)"),
  skillsLead: E("Each version is frozen once written; the agent can only add new ones. Only active skills are used.", "Cada versión queda congelada al escribirse; el agente solo puede agregar nuevas. Solo usa las activas."),
  noSkills: E("No skills yet. Run a cycle.", "Aún no tiene habilidades. Corre un ciclo."),
  status: { candidate: E("candidate", "candidata"), active: E("active", "activa"), rejected: E("rejected", "rechazada"), retired: E("retired", "retirada") } as Record<string, Text>,
  retire: E("Retire", "Retirar"),
  emblem: E("Emblem with Muse Image", "Emblema con Muse Image"),
  exam: E("Sealed exam", "Examen sellado"),
  examLead: E("Held-out records it has never seen, with and without its skills. Two calls.", "Registros reservados que nunca ha visto, con y sin sus habilidades. Dos llamadas."),
  runExam: E("Take the sealed exam", "Presentar el examen sellado"),
  bare: E("without skills", "sin habilidades"),
  withSkills: E("with its skills", "con sus habilidades"),
  overBudget: E("Stopped by the harness: this step could go over your monthly budget.", "Detenido por el arnés: este paso podría pasarse de tu presupuesto mensual."),
  spent: E("spent this month", "gastado este mes"),
  honest: E(
    "What changes here: it writes itself skills, short scoped instructions, versioned and reversible. In “Its code” it can also rewrite its own core, behind a judge. It never touches the app or the weights of Meta's models.",
    "Qué cambia aquí: se escribe habilidades, instrucciones cortas con alcance, versionadas y reversibles. En «Su código» también puede reescribir su núcleo, con un juez. Nunca toca la app ni los pesos de los modelos de Meta.",
  ),
};

const RUNNING = ["dream", "plan", "baseline", "propose", "validate"];
const pct = (s?: { correct: number; total: number }) => (s && s.total ? Math.round((100 * s.correct) / s.total) : 0);

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
const I = {
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  stop: "M7 7h10v10H7z",
  play: "M8 5v14l11-7z",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z",
  check: "M5 12.5l4.5 4.5L19 7",
  x: "M6 6l12 12M18 6L6 18",
  brush: "M4 20c3 0 5-2 5-4.5S11 12 13 12l7-7-2-2-7 7c0 2-1.5 3.5-4 4S4 17 4 20z",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  ear: "M7 10a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5 2M10 10a2 2 0 0 1 4 0",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
};

function Bars({ scores, contexts, label }: { scores?: Scores; contexts: { id: string; name: string }[]; label: string }) {
  if (!scores) return null;
  return (
    <div className="bars">
      <p className="muted small">{label}</p>
      {contexts.map((c) => {
        const s = scores[c.id];
        return (
          <div key={c.id} className="barrow">
            <span className="barname">{c.name}</span>
            <span className="bartrack"><i style={{ width: `${pct(s)}%` }} /></span>
            <b>{s ? `${s.correct}/${s.total}` : "—"}</b>
          </div>
        );
      })}
    </div>
  );
}

function Diff({ before, after }: { before: string | null; after: string }) {
  const old = new Set((before ?? "").split("\n").map((l) => l.trim()).filter(Boolean));
  const next = after.split("\n");
  const fresh = new Set(next.map((l) => l.trim()));
  const gone = [...old].filter((l) => !fresh.has(l));
  return (
    <pre className="diff">
      {gone.map((l, i) => <span key={`g${i}`} className="del">- {l}{"\n"}</span>)}
      {next.map((l, i) => <span key={`n${i}`} className={old.size && !old.has(l.trim()) ? "add" : ""}>{old.size && !old.has(l.trim()) ? "+ " : "  "}{l}{"\n"}</span>)}
    </pre>
  );
}

/** Records up to two minutes of audio in the browser. */
function useRecorder() {
  const [recording, setRecording] = useState(false);
  const rec = useRef<{ mr: MediaRecorder; chunks: Blob[]; t0: number; done: (b: { blob: Blob; seconds: number }) => void } | null>(null);
  const start = async (done: (b: { blob: Blob; seconds: number }) => void) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => chunks.push(e.data);
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const r = rec.current;
      rec.current = null;
      setRecording(false);
      if (r) r.done({ blob: new Blob(chunks, { type: mr.mimeType || "audio/webm" }), seconds: (Date.now() - r.t0) / 1000 });
    };
    rec.current = { mr, chunks, t0: Date.now(), done };
    mr.start();
    setRecording(true);
    setTimeout(() => { if (rec.current?.mr === mr) mr.stop(); }, 120_000);
  };
  const stop = () => rec.current?.mr.stop();
  return { recording, start, stop };
}

export function Agent({ client, go, lang }: { client: Api; go: (t: Tab) => void; lang: Lang }) {
  const t = useT();
  const [data, setData] = useState<AgentState | null>(null);
  const [scenario, setScenario] = useState("codigo");
  const [executor, setExecutor] = useState("");
  const [planner, setPlanner] = useState("");
  const [effort, setEffort] = useState("medium");
  const [guidance, setGuidance] = useState("");
  const [auto, setAuto] = useState(true);
  const [cap, setCap] = useState(() => savedCap().toFixed(2));
  const live = useLive();
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [exam, setExam] = useState<{ bare?: Exam; withSkills?: Exam } | null>(null);
  const [examBusy, setExamBusy] = useState(false);
  const [emblems, setEmblems] = useState<Record<string, string>>({});
  const [voiceBusy, setVoiceBusy] = useState(false);
  const recorder = useRecorder();
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    try {
      const d = await client.agent();
      setData(d);
      setJob((cur) => cur ?? d.jobs.find((j) => RUNNING.includes(j.phase) || j.phase === "awaiting") ?? d.jobs[0] ?? null);
      const fam = (f: string) => d.families.find((x) => x.family === f)?.id ?? "";
      setExecutor((v) => v || d.key?.model || fam("spark"));
      setPlanner((v) => v || fam("wonder") || d.key?.model || "");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [client]);
  useEffect(() => { void load(); }, [load]);

  const fail = (err: unknown) => {
    if (err instanceof ApiError && err.reason === "budget") setError(t(L.overBudget));
    else setError((err as Error).message);
  };

  // the cycle runs in the app-wide runner, so it keeps going on other tabs (the 3D lab, the brain graph)
  const drive = async (j: Job) => {
    setJob(j);
    await live.drive(j);
    if (alive.current) await load();
  };
  // follow the runner's copy of this cycle while it advances
  useEffect(() => {
    const lj = live.job;
    if (lj) setJob((cur) => (!cur || cur.id === lj.id || RUNNING.includes(lj.phase) ? lj : cur));
  }, [live.job]);
  useEffect(() => { if (live.error) setError(live.error); }, [live.error]);

  const start = async () => {
    setBusy(true);
    setError("");
    setExam(null);
    try {
      const maxCost = Math.max(0.05, Math.min(20, Number(cap) || 0.5));
      try { localStorage.setItem(CAP_KEY, String(maxCost)); } catch { /* private mode */ }
      const body = auto ? { auto: true, planner, guidance, maxCost, lang } : { scenario, executor, planner, effort, guidance, maxCost, lang };
      const r = await client.agentOp({ op: "start", ...body });
      await drive(r.job);
    } catch (err) {
      if (err instanceof ApiError && err.reason === "busy" && err.detail?.job) setJob(err.detail.job as Job);
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const resume = async () => {
    if (!job) return;
    setBusy(true);
    setError("");
    try { await drive(job); } catch (err) { fail(err); } finally { setBusy(false); }
  };
  const decide = async (skillId: string, decision: "approved" | "rejected") => {
    setError("");
    try {
      await client.agentOp({ op: "decide", skillId, decision });
      setJob((j) => (j ? { ...j, phase: "done", state: { ...j.state, outcome: decision } } : j));
      await load();
    } catch (err) { fail(err); }
  };
  const retire = async (skillId: string) => {
    try { await client.agentOp({ op: "retire", skillId }); await load(); } catch (err) { fail(err); }
  };
  const runExam = async () => {
    setExamBusy(true);
    setError("");
    setExam({});
    try {
      const bare = await client.agentOp<Exam>({ op: "exam", scenario, executor, effort, bare: true });
      setExam({ bare });
      const withSkills = await client.agentOp<Exam>({ op: "exam", scenario, executor, effort });
      setExam({ bare, withSkills });
      await load();
    } catch (err) { fail(err); } finally { setExamBusy(false); }
  };
  const emblem = async (skillId: string) => {
    setError("");
    try { const r = await client.emblem(skillId); setEmblems((m) => ({ ...m, [skillId]: r.image })); } catch (err) { fail(err); }
  };
  const dictate = async () => {
    if (recorder.recording) return recorder.stop();
    setError("");
    try {
      await recorder.start(async ({ blob, seconds }) => {
        setVoiceBusy(true);
        try {
          const r = await client.transcribe(blob, seconds, lang);
          setGuidance((g) => (g ? `${g} ${r.text}` : r.text).slice(0, 500));
        } catch (err) { fail(err); } finally { setVoiceBusy(false); }
      });
    } catch (err) { setError((err as Error).message); }
  };

  if (!data) return <section><p className="muted">{error || "…"}</p></section>;
  const sc = data.bench.find((b) => b.id === scenario) ?? data.bench[0];
  const jobSc = data.bench.find((b) => b.id === job?.scenario) ?? sc;
  const hasKey = Boolean(data.key);
  const models = [...new Set([...(data.key?.models ?? []), ...data.families.map((f) => f.id).filter((x): x is string => Boolean(x))])];
  const execFam = familyOf(executor);
  const takesEffort = !execFam || execFam.effort;
  const strip = [
    ...data.families.filter((f) => ["wonder", "spark"].includes(f.family) || f.id).map((f) => ({ key: f.family, name: f.name, id: f.id })),
    { key: "voice", name: "Muse Voice Transcribe", id: null },
    { key: "image", name: "Muse Image", id: null },
  ];
  const phaseIdx = job ? (job.phase === "done" ? (job.state.verdict ? 5 : job.state.candidate ? 4 : job.state.before ? 2 : 1) : ["plan", "baseline", "propose", "validate", "awaiting"].indexOf(job.phase === "dream" ? "plan" : job.phase)) : -1;
  const runs = (live.agent?.jobs ?? data.jobs).filter((j) => j.state.trace?.length);
  const skillsBy = (sid: string) => data.skills.filter((s) => s.scenario === sid);
  const verdict = job?.state.verdict;
  const candId = job?.state.candidate?.id;
  const delta = (s: Skill) => (s.verdict ? s.verdict.deltas[s.verdict.target] ?? 0 : 0);

  return (
    <section className="agent">
      <div className="agent-head">
        <div>
          <p className="kicker meta-k"><MetaMark size={20} /> {t(L.kicker)}</p>
          <h1 className="h1">{t(L.title)}</h1>
          <p className="lead">{t(L.lead)}</p>
        </div>
        <div className="fams" aria-label={t(L.families)}>
          <p className="muted small">{t(L.families)}</p>
          <ul>
            {strip.map((f) => (
              <li key={f.key} className={f.id ? "on" : ""}>
                <b>{f.name}</b>
                <span>{t(L.roles[f.key] ?? E("", ""))}</span>
                <em>{f.id ? `${t(L.available)} · ${f.id}` : f.key === "voice" || f.key === "image" ? t(L.tryIt) : t(L.notListed)}</em>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {!hasKey ? (
        <div className="runbox"><p className="muted">{t(L.needKey)}</p><button type="button" className="btn" onClick={() => go("brain")}>→</button></div>
      ) : (
        <div className="agent-grid">
          <div className="runbox agent-ctl">
            <p className="stepq"><span>1</span>{t(E("Who chooses what it practices?", "¿Quién elige qué practica?"))}</p>
            <div className="seg" role="tablist" aria-label={t(L.modeAuto)}>
              <button type="button" role="tab" aria-selected={auto} onClick={() => setAuto(true)} disabled={busy}>✦ {t(L.modeAuto)}</button>
              <button type="button" role="tab" aria-selected={!auto} onClick={() => setAuto(false)} disabled={busy}>{t(L.modeMine)}</button>
            </div>
            {auto && <p className="small muted">{t(L.autoLead)}</p>}
            {!auto && <>
            <label className="field">
              <span>{t(L.scenario)}</span>
              <div className="scen">
                {data.bench.filter((b) => !b.legacy).map((b) => (
                  <button key={b.id} type="button" aria-pressed={scenario === b.id} onClick={() => setScenario(b.id)} disabled={busy}>
                    <b>{b.title}{b.benchmark ? <span className="bm"> · {b.benchmark}</span> : null}</b>
                    <small>{b.contexts.map((c) => c.name).join(" · ")}</small>
                  </button>
                ))}
              </div>
            </label>
            {sc && <p className="small muted">{sc.task}</p>}
            <div className="two">
              <label className="field">
                <span>{t(L.planner)}</span>
                <select value={planner} onChange={(e) => setPlanner(e.target.value)} disabled={busy}>
                  {models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label className="field">
                <span>{t(L.executor)}</span>
                <select value={executor} onChange={(e) => setExecutor(e.target.value)} disabled={busy}>
                  {models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
            </div>
            {takesEffort && (
              <label className="field">
                <span>{t(L.effort)}</span>
                <div className="effort-pick" role="radiogroup" aria-label={t(L.effort)}>
                  {EFFORTS.map((e) => <button key={e} type="button" role="radio" aria-checked={effort === e} onClick={() => setEffort(e)}>{e}</button>)}
                </div>
              </label>
            )}
            </>}
            <p className="stepq"><span>2</span>{t(E("How much can it spend in this cycle?", "¿Cuánto puede gastar en esta corrida?"))}</p>
            <label className="field">
              <span>{t(L.cap)}</span>
              <input type="number" inputMode="decimal" min={0.05} max={20} step={0.05} value={cap} onChange={(e) => setCap(e.target.value)} disabled={busy} />
              <small className="fine">{t(L.capHelp)}</small>
            </label>
            <p className="stepq"><span>3</span>{t(E("Anything to tell it? (optional)", "¿Algo que decirle? (opcional)"))}</p>
            <label className="field">
              <span className="row between">
                {t(L.guidance)}
                <button type="button" className={`mic ${recorder.recording ? "rec" : ""}`} onClick={() => void dictate()} disabled={voiceBusy || busy}>
                  <Icon d={recorder.recording ? I.stop : I.mic} size={16} />
                  {voiceBusy ? t(L.transcribing) : recorder.recording ? t(L.stop) : t(L.speak)}
                </button>
              </span>
              <textarea rows={2} maxLength={500} value={guidance} onChange={(e) => setGuidance(e.target.value)} placeholder={t(L.guidancePh)} disabled={busy} />
            </label>
            <button type="button" className="btn" onClick={() => void start()} disabled={busy || !executor || !planner} aria-busy={busy}>
              {busy ? <span className="spin light" aria-hidden="true" /> : <Icon d={I.play} size={16} />}
              {busy ? t(L.running) : t(L.start)}
            </button>
            {!busy && <p className="fine">{t(E("What happens next: it takes an exam, studies its mistakes, writes a skill and tests it. You watch it live in the network below, and only you approve the result.", "Qué pasa después: presenta un examen, estudia sus errores, escribe una habilidad y la prueba. Lo ves en vivo en la red de abajo y solo tú apruebas el resultado."))}</p>}
            <p className="muted small">${data.budget.spent.toFixed(4)} / ${data.budget.monthly.toFixed(2)} {t(L.spent)}</p>
            {error && <p className="error" role="alert">{error}</p>}
          </div>

          <div className="cycle">
            {job && jobSc ? (
              <>
                <ol className="steps">
                  {L.phases.map((p, i) => (job.state.auto || i > 0) && (
                    <li key={p.id} className={i < phaseIdx ? "done" : i === phaseIdx ? (job.phase === "done" ? "done" : "now") : ""}>
                      <span className="sn">{i < phaseIdx || (i === phaseIdx && job.phase === "done") ? <Icon d={I.check} size={14} /> : job.state.auto ? i + 1 : i}</span>
                      <div><b>{t(p.t)}</b><small>{t(p.d)}</small></div>
                      {i === phaseIdx && RUNNING.includes(job.phase) && busy && <span className="spin" aria-hidden="true" />}
                    </li>
                  ))}
                </ol>
                <p className="small muted">{jobSc.title} · {job.planner} → {job.executor}{job.effort ? ` (${job.effort})` : ""} · ${Number(job.state.cost ?? 0).toFixed(4)}{job.state.maxCost ? ` / $${job.state.maxCost.toFixed(2)}` : ""} {t(L.cost)}</p>
                <div className="row gap" style={{ flexWrap: "wrap" }}>
                  <a className="btn small ghost" href="#corrida" onClick={(e) => { e.preventDefault(); document.getElementById("corrida")?.scrollIntoView({ behavior: "smooth" }); }}>{t(E("See it as a network", "Verla como red"))} ↓</a>
                  {RUNNING.includes(job.phase) && busy && <button type="button" className="btn small ghost" onClick={() => go("lab")}>{t(L.watch)} →</button>}
                </div>
                {job.state.plan && (
                  <div className="plan">
                    <p className="small"><b>✦ {t(L.planTitle)}:</b> {job.state.plan.why || "—"}{job.state.plan.estimate ? ` (≈ $${job.state.plan.estimate.toFixed(3)})` : ""}</p>
                    {job.state.plan.proposals.length > 0 && (
                      <>
                        <p className="small"><b>{t(L.proposals)}</b></p>
                        <ul>
                          {job.state.plan.proposals.map((p, i) => (
                            <li key={i}><span className="pill">{t(L.capability[p.capability] ?? E(p.capability, p.capability))}{p.model ? ` · ${p.model}` : ""}</span> {p.idea} <span className="muted">— {p.why}</span></li>
                          ))}
                        </ul>
                        <p className="fine">{t(L.proposalNote)}</p>
                      </>
                    )}
                  </div>
                )}
                {job.state.guidance && <p className="small">“{job.state.guidance}”</p>}
                {job.state.error && <p className="error">{job.state.error}</p>}
                {RUNNING.includes(job.phase) && !busy && <button type="button" className="btn small ghost" onClick={() => void resume()}>{t(L.resume)}</button>}

                {job.state.before && (
                  <div className="scores">
                    <Bars scores={job.state.before.validation} contexts={jobSc.contexts} label={`${t(L.before)} · ${t(L.validation)}`} />
                    {job.state.after && <Bars scores={job.state.after} contexts={jobSc.contexts} label={t(L.after)} />}
                  </div>
                )}

                {job.state.mistakes.length > 0 && !job.state.after && (
                  <details className="mist">
                    <summary>{t(L.mistakes)}</summary>
                    <ul>
                      {job.state.mistakes.map((m, i) => (
                        <li key={i}>
                          <code>{m.context}</code> {Object.entries(m.fields).map(([k, v]) => `${k}=${String(v)}`).join("; ")}
                          <span className="bad"> {t(L.said)} {m.given ?? "—"}</span> · <span className="good">{t(L.right)} {m.truth}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {job.state.candidate && (
                  <div className="cand">
                    <p className="row between"><b>{t(L.candidate)} v{job.state.candidate.version} {t(L.forCtx)} {jobSc.contexts.find((c) => c.id === job.state.candidate?.context)?.name}</b><span className="pill">{job.state.candidate.model}</span></p>
                    <Diff before={job.state.candidate.parentInstructions} after={job.state.candidate.instructions} />
                    <p className="small"><b>{t(L.why)}:</b> {job.state.candidate.rationale}</p>
                  </div>
                )}

                {verdict && (
                  <p className={`gate ${verdict.pass ? "pass" : "fail"}`}>
                    <Icon d={I.shield} size={18} />
                    {verdict.pass ? t(L.verdictPass) : verdict.reason === "regression" ? t(L.verdictRegression) : t(L.verdictNoGain)}
                  </p>
                )}
                {job.phase === "awaiting" && candId && (
                  <div className="decide">
                    <button type="button" className="btn small" onClick={() => void decide(candId, "approved")}><Icon d={I.check} size={16} />{t(L.approve)}</button>
                    <button type="button" className="btn small ghost" onClick={() => void decide(candId, "rejected")}><Icon d={I.x} size={16} />{t(L.reject)}</button>
                  </div>
                )}
                {job.phase === "done" && job.state.outcome && <p className={`decided ${job.state.outcome === "approved" ? "approved" : "rejected"}`}>{t(L.outcome[job.state.outcome] ?? E("", ""))}{job.state.detail ? ` (${job.state.detail})` : ""}</p>}
              </>
            ) : (
              <p className="empty">{t(L.lead)}</p>
            )}
          </div>
        </div>
      )}

      {hasKey && runs.length > 0 && job && (
        <div className="runs" id="corrida">
          <div className="runs-head">
            <div>
              <h2 className="h2">{t(E("Each cycle, as a network", "Cada corrida, como red"))}</h2>
              <p className="muted small">{t(E("Pick a cycle to see what it did step by step: which model it called, which tools it used, what each gave back and how much it spent.", "Elige una corrida para ver qué hizo paso a paso: a qué modelo llamó, qué herramientas usó, qué le devolvió cada una y cuánto gastó."))}</p>
            </div>
          </div>
          <ul className="runs-list" aria-label={t(E("Cycles", "Corridas"))}>
            {runs.slice(0, 12).map((r, i) => {
              const title = data.bench.find((b) => b.id === r.scenario)?.title ?? r.scenario;
              const state = RUNNING.includes(r.phase) && !r.state.error ? "live" : r.phase === "awaiting" ? "wait" : r.state.outcome === "approved" || r.state.outcome === "nothing-to-learn" ? "ok" : "bad";
              return (
                <li key={r.id}>
                  <button type="button" aria-pressed={job.id === r.id} onClick={() => setJob(r)} className={state}>
                    <b>#{runs.length - i} · {title}</b>
                    <small>{new Date(r.createdAt).toLocaleString(lang === "es" ? "es-MX" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${Number(r.state.cost ?? 0).toFixed(3)}</small>
                    <em>{state === "live" ? t(E("running", "en curso")) : state === "wait" ? t(E("waiting for you", "te espera")) : t(L.outcome[r.state.outcome ?? ""] ?? E("ended", "terminó")).split(/[.:]/)[0]}</em>
                  </button>
                </li>
              );
            })}
          </ul>
          <RunGraph key={job.id} job={job} bench={data.bench} lang={lang} />
        </div>
      )}

      {hasKey && sc && (
        <div className="agent-low">
          <div>
            <h2 className="h3">{t(L.skills)}</h2>
            <p className="muted small">{t(L.skillsLead)}</p>
            {data.bench.every((b) => skillsBy(b.id).length === 0) ? (
              <p className="empty">{t(L.noSkills)}</p>
            ) : (
              data.bench.filter((b) => skillsBy(b.id).length).map((b) => (
                <div key={b.id} className="skillset">
                  <h3>{b.title}</h3>
                  {skillsBy(b.id).map((s: Skill) => (
                    <article key={s.id} className={`skill ${s.status}`}>
                      <div className="row between">
                        <b>{b.contexts.find((c) => c.id === s.context)?.name} · v{s.version}</b>
                        <span className={`st ${s.status}`}>{t(L.status[s.status] ?? E("", ""))}</span>
                      </div>
                      <pre>{s.instructions}</pre>
                      {s.verdict && <p className="muted small">{delta(s) > 0 ? "+" : ""}{delta(s)} · {s.model}</p>}
                      {emblems[s.id] && <img className="emblem" src={emblems[s.id]} alt="" width={96} height={96} />}
                      {s.status === "active" && (
                        <div className="row gap">
                          <button type="button" className="link small" onClick={() => void emblem(s.id)}><Icon d={I.brush} size={14} /> {t(L.emblem)}</button>
                          <button type="button" className="link small" onClick={() => void retire(s.id)}>{t(L.retire)}</button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ))
            )}
          </div>
          <aside className="runbox">
            <h2 className="h3"><Icon d={I.lock} /> {t(L.exam)} · {sc.title}</h2>
            <p className="muted small">{t(L.examLead)}</p>
            <button type="button" className="btn small" onClick={() => void runExam()} disabled={examBusy || busy}>
              {examBusy && <span className="spin light" aria-hidden="true" />}{t(L.runExam)}
            </button>
            {exam?.bare && <Bars scores={exam.bare.scores} contexts={sc.contexts} label={t(L.bare)} />}
            {exam?.withSkills && <Bars scores={exam.withSkills.scores} contexts={sc.contexts} label={t(L.withSkills)} />}
            <p className="fine">{t(L.honest)}</p>
          </aside>
        </div>
      )}

      {hasKey && data.memory && <Memory client={client} memory={data.memory} bench={data.bench} lang={lang} onChange={load} />}
    </section>
  );
}
