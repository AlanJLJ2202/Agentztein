// The lab, live, for every tab: the agent's state and the radar notes, loaded once, and the cycle runner. A cycle
// advances one server step at a time; the runner lives above the tabs, so it keeps going while the person moves
// around (the 3D lab, the brain graph and the companion all watch the same job). Each new step of the trace becomes
// a line the companion can say.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AgentState, Api, Job, Note } from "./api.js";
import type { Text } from "./i18n.js";
import { isRunning, RUNNING_PHASES, say } from "./story.js";

export type Beat = { id: number; text: Text; tool: string; bad?: boolean; job: Job };
export type Live = {
  agent: AgentState | null;
  notes: Note[] | null;
  failed: boolean;
  driving: boolean;
  /** the newest cycle, kept fresh while it runs */
  job: Job | null;
  beat: Beat | null;
  error: string;
  reload: () => Promise<AgentState | null>;
  reloadNotes: () => Promise<void>;
  start: (body: Record<string, unknown>) => Promise<Job | null>;
  drive: (job: Job) => Promise<void>;
};

const LiveContext = createContext<Live | null>(null);
export const useLive = (): Live => {
  const v = useContext(LiveContext);
  if (!v) throw new Error("useLive outside LiveProvider");
  return v;
};

export function LiveProvider({ client, children }: { client: Api; children: React.ReactNode }) {
  const [agent, setAgent] = useState<AgentState | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [driving, setDriving] = useState(false);
  const [beat, setBeat] = useState<Beat | null>(null);
  const [error, setError] = useState("");
  const drivingRef = useRef<string | null>(null);
  const seen = useRef(new Map<string, number>());
  const beatId = useRef(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const reload = useCallback(async () => {
    try {
      const a = await client.agent();
      setAgent(a);
      setFailed(false);
      for (const j of a.jobs) if (!seen.current.has(j.id)) seen.current.set(j.id, j.state.trace?.length ?? 0);
      return a;
    } catch {
      setFailed(true);
      return null;
    }
  }, [client]);
  const reloadNotes = useCallback(async () => {
    try { setNotes((await client.notes()).notes); } catch { setNotes([]); }
  }, [client]);
  useEffect(() => { void reload(); void reloadNotes(); }, [reload, reloadNotes]);

  // a fresh job replaces its old copy; its new trace entries become beats
  const merge = useCallback((j: Job) => {
    setAgent((a) => (a ? { ...a, jobs: [j, ...a.jobs.filter((x) => x.id !== j.id)] } : a));
    const trace = j.state.trace ?? [];
    const from = seen.current.get(j.id) ?? 0;
    const fresh = trace.slice(from);
    seen.current.set(j.id, trace.length);
    const last = fresh.at(-1);
    if (last) setBeat({ id: ++beatId.current, text: say(last, j), tool: last.tool, bad: last.tool === "harness" && last.note !== "improves", job: j });
  }, []);

  const drive = useCallback(async (j: Job) => {
    if (drivingRef.current === j.id) return;
    drivingRef.current = j.id;
    setDriving(true);
    setError("");
    let cur = j;
    merge(cur);
    try {
      while (alive.current && RUNNING_PHASES.includes(cur.phase)) {
        const r = await client.agentOp({ op: "step", jobId: cur.id });
        cur = r.job;
        merge(cur);
        if (cur.running) await new Promise((res) => setTimeout(res, 4000));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      drivingRef.current = null;
      setDriving(false);
      await reload();
    }
  }, [client, merge, reload]);

  const start = useCallback(async (body: Record<string, unknown>) => {
    setError("");
    try {
      const r = await client.agentOp({ op: "start", ...body });
      seen.current.set(r.job.id, 0);
      void drive(r.job);
      return r.job;
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, [client, drive]);

  const job = agent?.jobs[0] ?? null;
  // a cycle that was running when the page opened (and isn't stuck) keeps going on its own
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !job) return;
    resumed.current = true;
    const fresh = Date.now() - Date.parse(job.updatedAt) < 10 * 60_000;
    if (isRunning(job) && fresh) void drive(job);
  }, [job, drive]);

  const value = useMemo<Live>(
    () => ({ agent, notes, failed, driving, job, beat, error, reload, reloadNotes, start, drive }),
    [agent, notes, failed, driving, job, beat, error, reload, reloadNotes, start, drive],
  );
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
