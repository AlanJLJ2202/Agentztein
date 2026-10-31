/**
 * Builds src/snapshot.json for the static panel from the environment generator.
 * Reads only adaptation and validation; the sealed test split appears solely as its committed manifest hash.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatasetManifest, type Case, type Family, type Label } from "@skillab/contracts";
import {
  CONFIG_VERSION,
  DEFAULT_COUNTS,
  GENERATOR_VERSION,
  generateDataset,
  naiveDedupeOracle,
  referenceOracle,
  scoreCases,
  signRuleOracle,
  type Oracle,
  type Projection,
} from "@skillab/env-recon";
import type { ConflictFamily, ExampleBatch, Snapshot } from "../src/snapshot-types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const FAMILIES: Family[] = ["stable", "interleaved", "temporal_shift"];
const POLICIES: [string, Oracle, Projection][] = [
  ["Duplicado = mismo importe + fecha", naiveDedupeOracle, "dedupe"],
  ["Cargo/abono por el signo del importe", signRuleOracle, "full"],
  ["Referencia (reglas correctas por esquema)", referenceOracle, "full"],
];

const cases = (split: "adaptation" | "validation", family: Family): Case[] =>
  generateDataset({ family, split, count: DEFAULT_COUNTS[split] }).cases;

const conflict: ConflictFamily[] = FAMILIES.map((family) => {
  const all = [...cases("adaptation", family), ...cases("validation", family)];
  return {
    family,
    rows: POLICIES.flatMap(([policy, oracle, projection]) =>
      scoreCases(all, (c) => oracle(c.batch), projection).map((cell) => ({
        policy,
        projection,
        vendor: cell.vendor,
        rulesVersion: cell.rulesVersion,
        batches: cell.batches,
        rowsCorrect: cell.rows,
      })),
    ),
  };
});

const labelCounts = (["adaptation", "validation"] as const).map((split) => {
  const counts: Record<Label["kind"], number> = { legitimate: 0, duplicate_of: 0, refund_of: 0, transfer_pair: 0 };
  for (const family of FAMILIES) for (const c of cases(split, family)) for (const l of c.truth) counts[l.kind]++;
  return { split, counts };
});

const adaptation = FAMILIES.flatMap((f) => cases("adaptation", f));
const examples: ExampleBatch[] = ["vendorA/R1", "vendorB/R1", "vendorB/R2"].flatMap((key) => {
  const c = adaptation.find((x) => `${x.batch.vendor}/${x.batch.rulesVersion}` === key);
  return c
    ? [{
        key,
        caseId: c.caseId,
        batchId: c.batch.batchId,
        vendor: c.batch.vendor,
        schemaVersion: c.batch.schemaVersion,
        rulesVersion: c.batch.rulesVersion,
        rows: c.batch.rows,
        truth: c.truth,
      }]
    : [];
});

const snapshot: Snapshot = {
  builtAt: new Date().toISOString(),
  commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null,
  generatorVersion: GENERATOR_VERSION,
  configVersion: CONFIG_VERSION,
  manifest: DatasetManifest.parse(JSON.parse(readFileSync(join(ROOT, "datasets/manifest.json"), "utf8"))),
  conflict,
  labelCounts,
  examples,
};

writeFileSync(join(HERE, "../src/snapshot.json"), JSON.stringify(snapshot));
console.log("panel snapshot written");
