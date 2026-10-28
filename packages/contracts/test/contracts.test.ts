import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Evidence, Label, Row, SkillContent, SubmitLabels, canonicalJson, hashCanonical } from "../src/index.js";

describe("canonical hashing", () => {
  it("is independent of key order (property)", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.oneof(fc.integer(), fc.string(), fc.boolean())), (obj) => {
        const reversed = Object.fromEntries(Object.entries(obj).reverse());
        expect(hashCanonical(reversed)).toBe(hashCanonical(obj));
      }),
    );
  });

  it("drops undefined fields and rejects non-finite numbers", () => {
    expect(canonicalJson({ b: 1, a: undefined, c: [{ z: 1, y: 2 }] })).toBe('{"b":1,"c":[{"y":2,"z":1}]}');
    expect(() => canonicalJson({ x: Number.NaN })).toThrow();
  });
});

describe("Row schema", () => {
  const base = { rowId: "r1", date: "2025-01-01", amount: -10, currency: "MXN", description: "CAFE LUNA" } as const;

  it("requires vendor_txn_id on A@1 and forbids it on vendorB", () => {
    expect(Row.safeParse({ ...base, vendor: "vendorA", schemaVersion: "A@1" }).success).toBe(false);
    expect(Row.safeParse({ ...base, vendor: "vendorA", schemaVersion: "A@1", vendor_txn_id: "A1" }).success).toBe(true);
    expect(Row.safeParse({ ...base, vendor: "vendorB", schemaVersion: "B@1", vendor_txn_id: "x" }).success).toBe(false);
  });

  it("B@2 requires direction and non-negative amounts", () => {
    const b2 = { ...base, vendor: "vendorB", schemaVersion: "B@2" } as const;
    expect(Row.safeParse({ ...b2, amount: 10 }).success).toBe(false);
    expect(Row.safeParse({ ...b2, amount: 10, direction: "debit" }).success).toBe(true);
    expect(Row.safeParse({ ...b2, direction: "debit" }).success).toBe(false);
  });

  it("rejects mismatched vendor/schema and unknown fields", () => {
    expect(Row.safeParse({ ...base, vendor: "vendorB", schemaVersion: "A@1", vendor_txn_id: "A1" }).success).toBe(false);
    expect(Row.safeParse({ ...base, vendor: "vendorB", schemaVersion: "B@1", label: "dup" }).success).toBe(false);
  });
});

describe("agent output", () => {
  it("SubmitLabels rejects labels without target where one is required", () => {
    expect(Label.safeParse({ rowId: "r1", kind: "duplicate_of" }).success).toBe(false);
    expect(SubmitLabels.safeParse({ batchId: "b", labels: [{ rowId: "r1", kind: "legitimate" }] }).success).toBe(true);
  });
});

describe("skill contracts", () => {
  const skill = {
    skillId: "dedupe-vendorA",
    version: 1,
    parentVersion: null,
    createdBy: "seed",
    hypothesis: "vendorA re-imports keep vendor_txn_id",
    scope: {
      task: "reconcile.dedupe",
      vendors: ["vendorA"],
      schemaVersions: ["A@1"],
      rulesVersions: ["R1"],
      requiredFields: ["vendor_txn_id"],
      permissions: ["list_rows", "submit_labels"],
    },
    procedure: { instructions: "Rows sharing vendor_txn_id are duplicates.", inputs: [], outputs: [], knownLimits: [] },
    validity: { evaluatedAgainst: [{ rulesVersion: "R1", schemaVersion: "A@1" }], revalidateWhen: ["rulesVersion changes"] },
  };

  it("accepts a well-formed skill and rejects an empty scope or unknown tool", () => {
    expect(SkillContent.safeParse(skill).success).toBe(true);
    expect(SkillContent.safeParse({ ...skill, scope: { ...skill.scope, vendors: [] } }).success).toBe(false);
    expect(SkillContent.safeParse({ ...skill, scope: { ...skill.scope, permissions: ["http_get"] } }).success).toBe(false);
  });

  it("evidence cannot report more successes than trials", () => {
    const ev = {
      skillId: "s",
      version: 1,
      experimentId: "e",
      family: "stable",
      rulesVersion: "R1",
      vendor: "vendorA",
      split: "validation",
      successes: 3,
      trials: 2,
      costUsd: 0,
      traceRefs: [],
    };
    expect(Evidence.safeParse(ev).success).toBe(false);
    expect(Evidence.safeParse({ ...ev, successes: 2 }).success).toBe(true);
  });
});
