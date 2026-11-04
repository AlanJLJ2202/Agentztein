// Its brain, as a graph that builds itself: Agentztein in the middle; around it the four exams it practices on and the
// situations inside each; beyond them every skill version it wrote (a chain per situation); above, the radar ideas that
// inspired some of them; below, the tools it picks up. Opening the tab replays how it grew, in the order things really
// happened. While a cycle runs (or when you replay the last one) the tool in use lights up and a spark travels to it.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Job, Note, Skill } from "./api.js";
import type { Tab } from "./App.js";
import { useT, type Text } from "./i18n.js";
import { useMt } from "./translate.js";
import { useLive } from "./live.js";
import { E, examColor, isRunning, nextUp, say, TOOLS, type ToolId } from "./story.js";

const W = 1000, H = 700, CX = 500, CY = 300;
// five exams around it: two up the sides, two down the sides and one below (ideas go on top, tools at the bottom)
const SC_ANGLE = [-152, -28, 28, 152, 90];
/** Short names for the graph (the card beside it shows the full title). */
const KIND: Record<string, string> = { codigo: "Código", terminal: "Terminal", razonamiento: "Razonamiento", web: "Web", investigacion: "Investigación" };
const short = (t: string, n = 26) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const TOOL_ROW: ToolId[] = ["director", "radar", "planner", "library", "exam", "grader", "harness", "human"];
const rad = (d: number) => (d * Math.PI) / 180;
const at = (deg: number, rx: number, ry: number) => ({ x: CX + Math.cos(rad(deg)) * rx, y: CY + Math.sin(rad(deg)) * ry });

type Kind = "me" | "scenario" | "context" | "skill" | "idea" | "tool";
type Node = { below?: boolean; id: string; kind: Kind; x: number; y: number; r: number; color: string; label: string; at: number; info: { title: string; body: Text | string; extra?: string } ; status?: string; uses?: number };
type Link = { a: string; b: string; kind: "own" | "version" | "inspired" | "uses"; at: number; w?: number };

function build(bench: { id: string; title: string; task: string; benchmark: string | null; contexts: { id: string; name: string }[] }[], skills: Skill[], notes: Note[], jobs: Job[]) {
  const nodes: Node[] = [];
  const links: Link[] = [];
  const firstJob = (sc: string) => Math.min(...jobs.filter((j) => j.scenario === sc).map((j) => Date.parse(j.createdAt)), Infinity);
  nodes.push({ id: "me", kind: "me", x: CX, y: CY, r: 38, color: "#0081fb", label: "Agentztein", at: -Infinity, info: { title: "Agentztein", body: E("This is me. Everything around me is what I practice on, what I learned and the tools I use.", "Este soy yo. Todo lo que me rodea es en qué practico, lo que aprendí y las herramientas que uso.") } });
  bench.forEach((b, i) => {
    const ang = SC_ANGLE[i % SC_ANGLE.length] ?? 0;
    const p = at(ang, ang === 90 ? 170 : 200, ang === 90 ? 120 : 150);
    const color = examColor(b.id);
    const t0 = firstJob(b.id);
    nodes.push({ id: `sc:${b.id}`, kind: "scenario", ...p, r: 22, color, label: b.benchmark ? `${KIND[b.id] ?? b.title} · ${b.benchmark}` : short(b.title), at: -Infinity, below: ang === 90, info: { title: b.title, body: b.benchmark ? `${b.task} (Estilo ${b.benchmark}.)` : b.task } });
    links.push({ a: "me", b: `sc:${b.id}`, kind: "own", at: Number.isFinite(t0) ? t0 : -Infinity });
    b.contexts.forEach((c, k) => {
      const ca = ang + (k ? 1 : -1) * (ang === 90 ? 30 : 14) * (Math.abs(ang) > 90 ? -1 : 1);
      const q = at(ca, ang === 90 ? 250 : 300, ang === 90 ? 170 : 210);
      nodes.push({ id: `cx:${b.id}:${c.id}`, kind: "context", ...q, r: 11, color, label: short(c.name, 24), at: -Infinity, info: { title: c.name, body: E(`A situation inside “${b.title}”. A skill only applies to its own situation.`, `Una situación dentro de «${b.title}». Una habilidad solo aplica a su propia situación.`) } });
      links.push({ a: `sc:${b.id}`, b: `cx:${b.id}:${c.id}`, kind: "own", at: -Infinity });
      const chain = skills.filter((s) => s.scenario === b.id && s.context === c.id).sort((x, y) => x.version - y.version);
      chain.forEach((s, v) => {
        const sp = at(ca, (ang === 90 ? 300 : 370) + v * 34, (ang === 90 ? 205 : 250) + v * 20);
        nodes.push({
          id: `sk:${s.id}`, kind: "skill", ...sp, r: s.status === "active" ? 10 : 7, color, label: `v${s.version}`, at: Date.parse(s.createdAt), status: s.status,
          info: { title: `${c.name} · v${s.version}`, body: s.instructions, extra: s.rationale },
        });
        links.push({ a: v ? `sk:${chain[v - 1]?.id}` : `cx:${b.id}:${c.id}`, b: `sk:${s.id}`, kind: v ? "version" : "own", at: Date.parse(s.createdAt) });
      });
    });
  });
  const ideas = notes.filter((n) => n.verdict === "experiment").slice(0, 7);
  ideas.forEach((n, i) => {
    const deg = ideas.length === 1 ? -90 : -122 + (64 * i) / (ideas.length - 1);
    const p = at(deg, 300, 252);
    nodes.push({ id: `id:${n.id}`, kind: "idea", ...p, r: 8, color: "#ff6600", label: n.title.length > 28 ? n.title.slice(0, 26) + "…" : n.title, at: Date.parse(n.assessedAt), status: n.decision ?? "pending", info: { title: n.title, body: n.gain || n.why, extra: n.why } });
    const used = skills.filter((s) => s.noteId === n.id);
    if (used.length) used.forEach((s) => links.push({ a: `id:${n.id}`, b: `sk:${s.id}`, kind: "inspired", at: Date.parse(s.createdAt) }));
    else links.push({ a: `id:${n.id}`, b: "me", kind: "inspired", at: Date.parse(n.assessedAt) });
  });
  const uses: Record<string, number> = {};
  const firstUse: Record<string, number> = {};
  for (const j of jobs) for (const e of j.state.trace ?? []) {
    uses[e.tool] = (uses[e.tool] ?? 0) + 1;
    firstUse[e.tool] = Math.min(firstUse[e.tool] ?? Infinity, Date.parse(e.at));
  }
  TOOL_ROW.forEach((id, i) => {
    const tl = TOOLS[id];
    const x = 90 + (i * (W - 180)) / (TOOL_ROW.length - 1);
    nodes.push({ id: `tl:${id}`, kind: "tool", x, y: 640, r: 20, color: tl.color, label: id, at: -Infinity, uses: uses[id] ?? 0, info: { title: id, body: tl.does } });
    links.push({ a: "me", b: `tl:${id}`, kind: "uses", at: firstUse[id] ?? Infinity, w: uses[id] ?? 0 });
  });
  return { nodes, links };
}

const curve = (a: { x: number; y: number }, b: { x: number; y: number }, bend = 0.12) => {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  return `M${a.x},${a.y} Q${mx - dy * bend},${my + dx * bend} ${b.x},${b.y}`;
};

export function Mind({ go }: { go: (t: Tab, anchor?: string) => void }) {
  const t = useT();
  const live = useLive();
  const bench = useMemo(() => (live.agent?.bench ?? []).filter((b) => !b.legacy), [live.agent]);
  const { mt } = useMt();
  const skills = useMemo(() => (live.agent?.skills ?? []).map((s) => ({ ...s, instructions: mt(s.instructions), rationale: mt(s.rationale) })), [live.agent, mt]);
  const jobs = useMemo(() => live.agent?.jobs ?? [], [live.agent]);
  const notes = live.notes ?? [];
  const { nodes, links } = useMemo(() => build(bench, skills, notes, jobs), [bench, skills, notes, jobs]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const [sel, setSel] = useState<string>("me");

  // grow: reveal everything in the order it really happened
  const times = useMemo(() => [...new Set(nodes.map((n) => n.at).concat(links.map((l) => l.at)).filter(Number.isFinite))].sort((a, b) => a - b), [nodes, links]);
  const [cursor, setCursor] = useState(Infinity);
  const grow = () => {
    if (!times.length || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    setCursor(-1);
    const id = setInterval(() => {
      const tm = times[i++];
      if (tm === undefined) { clearInterval(id); setCursor(Infinity); return; }
      setCursor(tm);
    }, Math.max(140, Math.min(600, 4200 / times.length)));
  };
  const grown = useRef(false);
  useEffect(() => { if (!grown.current && live.agent) { grown.current = true; grow(); } });
  const shown = (x: number) => x <= cursor;

  // the tool in use: live while a cycle runs, or a replay of the last cycle's trace
  const job = live.job;
  const [replay, setReplay] = useState<number | null>(null);
  const trace = job?.state.trace ?? [];
  useEffect(() => {
    if (replay === null) return;
    if (replay >= trace.length) { const id = setTimeout(() => setReplay(null), 1500); return () => clearTimeout(id); }
    const id = setTimeout(() => setReplay((r) => (r === null ? null : r + 1)), 1600);
    return () => clearTimeout(id);
  }, [replay, trace.length]);
  const running = isRunning(job) && live.driving;
  const entry = replay !== null ? trace[Math.min(replay, trace.length - 1)] : null;
  const activeTool = entry ? entry.tool : running && job ? nextUp(job)?.tool : null;
  const caption: Text | null = entry && job ? say(entry, job) : running && job ? nextUp(job)?.text ?? null : null;

  const node = byId.get(sel) ?? byId.get("me");
  const toolName = (id: string) => t(TOOLS[id as ToolId]?.name ?? E(id, id));
  const learned = skills.filter((s) => s.status === "active").length;

  return (
    <section className="mind">
      <div className="mhead">
        <p className="kicker" style={{ color: "#6d5ce8" }}>{t(E("Its brain", "Su cerebro"))}</p>
        <h1 className="h2">{t(E("Watch it connect the dots", "Míralo conectar los puntos"))}</h1>
        <p className="lead">{t(E(
          `Every dot is something it practices on, learned or uses. Today it has ${learned} active skill${learned === 1 ? "" : "s"}. Tap any dot to see what it is.`,
          `Cada punto es algo en lo que practica, que aprendió o que usa. Hoy tiene ${learned} habilidad${learned === 1 ? "" : "es"} activa${learned === 1 ? "" : "s"}. Toca cualquier punto para ver qué es.`,
        ))}</p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <button type="button" className="btn small ghost" onClick={grow}>{t(E("▶ Watch it grow", "▶ Ver cómo creció"))}</button>
          <button type="button" className="btn small ghost" disabled={!trace.length || running} onClick={() => setReplay(0)}>{t(E("▶ Replay its last cycle", "▶ Repetir su último ciclo"))}</button>
          <button type="button" className="btn small ghost" onClick={() => go("agent", "corrida")}>{t(E("Each cycle as a network →", "Cada corrida como red →"))}</button>
          <button type="button" className="btn small" onClick={() => { location.hash = "lab3d"; }}>{t(E("Watch it in 3D", "Verlo en 3D"))}</button>
        </div>
      </div>

      <div className="mind-wrap">
        <div className="mind-graph">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t(E("Graph of what the agent knows and the tools it uses", "Grafo de lo que sabe el agente y las herramientas que usa"))}>
            <defs>
              <radialGradient id="mglow"><stop offset="0" stopColor="#bfe0ff" /><stop offset="1" stopColor="#bfe0ff" stopOpacity="0" /></radialGradient>
            </defs>
            <ellipse cx={CX} cy={CY} rx={330} ry={250} fill="url(#mglow)" opacity={0.55} />
            {links.map((l, i) => {
              const a = byId.get(l.a), b = byId.get(l.b);
              if (!a || !b) return null;
              const on = shown(l.at) && shown(a.at) && shown(b.at);
              const hot = l.kind === "uses" && activeTool && l.b === `tl:${activeTool}`;
              const d = l.kind === "uses" ? curve(a, b, 0) : curve(a, b, l.kind === "inspired" ? 0.18 : 0.06);
              return (
                <g key={i}>
                  <path d={d} className={`ml ${l.kind}${on ? " in" : ""}${hot ? " hot" : ""}${l.kind === "uses" && !l.w ? " unused" : ""}`}
                    style={{ ["--w" as string]: String(l.kind === "uses" ? 1 + Math.min(4, Math.log2(1 + (l.w ?? 0))) : 1.5) }} pathLength={1} />
                  {hot && <circle r={6} className="spark" fill={TOOLS[activeTool as ToolId]?.color}><animateMotion dur="1.1s" repeatCount="indefinite" path={d} /></circle>}
                </g>
              );
            })}
            {nodes.map((n) => {
              const on = shown(n.at);
              const hot = n.kind === "tool" && n.id === `tl:${activeTool}`;
              return (
                <g key={n.id} className={`mn ${n.kind}${on ? " in" : ""}${hot ? " hot" : ""}${sel === n.id ? " sel" : ""}${n.status ? ` st-${n.status}` : ""}${n.kind === "tool" && !n.uses ? " unused" : ""}`}
                  transform={`translate(${n.x},${n.y})`} style={{ ["--c" as string]: n.color }} tabIndex={on ? 0 : -1} role="button"
                  aria-label={n.kind === "tool" ? toolName(n.label) : n.label}
                  onClick={() => setSel(n.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(n.id); } }}>
                  <g className="mn-in">
                    {n.kind === "me" ? (
                      <>
                        <circle r={n.r + 8} className="halo" />
                        <circle r={n.r} className="dot" />
                        <image href="/img/agent-ok.webp" x={-22} y={-34} width={44} height={66} />
                      </>
                    ) : (
                      <>
                        {hot && <circle r={n.r + 10} className="ring" />}
                        <circle r={n.r} className="dot" />
                        {n.kind === "tool" && <text className="ico" dy="0.35em">{TOOLS[n.label as ToolId]?.icon}</text>}
                        {n.kind === "tool" && n.uses ? <text className="count" x={n.r - 2} y={-n.r + 4}>{n.uses}</text> : null}
                      </>
                    )}
                    {n.kind !== "me" && (
                      <text className="lbl" y={n.kind === "tool" || n.below ? n.r + 16 : n.kind === "scenario" ? -n.r - 8 : n.r + 13} textAnchor="middle">
                        {n.kind === "tool" ? toolName(n.label).split(" · ")[0] : n.label}
                      </text>
                    )}
                  </g>
                </g>
              );
            })}
          </svg>
          {caption && (
            <p className="mind-cap" aria-live="polite">
              <img src="/img/agent-ok.webp" alt="" width={20} height={30} />
              {t(caption)}
            </p>
          )}
          {!live.agent && <p className="mind-empty">{t(E("Loading its brain…", "Cargando su cerebro…"))}</p>}
        </div>
        <aside className="mind-side">
          {node && (
            <div className="mind-card" style={{ ["--c" as string]: node.color }}>
              <p className="small muted">{t(({
                me: E("That's me", "Ese soy yo"), scenario: E("An exam it practices on", "Un examen en el que practica"), context: E("A situation", "Una situación"),
                skill: E("A skill it wrote itself", "Una habilidad que se escribió"), idea: E("An idea from the radar", "Una idea del radar"), tool: E("A tool it uses", "Una herramienta que usa"),
              } as Record<Kind, Text>)[node.kind])}</p>
              <h2 className="h3">{node.kind === "tool" ? toolName(node.label) : node.info.title}</h2>
              {node.status && <span className={`pill${node.status === "active" ? " ok" : node.status === "candidate" ? " amber" : ""}`}>{t(({ active: E("active", "activa"), candidate: E("waiting for you", "te espera"), rejected: E("rejected", "rechazada"), retired: E("replaced by a newer one", "reemplazada por una nueva"), approved: E("you approved it", "la aprobaste"), pending: E("not decided", "sin decidir") } as Record<string, Text>)[node.status] ?? E(node.status, node.status))}</span>}
              <p className={node.kind === "skill" ? "mono" : ""}>{typeof node.info.body === "string" ? node.info.body : t(node.info.body)}</p>
              {node.kind === "skill" && node.info.extra && <p className="small muted"><b>{t(E("Why it wrote it", "Por qué la escribió"))}:</b> {node.info.extra}</p>}
              {node.kind === "tool" && <p className="small muted">{t(E(`Used ${node.uses ?? 0} times in its recent cycles.`, `La usó ${node.uses ?? 0} veces en sus ciclos recientes.`))}</p>}
            </div>
          )}
          <ul className="mind-legend">
            <li><i className="lg sc" />{t(E("Exams it practices on", "Exámenes en los que practica"))}</li>
            <li><i className="lg cx" />{t(E("Situations inside each", "Situaciones dentro de cada uno"))}</li>
            <li><i className="lg sk" />{t(E("Skills (a chain of versions)", "Habilidades (una cadena de versiones)"))}</li>
            <li><i className="lg id" />{t(E("Radar ideas", "Ideas del radar"))}</li>
            <li><i className="lg tl" />{t(E("Tools · thicker line = used more", "Herramientas · línea más gruesa = más uso"))}</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}
