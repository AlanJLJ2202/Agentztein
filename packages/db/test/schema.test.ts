import { hashCanonical } from "@skillab/contracts";
import { generateBatch, RULE_VERSIONS } from "@skillab/env-recon";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, type Db } from "../src/index.js";
import { freshDatabase, hasDatabase } from "./helpers.js";

if (!hasDatabase) console.warn("[db tests] DATABASE_URL not set — skipping Postgres tests (see ADR-010)");

describe.skipIf(!hasDatabase)("database schema (Postgres)", () => {
  let db: Db;
  let close: () => Promise<void>;

  const skill = {
    skillId: "dedupe-vendorA",
    version: 1,
    parentVersion: null,
    contentHash: hashCanonical({ seed: 1 }),
    createdBy: "seed",
    hypothesis: "vendorA re-imports keep vendor_txn_id",
    scope: { task: "reconcile.dedupe" },
    procedure: { instructions: "x" },
    validity: { evaluatedAgainst: [] },
  };

  beforeAll(async () => {
    ({ db, close } = await freshDatabase());
    await db.insert(schema.ruleVersions).values(
      Object.values(RULE_VERSIONS).map((r) => ({ id: r.id, supersedes: r.supersedes, definition: r })),
    );
    await db.insert(schema.skillVersions).values(skill);
  });
  afterAll(async () => close?.());

  /** Drizzle wraps driver errors; the trigger's message is on the cause. */
  async function expectAppendOnly(p: PromiseLike<unknown>): Promise<void> {
    const err = await Promise.resolve(p).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err, "mutation should have been rejected").toBeInstanceOf(Error);
    const cause = (err as Error & { cause?: Error }).cause;
    expect(cause?.message ?? "").toMatch(/append-only table/);
  }

  it("migrations create the sealed schema separately from public", async () => {
    const res = await db.execute(
      sql`select table_schema, table_name from information_schema.tables where table_schema in ('public','sealed') order by 1,2`,
    );
    const names = res.rows.map((r) => `${r.table_schema}.${r.table_name}`);
    expect(names).toContain("sealed.truth");
    expect(names).toContain("sealed.test_cases");
    expect(names).not.toContain("public.truth");
  });

  it("I1: skill versions cannot be updated, deleted or truncated", async () => {
    await expectAppendOnly(
      db.update(schema.skillVersions).set({ hypothesis: "changed" }).where(eq(schema.skillVersions.skillId, skill.skillId)),
    );
    await expectAppendOnly(db.delete(schema.skillVersions));
    await expectAppendOnly(db.execute(sql`truncate skill_versions cascade`));
    const [row] = await db.select().from(schema.skillVersions);
    expect(row?.hypothesis).toBe(skill.hypothesis);
    expect(row?.contentHash).toBe(skill.contentHash);
  });

  it("I1: a new version is an insert with a parent, not an edit", async () => {
    await db.insert(schema.skillVersions).values({ ...skill, version: 2, parentVersion: 1, contentHash: hashCanonical({ seed: 2 }) });
    await expect(
      db.insert(schema.skillVersions).values({ ...skill, version: 3, parentVersion: 3, contentHash: hashCanonical({ seed: 3 }) }),
    ).rejects.toThrow();
    await expect(db.insert(schema.skillVersions).values({ ...skill, contentHash: "not-a-hash", version: 4 })).rejects.toThrow();
  });

  it("skill events and sealed truth are append-only", async () => {
    await db.insert(schema.skillEvents).values({ skillId: skill.skillId, version: 1, fromState: null, toState: "candidate", reason: "seed", actor: "test" });
    await expectAppendOnly(db.update(schema.skillEvents).set({ toState: "active" }));

    await db.insert(schema.truth).values({ caseId: "c1", split: "test", labels: [] });
    await expectAppendOnly(db.update(schema.truth).set({ labels: [{ forged: true }] }));
    await expectAppendOnly(db.delete(schema.truth));
  });

  it("stores a generated batch and its truth with matching contracts", async () => {
    const spec = { split: "validation", family: "interleaved", seed: 2_100_001, vendor: "vendorB", rulesVersion: "R1", profile: "train" } as const;
    const { batch, truth } = generateBatch(spec);
    await db.insert(schema.datasets).values({ id: "ds1", split: "validation", family: "interleaved", generatorVersion: "env-recon@1", configVersion: "ds-v1", hash: hashCanonical(batch), caseCount: 1 });
    await db.insert(schema.cases).values({
      caseId: "validation/interleaved/001",
      datasetId: "ds1",
      split: "validation",
      family: "interleaved",
      seed: spec.seed,
      idx: 1,
      batchId: batch.batchId,
      scenario: "conciliacion",
      context: batch.vendor,
      schemaVersion: batch.schemaVersion,
      rulesVersion: batch.rulesVersion,
      batch,
    });
    await db.insert(schema.truth).values({ caseId: "validation/interleaved/001", split: "validation", labels: truth });
    const [stored] = await db.select().from(schema.cases).where(eq(schema.cases.batchId, batch.batchId));
    expect(hashCanonical(stored?.batch)).toBe(hashCanonical(batch));

    // Test batches are not allowed in the public cases table.
    await expect(
      db.insert(schema.cases).values({ caseId: "x", datasetId: "ds1", split: "test", family: "stable", seed: 1, idx: 0, batchId: "bx", scenario: "conciliacion", context: "vendorA", schemaVersion: "A@1", rulesVersion: "R1", batch: {} }),
    ).rejects.toThrow();
  });

  it("evidence counts are constrained and episodes require a sha256 trace ref", async () => {
    await db.insert(schema.experiments).values({ id: "exp1", name: "t", variants: ["frozen"], status: "planned", budgetUsd: "1" });
    await expect(
      db.insert(schema.evidence).values({ skillId: skill.skillId, version: 1, experimentId: "exp1", family: "stable", rulesVersion: "R1", scenario: "conciliacion", context: "vendorA", split: "validation", successes: 3, trials: 2, costUsd: "0", traceRefs: [] }),
    ).rejects.toThrow();
    const now = new Date();
    const ep = { id: "ep1", experimentId: "exp1", caseId: "c", split: "validation", variant: "frozen", repetition: 0, status: "timeout", modelId: "fake", inputTokens: 10, outputTokens: 0, costUsd: "0.0001", latencyMs: 5, appliedSkills: [], selectorDecision: {}, startedAt: now, finishedAt: now };
    await expect(db.insert(schema.episodes).values({ ...ep, traceBlob: "nope" })).rejects.toThrow();
    await db.insert(schema.episodes).values({ ...ep, traceBlob: hashCanonical("trace") });
    await expectAppendOnly(db.update(schema.episodes).set({ costUsd: "0" }));
  });
});
