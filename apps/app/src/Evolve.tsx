// The agent changing its own code (ADR-026): Muse Wonder proposes a change, Muse Code builds it in GitHub Actions,
// the gate examines it with an exam nobody has seen and merges it only if it improves without breaking anything.
// This screen sends the idea and shows the lineage: versions (agent-vN), attempts and the gate's verdicts.
import { useCallback, useEffect, useState } from "react";
import { ApiError, type Api, type EvolveState } from "./api.js";
import type { Tab } from "./App.js";
import { useT, type Text } from "./i18n.js";
import { MetaMark } from "./Logos.js";

const E = (en: string, es: string): Text => ({ en, es });
const L = {
  kicker: E("Self-change · Meta models only", "Auto-cambio · solo modelos de Meta"),
  title: E("The agent rewrites its own code", "El agente reescribe su propio código"),
  lead: E(
    "Not a text skill: real code in packages/agent-core. Muse Wonder proposes one change, Muse Code writes it in a sandbox, and the gate gives the old and new versions an exam generated on the spot. It merges only if the new one scores higher and breaks nothing.",
    "No una skill de texto: código real en packages/agent-core. Muse Wonder propone un cambio, Muse Code lo escribe en un sandbox y el gate examina la versión vieja y la nueva con un examen generado en el momento. Solo se fusiona si la nueva saca más y no rompe nada.",
  ),
  pipeline: [
    { who: "Muse Wonder", what: E("proposes a hypothesis", "propone una hipótesis") },
    { who: "Muse Code", what: E("changes the core in a sandbox", "cambia el núcleo en un sandbox") },
    { who: "Muse Spark", what: E("takes a fresh exam, old vs new", "presenta un examen nuevo, viejo vs nuevo") },
    { who: E("Gate", "Gate"), what: E("merges only if it improves", "fusiona solo si mejora") },
  ],
  today: E("Running today", "Corriendo hoy"),
  propose: E("Let Muse Wonder propose a change", "Que Muse Wonder proponga un cambio"),
  guidance: E("Guidance for the planner (optional)", "Guía para el planificador (opcional)"),
  guidancePh: E("e.g. the tolerance math fails with decimals", "p. ej. falla la cuenta de tolerancias con decimales"),
  own: E("Or send your own idea", "O manda tu propia idea"),
  ownTitle: E("Title", "Título"),
  ownIdea: E("What it should try", "Qué debería intentar"),
  send: E("Send to Muse Code", "Mandar a Muse Code"),
  sent: E("Sent. GitHub Actions is building it:", "Enviado. GitHub Actions lo está construyendo:"),
  notAdmin: E("Only the lab's admins can send the agent to change its code (it spends the project's Meta key).", "Solo quien administra el laboratorio puede mandar al agente a cambiar su código (gasta la llave de Meta del proyecto)."),
  notConfigured: E("GitHub isn't connected yet. Missing in Vercel:", "GitHub aún no está conectado. Falta en Vercel:"),
  versions: E("Versions", "Versiones"),
  attempts: E("Attempts", "Intentos"),
  inProgress: E("Being built", "En construcción"),
  none: E("No attempts yet. The first one starts here.", "Todavía no hay intentos. El primero empieza aquí."),
  states: { merged: E("merged", "fusionado"), open: E("open", "abierto"), closed: E("closed", "cerrado") } as Record<string, Text>,
  gate: { merge: E("passed", "pasó"), human: E("a person decides", "decide una persona"), reject: E("rejected", "rechazado"), skip: E("nothing to judge", "nada que juzgar") } as Record<string, Text>,
  by: E("built by", "lo hizo"),
};

export function Evolve({ client, go }: { client: Api; go: (t: Tab) => void }) {
  const t = useT();
  const [data, setData] = useState<EvolveState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [guidance, setGuidance] = useState("");
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [sent, setSent] = useState<{ number: number; url: string; title: string } | null>(null);

  const load = useCallback(async () => {
    try { setData(await client.evolve()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [client]);
  useEffect(() => { void load(); }, [load]);
  // while something is being built, check GitHub now and then
  useEffect(() => {
    if (!data?.ideas.length && !data?.prs.some((p) => p.state === "open")) return;
    const id = setInterval(() => void load(), 20_000);
    return () => clearInterval(id);
  }, [data, load]);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true); setError(""); setSent(null);
    try {
      const out = await client.evolveOp(body);
      setSent(out.issue);
      setTitle(""); setIdea(""); setGuidance("");
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.reason === "no-key") go("brain");
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  if (!data) return <section><p className="muted">{error || "…"}</p></section>;

  return (
    <section className="agent evolve">
      <div className="agent-head">
        <div>
          <p className="kicker meta-k"><MetaMark size={20} /> {t(L.kicker)}</p>
          <h1 className="h1">{t(L.title)}</h1>
          <p className="lead">{t(L.lead)}</p>
        </div>
      </div>
      <ol className="evo-pipe">
        {L.pipeline.map((p, i) => (
          <li key={i}><b>{typeof p.who === "string" ? p.who : t(p.who)}</b><span>{t(p.what)}</span></li>
        ))}
      </ol>
      <p className="small"><b>{t(L.today)}:</b> <code>{data.core.version}</code> · {data.core.strategy}</p>

      {!data.configured ? (
        <p className="notice">{t(L.notConfigured)} {data.missing?.map((m) => <code key={m}>{m}</code>)}</p>
      ) : !data.canDispatch ? (
        <p className="notice">{t(L.notAdmin)}</p>
      ) : (
        <div className="agent-grid">
          <div className="runbox">
            <label className="field">
              <span>{t(L.guidance)}</span>
              <textarea rows={2} value={guidance} maxLength={500} placeholder={t(L.guidancePh)} onChange={(e) => setGuidance(e.target.value)} />
            </label>
            <button type="button" className="btn" disabled={busy} aria-busy={busy} onClick={() => void send({ op: "propose", guidance })}>
              {busy && <span className="spin light" aria-hidden="true" />} {t(L.propose)}
            </button>
          </div>
          <div className="runbox">
            <p className="small"><b>{t(L.own)}</b></p>
            <label className="field"><span>{t(L.ownTitle)}</span><input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="field"><span>{t(L.ownIdea)}</span><textarea rows={3} value={idea} maxLength={3000} onChange={(e) => setIdea(e.target.value)} /></label>
            <button type="button" className="btn ghost" disabled={busy || title.trim().length < 5} onClick={() => void send({ op: "dispatch", title, idea })}>{t(L.send)}</button>
          </div>
        </div>
      )}
      {sent && <p className="notice" role="status">{t(L.sent)} <a href={sent.url} target="_blank" rel="noreferrer">#{sent.number} {sent.title}</a></p>}
      {error && <p className="error" role="alert">{error}</p>}

      {data.configured && (
        <div className="evo-lists">
          {data.versions.length > 0 && (
            <div>
              <h2 className="h3">{t(L.versions)}</h2>
              <p className="evo-tags">{data.versions.map((v) => <code key={v.tag} title={v.sha}>{v.tag}</code>)}</p>
            </div>
          )}
          {data.ideas.length > 0 && (
            <div>
              <h2 className="h3">{t(L.inProgress)}</h2>
              <ul className="evo-list">{data.ideas.map((i) => <li key={i.number}><span className="spin" aria-hidden="true" /> <a href={i.url} target="_blank" rel="noreferrer">#{i.number} {i.title}</a></li>)}</ul>
            </div>
          )}
          <div>
            <h2 className="h3">{t(L.attempts)}</h2>
            {data.prs.length === 0 ? <p className="muted small">{t(L.none)}</p> : (
              <ul className="evo-list">
                {data.prs.map((p) => (
                  <li key={p.number} className={`evo-${p.state}`}>
                    <a href={p.url} target="_blank" rel="noreferrer">#{p.number} {p.title}</a>
                    <span className="small muted">
                      {t(L.states[p.state] ?? E(p.state, p.state))}
                      {p.gate?.decision && <> · gate: {t(L.gate[p.gate.decision] ?? E(p.gate.decision, p.gate.decision))}</>}
                      {p.gate?.base && p.gate.head && <> · {p.gate.base.correct}/{p.gate.base.total} → {p.gate.head.correct}/{p.gate.head.total} ({(p.gate.gain ?? 0) >= 0 ? "+" : ""}{p.gate.gain})</>}
                      {p.builder && <> · {t(L.by)} {p.builder}</>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
