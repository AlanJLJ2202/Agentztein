import { ScenarioBatch, ScenarioCase, type Family, type ScenarioLabel, type Split } from "@skillab/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COUNTS,
  FAMILIES,
  SCENARIOS,
  SPLITS,
  batchCorrect,
  generateScenarioDataset,
  scenarioDatasetHash,
  scenarioIndex,
  scoreScenarioCases,
  standardCaseSpec,
  type GenerateSpec,
  type ScenarioCell,
  type ScenarioDefinition,
} from "../src/index.js";

// Every scenario must reproduce the structure of the research question:
// a global rule that helps context A and hurts B, and an R1 → R2 change that only affects B.

const specArb: fc.Arbitrary<GenerateSpec> = fc.record({
  split: fc.constantFrom<Split>(...SPLITS),
  family: fc.constantFrom<Family>(...FAMILIES),
  seed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
  role: fc.constantFrom("A" as const, "B" as const),
  rulesVersion: fc.constantFrom("R1" as const, "R2" as const),
  profile: fc.constantFrom("train" as const, "heldout" as const),
});

const nonSealed = (def: ScenarioDefinition) =>
  FAMILIES.flatMap((f) =>
    (["adaptation", "validation"] as const).flatMap((s) => generateScenarioDataset(def, scenarioIndex(def.id), f, s).cases),
  );

const cells = (def: ScenarioDefinition, policy: "naive" | "legacy" | "reference", cases = nonSealed(def)): ScenarioCell[] =>
  scoreScenarioCases(def, cases, (c) => def.policies[policy](c.batch));

const perfect = (c: ScenarioCell) => c.batches.success === c.batches.total;

describe.each(SCENARIOS.map((s) => [s.id, s] as const))("scenario %s", (_id, def) => {
  it("is deterministic and every case matches the contracts", () => {
    const i = scenarioIndex(def.id);
    for (const family of FAMILIES) {
      const a = generateScenarioDataset(def, i, family, "validation");
      expect(scenarioDatasetHash(a)).toBe(scenarioDatasetHash(generateScenarioDataset(def, i, family, "validation")));
      for (const c of a.cases) ScenarioCase.parse(c);
    }
  });

  it("labels every item exactly once, with opaque unique ids (property)", () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        const { batch, truth } = def.generate(spec);
        ScenarioBatch.parse(batch);
        const ids = batch.items.map((i) => i.itemId);
        expect(new Set(ids).size).toBe(ids.length);
        expect(truth.map((t: ScenarioLabel) => t.itemId)).toEqual(ids);
        expect(batch.items.length).toBeGreaterThan(0);
        for (const l of truth) if (l.target !== undefined) expect(ids).toContain(l.target);
      }),
      { numRuns: 150 },
    );
  });

  it("is solvable from observable data: the reference policy is perfect (property)", () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        const { batch, truth } = def.generate(spec);
        const s = batchCorrect(truth, def.policies.reference(batch));
        expect(s.correct).toBe(s.total);
      }),
      { numRuns: 150 },
    );
  });

  it("trap: the global rule is right on every context-A batch and wrong on every context-B batch", () => {
    const naive = cells(def, "naive");
    const a = naive.filter((c) => c.role === "A");
    const b = naive.filter((c) => c.role === "B");
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    for (const c of a) expect(perfect(c), `${c.context}/${c.rulesVersion}`).toBe(true);
    for (const c of b) expect(c.batches.success, `${c.context}/${c.rulesVersion}`).toBe(0);
  });

  it("change: R1 knowledge stays valid in A and under R1, and fails on every context-B batch under R2", () => {
    const legacy = cells(def, "legacy");
    for (const c of legacy) {
      if (c.role === "B" && c.rulesVersion === "R2") expect(c.batches.success).toBe(0);
      else expect(perfect(c), `${c.context}/${c.rulesVersion}`).toBe(true);
    }
    expect(legacy.some((c) => c.role === "B" && c.rulesVersion === "R2")).toBe(true);
  });

  it("the sealed test split is also solvable and uses a shifted profile", () => {
    const test = FAMILIES.flatMap((f) => generateScenarioDataset(def, scenarioIndex(def.id), f, "test").cases);
    for (const c of cells(def, "reference", test)) expect(perfect(c)).toBe(true);
    const meanItems = (cs: { batch: { items: unknown[] } }[]) => cs.reduce((n, c) => n + c.batch.items.length, 0) / cs.length;
    expect(meanItems(test)).toBeGreaterThan(meanItems(nonSealed(def)));
  });
});

describe("cross-scenario separation", () => {
  const all = SCENARIOS.flatMap((def) =>
    SPLITS.flatMap((split) =>
      FAMILIES.flatMap((f) => generateScenarioDataset(def, scenarioIndex(def.id), f, split, DEFAULT_COUNTS[split]).cases),
    ),
  );

  it("no item id or batch id repeats anywhere", () => {
    const items = all.flatMap((c) => c.batch.items.map((i) => i.itemId));
    expect(new Set(items).size).toBe(items.length);
    const batches = all.map((c) => c.batch.batchId);
    expect(new Set(batches).size).toBe(batches.length);
  });

  it("no seed is shared between splits within a scenario", () => {
    for (const def of SCENARIOS) {
      const bySplit = SPLITS.map((s) => new Set(all.filter((c) => c.scenario === def.id && c.split === s).map((c) => c.seed)));
      for (const [i, a] of bySplit.entries()) {
        for (const b of bySplit.slice(i + 1)) for (const s of a) expect(b.has(s)).toBe(false);
      }
    }
  });

  it("standard seed ranges reject out-of-range indices", () => {
    expect(() => standardCaseSpec(0, "stable", "test", 100_000, 1)).toThrow();
    expect(() => standardCaseSpec(10, "stable", "test", 0, 1)).toThrow();
  });
});
