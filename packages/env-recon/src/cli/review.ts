/**
 * pnpm datasets:review → docs/GROUND_TRUTH_REVIEW.md
 *
 * The anteproyecto requires the programmatic ground truth to be reviewed before agents run.
 * This renders one adaptation batch per vendor × rules version with its labels, plus label counts
 * for adaptation and validation, for a human to check. The sealed test split is not read at all.
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Case, Family, Label, Row, Split } from "@skillab/contracts";
import { CONFIG_VERSION, DEFAULT_COUNTS, GENERATOR_VERSION, generateDataset } from "../generator.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const OUT = join(ROOT, "docs/GROUND_TRUTH_REVIEW.md");
const FAMILIES: Family[] = ["stable", "interleaved", "temporal_shift"];

const short = (id: string) => id.slice(2, 8);

function labelText(l: Label): string {
  return l.kind === "legitimate" ? "legitimate" : `${l.kind}(${short(l.target)})`;
}

function rowTable(rows: Row[], truth: Label[]): string {
  const head = "| # | row | date | amount | direction | description | vendor_txn_id | ref | label |\n|---|---|---|---:|---|---|---|---|---|";
  const body = rows.map((r, i) =>
    [i, short(r.rowId), r.date, r.amount.toFixed(2), r.direction ?? "", r.description, r.vendor_txn_id ?? "", r.ref ?? "", labelText(truth[i] as Label)]
      .map((v) => String(v).replace(/\|/g, "\\|"))
      .join(" | "),
  );
  return [head, ...body.map((b) => `| ${b} |`)].join("\n");
}

function counts(cases: Case[]): Record<Label["kind"], number> {
  const c = { legitimate: 0, duplicate_of: 0, refund_of: 0, transfer_pair: 0 };
  for (const x of cases) for (const l of x.truth) c[l.kind]++;
  return c;
}

const bySplit = (split: Split) =>
  FAMILIES.flatMap((family) => generateDataset({ family, split, count: DEFAULT_COUNTS[split] }).cases);

const adaptation = bySplit("adaptation");
const sections: string[] = [];
for (const key of ["vendorA/R1", "vendorB/R1", "vendorA/R2", "vendorB/R2"]) {
  const c = adaptation.find((x) => `${x.batch.vendor}/${x.batch.rulesVersion}` === key);
  if (!c) continue;
  sections.push(
    `### ${key} — \`${c.caseId}\` (schema ${c.batch.schemaVersion}, batch \`${c.batch.batchId}\`)\n\n${rowTable(c.batch.rows, c.truth)}`,
  );
}

const countRows = (["adaptation", "validation"] as const).map((split) => {
  const k = counts(bySplit(split));
  return `| ${split} | ${k.legitimate} | ${k.duplicate_of} | ${k.refund_of} | ${k.transfer_pair} |`;
});

const md = `# Revisión de la verdad de referencia

> Generado por \`pnpm datasets:review\` (${GENERATOR_VERSION}, ${CONFIG_VERSION}). No editar a mano.
> Muestra lotes del split **adaptation** y conteos de adaptation/validation. El split test sellado no se lee.

**Estado:** pendiente de revisión por Alan. Al aprobar, anotar fecha y hash del manifest en
\`docs/DECISIONS.md\` (ADR-011).

## Qué revisar
1. Cada \`duplicate_of\` apunta a una fila idéntica (salvo \`rowId\`) que aparece antes.
2. En vendorB, dos compras con mismo importe y fecha pero **distinta hora** son \`legitimate\`.
3. Cada \`refund_of\` apunta a una compra anterior del mismo comercio e importe absoluto.
4. Las dos patas de una transferencia comparten \`ref\`, fecha e importe, con sentidos opuestos.
5. En B@2 (R2) los importes son positivos y el sentido está en \`direction\`.

Los ids se muestran abreviados (6 caracteres).

## Conteo de etiquetas por split

| split | legitimate | duplicate_of | refund_of | transfer_pair |
|---|---:|---:|---:|---:|
${countRows.join("\n")}

## Lotes de ejemplo

${sections.join("\n\n")}
`;

writeFileSync(OUT, md);
console.log(`wrote ${OUT}`);
