/**
 * pnpm datasets:generate  → writes every split + datasets/manifest.json
 * pnpm datasets:verify    → regenerates in memory and checks hashes against the committed manifest
 *
 * The test split goes to datasets/sealed/ (git-ignored); only its hash is committed.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatasetManifest, canonicalJson, hashCanonical, type Family, type Split } from "@skillab/contracts";
import { CONFIG_VERSION, DEFAULT_COUNTS, GENERATOR_VERSION, datasetHash, generateDataset } from "../generator.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DATASETS = join(ROOT, "datasets");
const MANIFEST = join(DATASETS, "manifest.json");
const FAMILIES: Family[] = ["stable", "interleaved", "temporal_shift"];
const SPLITS: Split[] = ["adaptation", "validation", "test"];

const pathFor = (split: Split, family: Family) =>
  split === "test" ? `sealed/test/${family}.json` : `${split}/${family}.json`;

function build(): { manifest: DatasetManifest; files: Map<string, string> } {
  const files = new Map<string, string>();
  const entries = [];
  for (const split of SPLITS) {
    for (const family of FAMILIES) {
      const ds = generateDataset({ family, split, count: DEFAULT_COUNTS[split] });
      const path = pathFor(split, family);
      files.set(path, `${JSON.stringify(ds, null, 2)}\n`);
      const seeds = ds.cases.map((c) => c.seed);
      entries.push({
        family,
        split,
        hash: datasetHash(ds),
        caseCount: ds.cases.length,
        rowCount: ds.cases.reduce((n, c) => n + c.batch.rows.length, 0),
        seedRange: [Math.min(...seeds), Math.max(...seeds)] as [number, number],
        path,
      });
    }
  }
  const body = { generatorVersion: GENERATOR_VERSION, configVersion: CONFIG_VERSION, entries };
  return { manifest: DatasetManifest.parse({ ...body, hash: hashCanonical(body) }), files };
}

const { manifest, files } = build();

if (process.argv.includes("--verify")) {
  const committed = DatasetManifest.parse(JSON.parse(readFileSync(MANIFEST, "utf8")));
  if (canonicalJson(committed) !== canonicalJson(manifest)) {
    console.error("datasets:verify FAILED — regenerated datasets do not match datasets/manifest.json");
    for (const e of manifest.entries) {
      const c = committed.entries.find((x) => x.split === e.split && x.family === e.family);
      if (c?.hash !== e.hash) console.error(`  ${e.split}/${e.family}: committed ${c?.hash ?? "-"} vs generated ${e.hash}`);
    }
    process.exit(1);
  }
  console.log(`datasets:verify OK — manifest ${manifest.hash}`);
} else {
  for (const [path, content] of files) {
    mkdirSync(dirname(join(DATASETS, path)), { recursive: true });
    writeFileSync(join(DATASETS, path), content);
  }
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${files.size} datasets; manifest ${manifest.hash}`);
}
for (const e of manifest.entries) {
  console.log(`  ${e.split.padEnd(10)} ${e.family.padEnd(14)} cases=${e.caseCount} rows=${e.rowCount} ${e.hash}`);
}
