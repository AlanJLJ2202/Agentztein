/**
 * pnpm datasets:generate  → writes every scenario × split × family + datasets/manifest.json
 * pnpm datasets:verify    → regenerates in memory and checks hashes against the committed manifest
 *
 * The test split goes to datasets/sealed/ (git-ignored); only its hash is committed.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatasetManifest, canonicalJson, hashCanonical, type Split } from "@skillab/contracts";
import { FAMILIES, SCENARIOS_VERSION, SPLITS, generateScenarioDataset, scenarioDatasetHash } from "../common.js";
import { SCENARIOS } from "../registry.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DATASETS = join(ROOT, "datasets");
const MANIFEST = join(DATASETS, "manifest.json");
export const CONFIG_VERSION = "ds-v2";

const pathFor = (split: Split, scenario: string, family: string) =>
  split === "test" ? `sealed/test/${scenario}/${family}.json` : `${split}/${scenario}/${family}.json`;

function build(): { manifest: DatasetManifest; files: Map<string, string> } {
  const files = new Map<string, string>();
  const entries = [];
  for (const [i, def] of SCENARIOS.entries()) {
    for (const split of SPLITS) {
      for (const family of FAMILIES) {
        const ds = generateScenarioDataset(def, i, family, split);
        const path = pathFor(split, def.id, family);
        files.set(path, `${JSON.stringify(ds, null, 2)}\n`);
        const seeds = ds.cases.map((c) => c.seed);
        entries.push({
          scenario: def.id,
          family,
          split,
          hash: scenarioDatasetHash(ds),
          caseCount: ds.cases.length,
          rowCount: ds.cases.reduce((n, c) => n + c.batch.items.length, 0),
          seedRange: [Math.min(...seeds), Math.max(...seeds)] as [number, number],
          path,
        });
      }
    }
  }
  const body = { generatorVersion: SCENARIOS_VERSION, configVersion: CONFIG_VERSION, entries };
  return { manifest: DatasetManifest.parse({ ...body, hash: hashCanonical(body) }), files };
}

const { manifest, files } = build();

if (process.argv.includes("--verify")) {
  const committed = DatasetManifest.parse(JSON.parse(readFileSync(MANIFEST, "utf8")));
  if (canonicalJson(committed) !== canonicalJson(manifest)) {
    console.error("datasets:verify FAILED — regenerated datasets do not match datasets/manifest.json");
    for (const e of manifest.entries) {
      const c = committed.entries.find((x) => x.scenario === e.scenario && x.split === e.split && x.family === e.family);
      if (c?.hash !== e.hash) console.error(`  ${e.scenario}/${e.split}/${e.family}: committed ${c?.hash ?? "-"} vs generated ${e.hash}`);
    }
    process.exit(1);
  }
  console.log(`datasets:verify OK — ${manifest.entries.length} datasets, manifest ${manifest.hash}`);
} else {
  for (const [path, content] of files) {
    mkdirSync(dirname(join(DATASETS, path)), { recursive: true });
    writeFileSync(join(DATASETS, path), content);
  }
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${files.size} datasets; manifest ${manifest.hash}`);
}
