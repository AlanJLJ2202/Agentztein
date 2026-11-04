// The research radar: what's new this week in its four sources (Hacker News, arXiv, Hugging Face Papers and GitHub),
// and what Agentztein decided about it.
import { CAPABILITIES, EFFORTS, familyOf, fetchLiveFeed, SOURCE_IDS, SOURCES, type Story } from "@skillab/research";
import { useEffect, useState } from "react";
import { ApiError, type Api, type Budget, type Note, type SavedKey, type Verdict } from "./api.js";
import type { Tab } from "./App.js";
import { T, useT, type Lang } from "./i18n.js";
import { useMt } from "./translate.js";
import { SourcesMark, SourceTag } from "./Logos.js";

type Props = { client: Api; keys: SavedKey[] | null; onKeys: (k: SavedKey[]) => void; onNotes: (n: number) => void; go: (t: Tab) => void; lang: Lang };
type Cap = keyof typeof CAPABILITIES;

const ago = (iso: string | null, lang: Lang) => {
  if (!iso) return "";
  const h = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000));
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  return h < 48 ? rtf.format(-h, "hour") : rtf.format(-Math.round(h / 24), "day");
};

function CapChip({ cap, lang }: { cap: string | null; lang: Lang }) {
  if (!cap || !(cap in CAPABILITIES)) return null;
  const c = CAPABILITIES[cap as Cap];
  return <span className="cap" style={{ "--c": c.color } as React.CSSProperties}><i />{c[lang]}</span>;
}

export function Radar({ client, keys, onKeys, onNotes, go, lang }: Props) {
  const t = useT();
  const { mt } = useMt();
  const [stories, setStories] = useState<Story[] | null>(null);
  const [liveError, setLiveError] = useState(false);
  const [down, setDown] = useState<string[]>([]);
  const [stale, setStale] = useState<string[]>([]);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [filter, setFilter] = useState<Verdict | "all">("all");
  const [provider, setProvider] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastRun, setLastRun] = useState<{ read: number; model?: string } | null>(null);
  const [effort, setEffort] = useState<string>("low");
  const [budget, setBudget] = useState<Budget | null>(null);
  useEffect(() => { client.limits().then(setBudget).catch(() => undefined); }, [client]);
  const decide = async (id: string, decision: "approved" | "rejected") => {
    try {
      const r = await client.decide(id, decision);
      setNotes((prev) => (prev ?? []).map((n) => (n.id === id ? r.note : n)));
    } catch (err) { setError((err as Error).message); }
  };

  useEffect(() => {
    const ctl = new AbortController();
    fetchLiveFeed({ limit: 14, signal: ctl.signal })
      .then((r) => { setStories(r.items); setDown(r.sources.filter((s) => !s.ok && !(s as { stale?: boolean }).stale).map((s) => s.id)); setStale(r.sources.filter((s) => (s as { stale?: boolean }).stale).map((s) => s.id)); })
      .catch(() => !ctl.signal.aborted && setLiveError(true));
    client.notes().then((r) => { setNotes(r.notes); onNotes(r.notes.length); }).catch(() => setNotes([]));
    return () => ctl.abort();
  }, [client, onNotes]);
  useEffect(() => {
    if (!keys) client.keys().then((r) => onKeys(r.keys)).catch(() => onKeys([]));
  }, [client, keys, onKeys]);
  useEffect(() => {
    if (!provider && keys?.[0]) setProvider(keys[0].provider);
  }, [keys, provider]);

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await client.triage(provider, lang, takesEffort ? effort : null);
      const fresh = new Set(r.notes.map((n) => n.id));
      const merged = [...r.notes, ...(notes ?? []).filter((n) => !fresh.has(n.id))];
      setNotes(merged);
      onNotes(merged.length);
      setLastRun({ read: r.read, ...(r.model ? { model: r.model } : {}) });
      if (r.budget) setBudget(r.budget);
    } catch (err) {
      setError(err instanceof ApiError ? (err.reason === "budget" ? t(T.harness.overBudget) : err.message) : t(T.liveError));
    } finally {
      setBusy(false);
    }
  };

  const hasKey = Boolean(keys?.length);
  const activeKey = keys?.find((k) => k.provider === provider) ?? keys?.[0];
  const fam = familyOf(activeKey?.model);
  const takesEffort = !fam || fam.effort;
  const shown = (notes ?? []).filter((n) => filter === "all" || n.verdict === filter);
  const count = (v: Verdict) => (notes ?? []).filter((n) => n.verdict === v).length;
  return (
    <section>
      <div className="radar-head">
        <div>
          <p className="kicker"><SourcesMark size={20} /> {SOURCE_IDS.map((id) => SOURCES[id].name).join(" · ")}</p>
          <h1 className="h1">{t(T.radarTitle)}</h1>
          <p className="lead">{t(T.radarLead)}</p>
        </div>
        <div className="runbox">
          {hasKey ? (
            <>
              {keys && keys.length > 1 && (
                <label className="field">
                  <span>{t(T.model)}</span>
                  <select value={provider ?? ""} onChange={(e) => setProvider(e.target.value)}>
                    {keys.map((k) => <option key={k.provider} value={k.provider}>{k.provider} · {k.model ?? "?"}</option>)}
                  </select>
                </label>
              )}
              <p className="small"><b>{fam?.name ?? activeKey?.model}</b>{activeKey?.model ? <span className="muted"> · {activeKey.model}</span> : null}</p>
              {takesEffort ? (
                <label className="field">
                  <span>{t(T.effort)}</span>
                  <div className="effort-pick" role="radiogroup" aria-label={t(T.effort)}>
                    {EFFORTS.map((e) => (
                      <button key={e} type="button" role="radio" aria-checked={effort === e} onClick={() => setEffort(e)}>{e}</button>
                    ))}
                  </div>
                  <small className="muted">{t(T.effortHelp)}</small>
                </label>
              ) : fam?.note ? <p className="muted small">{t(fam.note)}</p> : null}
              <button type="button" className="btn" onClick={() => void run()} disabled={busy} aria-busy={busy}>
                {busy && <span className="spin light" aria-hidden="true" />}
                {busy ? t(T.triaging) : t(T.triage)}
              </button>
              {budget && <p className="muted small">${budget.spent.toFixed(4)} / ${budget.monthly.toFixed(2)} {t(T.harness.spent)}</p>}
              {lastRun && <p className="muted small">{lastRun.read} {t(T.read)}{lastRun.model ? ` · ${lastRun.model}` : ""}</p>}
            </>
          ) : (
            <>
              <p className="muted">{t(T.needKey)}</p>
              <button type="button" className="btn" onClick={() => go("brain")}>{t(T.tabs.brain)} →</button>
            </>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </div>

      <div className="radar-grid">
        <div>
          <div className="row between">
            <h2 className="h3">{t(T.notesTitle)}</h2>
          </div>
          <div className="chips" role="group" aria-label={t(T.notesTitle)}>
            {(["all", "experiment", "watch", "skip"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)} className={`chip ${v}`}>
                {v === "all" ? t(T.all) : t(T.verdict[v])}
                {v !== "all" && <b>{count(v)}</b>}
              </button>
            ))}
          </div>
          {notes === null ? (
            <p className="muted">{t(T.loading)}</p>
          ) : shown.length === 0 ? (
            <p className="empty">{t(T.notesEmpty)}</p>
          ) : (
            <ol className="notes">
              {shown.map((n) => (
                <li key={n.id} className={`note ${n.verdict}`}>
                  <div className="note-top">
                    <span className={`verdict ${n.verdict}`}>{t(T.verdict[n.verdict])}</span>
                    <SourceTag source={n.source} />
                    <CapChip cap={n.capability} lang={lang} />
                  </div>
                  <h3><a href={n.url ?? n.discussionUrl ?? "#"} target="_blank" rel="noreferrer">{n.title}</a></h3>
                  <dl>
                    {n.gain && <div><dt>{t(T.gain)}</dt><dd>{mt(n.gain)}</dd></div>}
                    {n.cost && <div><dt>{t(T.cost)}</dt><dd>{mt(n.cost)}</dd></div>}
                    {n.why && <div><dt>{t(T.why)}</dt><dd>{mt(n.why)}</dd></div>}
                  </dl>
                  {n.verdict === "experiment" && (
                    n.decision ? (
                      <p className={`decided ${n.decision}`}>{n.decision === "approved" ? t(T.harness.approved) : t(T.harness.rejected)}</p>
                    ) : (
                      <div className="decide">
                        <span className="muted small">{t(T.harness.needsYou)}</span>
                        <button type="button" className="btn small" onClick={() => void decide(n.id, "approved")}>{t(T.harness.approve)}</button>
                        <button type="button" className="btn small ghost" onClick={() => void decide(n.id, "rejected")}>{t(T.harness.reject)}</button>
                      </div>
                    )
                  )}
                  <p className="meta">
                    {n.points ?? 0} {t(T.points)} · {n.discussionUrl && <a href={n.discussionUrl} target="_blank" rel="noreferrer">{t(T.discussion)}</a>} · {t(T.judgedBy)} {n.model} · {ago(n.assessedAt, lang)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="live">
          <h2 className="h3"><span className="dot-live" aria-hidden="true" />{t(T.liveTitle)}</h2>
          {liveError ? (
            <p className="error">{t(T.liveError)}</p>
          ) : !stories ? (
            <p className="muted">{t(T.loading)}</p>
          ) : (
            <ol className="stories">
              {stories.map((s) => (
                <li key={s.id}>
                  <a href={s.url ?? s.hnUrl} target="_blank" rel="noreferrer">{s.title}</a>
                  <p className="meta">
                    <SourceTag source={s.source} /> <CapChip cap={s.hint} lang={lang} /> {s.points ? `${s.points} ${t(T.points)} · ` : ""}{s.source === "hackernews" || !s.source ? <><a href={s.hnUrl} target="_blank" rel="noreferrer">{s.comments} {t(T.comments)}</a> · </> : null}{ago(s.postedAt, lang)}
                  </p>
                </li>
              ))}
            </ol>
          )}
          {down.length > 0 && <p className="fine">{down.map((d) => SOURCES[d as keyof typeof SOURCES]?.name ?? d).join(", ")} {t(T.sourceDown)}.</p>}
          {stale.length > 0 && <p className="fine">{stale.map((d) => SOURCES[d as keyof typeof SOURCES]?.name ?? d).join(", ")} {t(T.sourceStale)}.</p>}
          <p className="fine">{t(T.liveNote)} {t(T.hnNote)}</p>
        </aside>
      </div>
    </section>
  );
}
