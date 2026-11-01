/**
 * pnpm datasets:review → docs/GROUND_TRUTH_REVIEW.md
 *
 * The anteproyecto requires the programmatic ground truth to be reviewed by a person before agents run.
 * For each scenario this shows one adaptation batch per context × rules version, with its answers.
 * The sealed test split is never read.
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ScenarioCase } from "@skillab/contracts";
import { FAMILIES, SCENARIOS_VERSION, generateScenarioDataset } from "../common.js";
import { SCENARIOS } from "../registry.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const OUT = join(ROOT, "docs/GROUND_TRUTH_REVIEW.md");
const MAX_ROWS = 12;

const cell = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|");
const short = (id: string) => id.slice(2, 8);

function table(c: ScenarioCase): string {
  const cols = [...new Set(c.batch.items.flatMap((i) => Object.keys(i.fields)))];
  const head = `| id | ${cols.join(" | ")} | respuesta correcta |\n|${"---|".repeat(cols.length + 2)}`;
  const rows = c.batch.items.slice(0, MAX_ROWS).map((item, i) => {
    const t = c.truth[i];
    const answer = t ? `${t.label}${t.target ? ` (${short(t.target)})` : ""}` : "";
    return `| ${short(item.itemId)} | ${cols.map((k) => cell(item.fields[k])).join(" | ")} | **${cell(answer)}** |`;
  });
  const more = c.batch.items.length > MAX_ROWS ? `\n\n_…y ${c.batch.items.length - MAX_ROWS} filas más en el lote._` : "";
  return `${head}\n${rows.join("\n")}${more}`;
}

const sections = SCENARIOS.map((def, idx) => {
  const cases = FAMILIES.flatMap((f) => generateScenarioDataset(def, idx, f, "adaptation").cases);
  const examples = (["A/R1", "B/R1", "B/R2"] as const).flatMap((k) => {
    const [role, rules] = k.split("/") as ["A" | "B", "R1" | "R2"];
    const ctx = def.info.contexts[role];
    const c = cases.find((x) => x.batch.context === ctx.id && x.batch.rulesVersion === rules);
    return c ? [`#### ${ctx.name} · reglas ${rules} — \`${c.caseId}\`\n\n${table(c)}`] : [];
  });
  return `## ${idx + 1}. ${def.info.title} (${def.info.industry})

- **Tarea:** ${def.info.task}
- **${def.info.contexts.A.name}:** ${def.info.contexts.A.rule}
- **${def.info.contexts.B.name}:** ${def.info.contexts.B.rule}
- **Cambio R1 → R2:** ${def.info.change}

${examples.join("\n\n")}`;
});

const md = `# Revisión de la verdad de referencia

> Generado por \`pnpm datasets:review\` (${SCENARIOS_VERSION}). No editar a mano.
> Muestra lotes del split **adaptation**; el split de prueba sellado no se lee.

**¿Qué es esto?** Las "respuestas correctas" de cada escenario las calcula un programa, no una persona ni
una IA. Antes de poner a trabajar a un agente, una persona debe revisar que esas respuestas tienen sentido
(anteproyecto §07). Si una respuesta se ve mal, el error está en el generador y hay que corregirlo antes de
medir nada.

**Estado:** pendiente de revisión por Alan (ADR-011). Al aprobar, anotar fecha y hash del manifest en
\`docs/DECISIONS.md\`.

**Cómo revisar:** en cada tabla, la última columna es la respuesta que el sistema considera correcta.
Compárala con la regla del contexto escrita arriba de la tabla. Los ids se muestran abreviados.

${sections.join("\n\n")}
`;

writeFileSync(OUT, md);
console.log(`wrote ${OUT}`);
