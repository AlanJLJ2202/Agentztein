/**
 * pnpm env:conflict — prints how the reference policies score on the non-sealed splits.
 * Reads only adaptation + validation (generated in memory); never the sealed test split.
 */
import type { Case, Family } from "@skillab/contracts";
import { naiveDedupeOracle, referenceOracle, signRuleOracle, type Oracle } from "../baselines.js";
import { DEFAULT_COUNTS, generateDataset } from "../generator.js";
import { scoreCases, type Projection } from "../score.js";

const FAMILIES: Family[] = ["stable", "interleaved", "temporal_shift"];
const ORACLES: [string, Oracle, Projection][] = [
  ["naive amount+date (dedupe)", naiveDedupeOracle, "dedupe"],
  ["sign-based polarity (full)", signRuleOracle, "full"],
  ["reference (full)", referenceOracle, "full"],
];

const pct = (n: number, d: number) => (d === 0 ? "  n/a" : `${((100 * n) / d).toFixed(1).padStart(5)}%`);

console.log("split: adaptation + validation | unit: batch (row accuracy in parentheses)\n");
for (const family of FAMILIES) {
  const cases: Case[] = (["adaptation", "validation"] as const).flatMap(
    (split) => generateDataset({ family, split, count: DEFAULT_COUNTS[split] }).cases,
  );
  console.log(`== ${family}`);
  for (const [name, oracle, projection] of ORACLES) {
    for (const c of scoreCases(cases, (x) => oracle(x.batch), projection)) {
      console.log(
        `  ${name.padEnd(28)} ${c.vendor}/${c.rulesVersion}  batches ${String(c.batches.success).padStart(2)}/${String(c.batches.total).padEnd(2)} ${pct(c.batches.success, c.batches.total)}   (rows ${c.rows.correct}/${c.rows.total} ${pct(c.rows.correct, c.rows.total)})`,
      );
    }
  }
}
