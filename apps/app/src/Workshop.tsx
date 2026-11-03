// The workshop: watch the autonomous agent pick up each tool, one after another, to reach its goal.
// With a real improvement cycle it follows that cycle (what the exam runner scored, what the planner wrote, what the
// harness decided). Without one, a labeled illustration plays the same sequence so you can see how it works.
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentState, Api, Job, Scores } from "./api.js";
import type { Tab } from "./App.js";
import { useT, type Text } from "./i18n.js";

const E = (en: string, es: string): Text => ({ en, es });

type ToolId = "radar" | "planner" | "exam" | "skills" | "harness" | "human" | "voice";
const TOOLS: { id: ToolId; x: number; y: number; name: Text; does: Text; icon: string; color: string }[] = [
  { id: "radar", x: 11, y: 26, name: E("AI news radar", "Radar de noticias de IA"), does: E("reads what's new in AI", "lee lo nuevo en IA"), icon: "📡", color: "#ff6600" },
  { id: "voice", x: 30, y: 12, name: E("Muse Voice", "Voz de Muse"), does: E("hears your guidance", "escucha tu guía"), icon: "🎙", color: "#3ccf6e" },
  { id: "planner", x: 50, y: 9, name: E("Planner (Muse Wonder)", "Planificador (Muse Wonder)"), does: E("writes the new skill", "escribe la habilidad nueva"), icon: "✎", color: "#6d5ce8" },
  { id: "exam", x: 70, y: 12, name: E("Exam runner (Muse Spark)", "Ejecutor de exámenes (Muse Spark)"), does: E("takes the exam", "presenta el examen"), icon: "✓", color: "#0081fb" },
  { id: "skills", x: 89, y: 26, name: E("Skill library", "Biblioteca de habilidades"), does: E("keeps approved skills", "guarda las habilidades aprobadas"), icon: "◈", color: "#8a7dff" },
  { id: "harness", x: 24, y: 80, name: E("Harness", "Arnés"), does: E("checks and can say no", "revisa y puede decir que no"), icon: "⛨", color: "#22b864" },
  { id: "human", x: 76, y: 80, name: E("You", "Tú"), does: E("approve or reject", "aprueban o rechazan"), icon: "☺", color: "#ffa928" },
];
const POS = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

type Beat = { tool: ToolId; say: Text; log: Text; bad?: boolean };
const sum = (s?: Scores) => (s ? Object.values(s).reduce((a, b) => ({ correct: a.correct + b.correct, total: a.total + b.total }), { correct: 0, total: 0 }) : { correct: 0, total: 0 });
const frac = (s?: Scores) => { const { correct, total } = sum(s); return `${correct}/${total}`; };

/** The beats of a real cycle, from what its state says has happened so far. */
function realBeats(job: Job): Beat[] {
  const b: Beat[] = [];
  const st = job.state;
  if (st.guidance) b.push({ tool: "voice", say: E("Your guidance reached the planner.", "Tu guía llegó al planificador."), log: E(`Guidance: “${st.guidance}”`, `Guía: «${st.guidance}»`) });
  b.push({ tool: "exam", say: E("First I take the exam to know where I stand.", "Primero presento el examen para saber dónde estoy."), log: E("Exam runner: baseline measured", "Ejecutor de exámenes: línea base medida") });
  if (st.before) b[b.length - 1] = { tool: "exam", say: E(`Baseline: ${frac(st.before.validation)} right on validation.`, `Línea base: ${frac(st.before.validation)} bien en validación.`), log: E(`Exam runner: baseline ${frac(st.before.validation)} (validation)`, `Ejecutor de exámenes: línea base ${frac(st.before.validation)} (validación)`) };
  if (st.candidate) {
    b.push({ tool: "planner", say: E(`I wrote skill v${st.candidate.version} for “${st.candidate.context}”.`, `Escribí la habilidad v${st.candidate.version} para «${st.candidate.context}».`), log: E(`Planner: wrote skill v${st.candidate.version} from ${st.mistakes.length} practice mistakes`, `Planificador: escribió la habilidad v${st.candidate.version} con base en ${st.mistakes.length} errores de práctica`) });
    b.push({ tool: "skills", say: E("I filed it in the library as a candidate.", "La guardé en la biblioteca como candidata."), log: E("Skill library: candidate saved (not active yet)", "Biblioteca de habilidades: candidata guardada (aún no activa)") });
  }
  if (st.after) b.push({ tool: "exam", say: E(`With the new skill: ${frac(st.after)}.`, `Con la habilidad nueva: ${frac(st.after)}.`), log: E(`Exam runner: with the candidate ${frac(st.after)}`, `Ejecutor de exámenes: con la candidata ${frac(st.after)}`) });
  if (st.verdict) {
    const ok = st.verdict.pass;
    b.push({ tool: "harness", bad: !ok, say: ok ? E("The harness passed it.", "El arnés la dejó pasar.") : E("The harness blocked it.", "El arnés la bloqueó."), log: ok ? E("Harness: improves and breaks nothing → passes to a person", "Arnés: mejora y no rompe nada → pasa a una persona") : E(`Harness: blocked (${st.verdict.reason})`, `Arnés: bloqueó (${st.verdict.reason})`) });
  }
  if (job.phase === "awaiting") b.push({ tool: "human", say: E("Waiting for your decision.", "Esperando tu decisión."), log: E("You: approve or reject", "Tú: aprueba o rechaza") });
  if (job.phase === "done" && st.outcome === "approved") b.push({ tool: "human", say: E("Approved: the skill is active.", "Aprobada: la habilidad quedó activa."), log: E("You approved it → active in the library", "La aprobaste → activa en la biblioteca") });
  if (job.phase === "done" && st.outcome === "rejected") b.push({ tool: "human", bad: true, say: E("Rejected: nothing changes.", "Rechazada: nada cambia."), log: E("You rejected it → nothing changes", "La rechazaste → nada cambia") });
  return b;
}

/** An illustrated cycle, clearly labeled as such. */
const DEMO: Beat[] = [
  { tool: "radar", say: E("Reading what the community discusses, for ideas.", "Leyendo lo que comenta la comunidad, para buscar ideas."), log: E("Radar: “tree search” → experiment", "Radar: «búsqueda en árbol» → experimentar") },
  { tool: "voice", say: E("You told me: focus on card payments.", "Me dijiste: enfócate en pagos con tarjeta."), log: E("Muse Voice: guidance transcribed", "Voz de Muse: guía transcrita") },
  { tool: "exam", say: E("Taking the exam: 26 of 40 right.", "Presentando el examen: 26 de 40 bien."), log: E("Exam runner: baseline 26/40", "Ejecutor de exámenes: línea base 26/40") },
  { tool: "planner", say: E("Writing a skill for the card-payment mistakes.", "Escribiendo una habilidad para los errores de pagos con tarjeta."), log: E("Planner: skill v2 written", "Planificador: habilidad v2 escrita") },
  { tool: "skills", say: E("Filing it as a candidate.", "Guardándola como candidata."), log: E("Skill library: candidate saved", "Biblioteca de habilidades: candidata guardada") },
  { tool: "exam", say: E("Exam again with the skill: 31 of 40.", "Examen otra vez con la habilidad: 31 de 40."), log: E("Exam runner: with the candidate 31/40", "Ejecutor de exámenes: con la candidata 31/40") },
  { tool: "harness", say: E("Harness: better and nothing broke.", "Arnés: mejor y nada se rompió."), log: E("Harness: passes to a person", "Arnés: pasa a una persona") },
  { tool: "human", say: E("Your turn: approve it?", "Tu turno: ¿la apruebas?"), log: E("You: approve or reject", "Tú: aprueba o rechaza") },
];

export function Workshop({ client, go }: { client: Api; go: (t: Tab) => void }) {
  const t = useT();
  const [data, setData] = useState<AgentState | null>(null);
  const [mode, setMode] = useState<"real" | "demo">("demo");
  const [demoAt, setDemoAt] = useState(0);
  const [seen, setSeen] = useState(0);
  const timer = useRef(0);

  const load = useCallback(async () => {
    try { const d = await client.agent(); setData(d); return d; } catch { return null; }
  }, [client]);
  useEffect(() => {
    void load().then((d) => { if (d?.jobs.length) setMode("real"); });
  }, [load]);
  const job = data?.jobs[0] ?? null;
  const running = Boolean(job && (job.phase === "baseline" || job.phase === "propose" || job.phase === "validate"));
  useEffect(() => {
    if (mode !== "real" || !running) return;
    const id = setInterval(() => void load(), 3500);
    return () => clearInterval(id);
  }, [mode, running, load]);

  const beats = mode === "real" && job ? realBeats(job) : DEMO;
  // the demo reveals one beat at a time; a real cycle shows everything it has reached, one beat at a time on first view
  useEffect(() => {
    clearInterval(timer.current);
    setSeen(0); setDemoAt(0);
    timer.current = window.setInterval(() => {
      setDemoAt((n) => { if (n >= beats.length - 1) { clearInterval(timer.current); return n; } return n + 1; });
    }, 3400);
    return () => clearInterval(timer.current);
  }, [mode, job?.id, job?.phase, beats.length]);
  useEffect(() => setSeen(demoAt), [demoAt]);

  const cur = beats[Math.min(seen, beats.length - 1)];
  const active = cur ? POS[cur.tool] : null;
  const sc = data?.bench.find((b) => b.id === job?.scenario);
  const goal = mode === "real" && sc
    ? E(`Raise the validation score of “${sc.title}” without breaking anything.`, `Subir la calificación de validación de «${sc.title}» sin romper nada.`)
    : E("Raise the validation score without breaking anything that already worked.", "Subir la calificación de validación sin romper nada de lo que ya funcionaba.");

  return (
    <section className="workshop">
      <div className="agent-head">
        <p className="kicker">{t(E("Workshop", "Taller"))}</p>
        <h1 className="h2">{t(E("Watch the agent work its tools", "Mira al agente usar sus herramientas"))}</h1>
        <p className="lead">{t(E("Each tool lights up when the agent picks it up. Follow its latest real cycle, or play an illustrated one.", "Cada herramienta se enciende cuando el agente la toma. Sigue su último ciclo real o reproduce uno ilustrado."))}</p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="button" className={`btn small${mode === "real" ? "" : " ghost"}`} disabled={!job} onClick={() => setMode("real")}>{t(E("Follow my latest cycle", "Seguir mi último ciclo"))}</button>
          <button type="button" className={`btn small${mode === "demo" ? "" : " ghost"}`} onClick={() => { setMode("demo"); setDemoAt(0); }}>{t(E("Play an illustration", "Reproducir una ilustración"))}</button>
          {!job && <button type="button" className="btn small ghost" onClick={() => go("agent")}>{t(E("Start a real cycle", "Iniciar un ciclo real"))}</button>}
        </div>
      </div>
      <div className="wbench" aria-label={t(E("The workshop", "El taller"))}>
        <svg className="wlines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {active && <line x1={50} y1={50} x2={active.x} y2={active.y + 6} stroke={active.color} strokeWidth="0.6" strokeDasharray="1.6 1.6" />}
        </svg>
        {TOOLS.map((tl) => {
          const used = beats.slice(0, seen + 1).some((b) => b.tool === tl.id);
          const on = cur?.tool === tl.id;
          return (
            <div key={tl.id} className={`wtool${on ? " on" : ""}${used ? " used" : ""}`} style={{ left: `${tl.x}%`, top: `${tl.y}%`, ["--c" as string]: tl.color }}>
              <i aria-hidden="true">{tl.icon}</i>
              <b>{t(tl.name)}</b>
              <small>{t(tl.does)}</small>
            </div>
          );
        })}
        <div className="wagent" style={{ left: `${active ? 50 + (active.x - 50) * 0.55 : 50}%`, top: `${active ? 50 + (active.y - 50) * 0.5 : 50}%` }}>
          {cur && <p className={`wsay${cur.bad ? " bad" : ""}`} aria-live="polite">{t(cur.say)}</p>}
          <img src={cur?.bad ? "/img/agent-alert.webp" : "/img/agent-ok.webp"} alt="" width={96} height={144} />
        </div>
        {mode === "demo" && <span className="wtag">{t(E("Illustration, not a real result", "Ilustración, no es un resultado real"))}</span>}
      </div>
      <div className="wlog">
        <p className="small"><b>{t(E("Goal", "Objetivo"))}:</b> {t(goal)}</p>
        <ol>
          {beats.slice(0, seen + 1).map((b, i) => (
            <li key={i} className={`${i === seen ? "now" : ""}${b.bad ? " bad" : ""}`}><span style={{ ["--c" as string]: POS[b.tool]?.color }}>{POS[b.tool]?.icon}</span>{t(b.log)}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}
