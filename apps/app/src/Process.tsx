// The agent's process, the default way to watch it work: a TL;DR of what it did in a cycle, the decisions it made
// (highlighted, not hidden), exactly what you are asked to approve, and its thinking step by step with what each step
// used (models, lessons from memory, mistakes it studied). The 3D lab is the alternative view of the same cycle.
//
// Every change it can make carries a tag that says what kind of change it is: a new skill or an update to one (text
// instructions it reads), a change to its own code (its core, behind a judge, in "Its code"), or a new tool it asks
// for (only a proposal: nothing switches on without a person).
import { useEffect, useMemo, useState } from "react";
import type { Api, BenchScenario, EvolveRun, Job, Memory, Scores, Skill, TraceEntry } from "./api.js";
import type { Tab } from "./App.js";
import { savedCap } from "./Companion.js";
import { useT, type Lang, type Text } from "./i18n.js";
import { Lab3D } from "./Lab3D.js";
import { useLive } from "./live.js";
import { RunGraph } from "./RunGraph.js";
import { E, isRunning, nextUp, say, toolOf } from "./story.js";
import { mtJob, MtStatus, useMt } from "./translate.js";

/* ---------------------------------------------------------------- the kind of change */

export type ChangeKind = "skill" | "skill-update" | "code" | "tool";
const KIND: Record<ChangeKind, { label: Text; icon: string; hint: Text }> = {
  skill: {
    label: E("New skill", "Nueva habilidad"), icon: "◈",
    hint: E("Written instructions it reads before answering. Its code doesn't change.", "Instrucciones escritas que lee antes de contestar. Su código no cambia."),
  },
  "skill-update": {
    label: E("Skill update", "Mejora de habilidad"), icon: "◈",
    hint: E("A new version of a skill it already had; the old one stays saved.", "Una versión nueva de una habilidad que ya tenía; la anterior queda guardada."),
  },
  code: {
    label: E("Code change", "Cambio de código"), icon: "{}",
    hint: E("Real code: it rewrites its own core, and a judge adopts it only if it scores higher.", "Código real: reescribe su propio núcleo y un juez lo adopta solo si saca más."),
  },
  tool: {
    label: E("New tool", "Nueva herramienta"), icon: "⚒",
    hint: E("A new ability it asks for (search the web, see images…). Only a proposal.", "Una capacidad nueva que pide (buscar en la web, ver imágenes…). Solo es una propuesta."),
  },
};
export const skillKind = (s: { parentInstructions?: string | null; parentId?: string | null; version: number }): ChangeKind =>
  s.parentInstructions || s.parentId || s.version > 1 ? "skill-update" : "skill";

export function ChangeTag({ kind, extra }: { kind: ChangeKind; extra?: string }) {
  const t = useT();
  const k = KIND[kind];
  return (
    <span className={`ctag ctag-${kind}`} title={t(k.hint)}>
      <i aria-hidden="true">{k.icon}</i>
      {t(k.label)}
      {extra ? <em>· {extra}</em> : null}
    </span>
  );
}

const CAPABILITY: Record<string, Text> = {
  vision: E("See images", "Ver imágenes"), image: E("Draw", "Dibujar"), voice: E("Listen", "Escuchar"),
  code: E("Change its code", "Cambiar su código"), web: E("Search the web", "Buscar en la web"), memory: E("Remember more", "Recordar más"),
};
const capName = (c: string) => CAPABILITY[c] ?? E(c, c);

/* ---------------------------------------------------------------- small shared parts */

const fmt = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const sum = (s?: Scores) => Object.values(s ?? {}).reduce((a, b) => ({ correct: a.correct + b.correct, total: a.total + b.total }), { correct: 0, total: 0 });
const frac = (s?: { correct: number; total: number }) => (s && s.total ? `${s.correct}/${s.total}` : "—");
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function Diff({ before, after }: { before: string | null; after: string }) {
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

/* ---------------------------------------------------------------- the TL;DR */

type Tone = "live" | "wait" | "ok" | "bad" | "neutral";
type Item = { icon: string; color: string; text: string; decision?: boolean; tag?: { kind: ChangeKind; extra?: string } };
export type Summary = { headline: string; tone: Tone; items: Item[]; cost: string };

/** What it did in one cycle, in a few plain lines, built only from the cycle's own state. Exported for tests. */
export function summarize(job: Job, sc: BenchScenario | undefined, tr: (x: Text) => string): Summary {
  const s = job.state;
  const ctx = (id: string) => sc?.contexts.find((c) => c.id === id)?.name ?? id;
  const exam = sc ? `${sc.title}${sc.benchmark ? ` (${sc.benchmark})` : ""}` : job.scenario;
  const items: Item[] = [];
  const trace = s.trace ?? [];
  const cand = s.candidate;
  const verdict = s.verdict;

  if (s.dream) items.push({ icon: "☾", color: "#4f5bd5", text: tr(E(`Dreamt about ${s.dream.jobs} finished cycles: ${s.dream.summary}`, `Soñó con ${s.dream.jobs} ciclos terminados: ${s.dream.summary}`)) });
  const recalled = new Set(trace.filter((e) => e.tool === "memory").flatMap((e) => e.ids ?? []));
  const recalledN = recalled.size || trace.filter((e) => e.tool === "memory").reduce((a, e) => a + (Number(e.note) || 0), 0);
  if (recalledN) items.push({ icon: "◎", color: "#7a6cf0", text: tr(E(`Remembered ${recalledN} lesson${recalledN === 1 ? "" : "s"} from earlier cycles.`, `Recordó ${recalledN} lección${recalledN === 1 ? "" : "es"} de ciclos anteriores.`)) });

  if (s.plan) {
    items.push({
      icon: "✦", color: "#6d5ce8", decision: true,
      text: tr(E(`Chose to practice ${exam} with ${job.executor}${job.effort ? ` (${job.effort})` : ""}. ${s.plan.why}`, `Eligió practicar ${exam} con ${job.executor}${job.effort ? ` (${job.effort})` : ""}. ${s.plan.why}`)),
    });
  } else if (trace[0]?.tool === "human") {
    items.push({ icon: "☺", color: "#e8a200", text: tr(E(`You chose ${exam} with ${job.executor}.`, `Tú elegiste ${exam} con ${job.executor}.`)) });
  }

  if (s.before) {
    const v = sum(s.before.validation);
    const p = sum(s.before.practice);
    const wrong = p.total - p.correct;
    const per = Object.entries(s.before.validation).map(([c, x]) => `${ctx(c)} ${frac(x)}`).join(" · ");
    items.push({
      icon: "✓", color: "#0081fb",
      text: tr(E(
        `First exam: ${frac(v)} on validation (${per}).${wrong ? ` It got ${wrong} practice question${wrong === 1 ? "" : "s"} wrong: that's what it studies.` : ""}`,
        `Primer examen: ${frac(v)} en validación (${per}).${wrong ? ` Falló ${wrong} pregunta${wrong === 1 ? "" : "s"} de práctica: eso es lo que estudia.` : ""}`,
      )),
    });
  }

  if (cand) {
    const kind = skillKind(cand);
    items.push({
      icon: "✎", color: "#9b5de5", decision: true, tag: { kind, extra: `v${cand.version}` },
      text: tr(E(
        `Wrote ${kind === "skill" ? "its first skill" : `version ${cand.version} of its skill`} for “${ctx(cand.context)}”: ${cand.rationale}`,
        `Escribió ${kind === "skill" ? "su primera habilidad" : `la versión ${cand.version} de su habilidad`} para «${ctx(cand.context)}»: ${cand.rationale}`,
      )),
    });
  }

  if (s.after && s.before) {
    const before = s.before.validation;
    const per = Object.keys({ ...before, ...s.after }).map((c) => `${ctx(c)} ${frac(before[c])} → ${frac(s.after?.[c])}`).join(" · ");
    items.push({ icon: "✓", color: "#0081fb", text: tr(E(`Exam again with the new skill: ${per}.`, `Examen de nuevo con la habilidad: ${per}.`)) });
  }

  if (verdict) {
    const gain = verdict.deltas[verdict.target] ?? 0;
    items.push({
      icon: "⛨", color: verdict.pass ? "#22b864" : "#c42d12", decision: true,
      text: verdict.pass
        ? tr(E(`The harness let it through: ${signed(gain)} in “${ctx(verdict.target)}” (it needed +${verdict.needed}) and nothing else got worse.`, `El arnés la dejó pasar: ${signed(gain)} en «${ctx(verdict.target)}» (necesitaba +${verdict.needed}) y nada más empeoró.`))
        : verdict.reason === "regression"
          ? tr(E("The harness threw it out: it made another situation worse.", "El arnés la descartó: empeoró otra situación."))
          : tr(E(`The harness threw it out: ${signed(gain)} in “${ctx(verdict.target)}”, it needed +${verdict.needed}.`, `El arnés la descartó: ${signed(gain)} en «${ctx(verdict.target)}», necesitaba +${verdict.needed}.`)),
    });
  }

  for (const p of s.plan?.proposals ?? []) {
    items.push({
      icon: "⚒", color: "#b58100", tag: { kind: "tool", extra: tr(capName(p.capability)) },
      text: tr(E(`Asked for a new tool: ${p.idea}${p.why ? ` — ${p.why}` : ""} (only a proposal).`, `Pidió una herramienta nueva: ${p.idea}${p.why ? ` — ${p.why}` : ""} (solo es una propuesta).`)),
    });
  }

  const cost = `${fmt(Number(s.cost ?? 0))}${typeof s.maxCost === "number" ? ` / ${fmt(s.maxCost)}` : ""}`;
  let headline: string;
  let tone: Tone;
  const target = cand ? ctx(cand.context) : "";
  if (s.error) {
    headline = tr(E(`It stopped with an error: ${s.error}`, `Se detuvo por un error: ${s.error}`));
    tone = "bad";
  } else if (isRunning(job)) {
    const up = nextUp(job);
    headline = up ? tr(up.text) : tr(E("Working…", "Trabajando…"));
    tone = "live";
  } else if (job.phase === "awaiting" && verdict && cand) {
    const b = verdict.before[cand.context];
    const a = verdict.after[cand.context];
    headline = tr(E(
      `It wrote a skill that takes “${target}” from ${frac(b)} to ${frac(a)} without making anything worse. It's waiting for your decision.`,
      `Escribió una habilidad que sube «${target}» de ${frac(b)} a ${frac(a)} sin empeorar nada. Espera tu decisión.`,
    ));
    tone = "wait";
  } else {
    const o = s.outcome;
    const text: Record<string, Text> = {
      "nothing-to-learn": E("Perfect score: there was nothing to learn, so nothing changed.", "Calificación perfecta: no había nada que aprender, así que no cambió nada."),
      "planner-failed": E("The skill it wrote couldn't be read. Nothing changed.", "La habilidad que escribió no se pudo leer. No cambió nada."),
      "harness-rejected": E("It tried a new skill but the harness threw it out. Nothing changed.", "Probó una habilidad nueva pero el arnés la descartó. No cambió nada."),
      approved: E(`Approved: it now uses v${cand?.version ?? "?"} of its skill for “${target}”.`, `Aprobada: ya usa la v${cand?.version ?? "?"} de su habilidad para «${target}».`),
      rejected: E("You rejected the skill. Nothing changed.", "Rechazaste la habilidad. No cambió nada."),
      "run-budget": E("It reached this cycle's spending cap and stopped cleanly. Nothing changed.", "Llegó al tope de gasto del ciclo y se detuvo limpio. No cambió nada."),
    };
    headline = tr(text[o ?? ""] ?? E("This cycle ended.", "Este ciclo terminó."));
    tone = o === "approved" || o === "nothing-to-learn" ? "ok" : o === "rejected" ? "neutral" : "bad";
  }
  return { headline, tone, items, cost };
}

export function Tldr({ job, sc, compact }: { job: Job; sc: BenchScenario | undefined; compact?: boolean }) {
  const t = useT();
  const s = summarize(job, sc, t);
  const items = compact ? s.items.filter((i) => i.decision || i.tag) : s.items;
  return (
    <div className={`tldr ${s.tone}`} role="region" aria-label="TL;DR">
      <p className="tldr-k">
        <span>TL;DR</span>
        {s.tone === "live" && <span className="spin" aria-hidden="true" />}
        <em>{s.cost}</em>
      </p>
      <p className="tldr-h">{s.headline}</p>
      {items.length > 0 && (
        <ol className="tldr-list">
          {items.map((it, i) => (
            <li key={i} className={it.decision ? "decision" : ""} style={{ ["--c" as string]: it.color }}>
              <span className="ico" aria-hidden="true">{it.icon}</span>
              <span>
                {(it.decision || it.tag) && (
                  <span className="tldr-tags">
                    {it.decision && <b className="dtag">{t(E("Decided", "Decidió"))}</b>}
                    {it.tag && <ChangeTag kind={it.tag.kind} extra={it.tag.extra} />}
                  </span>
                )}
                {it.text}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- what you approve */

/** `job` may come translated for reading; `raw` is the same cycle as the agent wrote it, so you can see the original. */
export function Approval({ job, raw, sc, onDecide }: { job: Job; raw?: Job; sc: BenchScenario | undefined; onDecide: (skillId: string, d: "approved" | "rejected") => Promise<void> }) {
  const t = useT();
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);
  const cand = job.state.candidate;
  const verdict = job.state.verdict;
  if (job.phase !== "awaiting" || !cand || !verdict) return null;
  const ctx = (id: string) => sc?.contexts.find((c) => c.id === id)?.name ?? id;
  const kind = skillKind(cand);
  const exam = sc?.title ?? job.scenario;
  const decide = async (d: "approved" | "rejected") => {
    setBusy(d);
    try { await onDecide(cand.id, d); } finally { setBusy(null); }
  };
  const contexts = Object.keys({ ...verdict.before, ...verdict.after });
  return (
    <div className="approve" id="aprobar">
      <div className="approve-h">
        <ChangeTag kind={kind} extra={`v${cand.version}`} />
        <h2 className="h3">{t(E("What you're approving", "Lo que estás aprobando"))}</h2>
      </div>
      <p>
        {t(E(
          `If you approve, Agentztein will read the instructions below every time it answers ${exam} in the situation “${ctx(cand.context)}”.`,
          `Si apruebas, Agentztein leerá las instrucciones de abajo cada vez que conteste ${exam} en la situación «${ctx(cand.context)}».`,
        ))}{" "}
        {kind === "skill-update"
          ? t(E(`It replaces v${cand.version - 1}, which stays saved.`, `Reemplaza a la v${cand.version - 1}, que queda guardada.`))
          : t(E("It's its first skill for that situation.", "Es su primera habilidad para esa situación."))}{" "}
        {t(E("It doesn't change its code or Meta's models, and you can retire it whenever you want.", "No cambia su código ni los modelos de Meta, y puedes retirarla cuando quieras."))}
      </p>

      <div className="evidence">
        <p className="small"><b>{t(E("The evidence", "La evidencia"))}</b> · {t(E("validation exam, answers hidden from the model", "examen de validación, respuestas ocultas al modelo"))}</p>
        <table>
          <thead>
            <tr><th>{t(E("Situation", "Situación"))}</th><th>{t(E("Before", "Antes"))}</th><th>{t(E("With it", "Con ella"))}</th><th>{t(E("Change", "Cambio"))}</th></tr>
          </thead>
          <tbody>
            {contexts.map((c) => {
              const d = verdict.deltas[c] ?? 0;
              return (
                <tr key={c} className={c === verdict.target ? "target" : ""}>
                  <td>{ctx(c)}{c === verdict.target && <span className="pill">{t(E("its target", "su objetivo"))}</span>}</td>
                  <td>{frac(verdict.before[c])}</td>
                  <td>{frac(verdict.after[c])}</td>
                  <td><span className={`delta ${d > 0 ? "up" : d < 0 ? "down" : ""}`}>{signed(d)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="fine">{t(E(
          `Harness rule: at least +${verdict.needed} in its target and no other situation down by more than 1. It passed.`,
          `Regla del arnés: al menos +${verdict.needed} en su objetivo y ninguna otra situación baja más de 1. La pasó.`,
        ))}</p>
      </div>

      <div>
        <p className="small"><b>{t(E("The skill, word for word", "La habilidad, palabra por palabra"))}</b>{kind === "skill-update" ? ` · ${t(E("green is new, struck out is removed", "lo verde es nuevo, lo tachado se quita"))}` : ""}</p>
        <Diff before={cand.parentInstructions} after={cand.instructions} />
        {raw?.state.candidate && raw.state.candidate.instructions !== cand.instructions && (
          <details className="orig">
            <summary className="fine">{t(E("Translated so you can read it; the agent uses it in its original words. See the original", "Traducida para que la leas; el agente la usa con sus palabras originales. Ver el original"))}</summary>
            <Diff before={raw.state.candidate.parentInstructions} after={raw.state.candidate.instructions} />
          </details>
        )}
      </div>
      <p className="small"><b>{t(E("Why it wrote it", "Por qué la escribió"))}:</b> {cand.rationale}</p>

      <div className="approve-btns">
        <button type="button" className="btn" onClick={() => void decide("approved")} disabled={busy !== null}>
          {busy === "approved" ? <span className="spin light" aria-hidden="true" /> : "✓"} {t(E("Approve: start using it", "Aprobar: que la empiece a usar"))}
        </button>
        <button type="button" className="btn ghost" onClick={() => void decide("rejected")} disabled={busy !== null}>
          {busy === "rejected" ? <span className="spin" aria-hidden="true" /> : "✕"} {t(E("Reject", "Rechazar"))}
        </button>
        <p className="fine">{t(E("If you reject it, nothing changes: it stays saved as rejected.", "Si la rechazas, no cambia nada: queda guardada como rechazada."))}</p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- its thinking, step by step */

type Group = { e: TraceEntry; n: number; cost: number; ms: number; tokens: number };
/** Consecutive calls of the same tool in the same phase (an exam in batches) read as one step. */
function group(trace: TraceEntry[]): Group[] {
  const out: Group[] = [];
  for (const e of trace) {
    const last = out.at(-1);
    if (last && e.tool === "exam" && last.e.tool === "exam" && last.e.phase === e.phase) {
      last.n += 1; last.cost += Number(e.cost ?? 0); last.ms += Number(e.ms ?? 0); last.tokens += Number(e.tokens ?? 0);
    } else out.push({ e, n: 1, cost: Number(e.cost ?? 0), ms: Number(e.ms ?? 0), tokens: Number(e.tokens ?? 0) });
  }
  return out;
}
const DECISION = (e: TraceEntry) => (e.tool === "director" && e.note !== "handed-over") || e.tool === "planner" || e.tool === "harness" || (e.tool === "human" && e.note === "waiting");

function Thinking({ job, sc, memories }: { job: Job; sc: BenchScenario | undefined; memories: Memory[] }) {
  const t = useT();
  const s = job.state;
  const ctx = (id: string) => sc?.contexts.find((c) => c.id === id)?.name ?? id;
  const groups = group(s.trace ?? []);
  const running = isRunning(job);
  const up = running ? nextUp(job) : null;
  const lesson = (id: string) => memories.find((m) => m.id === id);

  const detail = (g: Group) => {
    const e = g.e;
    switch (e.tool) {
      case "director":
        if (e.note === "handed-over" || !s.plan) return null;
        return (
          <div className="th-detail">
            <p><b>{t(E("Its reasoning", "Su razonamiento"))}:</b> {s.plan.why}</p>
            {s.plan.steps.some((x) => x.why) && (
              <>
                <p><b>{t(E("Its plan", "Su plan"))}</b></p>
                <ol>{s.plan.steps.map((x, i) => <li key={i}><b>{t(toolOf(x.tool).name)}</b>{x.why ? ` — ${x.why}` : ""}</li>)}</ol>
              </>
            )}
            {s.plan.fixes.length > 0 && <p className="fine">{t(E(`The server corrected part of its answer (${s.plan.fixes.join(", ")}) to keep it within the rules and the cap.`, `El servidor corrigió parte de su respuesta (${s.plan.fixes.join(", ")}) para mantenerla dentro de las reglas y el tope.`))}</p>}
            {s.plan.proposals.map((p, i) => (
              <p key={i} className="th-prop"><ChangeTag kind="tool" extra={t(capName(p.capability))} /> {p.idea} <span className="muted">— {p.why}</span></p>
            ))}
          </div>
        );
      case "memory": {
        const ids = e.ids ?? [];
        if (!ids.length) return <div className="th-detail"><p className="fine">{t(E("(this cycle only recorded how many it recalled)", "(este ciclo solo guardó cuántas recordó)"))}</p></div>;
        return (
          <div className="th-detail">
            <ul className="th-mem">
              {ids.map((id) => {
                const m = lesson(id);
                return <li key={id}>{m ? <><span className="pill">{m.kind}</span> {m.text}</> : <span className="muted">{t(E("a lesson that is no longer active", "una lección que ya no está activa"))}</span>}</li>;
              })}
            </ul>
          </div>
        );
      }
      case "dream":
        return s.dream ? (
          <div className="th-detail">
            <p>{s.dream.summary}</p>
            <p className="fine">{t(E(`+${s.dream.stats.added} new · ${s.dream.stats.rewritten} rewritten · ${s.dream.stats.strengthened} strengthened · ${s.dream.stats.faded} faded`, `+${s.dream.stats.added} nuevas · ${s.dream.stats.rewritten} reescritas · ${s.dream.stats.strengthened} reforzadas · ${s.dream.stats.faded} olvidadas`))}</p>
          </div>
        ) : null;
      case "grader": {
        const scores = e.phase === "validate" ? s.after : s.before?.validation;
        if (!scores) return null;
        return <div className="th-detail"><p>{Object.entries(scores).map(([c, x]) => `${ctx(c)}: ${frac(x)}`).join(" · ")}</p></div>;
      }
      case "planner":
        return s.mistakes.length ? (
          <div className="th-detail">
            <p><b>{t(E("Mistakes it studied", "Errores que estudió"))}</b></p>
            <ul className="th-mist">
              {s.mistakes.slice(0, 5).map((m, i) => (
                <li key={i}>
                  <code>{ctx(m.context)}</code> {Object.entries(m.fields).slice(0, 4).map(([k, v]) => `${k}=${String(v)}`).join("; ")}
                  <span className="bad"> {t(E("said", "dijo"))} {m.given ?? "—"}</span> · <span className="good">{t(E("right", "correcta"))} {m.truth}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null;
      case "library":
        return s.candidate ? (
          <div className="th-detail">
            <p className="th-prop"><ChangeTag kind={skillKind(s.candidate)} extra={`v${s.candidate.version}`} /> {t(E(`for “${ctx(s.candidate.context)}”`, `para «${ctx(s.candidate.context)}»`))}</p>
            <p>{s.candidate.rationale}</p>
          </div>
        ) : null;
      case "harness":
        return s.verdict ? (
          <div className="th-detail">
            <p>{Object.entries(s.verdict.deltas).map(([c, d]) => `${ctx(c)} ${signed(d)}`).join(" · ")} · {t(E(`needed +${s.verdict.needed} in its target`, `necesitaba +${s.verdict.needed} en su objetivo`))}</p>
          </div>
        ) : null;
      case "human":
        return e.note === "waiting" ? <div className="th-detail"><a className="link small" href="#aprobar">{t(E("See what you're approving ↑", "Ver lo que estás aprobando ↑"))}</a></div> : null;
      default:
        return null;
    }
  };

  return (
    <div className="think">
      <h2 className="h3">{t(E("Its thinking, step by step", "Su pensamiento, paso a paso"))}</h2>
      <p className="muted small">{t(E("Highlighted steps are decisions it made. Open any step to see what it used.", "Los pasos resaltados son decisiones que tomó. Abre cualquier paso para ver qué usó."))}</p>
      <ol className="th-list">
        {groups.map((g, i) => {
          const tl = toolOf(g.e.tool);
          const d = detail(g);
          const dec = DECISION(g.e);
          const bad = g.e.tool === "harness" && g.e.note !== "improves";
          const head = (
            <>
              <span className="ico" aria-hidden="true">{tl.icon}</span>
              <span className="th-text">
                {dec && <b className={`dtag${bad ? " bad" : ""}`}>{g.e.tool === "human" ? t(E("Your turn", "Te toca")) : t(E("Decision", "Decisión"))}</b>}
                {t(say(g.e, job))}
                <small>
                  {t(tl.name)}
                  {g.n > 1 ? ` · ${t(E(`${g.n} calls`, `${g.n} llamadas`))}` : ""}
                  {g.e.model ? ` · ${g.e.model}` : ""}
                  {g.cost ? ` · ${fmt(g.cost)}` : ""}
                  {g.ms ? ` · ${(g.ms / 1000).toFixed(1)} s` : ""}
                  {g.tokens ? ` · ${g.tokens.toLocaleString()} tokens` : ""}
                </small>
              </span>
            </>
          );
          return (
            <li key={i} className={`${dec ? "decision" : ""}${bad ? " bad" : ""}`} style={{ ["--c" as string]: tl.color }}>
              {d ? (
                <details open={dec}>
                  <summary>{head}</summary>
                  {d}
                </details>
              ) : <div className="th-row">{head}</div>}
            </li>
          );
        })}
        {up && (
          <li className="now" style={{ ["--c" as string]: toolOf(up.tool).color }}>
            <div className="th-row">
              <span className="ico" aria-hidden="true"><span className="spin light" /></span>
              <span className="th-text">{t(up.text)}<small>{t(E("thinking now", "pensando ahora"))} · {t(toolOf(up.tool).name)}</small></span>
            </div>
          </li>
        )}
      </ol>
    </div>
  );
}

/* ---------------------------------------------------------------- its mind in this cycle */

function MindPanel({ job, memories, skills }: { job: Job; memories: Memory[]; skills: Skill[] }) {
  const t = useT();
  const s = job.state;
  const trace = s.trace ?? [];
  const spent = Number(s.cost ?? 0);
  const cap = typeof s.maxCost === "number" ? s.maxCost : null;
  const level = cap ? Math.min(1, spent / cap) : 0;
  const models = new Map<string, { calls: number; cost: number; roles: Set<string> }>();
  for (const e of trace) {
    if (!e.model) continue;
    const m = models.get(e.model) ?? { calls: 0, cost: 0, roles: new Set<string>() };
    m.calls += 1; m.cost += Number(e.cost ?? 0); m.roles.add(t(toolOf(e.tool).name).split(" · ")[0] ?? e.tool);
    models.set(e.model, m);
  }
  const recalled = [...new Set(trace.filter((e) => e.tool === "memory").flatMap((e) => e.ids ?? []))];
  const used = s.skillsUsed ?? [];
  const activeHere = skills.filter((k) => k.scenario === job.scenario && k.status === "active");
  return (
    <aside className="mindp" aria-label={t(E("Its mind in this cycle", "Su mente en este ciclo"))}>
      <h2 className="h3">{t(E("Its mind in this cycle", "Su mente en este ciclo"))}</h2>
      <section>
        <p className="mp-k">{t(E("Spending", "Gasto"))}</p>
        <p className="mp-big">{fmt(spent)}{cap !== null ? <small> / {fmt(cap)}</small> : null}</p>
        {cap !== null && <span className={`mp-meter${level >= 1 ? " over" : level >= 0.8 ? " near" : ""}`}><i style={{ width: `${Math.round(level * 100)}%` }} /></span>}
      </section>
      <section>
        <p className="mp-k">{t(E("Models it called (its neurons)", "Modelos que llamó (sus neuronas)"))}</p>
        {models.size ? (
          <ul className="mp-list">
            {[...models].map(([id, m]) => <li key={id}><b>{id}</b><span>{[...m.roles].join(", ")} · {m.calls}× · {fmt(m.cost)}</span></li>)}
          </ul>
        ) : <p className="fine">{t(E("None yet.", "Ninguno todavía."))}</p>}
      </section>
      <section>
        <p className="mp-k">{t(E("Memory", "Memoria"))}</p>
        <p className="small">{t(E(`${recalled.length} lesson${recalled.length === 1 ? "" : "s"} recalled · ${memories.length} in its memory`, `${recalled.length} ${recalled.length === 1 ? "lección recordada" : "lecciones recordadas"} · ${memories.length} en su memoria`))}</p>
        {recalled.slice(0, 3).map((id) => {
          const m = memories.find((x) => x.id === id);
          return m ? <p key={id} className="mp-lesson">“{m.text}”</p> : null;
        })}
      </section>
      <section>
        <p className="mp-k">{t(E("Skills in play", "Habilidades en juego"))}</p>
        {used.length ? <p className="small">{t(E("It took the first exam with", "Presentó el primer examen con"))} {used.map((u) => `${u.context} v${u.version}`).join(", ")}</p> : <p className="small">{t(E("It took the first exam with no skills for this exam.", "Presentó el primer examen sin habilidades para este examen."))}</p>}
        {s.candidate && <p className="small"><ChangeTag kind={skillKind(s.candidate)} extra={`v${s.candidate.version}`} /></p>}
        {activeHere.length > 0 && <p className="fine">{t(E(`${activeHere.length} active now for this exam.`, `${activeHere.length} activa${activeHere.length === 1 ? "" : "s"} ahora para este examen.`))}</p>}
      </section>
    </aside>
  );
}

/* ---------------------------------------------------------------- every change, with its kind */

function Changes({ jobs, skills, runs, bench, go }: { jobs: Job[]; skills: Skill[]; runs: EvolveRun[]; bench: BenchScenario[]; go: (t: Tab) => void }) {
  const t = useT();
  const { mt } = useMt();
  type Row = { at: string; kind: ChangeKind; extra?: string; title: string; status: string; tone: Tone; to?: Tab };
  const title = (id: string) => bench.find((b) => b.id === id)?.title ?? id;
  const SKILL_ST: Record<string, [Text, Tone]> = {
    candidate: [E("waiting for you", "te espera"), "wait"], active: [E("in use", "en uso"), "ok"],
    rejected: [E("rejected", "rechazada"), "bad"], retired: [E("retired", "retirada"), "neutral"],
  };
  const RUN_ST: Record<string, [Text, Tone]> = {
    queued: [E("queued", "en cola"), "live"], building: [E("building", "construyendo"), "live"], passed: [E("adopted", "adoptado"), "ok"],
    rejected: [E("rejected by the judge", "rechazado por el juez"), "bad"], failed: [E("failed", "falló"), "bad"],
  };
  const rows: Row[] = [];
  for (const k of skills.slice(0, 30)) {
    const sc = bench.find((b) => b.id === k.scenario);
    const [st, tone] = SKILL_ST[k.status] ?? [E(k.status, k.status), "neutral"];
    rows.push({ at: k.createdAt, kind: skillKind(k), extra: `v${k.version}`, title: `${title(k.scenario)} · ${sc?.contexts.find((c) => c.id === k.context)?.name ?? k.context}`, status: t(st), tone, to: "agent" });
  }
  for (const r of runs.slice(0, 10)) {
    const [st, tone] = RUN_ST[r.status] ?? [E(r.status, r.status), "neutral"];
    rows.push({ at: r.createdAt, kind: "code", title: r.proposal.title, status: t(st), tone, to: "evolve" });
  }
  for (const j of jobs.slice(0, 12)) {
    for (const p of j.state.plan?.proposals ?? []) rows.push({ at: j.createdAt, kind: "tool", extra: t(capName(p.capability)), title: mt(p.idea), status: t(E("proposal", "propuesta")), tone: "neutral" });
  }
  rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (!rows.length) return null;
  return (
    <div className="changes">
      <h2 className="h3">{t(E("Every change it has proposed", "Todos los cambios que ha propuesto"))}</h2>
      <p className="muted small">{t(E("Each one says what kind of change it is. Skills are text it reads; code changes rewrite its core; new tools are only proposals.", "Cada uno dice qué tipo de cambio es. Las habilidades son texto que lee; los cambios de código reescriben su núcleo; las herramientas nuevas solo son propuestas."))}</p>
      <ul className="ch-list">
        {rows.slice(0, 14).map((r, i) => (
          <li key={i}>
            <ChangeTag kind={r.kind} extra={r.extra} />
            <span className="ch-title">{r.title}</span>
            <span className={`ch-st ${r.tone}`}>{r.status}</span>
            {r.to && <button type="button" className="link small" onClick={() => { if (r.to) go(r.to); }}>{t(E("Open", "Abrir"))} →</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- the page */

export function Process({ client, go, lang }: { client: Api; go: (t: Tab) => void; lang: Lang }) {
  const t = useT();
  const live = useLive();
  const [mode, setMode] = useState<"process" | "3d">(() => (location.hash === "#lab3d" ? "3d" : "process"));
  const [picked, setPicked] = useState<string | null>(null);
  const [runs, setRuns] = useState<EvolveRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { client.evolve().then((s) => setRuns(s.runs ?? [])).catch(() => setRuns([])); }, [client]);

  const a = live.agent;
  const jobs = useMemo(() => (a?.jobs ?? []).filter((j) => j.state.trace?.length), [a?.jobs]);
  // a running cycle (or one waiting for you) takes the stage; otherwise the one you picked, or the newest
  const newest = live.job;
  const job = (newest && (isRunning(newest) || newest.phase === "awaiting") && picked === null ? newest : jobs.find((j) => j.id === picked)) ?? newest ?? jobs[0] ?? null;
  const sc = a?.bench.find((b) => b.id === job?.scenario);
  // what the models wrote, in the language you read (the original stays in `job`)
  const { mt } = useMt();
  const view = useMemo(() => (job ? mtJob(job, mt) : null), [job, mt]);
  const memories = useMemo(() => (a?.memory?.active ?? []).map((m) => ({ ...m, text: mt(m.text) })), [a?.memory, mt]);
  const running = Boolean(newest && isRunning(newest));

  const start = async () => {
    setBusy(true);
    setError("");
    setPicked(null);
    try { await live.start({ auto: true, maxCost: savedCap(), lang }); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const decide = async (skillId: string, decision: "approved" | "rejected") => {
    setError("");
    try { await client.agentOp({ op: "decide", skillId, decision }); await live.reload(); } catch (err) { setError((err as Error).message); }
  };

  return (
    <section className="proc">
      <div className="proc-bar">
        <div>
          <p className="kicker">{t(E("The agent's process", "El proceso del agente"))}</p>
          <h1 className="h2">{t(E("What it thinks, decides and does", "Qué piensa, qué decide y qué hace"))}</h1>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <div className="seg" role="tablist" aria-label={t(E("View", "Vista"))}>
            <button type="button" role="tab" aria-selected={mode === "process"} onClick={() => setMode("process")}>{t(E("Process", "Proceso"))}</button>
            <button type="button" role="tab" aria-selected={mode === "3d"} onClick={() => setMode("3d")}>{t(E("3D lab", "Lab 3D"))}</button>
          </div>
          {mode === "process" && !running && a?.key && (
            <button type="button" className="btn small" onClick={() => void start()} disabled={busy}>
              {busy && <span className="spin light" aria-hidden="true" />}
              {t(E(`Let it improve itself (cap $${savedCap().toFixed(2)})`, `Que se mejore solo (tope $${savedCap().toFixed(2)})`))}
            </button>
          )}
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <MtStatus lang={lang} />

      {mode === "3d" ? (
        <Lab3D go={go} lang={lang} />
      ) : !a ? (
        <p className="muted">{live.failed ? t(E("Couldn't load the lab.", "No se pudo cargar el laboratorio.")) : "…"}</p>
      ) : !job ? (
        <div className="empty">
          <p>{t(E("No cycles yet. Start one and you'll see here, step by step, what it thinks and decides.", "Aún no hay ciclos. Inicia uno y aquí verás, paso a paso, qué piensa y qué decide."))}</p>
          {!a.key && <button type="button" className="btn small" onClick={() => go("brain")}>{t(E("Connect your Meta key first", "Primero conecta tu llave de Meta"))}</button>}
        </div>
      ) : (
        <>
          {jobs.length > 1 && (
            <ul className="runs-list" aria-label={t(E("Cycles", "Corridas"))}>
              {jobs.slice(0, 12).map((r, i) => {
                const st = isRunning(r) ? "live" : r.phase === "awaiting" ? "wait" : r.state.outcome === "approved" || r.state.outcome === "nothing-to-learn" ? "ok" : "bad";
                return (
                  <li key={r.id}>
                    <button type="button" aria-pressed={job.id === r.id} onClick={() => setPicked(r.id)} className={st}>
                      <b>#{jobs.length - i} · {a.bench.find((b) => b.id === r.scenario)?.title ?? r.scenario}</b>
                      <small>{new Date(r.createdAt).toLocaleString(lang === "es" ? "es-MX" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${Number(r.state.cost ?? 0).toFixed(3)}</small>
                      <em>{st === "live" ? t(E("running", "en curso")) : st === "wait" ? t(E("waiting for you", "te espera")) : summarize(r, a.bench.find((b) => b.id === r.scenario), t).headline.split(/[.:]/)[0]}</em>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="proc-grid">
            <div className="proc-main">
              <Tldr job={view ?? job} sc={sc} />
              <Approval job={view ?? job} raw={job} sc={sc} onDecide={decide} />
              <Thinking job={view ?? job} sc={sc} memories={memories} />
            </div>
            <MindPanel job={view ?? job} memories={memories} skills={a.skills} />
          </div>
          <div className="runs">
            <RunGraph key={job.id} job={view ?? job} bench={a.bench} lang={lang} />
          </div>
          <Changes jobs={a.jobs} skills={a.skills} runs={runs} bench={a.bench} go={go} />
        </>
      )}
    </section>
  );
}
