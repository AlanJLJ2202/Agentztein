import { useState } from "react";
import { POLICY_TEXT } from "./content.js";
import type { PolicyId, ScenarioSnapshot } from "./snapshot-types.js";
import { About, Section } from "./ui.js";

const POLICIES: PolicyId[] = ["naive", "legacy", "reference"];
const COLUMNS = [
  ["A", "R1"],
  ["A", "R2"],
  ["B", "R1"],
  ["B", "R2"],
] as const;

const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((100 * n) / d)}%`);

export function Scenarios({ scenarios }: { scenarios: ScenarioSnapshot[] }) {
  const [active, setActive] = useState(0);
  const s = scenarios[active];
  if (!s) return null;
  return (
    <Section id="escenarios" title="Escenarios de negocio">
      <About>
        Cada escenario es un problema real de un tipo de negocio, recreado con datos ficticios. Todos tienen la misma
        estructura: <strong>dos contextos</strong> donde la forma correcta de resolver es distinta, y{" "}
        <strong>un cambio de reglas</strong> que solo afecta a uno de ellos. Así podemos ver si el agente aprende lo
        correcto en cada lugar y si sabe qué conservar cuando algo cambia.
      </About>

      <div className="tabs" role="tablist" aria-label="Escenarios">
        {scenarios.map((x, i) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={i === active}
            className={i === active ? "tab active" : "tab"}
            onClick={() => setActive(i)}
          >
            <span className="tab-kicker">{x.info.industry}</span>
            {x.info.title}
          </button>
        ))}
      </div>

      <article className="card scenario" role="tabpanel">
        <header>
          <p className="eyebrow">{s.info.industry}</p>
          <h3>{s.info.title}</h3>
          <p className="lede">{s.info.summary}</p>
        </header>

        <div className="grid2">
          <div>
            <h4>El problema</h4>
            <p>{s.info.problem}</p>
          </div>
          <div>
            <h4>Lo que debe decidir el agente</h4>
            <p>{s.info.task}</p>
          </div>
        </div>

        <h4>Los dos contextos</h4>
        <div className="grid2">
          {(["A", "B"] as const).map((r) => (
            <div key={r} className="context">
              <span className="pill">Contexto {r}</span>
              <strong>{s.info.contexts[r].name}</strong>
              <p>{s.info.contexts[r].rule}</p>
            </div>
          ))}
        </div>

        <div className="callouts">
          <div className="callout bad">
            <h4>La trampa</h4>
            <p>{s.info.trap}</p>
          </div>
          <div className="callout warn">
            <h4>El cambio de reglas (R1 → R2)</h4>
            <p>{s.info.change}</p>
          </div>
          <div className="callout good">
            <h4>Cómo se vería una ficha bien delimitada</h4>
            <p>{s.info.scopedSkill}</p>
            <p className="fine">Ejemplo ilustrativo escrito por el equipo; el sistema todavía no lo ha aprendido.</p>
          </div>
        </div>

        <p className="why">
          <strong>Por qué importa:</strong> {s.info.whyItMatters}
        </p>

        <Results s={s} />
        <Examples s={s} />
      </article>
    </Section>
  );
}

function Results({ s }: { s: ScenarioSnapshot }) {
  const cols = COLUMNS.filter(([r, v]) => s.results.some((x) => x.role === r && x.rulesVersion === v));
  return (
    <div className="results">
      <h4>¿Qué pasa con cada forma de pensar?</h4>
      <p className="muted">
        Probamos tres formas fijas de resolver, escritas a mano, sobre {s.counts.cases} lotes ({s.counts.items} casos).
        Un lote cuenta como bien resuelto solo si <em>todas</em> sus respuestas son correctas. Esto no es el agente:
        sirve para comprobar que la trampa y el cambio de reglas existen de verdad.
      </p>
      <div className="scroll">
        <table className="results-table">
          <thead>
            <tr>
              <th>Forma de resolver</th>
              {cols.map(([r, v]) => (
                <th key={`${r}${v}`} className="num">
                  {s.info.contexts[r].name}
                  <span className="th-sub">reglas {v}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {POLICIES.map((p) => (
              <tr key={p}>
                <td>
                  <strong>{POLICY_TEXT[p].name}</strong>
                  <span className="td-sub">{POLICY_TEXT[p].body}</span>
                </td>
                {cols.map(([r, v]) => {
                  const x = s.results.find((y) => y.policy === p && y.role === r && y.rulesVersion === v);
                  if (!x) return <td key={`${r}${v}`} />;
                  const ratio = x.batches.total ? x.batches.success / x.batches.total : 0;
                  const tone = ratio === 1 ? "ok" : ratio === 0 ? "bad" : "mid";
                  return (
                    <td key={`${r}${v}`} className="num" data-label={`${s.info.contexts[r].name} · reglas ${v}`}>
                      <span className="score">
                        {x.batches.success} de {x.batches.total} lotes <span className={`tag ${tone}`}>{pct(x.batches.success, x.batches.total)}</span>
                      </span>
                      <span className="bar">
                        <span className={`fill ${tone}`} style={{ width: `${ratio * 100}%` }} />
                      </span>
                      <span className="td-sub">
                        {x.items.correct} de {x.items.total} casos
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="reading">
        <strong>Cómo leerlo:</strong> la regla única acierta en el contexto A y falla en todos los lotes del B. Las
        reglas de antes del cambio funcionan hasta que llega R2, y solo fallan en el contexto que cambió. Eso es
        justamente lo que un buen sistema debe aprender a distinguir.
      </p>
    </div>
  );
}

function Examples({ s }: { s: ScenarioSnapshot }) {
  const [active, setActive] = useState(0);
  const ex = s.examples[active];
  if (!ex) return null;
  const cols = [...new Set(ex.case.batch.items.flatMap((i) => Object.keys(i.fields)))];
  const label = (id: string) => s.info.labels.find((l) => l.id === id)?.meaning ?? id;
  return (
    <details className="examples">
      <summary>Ver datos de ejemplo con sus respuestas correctas</summary>
      <p className="muted">
        Datos ficticios generados por programa, igual que los que verá el agente. La última columna es la respuesta
        que el sistema considera correcta (pendiente de revisión humana).
      </p>
      <div className="tabs small-tabs">
        {s.examples.map((e, i) => (
          <button key={`${e.role}${e.rulesVersion}`} className={i === active ? "tab active" : "tab"} onClick={() => setActive(i)}>
            {s.info.contexts[e.role].name} · {e.rulesVersion}
          </button>
        ))}
      </div>
      <div className="scroll">
        <table className="rows">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c}>{c.replace(/_/g, " ")}</th>
              ))}
              <th>respuesta correcta</th>
            </tr>
          </thead>
          <tbody>
            {ex.case.batch.items.map((item, i) => {
              const t = ex.case.truth[i];
              return (
                <tr key={item.itemId}>
                  {cols.map((c) => (
                    <td key={c} className={typeof item.fields[c] === "number" ? "num" : c === "texto" ? "wrap" : ""}>
                      {String(item.fields[c] ?? "")}
                    </td>
                  ))}
                  <td>
                    {t && (
                      <span className="label" title={label(t.label)}>
                        {label(t.label)}
                        {t.target && <code> → {t.target.slice(2, 8)}</code>}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="fine">Se muestran {ex.shown} filas del lote {ex.case.caseId}.</p>
    </details>
  );
}
