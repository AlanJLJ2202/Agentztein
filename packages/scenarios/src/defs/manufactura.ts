import type { ScenarioBatch } from "@skillab/contracts";
import { Rng } from "@skillab/env-recon";
import { batchIdFor, materialize, num, str } from "../common.js";
import type { Policy, Role, ScenarioDefinition } from "../types.js";

/**
 * Quality inspection on two production lines with different customer tolerances.
 * Trap: one global tolerance (±0.50 mm) accepts parts the export customer would reject.
 * Change (R2): the export line starts reporting in micrometres, so mm-based rules break there only.
 */

const TOL_MM: Record<Role, number> = { A: 0.5, B: 0.1 };
const CONTEXT = { A: "linea_nacional", B: "linea_exportacion" } as const;
const SPEC = { A: "AUTO-NAC-07", B: "AERO-EXP-12" } as const;

const PARTS: Record<"train" | "heldout", readonly (readonly [string, number])[]> = {
  train: [
    ["BRK-2041", 12.0],
    ["SHF-1180", 25.4],
    ["BSH-0330", 40.0],
    ["PIN-0772", 8.5],
  ],
  heldout: [
    ["VLV-5512", 15.75],
    ["GER-9034", 32.0],
    ["HSG-4410", 55.5],
    ["SPC-0021", 6.35],
  ],
};

function deviation(rng: Rng, lo: number, hi: number): number {
  const mag = lo + rng.next() * (hi - lo);
  return Math.round((rng.next() < 0.5 ? -mag : mag) * 1000) / 1000;
}

const role = (b: ScenarioBatch): Role => (b.context === CONTEXT.A ? "A" : "B");

function devMm(fields: ScenarioBatch["items"][number]["fields"], honourUnit: boolean): number {
  const d = Math.abs(num(fields.medida) - num(fields.nominal));
  return honourUnit && str(fields.unidad) === "um" ? d / 1000 : d;
}

const decide = (tol: (b: ScenarioBatch) => number, honourUnit: boolean): Policy => (b) =>
  b.items.map((i) => ({ itemId: i.itemId, label: devMm(i.fields, honourUnit) <= tol(b) ? "aceptar" : "rechazar" }));

export const manufactura: ScenarioDefinition = {
  id: "manufactura",
  version: "1",
  info: {
    industry: "Manufactura automotriz y aeroespacial",
    title: "Inspección de calidad de piezas",
    summary: "Decidir si una pieza maquinada se acepta o se rechaza según la medida y el cliente al que va.",
    problem:
      "Una planta surte a dos clientes con exigencias distintas. Aceptar una pieza fuera de tolerancia genera reclamos y devoluciones; rechazar piezas buenas tira dinero a la chatarra.",
    task: "Aceptar o rechazar cada pieza comparando la medida contra la medida nominal y la tolerancia del cliente.",
    contexts: {
      A: { id: CONTEXT.A, name: "Línea 1 · cliente automotriz nacional", rule: "Tolerancia de ±0.50 mm." },
      B: { id: CONTEXT.B, name: "Línea 2 · cliente aeroespacial de exportación", rule: "Tolerancia de ±0.10 mm." },
    },
    labels: [
      { id: "aceptar", meaning: "La pieza está dentro de tolerancia" },
      { id: "rechazar", meaning: "La pieza está fuera de tolerancia" },
    ],
    trap: "“Acepta toda pieza con desviación de hasta 0.5 mm.” Es correcta para la Línea 1 y deja pasar piezas defectuosas en la Línea 2.",
    change: "El cliente de exportación pide los reportes en micras en vez de milímetros. Una regla que asume milímetros rechaza piezas buenas, solo en la Línea 2.",
    scopedSkill: "“Tolerancia ±0.10 mm” con alcance: solo Línea 2, especificación AERO-EXP-12, convirtiendo la unidad del reporte.",
    whyItMatters: "En el Bajío una misma planta suele surtir a clientes con normas distintas; aplicar la norma equivocada es un error caro y frecuente.",
  },
  schemaFor: (r, rules) => (r === "A" ? "L1-mm@1" : rules === "R2" ? "L2-um@2" : "L2-mm@1"),
  generate: (spec) => {
    const rng = new Rng(spec.seed);
    const schema = manufactura.schemaFor(spec.role, spec.rulesVersion);
    const micro = schema === "L2-um@2";
    const parts = PARTS[spec.profile];
    const n = spec.profile === "heldout" ? rng.int(14, 20) : rng.int(10, 14);

    // Deviation bands keep a clear gap around each tolerance, so labels are never borderline.
    const kinds: ("good" | "bad" | "trap")[] = [];
    if (spec.role === "B") {
      kinds.push("good", "trap");
      const extraTraps = rng.int(0, 2);
      for (let i = 0; i < extraTraps; i++) kinds.push("trap");
    }
    while (kinds.length < n) kinds.push(rng.next() < 0.75 ? "good" : "bad");

    const rows = rng.shuffle(kinds).map((kind) => {
      const [code, nominal] = rng.pick(parts);
      const d =
        kind === "bad"
          ? deviation(rng, 0.55, 1.2)
          : kind === "trap"
            ? deviation(rng, 0.12, 0.45)
            : spec.role === "A"
              ? deviation(rng, 0.005, 0.45)
              : deviation(rng, 0.005, 0.08);
      const measured = Math.round((nominal + d) * 1000) / 1000;
      const label = Math.abs(d) <= TOL_MM[spec.role] ? "aceptar" : "rechazar";
      return {
        label,
        fields: {
          pieza: code,
          especificacion: SPEC[spec.role],
          turno: rng.pick(["matutino", "vespertino", "nocturno"]),
          nominal: micro ? Math.round(nominal * 1000) : nominal,
          medida: micro ? Math.round(measured * 1000) : measured,
          unidad: micro ? "um" : "mm",
        },
      };
    });

    const batchId = batchIdFor("manufactura", manufactura.version, spec);
    const { items, truth } = materialize(batchId, rows);
    return {
      batch: { batchId, scenario: "manufactura", context: CONTEXT[spec.role], schemaVersion: schema, rulesVersion: spec.rulesVersion, items },
      truth,
    };
  },
  policies: {
    naive: decide(() => TOL_MM.A, false),
    legacy: decide((b) => TOL_MM[role(b)], false),
    reference: decide((b) => TOL_MM[role(b)], true),
  },
};
