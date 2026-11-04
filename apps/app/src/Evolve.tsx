// Your agent changing its own code (ADR-026), with your own Meta key: Muse Wonder proposes a change, Muse Code builds
// it in GitHub Actions on a copy of YOUR core, and the judge gives your current core and the new one an exam nobody
// has seen. A version that scores higher and breaks nothing becomes your active core; you can always go back.
import { useCallback, useEffect, useState } from "react";
import { Robot } from "./Robot.js";
import { ApiError, type Api, type CoreVersion, type EvolveRun, type EvolveState } from "./api.js";
import type { Tab } from "./App.js";
import { useT, type Text } from "./i18n.js";
import { MetaMark } from "./Logos.js";
import { SetupAlerts } from "./SetupAlerts.js";

const E = (en: string, es: string): Text => ({ en, es });
const L = {
  kicker: E("Self-change · your Meta key", "Auto-cambio · tu llave de Meta"),
  title: E("Your agent rewrites its own code", "Tu agente reescribe su propio código"),
  lead: E(
    "Not a text skill: real code. Your agent has its own copy of its core. Muse Wonder proposes one change, Muse Code writes it in a sandbox, and the judge gives your current version and the new one an exam generated on the spot. The new one replaces yours only if it scores higher and breaks nothing.",
    "No una habilidad de texto: código real. Tu agente tiene su propia copia de su núcleo. Muse Wonder propone un cambio, Muse Code lo escribe en un sandbox y el juez examina tu versión actual y la nueva con un examen generado en el momento. La nueva reemplaza a la tuya solo si saca más y no rompe nada.",
  ),
  pipeline: [
    { who: "Muse Wonder", what: E("proposes a hypothesis", "propone una hipótesis") },
    { who: "Muse Code", what: E("changes your core in a sandbox", "cambia tu núcleo en un sandbox") },
    { who: "Muse Spark", what: E("takes a fresh exam, old vs new", "presenta un examen nuevo, viejo vs nuevo") },
    { who: E("Judge", "Juez"), what: E("adopts it only if it improves", "lo adopta solo si mejora") },
  ],
  today: E("Your core today", "Tu núcleo hoy"),
  platform: E("the platform's (v0)", "el de la plataforma (v0)"),
  builder: E("Who writes the code", "Quién escribe el código"),
  builders: {
    "muse-code": E("Muse Code (Meta's coding agent)", "Muse Code (el agente de código de Meta)"),
    forja: E("Forja (Muse with function calling, capped spend)", "Forja (Muse con function calling, gasto con tope)"),
  } as Record<string, Text>,
  museNote: E("Muse Code bills its own use to your key; only Forja's spend is capped here.", "Muse Code cobra su propio uso a tu llave; aquí solo se le pone tope al gasto de Forja."),
  propose: E("Let Muse Wonder propose a change", "Que Muse Wonder proponga un cambio"),
  guidance: E("Guidance for the planner (optional)", "Guía para el planificador (opcional)"),
  guidancePh: E("e.g. the tolerance math fails with decimals", "p. ej. falla la cuenta de tolerancias con decimales"),
  own: E("Or send your own idea", "O manda tu propia idea"),
  ownTitle: E("Title", "Título"),
  ownIdea: E("What it should try", "Qué debería intentar"),
  send: E("Send to the builder", "Mandar al constructor"),
  limits: E("Up to $X of your budget per run, N runs a day.", "Hasta $X de tu presupuesto por corrida, N corridas al día."),
  notConfigured: E("You can start a run as soon as the server setup above is complete.", "Podrás iniciar una corrida en cuanto esté completa la configuración del servidor de arriba."),
  runs: E("Runs", "Corridas"),
  versions: E("Your versions", "Tus versiones"),
  none: E("No runs yet. The first one starts here.", "Todavía no hay corridas. La primera empieza aquí."),
  noVersions: E("You still run the platform's core. Your first version that passes the judge will appear here.", "Todavía corres el núcleo de la plataforma. Tu primera versión que pase al juez aparecerá aquí."),
  status: {
    queued: E("queued", "en cola"), building: E("building", "construyendo"), passed: E("adopted", "adoptada"),
    rejected: E("rejected by the judge", "rechazada por el juez"), failed: E("failed", "falló"),
    active: E("active", "activa"), retired: E("previous", "anterior"), candidate: E("candidate", "candidata"),
  } as Record<string, Text>,
  reasons: {
    improves: E("improves", "mejora"), "no-gain": E("doesn't improve enough", "no mejora lo suficiente"),
    regression: E("breaks a scenario", "rompe un escenario"), broken: E("fails where yours works", "falla donde la tuya funciona"),
    rules: E("breaks the rules", "rompe las reglas"),
  } as Record<string, Text>,
  use: E("Use this one", "Usar esta"),
  backToPlatform: E("Go back to the platform's core", "Volver al núcleo de la plataforma"),
  showCode: E("Code", "Código"),
  hideCode: E("Hide", "Ocultar"),
  ci: E("run in GitHub Actions", "corrida en GitHub Actions"),
};

const score = (b: { correct: number; total: number } | null | undefined) => (b ? `${b.correct}/${b.total}` : "—");

export function Evolve({ client, go }: { client: Api; go: (t: Tab) => void }) {
  const t = useT();
  const [data, setData] = useState<EvolveState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [guidance, setGuidance] = useState("");
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [builder, setBuilder] = useState<"muse-code" | "forja">("muse-code");
  const [code, setCode] = useState<{ id: string; files: Record<string, string> } | null>(null);

  const load = useCallback(async () => {
    try { setData(await client.evolve()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [client]);
  useEffect(() => { void load(); }, [load]);
  const working = data?.runs.some((r) => r.status === "queued" || r.status === "building") ?? false;
  useEffect(() => {
    if (!working) return;
    const id = setInterval(() => void load(), 15_000);
    return () => clearInterval(id);
  }, [working, load]);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try {
      await client.evolveOp(body);
      if (body.op !== "activate") { setTitle(""); setIdea(""); setGuidance(""); }
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.reason === "no-key") go("brain");
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  const toggleCode = async (c: CoreVersion) => {
    if (code?.id === c.id) { setCode(null); return; }
    try { const r = await client.coreFiles(c.id); setCode({ id: c.id, files: r.files }); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  if (!data) return <section><p className="muted">{error || "…"}</p></section>;
  const today = data.active ? `v${data.active.version} · ${data.active.coreVersion}` : `${t(L.platform)} · ${data.platform.version}`;

  return (
    <section className="agent evolve">
      <div className="agent-head">
        <div>
          <p className="kicker meta-k"><MetaMark size={20} /> {t(L.kicker)}</p>
          <h1 className="h1">{t(L.title)}</h1>
          <Robot
            className="radar-robot"
            scene="code"
            say={working
              ? t({ en: "A judge is examining my new code with an exam I've never seen…", es: "Un juez está examinando mi código nuevo con un examen que nunca he visto…" })
              : t({ en: "Here I can rewrite my own code. A judge tests it, and I only keep a version that does better.", es: "Aquí puedo reescribir mi propio código. Un juez lo prueba y solo me quedo con una versión que lo haga mejor." })}
          />
          <details className="more small"><summary>{t({ en: "How it works", es: "Cómo funciona" })}</summary><p className="muted">{t(L.lead)}</p></details>
        </div>
      </div>
      <ol className="evo-pipe">
        {L.pipeline.map((p, i) => <li key={i}><b>{typeof p.who === "string" ? p.who : t(p.who)}</b><span>{t(p.what)}</span></li>)}
      </ol>
      <p className="small"><b>{t(L.today)}:</b> <code>{today}</code> · {data.active?.strategy ?? data.platform.strategy}</p>

      <SetupAlerts checks={data.health.checks} go={go} all />
      {!data.configured || data.health.checks.some((c) => c.who === "admin" && c.ok === false) ? (
        <p className="notice">{t(L.notConfigured)}</p>
      ) : (
        <>
          <div className="agent-grid">
            <div className="runbox">
              <label className="field">
                <span>{t(L.builder)}</span>
                <select value={builder} onChange={(e) => setBuilder(e.target.value as "muse-code" | "forja")}>
                  {(["muse-code", "forja"] as const).map((b) => <option key={b} value={b}>{t(L.builders[b] ?? E(b, b))}</option>)}
                </select>
              </label>
              {builder === "muse-code" && <p className="fine">{t(L.museNote)}</p>}
              <label className="field">
                <span>{t(L.guidance)}</span>
                <textarea rows={2} value={guidance} maxLength={500} placeholder={t(L.guidancePh)} onChange={(e) => setGuidance(e.target.value)} />
              </label>
              <button type="button" className="btn" disabled={busy || working} aria-busy={busy} onClick={() => void act({ op: "propose", guidance, builder })}>
                {busy && <span className="spin light" aria-hidden="true" />} {t(L.propose)}
              </button>
              <p className="fine">{t(L.limits).replace("X", data.limits.maxUsd.toFixed(2)).replace("N", String(data.limits.dailyRuns))}</p>
            </div>
            <div className="runbox">
              <p className="small"><b>{t(L.own)}</b></p>
              <label className="field"><span>{t(L.ownTitle)}</span><input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} /></label>
              <label className="field"><span>{t(L.ownIdea)}</span><textarea rows={3} value={idea} maxLength={3000} onChange={(e) => setIdea(e.target.value)} /></label>
              <button type="button" className="btn ghost" disabled={busy || working || title.trim().length < 5} onClick={() => void act({ op: "dispatch", title, idea, builder })}>{t(L.send)}</button>
            </div>
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      <div className="evo-lists">
        <div>
          <h2 className="h3">{t(L.runs)}</h2>
          {data.runs.length === 0 ? <p className="muted small">{t(L.none)}</p> : (
            <ul className="evo-list">{data.runs.map((r) => <RunItem key={r.id} r={r} />)}</ul>
          )}
        </div>
        <div>
          <h2 className="h3">{t(L.versions)}</h2>
          {data.cores.length === 0 ? <p className="muted small">{t(L.noVersions)}</p> : (
            <ul className="evo-list">
              {data.cores.map((c) => (
                <li key={c.id} className={`evo-${c.status === "active" ? "merged" : c.status === "rejected" ? "closed" : "open"}`}>
                  <span><b>v{c.version}</b> · <code>{c.coreVersion}</code> · {t(L.status[c.status] ?? E(c.status, c.status))} · {c.builder}</span>
                  <span className="small muted">
                    {c.verdict && <>{score(c.verdict.base)} → {score(c.verdict.head)} ({c.verdict.gain >= 0 ? "+" : ""}{c.verdict.gain}) · {t(L.reasons[c.verdict.reason] ?? E(c.verdict.reason, c.verdict.reason))}</>}
                    {c.changed.length > 0 && <> · {c.changed.join(", ")}</>}
                  </span>
                  {c.changes && <p className="small">{c.changes.split("\n")[0]}</p>}
                  <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    {c.status !== "active" && c.verdict?.pass && <button type="button" className="btn small ghost" disabled={busy} onClick={() => void act({ op: "activate", coreId: c.id })}>{t(L.use)}</button>}
                    <button type="button" className="btn small ghost" onClick={() => void toggleCode(c)}>{code?.id === c.id ? t(L.hideCode) : t(L.showCode)}</button>
                  </span>
                  {code?.id === c.id && Object.entries(code.files).filter(([p]) => p.startsWith("src/")).map(([p, text]) => (
                    <details key={p}><summary><code>{p}</code></summary><pre className="diff">{text}</pre></details>
                  ))}
                </li>
              ))}
            </ul>
          )}
          {data.active && <button type="button" className="btn small ghost" style={{ marginTop: 10 }} disabled={busy} onClick={() => void act({ op: "activate", coreId: null })}>{t(L.backToPlatform)}</button>}
        </div>
      </div>
    </section>
  );
}

function RunItem({ r }: { r: EvolveRun }) {
  const t = useT();
  const live = r.status === "queued" || r.status === "building";
  return (
    <li className={`evo-${r.status === "passed" ? "merged" : r.status === "rejected" || r.status === "failed" ? "closed" : "open"}`}>
      <span>{live && <span className="spin" aria-hidden="true" />} <b>{r.proposal.title}</b></span>
      <span className="small muted">
        {t(L.status[r.status] ?? E(r.status, r.status))}{r.stage && live ? ` · ${r.stage}` : ""} · {r.builder}
        {r.verdict && <> · {score(r.base)} → {score(r.head)} ({r.verdict.gain >= 0 ? "+" : ""}{r.verdict.gain}) · {t(L.reasons[r.verdict.reason] ?? E(r.verdict.reason, r.verdict.reason))}</>}
        {r.costUsd > 0 && <> · ${r.costUsd.toFixed(3)}</>}
        {r.ciUrl && <> · <a href={r.ciUrl} target="_blank" rel="noreferrer">{t(L.ci)}</a></>}
      </span>
      {r.proposal.hypothesis && <p className="small">{r.proposal.hypothesis}</p>}
      {r.error && <p className="error small">{r.error}</p>}
    </li>
  );
}
