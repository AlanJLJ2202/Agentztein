import type { ScenarioBatch } from "@skillab/contracts";
import { Rng } from "@skillab/env-recon";
import { batchIdFor, materialize, num } from "../common.js";
import type { Policy, Role, ScenarioDefinition } from "../types.js";

/**
 * Picking the rate bracket for parcels sent with two carriers.
 * Trap: "bracket by actual weight" is right for the first carrier, wrong for the second, which bills
 * the larger of actual and volumetric weight.
 * Change (R2): the second carrier lowers its volumetric divisor from 5000 to 4000.
 */

const CONTEXT = { A: "express_norte", B: "ruta_sur" } as const;
const BRACKETS = [1, 5, 20] as const;
const MARGIN = 0.05;

export function bracket(kg: number): string {
  if (kg <= 1) return "T1";
  if (kg <= 5) return "T2";
  if (kg <= 20) return "T3";
  return "T4";
}

const nearBoundary = (kg: number) => BRACKETS.some((b) => Math.abs(kg - b) < MARGIN);
const vol = (l: number, w: number, h: number, divisor: number) => (l * w * h) / divisor;

const role = (b: ScenarioBatch): Role => (b.context === CONTEXT.A ? "A" : "B");

function billable(fields: ScenarioBatch["items"][number]["fields"], r: Role, divisor: number | null): number {
  const kg = num(fields.peso_kg);
  if (r === "A" || divisor === null) return kg;
  return Math.max(kg, vol(num(fields.largo_cm), num(fields.ancho_cm), num(fields.alto_cm), divisor));
}

const decide = (divisorFor: (b: ScenarioBatch) => number | null): Policy => (b) =>
  b.items.map((i) => ({ itemId: i.itemId, label: bracket(billable(i.fields, role(b), divisorFor(b))) }));

const CONTENTS = {
  train: ["refacciones", "ropa", "documentos", "herramienta", "cojines"],
  heldout: ["lámpara", "piezas de plástico", "electrónica", "colchoneta", "artesanías"],
} as const;

type Kind = "any" | "bulky" | "r2trap";

export const envios: ScenarioDefinition = {
  id: "envios",
  version: "1",
  info: {
    industry: "Logística y paquetería",
    title: "Cotizar envíos con dos paqueterías",
    summary: "Elegir la tarifa correcta de cada paquete según cómo cobra cada paquetería.",
    problem:
      "Si se cotiza con la tarifa equivocada, la empresa absorbe la diferencia o el paquete se regresa. Las paqueterías cobran distinto los paquetes ligeros pero voluminosos.",
    task: "Asignar a cada paquete su tarifa: T1 (hasta 1 kg), T2 (hasta 5 kg), T3 (hasta 20 kg) o T4 (más de 20 kg).",
    contexts: {
      A: { id: CONTEXT.A, name: "Paquetería Express Norte", rule: "Cobra por el peso real." },
      B: {
        id: CONTEXT.B,
        name: "Paquetería Ruta Sur",
        rule: "Cobra por el mayor entre el peso real y el volumétrico (largo × ancho × alto ÷ 5000).",
      },
    },
    labels: [
      { id: "T1", meaning: "Hasta 1 kg cobrable" },
      { id: "T2", meaning: "Hasta 5 kg cobrables" },
      { id: "T3", meaning: "Hasta 20 kg cobrables" },
      { id: "T4", meaning: "Más de 20 kg cobrables" },
    ],
    trap: "“La tarifa depende del peso en báscula.” Es correcta con Express Norte y subcotiza las cajas grandes y ligeras con Ruta Sur.",
    change: "Ruta Sur cambia su divisor volumétrico de 5000 a 4000: los mismos paquetes pesan más para cobrarse. Express Norte no cambia.",
    scopedSkill: "“Usar peso volumétrico ÷ 5000” con alcance: solo Ruta Sur bajo R1; una versión revisada (÷ 4000) para R2.",
    whyItMatters: "Las tiendas en línea mexicanas trabajan con varias paqueterías y sus reglas cambian; un error de tarifa se repite en cada envío.",
  },
  schemaFor: (r) => (r === "A" ? "ENV-EN@1" : "ENV-RS@1"),
  generate: (spec) => {
    const rng = new Rng(spec.seed);
    const heldout = spec.profile === "heldout";
    const n = heldout ? rng.int(12, 18) : rng.int(8, 12);
    const kinds: Kind[] = spec.role === "B" ? ["bulky", "r2trap"] : [];
    while (kinds.length < n) kinds.push("any");

    // Rejection sampling: draw a parcel until it has the required property and no value sits near a bracket edge.
    const draw = (kind: Kind) => {
      for (;;) {
        // Log-uniform weight: many light parcels, few heavy ones, as in real e-commerce.
        const [wLo, wHi] = heldout ? [0.5, 40] : [0.2, 25];
        const kg = Math.round(wLo * Math.exp(rng.next() * Math.log(wHi / wLo)) * 100) / 100;
        const [lo, hi] = heldout ? [15, 100] : [10, 70];
        const dims = [rng.int(lo, hi), rng.int(lo, hi), rng.int(lo, hi)] as const;
        const v5 = vol(...dims, 5000);
        const v4 = vol(...dims, 4000);
        if ([kg, v5, v4].some(nearBoundary)) continue;
        const real = bracket(kg);
        const r1 = bracket(Math.max(kg, v5));
        const r2 = bracket(Math.max(kg, v4));
        if (kind === "bulky" && r1 === real) continue;
        if (kind === "r2trap" && r2 === r1) continue;
        return { kg, dims };
      }
    };

    const rows = rng.shuffle(kinds).map((kind) => {
      const { kg, dims } = draw(kind);
      const fields = {
        guia: `GU-${rng.int(100000, 999999)}`,
        contenido: rng.pick(CONTENTS[spec.profile]),
        destino: rng.pick(["León", "Querétaro", "Guadalajara", "Monterrey", "CDMX", "Aguascalientes"]),
        peso_kg: kg,
        largo_cm: dims[0],
        ancho_cm: dims[1],
        alto_cm: dims[2],
      };
      const divisor = spec.role === "B" ? (spec.rulesVersion === "R2" ? 4000 : 5000) : null;
      return { label: bracket(billable(fields, spec.role, divisor)), fields };
    });

    const batchId = batchIdFor("envios", envios.version, spec);
    const { items, truth } = materialize(batchId, rows);
    return {
      batch: {
        batchId,
        scenario: "envios",
        context: CONTEXT[spec.role],
        schemaVersion: envios.schemaFor(spec.role, spec.rulesVersion),
        rulesVersion: spec.rulesVersion,
        items,
      },
      truth,
    };
  },
  policies: {
    naive: decide(() => null),
    legacy: decide((b) => (role(b) === "B" ? 5000 : null)),
    reference: decide((b) => (role(b) === "B" ? (b.rulesVersion === "R2" ? 4000 : 5000) : null)),
  },
};
