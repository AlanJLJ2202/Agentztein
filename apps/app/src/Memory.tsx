// Its memory, and you in control of it (ADR-031): the lessons it consolidated while dreaming, how strong each one is,
// where it applies, and the last dreams. You can make it dream now, pin a lesson (it never fades) or forget one.
// Lessons only reach the planner, the director and the talk, each within its own budget; the exams never see them.
import { useState } from "react";
import { ApiError, type Api, type BenchScenario, type Memory as Lesson, type MemoryKind, type MemoryState } from "./api.js";
import { useT, type Lang, type Text } from "./i18n.js";
import { useMt } from "./translate.js";

const E = (en: string, es: string): Text => ({ en, es });
const L = {
  title: E("Memory and dreams", "Memoria y sueños"),
  lead: E(
    "Every cycle leaves a long trace. Instead of rereading all of it, it dreams: it rereads the finished cycles once and keeps only short lessons. Each later step gets just the lessons that matter to it, so it spends less context and less reasoning. Lessons it neither keeps nor uses fade away by themselves.",
    "Cada corrida deja una traza larga. En vez de releerla toda, sueña: relee una vez las corridas terminadas y se queda solo con lecciones cortas. Cada paso después recibe solo las lecciones que le importan, así gasta menos contexto y menos razonamiento. Las que no conserva ni usa se desvanecen solas.",
  ),
  layers: [
    { t: E("Working", "De trabajo"), d: E("what fits in one prompt, with a budget per step", "lo que cabe en un prompt, con presupuesto por paso") },
    { t: E("Episodic", "Episódica"), d: E("every cycle as it happened, never sent whole", "cada corrida como pasó, nunca se manda completa") },
    { t: E("Lessons", "Lecciones"), d: E("what it learned, written only while it dreams", "lo que aprendió, escrito solo al soñar") },
    { t: E("Skills and code", "Habilidades y código"), d: E("how it acts; only change behind the harness", "cómo actúa; solo cambian con el arnés") },
  ],
  dream: E("Dream now", "Soñar ahora"),
  dreaming: E("Dreaming…", "Soñando…"),
  pending: (n: number, after: number) =>
    E(
      `${n} finished ${n === 1 ? "cycle" : "cycles"} to digest. When you let it decide, it dreams by itself once there are ${after}.`,
      `${n} ${n === 1 ? "corrida terminada" : "corridas terminadas"} por digerir. Cuando lo dejas decidir, sueña solo al juntar ${after}.`,
    ),
  nothing: E("Nothing new to dream about: finish a cycle first.", "Nada nuevo que soñar: primero termina una corrida."),
  cap: (usd: number) => E(`Uses Muse Wonder, at most $${usd.toFixed(2)} per dream.`, `Usa Muse Wonder, máximo $${usd.toFixed(2)} por sueño.`),
  empty: E("It doesn't remember anything yet. After a few cycles, let it dream.", "Todavía no recuerda nada. Después de unas corridas, déjalo soñar."),
  kinds: {
    rule: E("Rule", "Regla"),
    "dead-end": E("Dead end", "Callejón sin salida"),
    strategy: E("Strategy", "Estrategia"),
    fact: E("Fact", "Dato"),
  } as Record<MemoryKind, Text>,
  everywhere: E("whole lab", "todo el laboratorio"),
  strength: E("strength", "fuerza"),
  used: (n: number) => E(`used ${n}×`, `usada ${n}×`),
  pin: E("Pin", "Fijar"),
  unpin: E("Unpin", "Soltar"),
  pinned: E("pinned: never fades", "fijada: nunca se desvanece"),
  forget: E("Forget", "Olvidar"),
  lastDreams: E("Last dreams", "Últimos sueños"),
  dreamLine: (d: { jobs: number; added: number; rewritten: number; faded: number }) =>
    E(
      `${d.jobs} cycles · +${d.added} new · ${d.rewritten} rewritten · ${d.faded} faded`,
      `${d.jobs} corridas · +${d.added} nuevas · ${d.rewritten} reescritas · ${d.faded} desvanecidas`,
    ),
};

const ORDER: MemoryKind[] = ["rule", "dead-end", "strategy", "fact"];

export function Memory({ client, memory, bench, lang, onChange }: { client: Api; memory: MemoryState; bench: BenchScenario[]; lang: Lang; onChange: () => Promise<void> }) {
  const t = useT();
  const { mt } = useMt();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scopeName = (scope: string) => {
    if (scope === "global") return t(L.everywhere);
    const [sid, cid] = scope.split(":");
    const b = bench.find((x) => x.id === sid);
    const c = cid ? b?.contexts.find((x) => x.id === cid) : null;
    return [b?.title ?? sid, c?.name].filter(Boolean).join(" · ");
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onChange();
    } catch (err) {
      setError(err instanceof ApiError && err.reason === "nothing-to-dream" ? t(L.nothing) : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const act = (m: Lesson, action: "pin" | "unpin" | "forget") => run(() => client.agentOp({ op: "memory", id: m.id, action }));
  const groups = ORDER.map((k) => ({ k, items: memory.active.filter((m) => m.kind === k) })).filter((g) => g.items.length);

  return (
    <div className="memory" id="memoria">
      <div className="row between wrap-row">
        <h2 className="h3"><span aria-hidden="true">☾</span> {t(L.title)}</h2>
        <button type="button" className="btn small" onClick={() => void run(() => client.agentOp({ op: "dream", lang }))} disabled={busy || memory.undigested === 0}>
          {busy && <span className="spin light" aria-hidden="true" />}{t(busy ? L.dreaming : L.dream)}
        </button>
      </div>
      <p className="muted small">{t(L.lead)}</p>
      <ol className="mem-layers">
        {L.layers.map((l, i) => (
          <li key={i}><b>{t(l.t)}</b><span>{t(l.d)}</span></li>
        ))}
      </ol>
      <p className="small">{memory.undigested ? t(L.pending(memory.undigested, memory.dreamAfter)) : t(L.nothing)} <span className="muted">{t(L.cap(memory.cap))}</span></p>
      {error && <p className="error small" role="alert">{error}</p>}

      {groups.length === 0 ? (
        <p className="empty">{t(L.empty)}</p>
      ) : (
        groups.map((g) => (
          <div key={g.k} className="mem-group">
            <h3>{t(L.kinds[g.k])} <span className="muted">· {g.items.length}</span></h3>
            {g.items.map((m) => (
              <article key={m.id} className={`mem ${m.kind}${m.pinned ? " pinned" : ""}`}>
                <p>{mt(m.text)}</p>
                <div className="row between wrap-row">
                  <span className="muted small">
                    {scopeName(m.scope)} · <span className="mem-dots" role="img" aria-label={`${t(L.strength)} ${m.strength}/5`}>{"●".repeat(m.strength)}{"○".repeat(Math.max(0, 5 - m.strength))}</span>
                    {m.uses > 0 && <> · {t(L.used(m.uses))}</>}
                    {m.pinned && <> · {t(L.pinned)}</>}
                  </span>
                  <span className="row gap">
                    <button type="button" className="link small" disabled={busy} onClick={() => void act(m, m.pinned ? "unpin" : "pin")}>{t(m.pinned ? L.unpin : L.pin)}</button>
                    <button type="button" className="link small" disabled={busy} onClick={() => void act(m, "forget")}>{t(L.forget)}</button>
                  </span>
                </div>
              </article>
            ))}
          </div>
        ))
      )}

      {memory.dreams.length > 0 && (
        <div className="mem-dreams">
          <h3>{t(L.lastDreams)}</h3>
          <ul>
            {memory.dreams.map((d) => (
              <li key={d.id}>
                <span className="muted small">{new Date(d.createdAt).toLocaleString(lang === "es" ? "es-MX" : "en-US", { dateStyle: "medium", timeStyle: "short" })} · ${d.cost.toFixed(3)}</span>
                {d.summary && <p className="small">{mt(d.summary)}</p>}
                <p className="muted small">{t(L.dreamLine({ jobs: d.jobs, added: d.stats.added ?? 0, rewritten: d.stats.rewritten ?? 0, faded: d.stats.faded ?? 0 }))}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
