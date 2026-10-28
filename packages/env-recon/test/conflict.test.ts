import type { Case } from "@skillab/contracts";
import { describe, expect, it } from "vitest";
import { generateDataset, naiveDedupeOracle, scoreCases, signRuleOracle, type Cell } from "../src/index.js";

// Exit criterion for E1: the designed conflicts exist and are measurable on non-sealed splits.
const cases = (family: "stable" | "interleaved" | "temporal_shift"): Case[] => [
  ...generateDataset({ family, split: "adaptation", count: 20 }).cases,
  ...generateDataset({ family, split: "validation", count: 10 }).cases,
];

function cell(cells: Cell[], vendor: string, rules: string): Cell {
  const c = cells.find((x) => x.vendor === vendor && x.rulesVersion === rules);
  if (!c) throw new Error(`no cases for ${vendor}/${rules}`);
  return c;
}

describe("A/B conflict: duplicate = same amount + same date", () => {
  it("is correct for vendorA (F1 stable) on every batch", () => {
    const a = cell(scoreCases(cases("stable"), (c) => naiveDedupeOracle(c.batch), "dedupe"), "vendorA", "R1");
    expect(a.batches.total).toBe(30);
    expect(a.batches.success).toBe(a.batches.total);
    expect(a.rows.correct).toBe(a.rows.total);
  });

  it("fails measurably for vendorB (F2 interleaved), while vendorA stays perfect", () => {
    const cells = scoreCases(cases("interleaved"), (c) => naiveDedupeOracle(c.batch), "dedupe");
    const a = cell(cells, "vendorA", "R1");
    const b = cell(cells, "vendorB", "R1");
    expect(a.batches.success).toBe(a.batches.total);
    // Every vendorB batch has at least one legitimate repeat, so the rule breaks every batch.
    expect(b.batches.success).toBe(0);
    expect(b.rows.total - b.rows.correct).toBeGreaterThanOrEqual(b.batches.total);
  });
});

describe("R1 → R2: sign-based polarity", () => {
  const cells = scoreCases(cases("temporal_shift"), (c) => signRuleOracle(c.batch), "full");

  it("keeps working for vendorA under both rule versions", () => {
    for (const rules of ["R1", "R2"]) {
      const a = cell(cells, "vendorA", rules);
      expect(a.batches.success).toBe(a.batches.total);
    }
  });

  it("works for vendorB under R1 and fails on every vendorB batch under R2", () => {
    const b1 = cell(cells, "vendorB", "R1");
    const b2 = cell(cells, "vendorB", "R2");
    expect(b1.batches.success).toBe(b1.batches.total);
    expect(b2.batches.total).toBeGreaterThan(0);
    expect(b2.batches.success).toBe(0);
  });
});
