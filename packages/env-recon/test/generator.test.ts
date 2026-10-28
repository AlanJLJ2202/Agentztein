import { Dataset, Row, type Case, type Family, type Label, type Split } from "@skillab/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COUNTS,
  HELDOUT_MERCHANTS,
  MAX_CASES_PER_FAMILY,
  TRAIN_MERCHANTS,
  caseSpec,
  datasetHash,
  generateBatch,
  generateDataset,
  referenceOracle,
  scoreBatch,
  type BatchSpec,
} from "../src/index.js";

const FAMILIES: Family[] = ["stable", "interleaved", "temporal_shift"];
const SPLITS: Split[] = ["adaptation", "validation", "test"];

const specArb: fc.Arbitrary<BatchSpec> = fc.record({
  split: fc.constantFrom<Split>(...SPLITS),
  family: fc.constantFrom<Family>(...FAMILIES),
  seed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
  vendor: fc.constantFrom("vendorA" as const, "vendorB" as const),
  rulesVersion: fc.constantFrom("R1" as const, "R2" as const),
  profile: fc.constantFrom("train" as const, "heldout" as const),
});

describe("determinism", () => {
  it("same spec → same dataset hash", () => {
    for (const family of FAMILIES) {
      const a = generateDataset({ family, split: "validation", count: 10 });
      const b = generateDataset({ family, split: "validation", count: 10 });
      expect(datasetHash(a)).toBe(datasetHash(b));
    }
  });

  it("same batch spec → identical batch (property)", () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        expect(generateBatch(spec)).toEqual(generateBatch(spec));
      }),
    );
  });

  it("different splits → different datasets", () => {
    const hashes = SPLITS.map((split) => datasetHash(generateDataset({ family: "interleaved", split, count: 10 })));
    expect(new Set(hashes).size).toBe(3);
  });
});

describe("schema validity", () => {
  it("every generated dataset parses with the contracts", () => {
    for (const family of FAMILIES) {
      for (const split of SPLITS) {
        expect(() => Dataset.parse(generateDataset({ family, split, count: DEFAULT_COUNTS[split] }))).not.toThrow();
      }
    }
  });

  it("every row of any spec parses (property)", () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        for (const row of generateBatch(spec).batch.rows) Row.parse(row);
      }),
    );
  });
});

function checkLabelConsistency(rows: Row[], truth: Label[]): void {
  const ids = rows.map((r) => r.rowId);
  expect(new Set(ids).size).toBe(ids.length);
  expect(truth.map((l) => l.rowId)).toEqual(ids);

  const byId = new Map(rows.map((r, i) => [r.rowId, { row: r, label: truth[i] as Label, pos: i }]));
  for (const [i, label] of truth.entries()) {
    if (label.kind === "legitimate") continue;
    const self = rows[i] as Row;
    const target = byId.get(label.target);
    expect(target, `target of ${label.rowId} exists in batch`).toBeDefined();
    if (!target) continue;
    expect(label.target).not.toBe(label.rowId);
    switch (label.kind) {
      case "duplicate_of": {
        // Chains point at the earliest copy, which is itself not a duplicate.
        expect(target.pos).toBeLessThan(i);
        expect(target.label.kind).not.toBe("duplicate_of");
        const { rowId: _selfId, ...selfRest } = self;
        const { rowId: _targetId, ...targetRest } = target.row;
        expect(selfRest).toEqual(targetRest);
        break;
      }
      case "refund_of":
        expect(target.label.kind).toBe("legitimate");
        expect(target.row.date < self.date).toBe(true);
        expect(Math.abs(target.row.amount)).toBe(Math.abs(self.amount));
        break;
      case "transfer_pair": {
        const back = target.label;
        expect(back.kind).toBe("transfer_pair");
        expect(back.kind !== "legitimate" && back.target).toBe(self.rowId);
        expect(target.row.date).toBe(self.date);
        expect(target.row.ref).toBe(self.ref);
        break;
      }
    }
  }
}

describe("label consistency", () => {
  it("targets exist in the same batch and relations are coherent (property)", () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        const { batch, truth } = generateBatch(spec);
        checkLabelConsistency(batch.rows, truth);
      }),
      { numRuns: 300 },
    );
  });

  it("the task is solvable from observable fields: reference oracle is perfect (property)", () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        const { batch, truth } = generateBatch(spec);
        expect(scoreBatch(truth, referenceOracle(batch), "full").success).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it("produces duplicate chains in the heldout profile", () => {
    const ds = generateDataset({ family: "interleaved", split: "test", count: 40 });
    const chained = ds.cases.some((c) => {
      const counts = new Map<string, number>();
      for (const l of c.truth) if (l.kind === "duplicate_of") counts.set(l.target, (counts.get(l.target) ?? 0) + 1);
      return [...counts.values()].some((n) => n >= 2);
    });
    expect(chained).toBe(true);
  });
});

describe("families", () => {
  it("stable is vendorA under R1 only", () => {
    const ds = generateDataset({ family: "stable", split: "adaptation", count: 20 });
    expect(new Set(ds.cases.map((c) => `${c.batch.vendor}/${c.batch.rulesVersion}`))).toEqual(new Set(["vendorA/R1"]));
  });

  it("interleaved alternates vendors under R1", () => {
    const ds = generateDataset({ family: "interleaved", split: "adaptation", count: 20 });
    ds.cases.forEach((c, i) => {
      expect(c.batch.vendor).toBe(i % 2 === 0 ? "vendorA" : "vendorB");
      expect(c.batch.rulesVersion).toBe("R1");
    });
  });

  it("temporal_shift switches R1 → R2 at shiftIndex; only vendorB changes schema", () => {
    const ds = generateDataset({ family: "temporal_shift", split: "validation", count: 10 });
    expect(ds.shiftIndex).toBe(5);
    for (const c of ds.cases) {
      expect(c.batch.rulesVersion).toBe(c.index >= 5 ? "R2" : "R1");
      const expected = c.batch.vendor === "vendorA" ? "A@1" : c.batch.rulesVersion === "R2" ? "B@2" : "B@1";
      expect(c.batch.schemaVersion).toBe(expected);
    }
  });
});

describe("split separation", () => {
  const all: Case[] = [];
  for (const split of SPLITS) {
    for (const family of FAMILIES) all.push(...generateDataset({ family, split, count: DEFAULT_COUNTS[split] }).cases);
  }

  it("no seed is shared between splits", () => {
    const seedsBySplit = new Map<Split, Set<number>>(SPLITS.map((s) => [s, new Set()]));
    for (const c of all) seedsBySplit.get(c.split)?.add(c.seed);
    for (const a of SPLITS) {
      for (const b of SPLITS) {
        if (a === b) continue;
        const sa = seedsBySplit.get(a) as Set<number>;
        for (const s of seedsBySplit.get(b) as Set<number>) expect(sa.has(s)).toBe(false);
      }
    }
  });

  it("no rowId or batchId is shared between any two cases", () => {
    const rowIds = all.flatMap((c) => c.batch.rows.map((r) => r.rowId));
    expect(new Set(rowIds).size).toBe(rowIds.length);
    const batchIds = all.map((c) => c.batch.batchId);
    expect(new Set(batchIds).size).toBe(batchIds.length);
  });

  it("seed sub-ranges cannot overlap for any admissible index", () => {
    const lo = (split: Split, family: Family) => caseSpec(family, split, 0, 1).seed;
    const ranges = SPLITS.flatMap((s) => FAMILIES.map((f) => [lo(s, f), lo(s, f) + MAX_CASES_PER_FAMILY - 1] as const));
    for (const [i, a] of ranges.entries()) {
      for (const b of ranges.slice(i + 1)) expect(a[1] < b[0] || b[1] < a[0]).toBe(true);
    }
    expect(() => caseSpec("stable", "test", MAX_CASES_PER_FAMILY, 1)).toThrow();
  });

  it("test split uses a shifted distribution (heldout merchants, larger batches)", () => {
    const merchantsOf = (cases: Case[]) =>
      new Set(
        cases.flatMap((c) =>
          c.batch.rows
            .map((r) => r.description.replace(/ \d{2}:\d{2}$/, "").replace(/^REFUND /, ""))
            .filter((d) => !d.startsWith("TRANSFER ")),
        ),
      );
    const train = all.filter((c) => c.split !== "test");
    const test = all.filter((c) => c.split === "test");
    expect([...merchantsOf(train)].every((m) => (TRAIN_MERCHANTS as readonly string[]).includes(m))).toBe(true);
    expect([...merchantsOf(test)].every((m) => (HELDOUT_MERCHANTS as readonly string[]).includes(m))).toBe(true);
    const meanRows = (cs: Case[]) => cs.reduce((n, c) => n + c.batch.rows.length, 0) / cs.length;
    expect(meanRows(test)).toBeGreaterThan(meanRows(train));
  });
});
