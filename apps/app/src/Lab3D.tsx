// The landing's 3D lab, inside the app: the same building (the cradle, one room per benchmark and the central
// workshop), embedded from /?embed=lab. You can walk it freely; with "Follow Agentztein" on, while a real cycle runs
// the agent walks to the room where each step happens (the exam rooms, the science lab for the radar, the central
// workshop when it writes a skill, the cradle when the harness and you decide) and says what it is doing.
import { useEffect, useRef, useState } from "react";
import type { Tab } from "./App.js";
import { useT } from "./i18n.js";
import { mtEntry, mtJob, useMt } from "./translate.js";
import { useLive } from "./live.js";
import { E, isRunning, nextUp, ROOM_NAME, roomFor, say, toolOf } from "./story.js";
import { savedCap } from "./Companion.js";

export function Lab3D({ go, lang }: { go: (t: Tab) => void; lang: string }) {
  const t = useT();
  const live = useLive();
  const { mt } = useMt();
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [follow, setFollow] = useState(true);
  const [where, setWhere] = useState<string | null>(null);
  const job = live.job;
  const running = isRunning(job) && live.driving;

  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.origin === location.origin && e.data?.type === "agz:ready") setReady(true); };
    addEventListener("message", on);
    return () => removeEventListener("message", on);
  }, []);
  const send = (msg: Record<string, unknown>) => frame.current?.contentWindow?.postMessage(msg, location.origin);

  // each new step: walk to its room and say it
  useEffect(() => {
    if (!ready || !follow || !live.beat) return;
    const b = live.beat;
    const room = roomFor({ tool: b.tool }, b.job.scenario);
    setWhere(room);
    send({ type: "agz:goto", room });
    send({ type: "agz:say", text: t(b.entry ? say(mtEntry(b.entry, mt), mtJob(b.job, mt)) : b.text) });
  }, [live.beat, ready, follow, t]);
  // while a step runs, it heads to where the next one happens
  const upcoming = job ? nextUp(job) : null;
  useEffect(() => {
    if (!ready || !follow || !running || !upcoming || !job) return;
    const room = roomFor({ tool: upcoming.tool }, job.scenario);
    setWhere(room);
    send({ type: "agz:goto", room });
    send({ type: "agz:say", text: t(upcoming.text) });
  }, [ready, follow, running, job?.phase, job?.id, t]);

  const trace = job?.state.trace ?? [];
  const [busy, setBusy] = useState(false);
  const letItDecide = async () => {
    setBusy(true);
    try { await live.start({ auto: true, maxCost: savedCap(), lang }); } catch { /* the companion and Agent tab show the error */ } finally { setBusy(false); }
  };

  return (
    <section className="lab3d">
      <div className="lab3d-bar">
        <div>
          <p className="kicker">{t(E("3D lab", "Laboratorio 3D"))}</p>
          <h1 className="h3">{running && upcoming ? t(upcoming.text) : t(E("Walk through its lab", "Recorre su laboratorio"))}</h1>
          <p className="small muted">
            {running && where
              ? t(E(`It's in ${t(ROOM_NAME[where] ?? E(where, where))}.`, `Está en ${t(ROOM_NAME[where] ?? E(where, where))}.`))
              : t(E("Tap the floor or a door to walk. When it works, it goes to the room of each step.", "Toca el piso o una puerta para caminar. Cuando trabaja, va al cuarto de cada paso."))}
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <label className="switch">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            <span>{t(E("Follow Agentztein", "Seguir a Agentztein"))}</span>
          </label>
          {!running && live.agent?.key && (
            <button type="button" className="btn small" onClick={() => void letItDecide()} disabled={busy}>
              {t(E(`Let it improve itself (cap $${savedCap().toFixed(2)})`, `Que se mejore solo (tope $${savedCap().toFixed(2)})`))}
            </button>
          )}
          <button type="button" className="btn small ghost" onClick={() => frame.current?.requestFullscreen?.().catch(() => undefined)}>{t(E("Full screen", "Pantalla completa"))}</button>
        </div>
      </div>
      <div className="lab3d-stage">
        <iframe ref={frame} src={`/?embed=lab&lang=${lang}`} title={t(E("Agentztein's 3D lab", "Laboratorio 3D de Agentztein"))} allow="fullscreen; autoplay" />
        {!ready && <p className="lab3d-wait"><span className="spin" aria-hidden="true" /> {t(E("Opening the lab…", "Abriendo el laboratorio…"))}</p>}
      </div>
      {trace.length > 0 && (
        <ol className="lab3d-trace" aria-label={t(E("What it did in its latest cycle", "Lo que hizo en su último ciclo"))}>
          {trace.slice(-8).map((e, i, arr) => {
            const tl = toolOf(e.tool);
            const room = roomFor(e, job?.scenario ?? "");
            return (
              <li key={i} className={i === arr.length - 1 ? "now" : ""} style={{ ["--c" as string]: tl.color }}>
                <span className="ico" aria-hidden="true">{tl.icon}</span>
                <span>
                  {job ? t(say(mtEntry(e, mt), mtJob(job, mt))) : ""}
                  <small>{t(tl.name)} · {t(ROOM_NAME[room] ?? E(room, room))}{e.cost ? ` · $${e.cost.toFixed(4)}` : ""}</small>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {!trace.length && !job && <p className="fine">{t(E("No cycles yet: start one and watch it walk from room to room.", "Aún no hay ciclos: inicia uno y míralo caminar de cuarto en cuarto."))} <button type="button" className="link" onClick={() => go("agent")}>{t(E("Start one", "Iniciar uno"))}</button></p>}
    </section>
  );
}
