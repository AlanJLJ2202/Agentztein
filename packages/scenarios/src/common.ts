import {
  hashCanonical,
  sha256,
  type Family,
  type Item,
  type RulesVersionId,
  type ScenarioCase,
  type ScenarioLabel,
  type Split,
} from "@skillab/contracts";
import type { GenerateSpec, Role, ScenarioDefinition } from "./types.js";

export const SCENARIOS_VERSION = "scenarios@1";

/** Disjoint seed ranges per split; each scenario and family gets its own sub-range. */
export const SPLIT_SEED_BASE: Record<Split, number> = {
  adaptation: 10_000_000,
  validation: 20_000_000,
  test: 30_000_000,
};
export const SCENARIO_SEED_STRIDE = 1_000_000;
export const FAMILY_SEED_OFFSET: Record<Family, number> = { stable: 0, interleaved: 100_000, temporal_shift: 200_000 };
export const MAX_CASES_PER_FAMILY = 100_000;
export const MAX_SCENARIOS = 10;

export const DEFAULT_COUNTS: Record<Split, number> = { adaptation: 20, validation: 10, test: 10 };
export const FAMILIES: Family[] = ["stable", "interleaved", "temporal_shift"];
export const SPLITS: Split[] = ["adaptation", "validation", "test"];

export function shiftIndexFor(family: Family, count: number): number | null {
  return family === "temporal_shift" ? Math.floor(count / 2) : null;
}

/** Standard assignment: F1 is context A only; F2/F3 alternate A/B; F3 switches to R2 at shiftIndex. */
export function standardCaseSpec(
  scenarioIndex: number,
  family: Family,
  split: Split,
  index: number,
  count: number,
): GenerateSpec {
  if (index >= MAX_CASES_PER_FAMILY) throw new Error("case index exceeds seed sub-range");
  if (scenarioIndex >= MAX_SCENARIOS) throw new Error("scenario index exceeds seed range");
  const seed = SPLIT_SEED_BASE[split] + scenarioIndex * SCENARIO_SEED_STRIDE + FAMILY_SEED_OFFSET[family] + index;
  const role: Role = family === "stable" || index % 2 === 0 ? "A" : "B";
  const shift = shiftIndexFor(family, count);
  const rulesVersion: RulesVersionId = shift !== null && index >= shift ? "R2" : "R1";
  return { split, family, seed, role, rulesVersion, profile: split === "test" ? "heldout" : "train" };
}

export function batchIdFor(scenario: string, version: string, spec: Pick<GenerateSpec, "split" | "family" | "seed">): string {
  return `b_${sha256(`${scenario}|${version}|${spec.split}|${spec.family}|${spec.seed}`).slice(0, 12)}`;
}

export function itemIdFor(batchId: string, position: number): string {
  return `i_${sha256(`${batchId}|${position}`).slice(0, 12)}`;
}

/** Assigns opaque ids by final position, so ids never leak the label or the generation order. */
export function materialize(batchId: string, rows: { fields: Item["fields"]; label: string }[]): {
  items: Item[];
  truth: ScenarioLabel[];
} {
  const items = rows.map((r, i) => ({ itemId: itemIdFor(batchId, i), fields: r.fields }));
  const truth = rows.map((r, i) => ({ itemId: itemIdFor(batchId, i), label: r.label }));
  return { items, truth };
}

export interface ScenarioDataset {
  generatorVersion: string;
  scenario: string;
  family: Family;
  split: Split;
  profile: "train" | "heldout";
  shiftIndex: number | null;
  cases: ScenarioCase[];
}

export function generateScenarioDataset(
  def: ScenarioDefinition,
  scenarioIndex: number,
  family: Family,
  split: Split,
  count: number = DEFAULT_COUNTS[split],
): ScenarioDataset {
  const cases: ScenarioCase[] = [];
  for (let index = 0; index < count; index++) {
    const spec = def.caseSpec
      ? def.caseSpec(family, split, index, count)
      : standardCaseSpec(scenarioIndex, family, split, index, count);
    const { batch, truth } = def.generate(spec);
    cases.push({
      caseId: `${def.id}/${split}/${family}/${String(index).padStart(3, "0")}`,
      scenario: def.id,
      family,
      split,
      seed: spec.seed,
      index,
      batch,
      truth,
    });
  }
  return {
    generatorVersion: `${SCENARIOS_VERSION}+${def.id}@${def.version}`,
    scenario: def.id,
    family,
    split,
    profile: split === "test" ? "heldout" : "train",
    shiftIndex: shiftIndexFor(family, count),
    cases,
  };
}

export function scenarioDatasetHash(ds: ScenarioDataset): string {
  return hashCanonical(ds);
}

// ---------------------------------------------------------------------------------------------
// Scoring (environment validation only, ADR-008; the external evaluator arrives in E4)
// ---------------------------------------------------------------------------------------------

const key = (l: ScenarioLabel | undefined) => (l === undefined ? "<missing>" : `${l.label}|${l.target ?? ""}`);

export function batchCorrect(truth: ScenarioLabel[], predicted: ScenarioLabel[]): { correct: number; total: number } {
  const byItem = new Map(predicted.map((l) => [l.itemId, l]));
  let correct = 0;
  for (const t of truth) if (key(byItem.get(t.itemId)) === key(t)) correct++;
  return { correct, total: truth.length };
}

export interface ScenarioCell {
  context: string;
  role: Role;
  rulesVersion: RulesVersionId;
  items: { correct: number; total: number };
  batches: { success: number; total: number };
}

export function scoreScenarioCases(
  def: ScenarioDefinition,
  cases: ScenarioCase[],
  policy: (c: ScenarioCase) => ScenarioLabel[],
): ScenarioCell[] {
  const cells = new Map<string, ScenarioCell>();
  const roleOf = (context: string): Role => (def.info.contexts.A.id === context ? "A" : "B");
  for (const c of cases) {
    const k = `${c.batch.context}|${c.batch.rulesVersion}`;
    const cell = cells.get(k) ?? {
      context: c.batch.context,
      role: roleOf(c.batch.context),
      rulesVersion: c.batch.rulesVersion,
      items: { correct: 0, total: 0 },
      batches: { success: 0, total: 0 },
    };
    const s = batchCorrect(c.truth, policy(c));
    cell.items.correct += s.correct;
    cell.items.total += s.total;
    cell.batches.success += Number(s.correct === s.total);
    cell.batches.total += 1;
    cells.set(k, cell);
  }
  return [...cells.values()].sort((a, b) => `${a.role}${a.rulesVersion}`.localeCompare(`${b.role}${b.rulesVersion}`));
}

// ---------------------------------------------------------------------------------------------
// Small shared helpers for generators
// ---------------------------------------------------------------------------------------------

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

export function str(v: Item["fields"][string] | undefined): string {
  return typeof v === "string" ? v : String(v ?? "");
}

export function num(v: Item["fields"][string] | undefined): number {
  if (typeof v !== "number") throw new Error(`expected number, got ${String(v)}`);
  return v;
}
