// One cycle ("corrida") as a neural network in 3D, drawn by hand on a canvas: how it started, every call to the
// model in order (the spine), the tools each call led to (grader, radar, library, harness, you) and what each tool
// gave back (scores per situation, mistakes, the skill it wrote), down to how it ended. It turns on its own and you
// can drag it; hovering or tapping a neuron says what it was.
//
// It is built only from the cycle's trace and state, the same for a live cycle and an old one: while a cycle runs
// it grows as the server adds steps; a finished one replays in a loop. The cost meter reads what was spent up to the
// step on screen, so it turns amber at 80% of the cycle's cap and red past it at the same moment it did for real.
import { useEffect, useMemo, useRef, useState } from "react";
import type { BenchScenario, Job, TraceEntry } from "./api.js";
import { useT, type Lang, type Text } from "./i18n.js";
import { markPath } from "./Path.js";
import { E, isRunning, nextUp, say, toolOf } from "./story.js";

const STAGE_MS = 550;
const HOLD_MS = 2600;
const FOCAL = 720;

export const COLORS = {
  start: "#e8eef5",
  model: "#a78bfa",
  tool: "#22d3ee",
  detail: "#facc15",
  mistake: "#fb923c",
  end: "#34d399",
  bad: "#f43f5e",
  wait: "#fbbf24",
  now: "#60a5fa",
} as const;

type Kind = "start" | "model" | "tool" | "detail" | "end";
export type GNode = {
  key: string; kind: Kind; label: string; sub?: string; color: string; r: number;
  x: number; y: number; z: number; stage: number;
  bad?: boolean; blocked?: boolean; live?: boolean;
  info: { title: string; body?: string; rows?: [string, string][] };
};
type GEdge = { a: string; b: string; kind: "flow" | "call" | "return" | "detail"; stage: number };
type Mark = { stage: number; spent: number };
export type RunGraphData = { nodes: GNode[]; edges: GEdge[]; marks: Mark[]; last: number; calls: number; tokens: number; cost: number; cap: number | null; stopped: boolean };

const fmt = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const pctOf = (s?: { correct: number; total: number }) => (s && s.total ? `${s.correct}/${s.total}` : "—");

/** Builds the network of one cycle. Exported for tests. */
export function buildRunGraph(job: Job, bench: BenchScenario[], tr: (x: Text) => string): RunGraphData {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const marks: Mark[] = [];
  const sc = bench.find((b) => b.id === job.scenario);
  const ctx = (id: string) => sc?.contexts.find((c) => c.id === id)?.name ?? id;
  const trace = job.state.trace ?? [];
  let stage = 0;
  let spent = 0;
  let calls = 0;
  let tokens = 0;
  const cap = typeof job.state.maxCost === "number" ? job.state.maxCost : null;

  const first = trace[0];
  const auto = Boolean(job.state.auto) || first?.note === "handed-over";
  nodes.push({
    key: "start", kind: "start", color: COLORS.start, r: 15, x: 0, y: 0, z: 0, stage: 0,
    label: auto ? tr(E("You let it decide", "Lo dejaste decidir")) : tr(E("You started it", "Tú lo iniciaste")),
    info: {
      title: tr(E("How it started", "Cómo empezó")),
      body: job.state.guidance ? `“${job.state.guidance}”` : tr(auto ? E("You handed it the choice: exam, model and effort.", "Le dejaste elegir: examen, modelo y esfuerzo.") : E("You chose the exam and the models.", "Tú elegiste el examen y los modelos.")),
      rows: [
        [tr(E("Exam", "Examen")), sc ? `${sc.title}${sc.benchmark ? ` · ${sc.benchmark}` : ""}` : job.scenario],
        ...(cap !== null ? [[tr(E("Cycle cap", "Tope del ciclo")), fmt(cap)] as [string, string]] : []),
        [tr(E("Date", "Fecha")), new Date(job.createdAt).toLocaleString()],
      ],
    },
  });
  marks.push({ stage: 0, spent: 0 });

  let spine = "start"; // the last model call (or the start)
  let pending: string[] = []; // tools that hand back to the next model call
  let seq = 0;
  const spineKeys: string[] = [];
  const toolsOf: Record<string, number> = {};

  const addTool = (e: TraceEntry, label: string, info: GNode["info"], flags: Partial<GNode> = {}) => {
    stage += 1;
    const key = `t${seq++}`;
    nodes.push({ key, kind: "tool", color: flags.bad || flags.blocked ? COLORS.bad : e.tool === "human" ? COLORS.wait : COLORS.tool, r: 10, x: 0, y: 0, z: 0, stage, label, info, ...flags });
    edges.push({ a: spine, b: key, kind: "call", stage });
    toolsOf[spine] = (toolsOf[spine] ?? 0) + 1;
    pending.push(key);
    marks.push({ stage, spent });
    return key;
  };
  const addDetails = (parent: string, items: { label: string; info: GNode["info"]; color?: string }[]) => {
    for (const it of items) {
      stage += 1;
      const key = `d${seq++}`;
      nodes.push({ key, kind: "detail", color: it.color ?? COLORS.detail, r: 6, x: 0, y: 0, z: 0, stage, label: it.label, info: it.info });
      edges.push({ a: parent, b: key, kind: "detail", stage });
      marks.push({ stage, spent });
    }
  };

  const body = trace.slice(first && (first.tool === "human" || (first.tool === "director" && first.note === "handed-over")) && !first.model ? 1 : 0);
  let baselineGraded = false;
  for (const e of body) {
    const tool = toolOf(e.tool);
    if (e.model || typeof e.cost === "number") {
      // a call to the model: a neuron of the spine
      stage += 1;
      calls += 1;
      spent += Number(e.cost ?? 0);
      tokens += Number(e.tokens ?? 0);
      const key = `m${seq++}`;
      const what = e.tool === "director" ? E("decides", "decide") : e.tool === "planner" ? E("writes a skill", "escribe habilidad") : e.phase === "validate" ? E("exam with the candidate", "examen con candidata") : E("exam", "examen");
      nodes.push({
        key, kind: "model", color: COLORS.model, r: 12, x: 0, y: 0, z: 0, stage,
        label: tr(E(`Model · ${calls}`, `Modelo · ${calls}`)), sub: tr(what),
        info: {
          title: `${tr(tool.name)} · ${tr(E("call", "llamada"))} ${calls}`,
          body: e.tool === "director" && e.note ? e.note : tr(tool.does),
          rows: [
            [tr(E("Model", "Modelo")), e.model ?? "—"],
            [tr(E("Cost", "Costo")), fmt(Number(e.cost ?? 0))],
            ...(e.tokens ? [[tr(E("Tokens", "Tokens")), e.tokens.toLocaleString()] as [string, string]] : []),
            ...(e.ms ? [[tr(E("Time", "Tiempo")), `${(e.ms / 1000).toFixed(1)} s`] as [string, string]] : []),
            [tr(E("Spent so far", "Gastado hasta aquí")), `${fmt(spent)}${cap !== null ? ` / ${fmt(cap)}` : ""}`],
          ],
        },
      });
      edges.push({ a: spine, b: key, kind: "flow", stage });
      for (const p of pending) edges.push({ a: p, b: key, kind: "return", stage });
      pending = [];
      spine = key;
      spineKeys.push(key);
      marks.push({ stage, spent });
      if (e.tool === "director" && job.state.plan) {
        const plan = job.state.plan;
        addDetails(key, [
          { label: sc?.title ?? plan.scenario, info: { title: tr(E("It picked the exam", "Eligió el examen")), body: plan.why } },
          { label: plan.executor, info: { title: tr(E("It picked the model", "Eligió el modelo")), rows: [[tr(E("Effort", "Esfuerzo")), plan.effort ?? "—"], ...(plan.estimate ? [[tr(E("Estimate", "Estimado")), fmt(plan.estimate)] as [string, string]] : [])] } },
          ...plan.proposals.slice(0, 4).map((p) => ({ label: p.capability, info: { title: tr(E("It proposes", "Propone")), body: `${p.idea} — ${p.why}` } })),
        ]);
      }
      continue;
    }
    if (e.tool === "grader") {
      const validate = e.phase === "validate";
      const scores = validate ? job.state.after : job.state.before?.validation;
      const t = addTool(e, tr(E(`Grade ${e.note ?? ""}`, `Calificación ${e.note ?? ""}`)), {
        title: tr(toolOf("grader").name),
        body: tr(validate ? E("Checked the answers with the new skill, without letting it see the truth.", "Revisó las respuestas con la habilidad nueva, sin dejarle ver la verdad.") : E("Checked its first answers: practice and validation.", "Revisó sus primeras respuestas: práctica y validación.")),
        rows: [[tr(E("Right", "Correctas")), e.note ?? "—"]],
      });
      addDetails(t, Object.entries(scores ?? {}).map(([c, s]) => ({ label: `${ctx(c)} ${pctOf(s)}`, info: { title: ctx(c), body: tr(E("Validation score in this situation.", "Calificación de validación en esta situación.")), rows: [[tr(E("Right", "Correctas")), pctOf(s)]] } })));
      if (!validate && !baselineGraded) {
        baselineGraded = true;
        addDetails(t, job.state.mistakes.slice(0, 5).map((m) => ({
          color: COLORS.mistake,
          label: tr(E(`said ${m.given ?? "—"}`, `dijo ${m.given ?? "—"}`)),
          info: { title: tr(E("A practice mistake", "Un error de práctica")), body: Object.entries(m.fields).map(([k, v]) => `${k}=${String(v)}`).join("; "), rows: [[tr(E("It said", "Dijo")), m.given ?? "—"], [tr(E("Right answer", "Correcta")), m.truth], [tr(E("Situation", "Situación")), ctx(m.context)]] },
        })));
      }
      continue;
    }
    if (e.tool === "radar") {
      addTool(e, tr(E(`Radar · ${e.note ?? ""} ideas`, `Radar · ${e.note ?? ""} ideas`)), { title: tr(tool.name), body: tr(E("Read the ideas you approved in the radar before writing.", "Leyó las ideas que aprobaste en el radar antes de escribir.")) });
      continue;
    }
    if (e.tool === "library") {
      const c = job.state.candidate;
      const t = addTool(e, tr(E("Library", "Biblioteca")), { title: tr(tool.name), body: tr(tool.does), rows: [[tr(E("Saved", "Guardó")), e.note ?? "—"]] });
      if (c) addDetails(t, [{ label: `${ctx(c.context)} v${c.version}`, info: { title: tr(E(`Candidate skill v${c.version}`, `Habilidad candidata v${c.version}`)), body: c.instructions, rows: [[tr(E("Why", "Por qué")), c.rationale]] } }]);
      continue;
    }
    if (e.tool === "harness") {
      const budget = e.note === "run-budget";
      if (budget) continue; // the end node already says the cap stopped it
      const ok = e.note === "improves";
      addTool(e, budget ? tr(E("Cap reached", "Tope alcanzado")) : ok ? tr(E("Harness: passes", "Arnés: pasa")) : tr(E("Harness: out", "Arnés: fuera")), {
        title: tr(tool.name), body: tr(say(e, job)),
        rows: job.state.verdict && !budget ? [[tr(E("Needed", "Necesitaba")), `+${job.state.verdict.needed}`], ...Object.entries(job.state.verdict.deltas).map(([c, d]) => [ctx(c), `${d > 0 ? "+" : ""}${d}`] as [string, string])] : undefined,
      }, budget ? { blocked: true } : ok ? {} : { bad: true });
      continue;
    }
    if (e.tool === "human" && e.note === "waiting") {
      addTool(e, tr(E("Your turn", "Te toca")), { title: tr(toolOf("human").name), body: tr(E("The harness passed it; now you approve or reject it.", "El arnés la aprobó; ahora tú la apruebas o rechazas.")) });
      continue;
    }
  }

  // how it ended (or what it is doing now)
  stage += 1;
  const o = job.state.outcome;
  const running = isRunning(job);
  const end: Pick<GNode, "label" | "color" | "info"> & Partial<GNode> = running
    ? { label: tr(nextUp(job)?.text ?? E("Working…", "Trabajando…")), color: COLORS.now, live: true, info: { title: tr(E("Right now", "Ahora mismo")), body: tr(nextUp(job)?.text ?? E("Working…", "Trabajando…")) } }
    : job.state.error
      ? { label: tr(E("Got stuck", "Se atoró")), color: COLORS.bad, bad: true, info: { title: tr(E("It got stuck", "Se atoró")), body: job.state.error } }
      : job.phase === "awaiting"
        ? { label: tr(E("Waiting for you", "Te espera")), color: COLORS.wait, info: { title: tr(E("Waiting for your decision", "Esperando tu decisión")), body: tr(E("Approve or reject the skill in the Agent tab.", "Aprueba o rechaza la habilidad en la pestaña Agente.")) } }
        : o === "approved"
          ? { label: tr(E("Approved", "Aprobada")), color: COLORS.end, info: { title: tr(E("Approved", "Aprobada")), body: tr(E("The agent now uses this skill.", "El agente ya usa esta habilidad.")) } }
          : o === "nothing-to-learn"
            ? { label: tr(E("Nothing to learn", "Nada que aprender")), color: COLORS.end, info: { title: tr(E("Perfect score", "Calificación perfecta")), body: tr(E("No mistakes to study, so nothing changed.", "No hubo errores que estudiar, así que nada cambió.")) } }
            : o === "run-budget"
              ? { label: tr(E("Stopped · cap", "Detenido · tope")), color: COLORS.bad, blocked: true, info: { title: tr(E("The code stopped the agent", "El código detuvo al agente")), body: tr(E("The next step could have gone over this cycle's cap, so it stopped cleanly. Nothing changed.", "El siguiente paso podía pasarse del tope del ciclo, así que se detuvo limpio. No cambió nada.")) } }
              : o === "rejected"
                ? { label: tr(E("You rejected it", "La rechazaste")), color: "#94a3b8", info: { title: tr(E("Rejected by you", "La rechazaste")), body: tr(E("Nothing changed.", "No cambió nada.")) } }
                : { label: o === "planner-failed" ? tr(E("Unusable skill", "Habilidad inservible")) : tr(E("Thrown out", "Descartada")), color: COLORS.bad, bad: true, info: { title: tr(E("Nothing changed", "No cambió nada")), body: job.state.detail ?? tr(E("The harness threw the candidate out.", "El arnés descartó la candidata.")) } };
  nodes.push({ key: "end", kind: "end", r: 15, x: 0, y: 0, z: 0, stage, ...end });
  edges.push({ a: spine, b: "end", kind: "flow", stage });
  for (const p of pending) edges.push({ a: p, b: "end", kind: "return", stage });
  marks.push({ stage, spent });

  layout(nodes, edges, spineKeys);
  return { nodes, edges, marks, last: stage, calls, tokens, cost: Number(job.state.cost ?? spent), cap, stopped: o === "run-budget" };
}

/** Places the network: the spine as a gentle helix from top to bottom, tools around it, details around each tool. */
function layout(nodes: GNode[], edges: GEdge[], spine: string[]) {
  const by = new Map(nodes.map((n) => [n.key, n]));
  const H = 480;
  const steps = spine.length + 1;
  const start = by.get("start");
  if (start) Object.assign(start, { x: 0, y: -H / 2, z: 0 });
  spine.forEach((k, i) => {
    const n = by.get(k);
    if (!n) return;
    const a = i * 0.95;
    Object.assign(n, { x: Math.sin(a) * 46, y: -H / 2 + ((i + 1) * H) / steps, z: Math.cos(a) * 46 });
  });
  const end = by.get("end");
  if (end) Object.assign(end, { x: 0, y: H / 2 + 24, z: 0 });
  const kids = (k: string, kind: GEdge["kind"]) => edges.filter((e) => e.a === k && e.kind === kind).map((e) => by.get(e.b)).filter((n): n is GNode => Boolean(n));
  let turn = 0;
  for (const k of ["start", ...spine]) {
    const p = by.get(k);
    if (!p) continue;
    const tools = kids(k, "call");
    tools.forEach((t, j) => {
      const a = turn * 1.7 + j * (Math.PI * 2 / Math.max(3, tools.length + 1));
      Object.assign(t, { x: p.x + Math.cos(a) * 170, y: p.y + 26 + j * 14, z: p.z + Math.sin(a) * 170 });
      const ds = kids(t.key, "detail");
      ds.forEach((d, m) => {
        const b = a + (m - (ds.length - 1) / 2) * 0.55;
        Object.assign(d, { x: t.x + Math.cos(b) * 78, y: t.y + (m - (ds.length - 1) / 2) * 20, z: t.z + Math.sin(b) * 78 });
      });
    });
    const own = kids(k, "detail"); // the director's choices hang from its own call
    own.forEach((d, m) => {
      const b = turn * 1.7 + Math.PI + m * 0.7;
      Object.assign(d, { x: p.x + Math.cos(b) * 120, y: p.y + (m - (own.length - 1) / 2) * 22, z: p.z + Math.sin(b) * 120 });
    });
    turn += 1;
  }
}

/* ---------- drawing ---------- */
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const; };
const rgba = (hex: string, a: number) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
const ease = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);

type Proj = { sx: number; sy: number; z: number; s: number };

function useSound() {
  const [on, setOn] = useState(() => { try { return localStorage.getItem("agz-graph-sound") === "on"; } catch { return false; } });
  const ctx = useRef<AudioContext | null>(null);
  const toggle = () => setOn((v) => {
    const next = !v;
    try { localStorage.setItem("agz-graph-sound", next ? "on" : "off"); } catch { /* private mode */ }
    if (next && !ctx.current) ctx.current = new AudioContext();
    return next;
  });
  const blip = (kind: Kind, bad?: boolean) => {
    if (!on) return;
    const c = ctx.current ?? (ctx.current = new AudioContext());
    const o = c.createOscillator();
    const g = c.createGain();
    const f = bad ? 160 : { start: 440, model: 520, tool: 660, detail: 880, end: 392 }[kind];
    o.type = kind === "model" ? "triangle" : "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(kind === "detail" ? 0.03 : 0.07, c.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + (bad ? 0.5 : 0.18));
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.55);
  };
  return { on, toggle, blip };
}

export function RunGraph({ job, bench, lang }: { job: Job; bench: BenchScenario[]; lang: Lang }) {
  const t = useT();
  const data = useMemo(() => buildRunGraph(job, bench, t), [job, bench, t]);
  const [view, setView] = useState<"net" | "list">("net");
  const [paused, setPaused] = useState(false);
  const [picked, setPicked] = useState<GNode | null>(null);
  const [hover, setHover] = useState<GNode | null>(null);
  const [shown, setShown] = useState(0); // the stage on screen, for the meter
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const sound = useSound();
  const live = isRunning(job);
  const reduce = useMemo(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  // the animation state lives in a ref so the loop never restarts when React re-renders
  const st = useRef({ clock: 0, rot: 0.6, tilt: 0.18, drag: null as null | { x: number; y: number; rot: number; tilt: number; moved: boolean }, lastStage: -1, proj: new Map<string, Proj>(), data, paused, live, reduce, blip: sound.blip, job: job.id });
  st.current.data = data;
  st.current.paused = paused;
  st.current.live = live;
  st.current.blip = sound.blip;
  if (st.current.job !== job.id) { st.current.job = job.id; st.current.clock = 0; st.current.lastStage = -1; }

  const hoverRef = useRef<string | null>(null);
  const pickRef = useRef<string | null>(null);
  hoverRef.current = hover?.key ?? null;
  pickRef.current = picked?.key ?? null;

  useEffect(() => { markPath("graph"); }, []);

  const replay = () => { st.current.clock = 0; st.current.lastStage = -1; setPaused(false); };

  useEffect(() => {
    if (view !== "net") return;
    const cv = canvas.current;
    const box = wrap.current;
    if (!cv || !box) return;
    const g = cv.getContext("2d");
    if (!g) return;
    let raf = 0;
    let prev = performance.now();
    let w = 0, h = 0;
    const size = () => {
      const r = box.getBoundingClientRect();
      w = Math.max(280, r.width);
      h = Math.max(360, Math.min(620, w * 0.62));
      const dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = w * dpr; cv.height = h * dpr;
      cv.style.height = `${h}px`;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(box);

    const frame = (now: number) => {
      const s = st.current;
      const hoverKey = hoverRef.current, pickKey = pickRef.current;
      const d = s.data;
      const dt = Math.min(64, now - prev);
      prev = now;
      if (!s.paused) {
        s.clock += dt;
        if (!s.drag && !s.reduce) s.rot += dt * 0.00012;
      }
      const end = d.last * STAGE_MS;
      if (s.reduce) s.clock = end + 1;
      if (!s.live && s.clock > end + HOLD_MS) { s.clock = 0; s.lastStage = -1; }
      if (s.live && s.clock > end) s.clock = end; // live: wait at the newest step
      const at = s.clock / STAGE_MS;
      const stageNow = Math.floor(at);
      if (stageNow !== s.lastStage) {
        for (const n of d.nodes) if (n.stage > s.lastStage && n.stage <= stageNow) s.blip(n.kind, n.bad || n.blocked);
        s.lastStage = stageNow;
        setShown(stageNow);
      }

      // spent so far and the alarm it raises
      const spent = [...d.marks].reverse().find((m) => m.stage <= at)?.spent ?? 0;
      const level = d.cap ? spent / d.cap : 0;
      const alarm = d.stopped && at >= d.last ? 1 : level >= 1 ? 1 : level >= 0.8 ? 0.5 : 0;

      g.clearRect(0, 0, w, h);
      const bg = g.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h / 2, Math.max(w, h) * 0.75);
      bg.addColorStop(0, alarm === 1 ? "#3a1020" : alarm ? "#2e2410" : "#141d3a");
      bg.addColorStop(1, alarm === 1 ? "#12060c" : "#070b18");
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // a few stars
      g.fillStyle = "rgba(255,255,255,.18)";
      for (let i = 0; i < 40; i++) g.fillRect((i * 97.3) % w, (i * 53.7 + (i % 3) * 41) % h, 1.2, 1.2);

      const fit = Math.min(w / 520, h / 700);
      const cos = Math.cos(s.rot), sin = Math.sin(s.rot), ct = Math.cos(s.tilt), stl = Math.sin(s.tilt);
      s.proj.clear();
      for (const n of d.nodes) {
        const x1 = n.x * cos - n.z * sin;
        const z1 = n.x * sin + n.z * cos;
        const y1 = n.y * ct - z1 * stl;
        const z2 = n.y * stl + z1 * ct;
        const k = FOCAL / (FOCAL + z2);
        s.proj.set(n.key, { sx: w / 2 + x1 * k * fit, sy: h * 0.5 + 18 + y1 * k * fit, z: z2, s: k * fit });
      }
      const by = new Map(d.nodes.map((n) => [n.key, n]));

      // connections, with the pulse that travels them
      for (const e of d.edges) {
        const a = s.proj.get(e.a), b = s.proj.get(e.b), nb = by.get(e.b);
        if (!a || !b || !nb) continue;
        const grow = ease((at - (e.stage - 1)) / 0.8);
        if (grow <= 0) continue;
        const ex = a.sx + (b.sx - a.sx) * grow, ey = a.sy + (b.sy - a.sy) * grow;
        const col = alarm === 1 && e.kind !== "detail" ? COLORS.bad : e.kind === "flow" ? COLORS.model : e.kind === "return" ? "#7dd3fc" : nb.color;
        g.strokeStyle = rgba(col, e.kind === "detail" ? 0.35 : 0.55);
        g.lineWidth = e.kind === "flow" ? 2.2 : 1.1;
        g.setLineDash(e.kind === "return" ? [4, 5] : []);
        g.beginPath(); g.moveTo(a.sx, a.sy); g.lineTo(ex, ey); g.stroke();
        g.setLineDash([]);
        if (grow < 1 || (s.live && e.stage === d.last)) {
          const p = s.live && grow >= 1 ? (now / 900) % 1 : grow;
          const px = a.sx + (b.sx - a.sx) * p, py = a.sy + (b.sy - a.sy) * p;
          const halo = g.createRadialGradient(px, py, 0, px, py, 10);
          halo.addColorStop(0, "rgba(255,255,255,.95)"); halo.addColorStop(1, rgba(col, 0));
          g.fillStyle = halo; g.beginPath(); g.arc(px, py, 10, 0, Math.PI * 2); g.fill();
        }
      }

      // neurons, far ones first
      const order = [...d.nodes].sort((p, q) => (s.proj.get(q.key)?.z ?? 0) - (s.proj.get(p.key)?.z ?? 0));
      for (const n of order) {
        const p = s.proj.get(n.key);
        if (!p) continue;
        const born = ease((at - n.stage + 0.25) / 0.6);
        if (born <= 0) continue;
        const col = alarm === 1 && n.kind === "model" ? COLORS.bad : n.color;
        const beat = n.live ? 1 + Math.sin(now / 260) * 0.18 : 1;
        const r = n.r * p.s * born * beat * (hoverKey === n.key || pickKey === n.key ? 1.35 : 1);
        const glow = g.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * 3.2);
        glow.addColorStop(0, rgba(col, 0.55 * born)); glow.addColorStop(1, rgba(col, 0));
        g.fillStyle = glow; g.beginPath(); g.arc(p.sx, p.sy, r * 3.2, 0, Math.PI * 2); g.fill();
        const core = g.createRadialGradient(p.sx - r * 0.35, p.sy - r * 0.35, r * 0.1, p.sx, p.sy, r);
        core.addColorStop(0, "#ffffff"); core.addColorStop(0.35, col); core.addColorStop(1, rgba(col, 0.75));
        g.fillStyle = core; g.beginPath(); g.arc(p.sx, p.sy, r, 0, Math.PI * 2); g.fill();
        if (n.blocked) {
          g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 1.6;
          g.beginPath(); g.arc(p.sx, p.sy, r + 4, 0, Math.PI * 2); g.stroke();
          g.beginPath(); g.moveTo(p.sx - r * 0.6, p.sy - r * 0.6); g.lineTo(p.sx + r * 0.6, p.sy + r * 0.6); g.moveTo(p.sx + r * 0.6, p.sy - r * 0.6); g.lineTo(p.sx - r * 0.6, p.sy + r * 0.6); g.stroke();
        } else if (n.bad) {
          g.fillStyle = "#fff"; g.font = `800 ${Math.max(9, r)}px Figtree, system-ui`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("!", p.sx, p.sy + 0.5);
        }
        // labels: always for the spine, start and end; for the rest while they are fresh or pointed at
        const fresh = at - n.stage < 2.2;
        const show = n.kind !== "detail" || fresh || hoverKey === n.key || pickKey === n.key;
        if (show) {
          const a = n.kind === "detail" && !fresh ? 0.75 : 0.95;
          g.textAlign = "left"; g.textBaseline = "middle";
          g.font = `${n.kind === "model" || n.kind === "start" || n.kind === "end" ? 700 : 500} ${n.kind === "detail" ? 11 : 12.5}px Figtree, system-ui`;
          g.fillStyle = rgba(n.kind === "model" && alarm === 1 ? "#fecdd3" : "#e5ecf6", a * born);
          g.fillText(n.label.length > 34 ? `${n.label.slice(0, 33)}…` : n.label, p.sx + r + 7, p.sy);
          if (n.sub) { g.font = "500 10.5px Figtree, system-ui"; g.fillStyle = rgba("#b9c6dc", 0.8 * born); g.fillText(n.sub, p.sx + r + 7, p.sy + 13); }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame((n) => { prev = n; frame(n); });
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [view]);

  // pointer: drag to turn, hover or tap to read a neuron
  const nearest = (cx: number, cy: number) => {
    const cv = canvas.current;
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    const x = cx - r.left, y = cy - r.top;
    const at = st.current.clock / STAGE_MS;
    let best: GNode | null = null, bd = 22;
    for (const n of st.current.data.nodes) {
      if (n.stage > at + 0.3) continue;
      const p = st.current.proj.get(n.key);
      if (!p) continue;
      const dd = Math.hypot(p.sx - x, p.sy - y) - n.r * p.s;
      if (dd < bd) { bd = dd; best = n; }
    }
    return best;
  };
  const onDown = (e: React.PointerEvent) => {
    st.current.drag = { x: e.clientX, y: e.clientY, rot: st.current.rot, tilt: st.current.tilt, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = st.current.drag;
    if (d) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
      st.current.rot = d.rot + dx * 0.008;
      st.current.tilt = Math.max(-0.5, Math.min(0.6, d.tilt + dy * 0.004));
      return;
    }
    const n = nearest(e.clientX, e.clientY);
    if ((n?.key ?? null) !== (hover?.key ?? null)) setHover(n);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = st.current.drag;
    st.current.drag = null;
    if (d && !d.moved) setPicked(nearest(e.clientX, e.clientY));
  };

  const at = shown;
  const spent = [...data.marks].reverse().find((m) => m.stage <= at)?.spent ?? 0;
  const level = data.cap ? spent / data.cap : 0;
  const over = data.cap !== null && spent > data.cap;
  const alarm = data.stopped && at >= data.last ? "stop" : over ? "over" : level >= 0.8 ? "near" : null;
  const focus = picked ?? hover;
  const trace = job.state.trace ?? [];
  const secs = trace.length > 1 ? (Date.parse(trace.at(-1)?.at ?? "") - Date.parse(trace[0]?.at ?? "")) / 1000 : 0;
  const summary = [
    t(E(`${data.calls} model call${data.calls === 1 ? "" : "s"}`, `${data.calls} llamada${data.calls === 1 ? "" : "s"} al modelo`)),
    data.tokens ? `${data.tokens.toLocaleString()} tokens` : null,
    `${fmt(data.cost)} USD`,
    secs > 0 ? `${secs < 120 ? secs.toFixed(1) + " s" : Math.round(secs / 60) + " min"}` : null,
    data.cap !== null ? t(E(`cap ${fmt(data.cap)}`, `tope ${fmt(data.cap)}`)) + (data.cost > data.cap ? t(E(`, over by ${fmt(data.cost - data.cap)}`, `, exceso ${fmt(data.cost - data.cap)}`)) : "") : null,
  ].filter(Boolean).join(" · ");

  return (
    <section className="rungraph" aria-label={t(E("This cycle as a network", "Esta corrida como red"))}>
      <header className="rg-head">
        <h3 className="h3">{t(E("What the agent did in this cycle", "Lo que hizo el agente en esta corrida"))}</h3>
        <div className="seg rg-seg" role="tablist" aria-label={t(E("View", "Vista"))}>
          <button type="button" role="tab" aria-selected={view === "net"} onClick={() => setView("net")}>{t(E("Network", "Red"))}</button>
          <button type="button" role="tab" aria-selected={view === "list"} onClick={() => setView("list")}>{t(E("List", "Lista"))}</button>
        </div>
      </header>

      {view === "net" ? (
        <div className={`rg-stage${alarm === "stop" || alarm === "over" ? " alarm" : alarm === "near" ? " near" : ""}`} ref={wrap}>
          <canvas ref={canvas} role="img" aria-label={summary} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { st.current.drag = null; setHover(null); }} />
          <div className="rg-tools">
            <button type="button" onClick={sound.toggle} aria-pressed={sound.on} title={t(E("Sound", "Sonido"))} aria-label={t(E("Sound", "Sonido"))}>{sound.on ? "🔊" : "🔈"}</button>
            <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? t(E("Play", "Reproducir")) : t(E("Pause", "Pausar"))} title={paused ? t(E("Play", "Reproducir")) : t(E("Pause", "Pausar"))}>{paused ? "▶" : "❚❚"}</button>
            <button type="button" onClick={replay} aria-label={t(E("Replay", "Repetir"))} title={t(E("Replay from the start", "Repetir desde el inicio"))}>↺</button>
          </div>
          {alarm && (
            <p className={`rg-banner ${alarm}`} role="status">
              {alarm === "stop" ? t(E("Cap used up · the code stopped the agent", "Tope agotado · el código detuvo al agente"))
                : alarm === "over" ? t(E("Over this cycle's cap", "Pasó el tope de esta corrida"))
                  : t(E("Close to this cycle's cap", "Cerca del tope de esta corrida"))}
            </p>
          )}
          {live && <p className="rg-live" role="status"><i /> {t(E("Live: it grows with every step", "En vivo: crece con cada paso"))}</p>}
          <div className={`rg-meter${over || alarm === "stop" ? " over" : level >= 0.8 ? " near" : ""}`}>
            <span>{t(E("Cost / cap", "Costo / tope"))}</span>
            <b>{fmt(spent)}{data.cap !== null ? ` / ${fmt(data.cap)}` : ""}</b>
            {data.cap !== null && <i style={{ ["--w" as string]: `${Math.min(100, level * 100)}%` }} />}
            {over && <small>{t(E(`Over · by ${fmt(spent - (data.cap ?? 0))}`, `Excedido · exceso ${fmt(spent - (data.cap ?? 0))}`))}</small>}
          </div>
          <ul className="rg-legend" aria-label={t(E("Legend", "Leyenda"))}>
            <li style={{ ["--c" as string]: COLORS.start }}>{t(E("Start", "Inicio"))}</li>
            <li style={{ ["--c" as string]: COLORS.model }}>{t(E("Model call", "Llamada al modelo"))}</li>
            <li style={{ ["--c" as string]: COLORS.tool }}>{t(E("Tool", "Herramienta"))}</li>
            <li style={{ ["--c" as string]: COLORS.detail }}>{t(E("What it gave back", "Lo que devolvió"))}</li>
            <li style={{ ["--c" as string]: COLORS.mistake }}>{t(E("Mistake", "Error"))}</li>
            <li style={{ ["--c" as string]: COLORS.end }}>{t(E("Result", "Resultado"))}</li>
            <li style={{ ["--c" as string]: COLORS.bad }}>{t(E("Failed (!)", "Falló (!)"))}</li>
            <li className="x">{t(E("Stopped (✕)", "Detenido (✕)"))}</li>
          </ul>
        </div>
      ) : (
        <ol className="rg-list">
          {trace.map((e, i) => (
            <li key={i} style={{ ["--c" as string]: toolOf(e.tool).color }}>
              <span className="ico" aria-hidden="true">{toolOf(e.tool).icon}</span>
              <div>
                <b>{t(say(e, job))}</b>
                <small>{[t(toolOf(e.tool).name), e.model, typeof e.cost === "number" ? fmt(e.cost) : null, e.tokens ? `${e.tokens.toLocaleString()} tokens` : null, e.ms ? `${(e.ms / 1000).toFixed(1)} s` : null].filter(Boolean).join(" · ")}</small>
              </div>
              <time>{new Date(e.at).toLocaleTimeString(lang === "es" ? "es-MX" : "en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
            </li>
          ))}
          {live && <li className="now"><span className="ico" aria-hidden="true">…</span><div><b>{t(nextUp(job)?.text ?? E("Working…", "Trabajando…"))}</b></div></li>}
        </ol>
      )}

      <div className="rg-info" aria-live="polite">
        {focus ? (
          <>
            <p><b style={{ color: focus.color === COLORS.start ? undefined : focus.color }}>{focus.info.title}</b>{focus.info.body ? ` — ${focus.info.body}` : ""}</p>
            {focus.info.rows && <dl>{focus.info.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
          </>
        ) : (
          <p className="muted">{view === "net"
            ? t(E("Drag to turn the network · point at or tap a neuron to see what it was and what it gave back. Each model call (violet) leads to its tools (cyan), and from each tool hang its results.", "Arrastra para girar la red · pasa el cursor o toca una neurona para ver qué fue y qué devolvió. Cada llamada al modelo (violeta) lleva a sus herramientas (cian), y de cada herramienta cuelgan sus resultados."))
            : t(E("Every step of this cycle, in order.", "Cada paso de esta corrida, en orden."))}</p>
        )}
      </div>
      <p className="rg-sum">{summary}</p>
    </section>
  );
}
