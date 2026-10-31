import { useState } from "react";
import type { Label } from "@skillab/contracts";
import data from "./snapshot.json";
import type { ExampleBatch, Snapshot } from "./snapshot-types.js";

const snapshot = data as unknown as Snapshot;

const FAMILY_NAMES: Record<string, string> = {
  stable: "F1 · estable",
  interleaved: "F2 · intercalada",
  temporal_shift: "F3 · cambio temporal R1→R2",
};

const STAGES = [
  ["E1", "Base: contratos, DB, entorno sintético", "done"],
  ["E2", "Ejecutor: modelo, herramientas, trazas, coste", "next"],
  ["E3", "Candidatas y proponente aislado", "todo"],
  ["E4", "Evaluador externo y comparación", "todo"],
  ["E5", "Selector y cambio de reglas", "todo"],
  ["E6", "Promoción, aprobación y rollback", "todo"],
  ["E7", "Panel de evidencia completo", "todo"],
  ["E8", "Pre-registro, piloto y reporte", "todo"],
] as const;

const short = (id: string) => id.slice(2, 8);
const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((100 * n) / d)}%`);

export function App() {
  return (
    <main>
      <header className="top">
        <p className="eyebrow">skillab · nombre de código</p>
        <h1>Evolución verificable de agentes</h1>
        <p className="lede">
          Laboratorio para medir si las habilidades con alcance y vigencia explícitos se adaptan a cambios de reglas
          con menos interferencia que acumular habilidades o reescribir instrucciones globales.
        </p>
        <div className="notice" role="note">
          <strong>Vista previa del entorno, no resultados del sistema.</strong> Todavía no se ha ejecutado ningún
          agente ni modelo (gasto en modelos: USD 0). Los números de abajo vienen de reglas escritas a mano que
          validan que el entorno sintético tiene las trampas diseñadas y que se puede resolver.
        </div>
      </header>

      <Stages />
      <Conflict />
      <Examples />
      <Datasets />

      <footer>
        <span>generador {snapshot.generatorVersion} · datos {snapshot.configVersion}</span>
        <span>commit {snapshot.commit ? snapshot.commit.slice(0, 7) : "local"}</span>
        <span>construido {new Date(snapshot.builtAt).toLocaleString("es-MX")}</span>
      </footer>
    </main>
  );
}

function Stages() {
  return (
    <section>
      <h2>Avance</h2>
      <ol className="stages">
        {STAGES.map(([id, name, state]) => (
          <li key={id} className={`stage ${state}`}>
            <span className="stage-id">{id}</span>
            <span className="stage-name">{name}</span>
            <span className="stage-state">{state === "done" ? "completa" : state === "next" ? "siguiente" : "pendiente"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Conflict() {
  return (
    <section>
      <h2>Conflicto A/B y cambio R1→R2</h2>
      <p className="muted">
        Unidad: lote completo (todas las filas correctas). Splits adaptation + validation. La regla de duplicados se
        evalúa solo en la tarea de deduplicación; las demás, con las cuatro etiquetas.
      </p>
      {snapshot.conflict.map((fam) => (
        <div key={fam.family} className="card">
          <h3>{FAMILY_NAMES[fam.family] ?? fam.family}</h3>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Regla</th>
                  <th>Proveedor · reglas</th>
                  <th className="num">Lotes correctos</th>
                  <th className="bar-col" aria-hidden />
                  <th className="num rows-col">Filas correctas</th>
                </tr>
              </thead>
              <tbody>
                {fam.rows.map((r) => {
                  const ratio = r.batches.total === 0 ? 0 : r.batches.success / r.batches.total;
                  const tone = ratio === 1 ? "ok" : ratio === 0 ? "bad" : "mid";
                  return (
                    <tr key={`${r.policy}${r.vendor}${r.rulesVersion}`}>
                      <td>{r.policy}</td>
                      <td>
                        <code>{r.vendor}</code> · {r.rulesVersion}
                      </td>
                      <td className="num">
                        {r.batches.success}/{r.batches.total} <span className={`tag ${tone}`}>{pct(r.batches.success, r.batches.total)}</span>
                      </td>
                      <td className="bar-col">
                        <span className="bar">
                          <span className={`fill ${tone}`} style={{ width: `${ratio * 100}%` }} />
                        </span>
                      </td>
                      <td className="num muted rows-col">
                        {r.rowsCorrect.correct}/{r.rowsCorrect.total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

const LABEL_TEXT: Record<Label["kind"], string> = {
  legitimate: "legítimo",
  duplicate_of: "duplicado de",
  refund_of: "reembolso de",
  transfer_pair: "transferencia con",
};

function Examples() {
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const batch = snapshot.examples[active] as ExampleBatch | undefined;
  if (!batch) return null;

  const labelOf = new Map(batch.truth.map((l) => [l.rowId, l]));
  const sel = selected ? labelOf.get(selected) : undefined;
  const related = new Set<string>();
  if (sel && sel.kind !== "legitimate") related.add(sel.target);
  for (const l of batch.truth) if (l.kind !== "legitimate" && l.target === selected) related.add(l.rowId);

  return (
    <section>
      <h2>Verdad de referencia: lotes de ejemplo</h2>
      <p className="muted">
        Lotes del split adaptation con sus etiquetas generadas programáticamente. Toca una fila para resaltar las
        filas relacionadas. Pendiente de revisión humana (ADR-011).
      </p>
      <div className="tabs" role="tablist">
        {snapshot.examples.map((e, i) => (
          <button
            key={e.key}
            role="tab"
            aria-selected={i === active}
            className={i === active ? "tab active" : "tab"}
            onClick={() => {
              setActive(i);
              setSelected(null);
            }}
          >
            {e.vendor} · {e.rulesVersion} <span className="muted">({e.schemaVersion})</span>
          </button>
        ))}
      </div>
      <div className="card">
        <p className="muted small">
          {batch.caseId} · lote <code>{batch.batchId}</code> · {batch.rows.length} filas
        </p>
        <div className="scroll">
          <table className="rows">
            <thead>
              <tr>
                <th>id</th>
                <th>fecha</th>
                <th className="num">importe</th>
                {batch.schemaVersion === "B@2" && <th>sentido</th>}
                <th>descripción</th>
                {batch.vendor === "vendorA" && <th>vendor_txn_id</th>}
                <th>etiqueta</th>
              </tr>
            </thead>
            <tbody>
              {batch.rows.map((row) => {
                const l = labelOf.get(row.rowId);
                const cls = row.rowId === selected ? "sel" : related.has(row.rowId) ? "rel" : "";
                return (
                  <tr key={row.rowId} className={cls} onClick={() => setSelected(row.rowId === selected ? null : row.rowId)}>
                    <td>
                      <code>{short(row.rowId)}</code>
                    </td>
                    <td>{row.date}</td>
                    <td className="num">{row.amount.toFixed(2)}</td>
                    {batch.schemaVersion === "B@2" && <td>{row.direction}</td>}
                    <td>{row.description}</td>
                    {batch.vendor === "vendorA" && (
                      <td>
                        <code>{row.vendor_txn_id}</code>
                      </td>
                    )}
                    <td>
                      {l && (
                        <span className={`label ${l.kind}`}>
                          {LABEL_TEXT[l.kind]}
                          {l.kind !== "legitimate" && <code> {short(l.target)}</code>}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Datasets() {
  return (
    <section>
      <h2>Datasets y hashes</h2>
      <p className="muted">
        Se regeneran desde semillas; el hash prueba que son los mismos. El split test está sellado: aquí solo aparece
        su hash. Manifest <code title={snapshot.manifest.hash}>{snapshot.manifest.hash.slice(0, 16)}…</code>
      </p>
      <div className="card scroll">
        <table>
          <thead>
            <tr>
              <th>Split</th>
              <th>Familia</th>
              <th className="num">Casos</th>
              <th className="num">Filas</th>
              <th>Hash</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.manifest.entries.map((e) => (
              <tr key={`${e.split}${e.family}`}>
                <td>
                  {e.split} {e.split === "test" && <span className="tag sealed">sellado</span>}
                </td>
                <td>{FAMILY_NAMES[e.family] ?? e.family}</td>
                <td className="num">{e.caseCount}</td>
                <td className="num">{e.rowCount}</td>
                <td>
                  <code title={e.hash}>{e.hash.slice(0, 12)}…</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="counts">
        {snapshot.labelCounts.map(({ split, counts }) => (
          <div key={split} className="card">
            <h3>Etiquetas en {split}</h3>
            <dl>
              {Object.entries(counts).map(([k, v]) => (
                <div key={k}>
                  <dt>{LABEL_TEXT[k as Label["kind"]]}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
