/**
 * Builds src/snapshot.json for the static panel from the scenario generators.
 * Reads only adaptation and validation; the sealed test split appears solely as its committed manifest hash.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatasetManifest } from "@skillab/contracts";
import { FAMILIES, SCENARIOS, generateScenarioDataset, scoreScenarioCases } from "@skillab/scenarios";
import type { PolicyId, ScenarioSnapshot, Snapshot } from "../src/snapshot-types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const POLICIES: PolicyId[] = ["naive", "legacy", "reference"];
const EXAMPLE_ROWS = 8;

const scenarios: ScenarioSnapshot[] = SCENARIOS.map((def, idx) => {
  const cases = FAMILIES.flatMap((f) =>
    (["adaptation", "validation"] as const).flatMap((s) => generateScenarioDataset(def, idx, f, s).cases),
  );
  const results = POLICIES.flatMap((policy) =>
    scoreScenarioCases(def, cases, (c) => def.policies[policy](c.batch)).map((cell) => ({
      policy,
      role: cell.role,
      context: cell.context,
      rulesVersion: cell.rulesVersion,
      batches: cell.batches,
      items: cell.items,
    })),
  );
  const examples = (
    [
      ["A", "R1"],
      ["B", "R1"],
      ["B", "R2"],
    ] as const
  ).flatMap(([role, rulesVersion]) => {
    const c = cases.find(
      (x) => x.split === "adaptation" && x.batch.context === def.info.contexts[role].id && x.batch.rulesVersion === rulesVersion,
    );
    if (!c) return [];
    const shown = Math.min(EXAMPLE_ROWS, c.batch.items.length);
    // Keep the payload small: only the rows that are displayed.
    const trimmed = { ...c, batch: { ...c.batch, items: c.batch.items.slice(0, shown) }, truth: c.truth.slice(0, shown) };
    return [{ role, rulesVersion, case: trimmed, shown }];
  });
  return {
    id: def.id,
    info: def.info,
    results,
    examples,
    counts: { cases: cases.length, items: cases.reduce((n, c) => n + c.batch.items.length, 0) },
  };
});

const snapshot: Snapshot = {
  builtAt: new Date().toISOString(),
  commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null,
  manifest: DatasetManifest.parse(JSON.parse(readFileSync(join(ROOT, "datasets/manifest.json"), "utf8"))),
  scenarios,
};

writeFileSync(join(HERE, "../src/snapshot.json"), JSON.stringify(snapshot));
console.log("panel snapshot written");
