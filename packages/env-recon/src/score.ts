import type { Case, Label, RulesVersionId, Vendor } from "@skillab/contracts";

/**
 * Minimal environment-validation scoring (ADR-008). The external evaluator (E4) is the
 * authority for experiments; this exists so E1 can prove the traps are real.
 *
 * - full: the whole label must match (kind and target).
 * - dedupe: projection for the task "reconcile.dedupe": is-duplicate (and of which row) vs not.
 */
export type Projection = "full" | "dedupe";

function project(label: Label | undefined, projection: Projection): string {
  if (label === undefined) return "<missing>";
  if (projection === "dedupe") return label.kind === "duplicate_of" ? `dup:${label.target}` : "nodup";
  return label.kind === "legitimate" ? "legitimate" : `${label.kind}:${label.target}`;
}

export interface BatchScore {
  correctRows: number;
  totalRows: number;
  success: boolean;
}

export function scoreBatch(truth: Label[], predicted: Label[], projection: Projection): BatchScore {
  const byRow = new Map(predicted.map((l) => [l.rowId, l]));
  let correct = 0;
  for (const t of truth) {
    if (project(byRow.get(t.rowId), projection) === project(t, projection)) correct++;
  }
  return { correctRows: correct, totalRows: truth.length, success: correct === truth.length };
}

export interface Cell {
  vendor: Vendor;
  rulesVersion: RulesVersionId;
  rows: { correct: number; total: number };
  batches: { success: number; total: number };
}

/** Aggregates by vendor × rules version, always keeping numerator and denominator. */
export function scoreCases(
  cases: Case[],
  oracle: (c: Case) => Label[],
  projection: Projection,
): Cell[] {
  const cells = new Map<string, Cell>();
  for (const c of cases) {
    const key = `${c.batch.vendor}|${c.batch.rulesVersion}`;
    const cell = cells.get(key) ?? {
      vendor: c.batch.vendor,
      rulesVersion: c.batch.rulesVersion,
      rows: { correct: 0, total: 0 },
      batches: { success: 0, total: 0 },
    };
    const s = scoreBatch(c.truth, oracle(c), projection);
    cell.rows.correct += s.correctRows;
    cell.rows.total += s.totalRows;
    cell.batches.success += Number(s.success);
    cell.batches.total += 1;
    cells.set(key, cell);
  }
  return [...cells.values()].sort((a, b) =>
    `${a.vendor}${a.rulesVersion}`.localeCompare(`${b.vendor}${b.rulesVersion}`),
  );
}
