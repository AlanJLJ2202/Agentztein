import type { ScenarioBatch } from "@skillab/contracts";
import { Rng } from "@skillab/env-recon";
import { batchIdFor, materialize } from "../common.js";
import type { Policy, Role, ScenarioDefinition } from "../types.js";

/**
 * Reasoning, in the style of ARC-AGI: was a grid puzzle solved? ARC only takes an exact grid, cell by cell; the
 * ARC Prize competition lets a solver submit two attempts per task.
 * Trap: the public practice set only counts the first attempt; the competition set counts either (not stated).
 * Change (R2): the competition starts reporting the percentage of right cells instead of the wrong ones.
 */

const CONTEXT = { A: "set_publico", B: "set_concurso" } as const;
const SIZES = { train: ["3x3", "5x5", "6x6", "8x8"], heldout: ["10x10", "12x12", "15x15", "20x20"] } as const;
const KINDS = ["simetría", "conteo de objetos", "relleno de huecos", "gravedad", "recolorear por tamaño", "copiar patrón"];

const opt = (v: unknown) => (typeof v === "number" ? v : Number.NaN);
const role = (b: ScenarioBatch): Role => (b.context === CONTEXT.A ? "A" : "B");
type F = ScenarioBatch["items"][number]["fields"];
/** An attempt is exact when no cell is wrong (R1) or 100 % of the cells are right (R2). */
const exact = (f: F, n: 1 | 2, honourR2: boolean) =>
  honourR2 && typeof f[`aciertos_pct_intento_${n}`] === "number" ? f[`aciertos_pct_intento_${n}`] === 100 : opt(f[`celdas_mal_intento_${n}`]) === 0;

const decide = (two: (b: ScenarioBatch) => boolean, honourR2: boolean): Policy => (b) =>
  b.items.map((i) => ({
    itemId: i.itemId,
    label: exact(i.fields, 1, honourR2) || (two(b) && exact(i.fields, 2, honourR2)) ? "resuelto" : "no_resuelto",
  }));

export const razonamiento: ScenarioDefinition = {
  id: "razonamiento",
  version: "1",
  info: {
    industry: "Benchmark de razonamiento · estilo ARC-AGI",
    title: "Calificar acertijos de cuadrículas",
    summary: "Decidir si un acertijo visual quedó resuelto, como en ARC-AGI: la cuadrícula tiene que ser exacta.",
    problem:
      "ARC mide razonamiento nuevo con acertijos de cuadrículas de colores. Una sola celda mal es un error, y cada set tiene su propia regla de cuántos intentos cuentan.",
    task: "Marcar cada acertijo como resuelto o no_resuelto con cuántas celdas falló cada intento.",
    contexts: {
      A: { id: CONTEXT.A, name: "Set público de práctica", rule: "Solo cuenta el primer intento, y tiene que ser exacto." },
      B: { id: CONTEXT.B, name: "Set del concurso", rule: "Cuenta cualquiera de los dos intentos, si es exacto." },
    },
    labels: [
      { id: "resuelto", meaning: "Una respuesta válida coincide celda por celda" },
      { id: "no_resuelto", meaning: "Ninguna respuesta válida es exacta" },
    ],
    trap: "“Solo cuenta el primer intento.” Es correcta en el set público y reprueba en el concurso acertijos que el segundo intento sí resolvió.",
    change: "El concurso empieza a reportar el porcentaje de celdas correctas (100 = exacta) en vez de las celdas mal. Una regla que lee celdas mal deja de funcionar, solo ahí.",
    scopedSkill: "“En el set del concurso, resuelto si cualquiera de los dos intentos es exacto (100 %)”, solo para ese contexto.",
    whyItMatters: "ARC-AGI es de los benchmarks donde los modelos más se alejan de las personas; contar mal los intentos cambia el puntaje de todo un concurso.",
  },
  schemaFor: (r, rules) => (r === "A" ? "arc-pub@1" : rules === "R2" ? "arc-prize-pct@2" : "arc-prize@1"),
  generate: (spec) => {
    const rng = new Rng(spec.seed);
    const schema = razonamiento.schemaFor(spec.role, spec.rulesVersion);
    const pct = schema === "arc-prize-pct@2";
    const n = spec.profile === "heldout" ? rng.int(13, 18) : rng.int(9, 12);
    // first: exact first attempt; second: only the second attempt is exact; none: both wrong
    const kinds: ("first" | "second" | "none")[] = [];
    if (spec.role === "B") {
      kinds.push("first", "second");
      for (let i = rng.int(0, 2); i > 0; i--) kinds.push("second");
    }
    while (kinds.length < n) kinds.push(rng.next() < 0.45 ? "first" : rng.next() < 0.5 ? "none" : spec.role === "A" ? "second" : "none");

    const rows = rng.shuffle(kinds).map((kind) => {
      const size = rng.pick(SIZES[spec.profile]);
      const [w, h] = size.split("x").map(Number);
      const cells = (w ?? 3) * (h ?? 3);
      const wrong = () => rng.int(1, Math.max(1, Math.floor(cells / 3)));
      const m1 = kind === "first" ? 0 : wrong();
      const m2 = kind === "second" ? 0 : kind === "first" ? (rng.next() < 0.5 ? 0 : wrong()) : wrong();
      const label = m1 === 0 || (spec.role === "B" && m2 === 0) ? "resuelto" : "no_resuelto";
      // percentages are floored, so a grid with any wrong cell never shows 100
      const toPct = (m: number) => (m === 0 ? 100 : Math.min(99, Math.floor((100 * (cells - m)) / cells)));
      return {
        label,
        fields: {
          acertijo: `arc-${rng.int(1000, 9999).toString(16)}`,
          tipo: rng.pick(KINDS),
          tamano: size,
          ...(pct
            ? { aciertos_pct_intento_1: toPct(m1), aciertos_pct_intento_2: toPct(m2) }
            : { celdas_mal_intento_1: m1, celdas_mal_intento_2: m2 }),
        },
      };
    });
    const batchId = batchIdFor("razonamiento", razonamiento.version, spec);
    const { items, truth } = materialize(batchId, rows);
    return { batch: { batchId, scenario: "razonamiento", context: CONTEXT[spec.role], schemaVersion: schema, rulesVersion: spec.rulesVersion, items }, truth };
  },
  policies: {
    naive: decide(() => false, false),
    legacy: decide((b) => role(b) === "B", false),
    reference: decide((b) => role(b) === "B", true),
  },
};
