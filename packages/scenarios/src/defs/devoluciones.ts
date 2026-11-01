import type { ScenarioBatch } from "@skillab/contracts";
import { Rng } from "@skillab/env-recon";
import { addDays, batchIdFor, daysBetween, materialize, str } from "../common.js";
import type { Policy, Role, ScenarioDefinition } from "../types.js";

/**
 * Customer return requests from two sales channels.
 * Trap: "30 days from purchase" is right for the own store, but the marketplace counts from delivery.
 * Change (R2): the marketplace shortens the window for electronics to 15 days from delivery.
 */

const CONTEXT = { A: "tienda_propia", B: "marketplace" } as const;
const CATEGORIES = {
  train: ["ropa", "hogar", "juguetes", "electronica"],
  heldout: ["deportes", "belleza", "herramientas", "electronica"],
} as const;
const REASONS = {
  train: ["talla incorrecta", "no era lo que esperaba", "cambio de opinión"],
  heldout: ["color distinto al de la foto", "ya no lo necesito", "lo compré por error"],
} as const;

const role = (b: ScenarioBatch): Role => (b.context === CONTEXT.A ? "A" : "B");

type Fields = ScenarioBatch["items"][number]["fields"];
const fromPurchase = (f: Fields) => daysBetween(str(f.fecha_compra), str(f.fecha_solicitud));
const fromDelivery = (f: Fields) => daysBetween(str(f.fecha_entrega), str(f.fecha_solicitud));

function windowFor(r: Role, rules: ScenarioBatch["rulesVersion"], category: string, knowsR2: boolean): number {
  return r === "B" && knowsR2 && rules === "R2" && category === "electronica" ? 15 : 30;
}

const decide = (perChannel: boolean, knowsR2: boolean): Policy => (b) =>
  b.items.map((i) => {
    const r = role(b);
    const days = perChannel && r === "B" ? fromDelivery(i.fields) : fromPurchase(i.fields);
    const ok = days <= windowFor(r, b.rulesVersion, str(i.fields.categoria), knowsR2);
    return { itemId: i.itemId, label: ok ? "aprobar" : "rechazar" };
  });

export const devoluciones: ScenarioDefinition = {
  id: "devoluciones",
  version: "1",
  info: {
    industry: "Comercio minorista y e-commerce",
    title: "Solicitudes de devolución",
    summary: "Aprobar o rechazar devoluciones de clientes que compraron por dos canales de venta.",
    problem:
      "Rechazar una devolución válida cuesta un cliente y una mala reseña; aprobar una fuera de plazo cuesta mercancía. Cada canal tiene su propia política.",
    task: "Aprobar o rechazar cada solicitud según la política del canal por el que se vendió.",
    contexts: {
      A: { id: CONTEXT.A, name: "Tienda en línea propia", rule: "30 días contados desde la fecha de compra." },
      B: { id: CONTEXT.B, name: "Marketplace", rule: "30 días contados desde la fecha de entrega." },
    },
    labels: [
      { id: "aprobar", meaning: "La devolución está dentro de la política" },
      { id: "rechazar", meaning: "La devolución está fuera de plazo" },
    ],
    trap: "“Aprueba si han pasado 30 días o menos desde la compra.” Es correcta en la tienda propia y rechaza devoluciones válidas del marketplace, donde el envío tarda más.",
    change: "El marketplace reduce a 15 días (desde la entrega) la ventana para electrónica. Lo aprendido para la tienda propia sigue siendo válido.",
    scopedSkill: "“Contar desde la entrega” con alcance: solo marketplace; y una versión nueva para electrónica bajo la política R2.",
    whyItMatters: "Las PyMEs que venden en su tienda y en marketplaces manejan políticas que cambian sin aviso; equivocarse se nota en reseñas y en inventario.",
  },
  schemaFor: (r) => (r === "A" ? "RET-TIENDA@1" : "RET-MKT@1"),
  generate: (spec) => {
    const rng = new Rng(spec.seed);
    const cats = CATEGORIES[spec.profile];
    const reasons = REASONS[spec.profile];
    const year = spec.profile === "heldout" ? 2026 : 2025;
    const start = addDays(`${year}-01-01`, rng.int(0, 300));
    const n = spec.profile === "heldout" ? rng.int(12, 18) : rng.int(8, 12);

    type Kind = "ok" | "late" | "trap" | "r2trap";
    const kinds: Kind[] = [];
    if (spec.role === "B") kinds.push("trap", "r2trap");
    while (kinds.length < n) kinds.push(rng.next() < 0.7 ? "ok" : "late");

    const rows = rng.shuffle(kinds).map((kind) => {
      const purchase = addDays(start, rng.int(0, 20));
      let category: string = rng.pick(cats.filter((c) => c !== "electronica"));
      let shipping = spec.role === "A" ? rng.int(1, 4) : rng.int(3, 10);
      let elapsed: number; // days from the date the channel counts from
      if (kind === "trap") {
        // Marketplace: within 30 days of delivery but more than 31 days after purchase.
        shipping = rng.int(7, 10);
        elapsed = rng.int(Math.max(1, 32 - shipping), 27);
      } else if (kind === "r2trap") {
        category = "electronica";
        elapsed = rng.int(17, 27);
      } else {
        if (rng.next() < 0.25) category = "electronica";
        elapsed = kind === "ok" ? rng.int(1, category === "electronica" ? 13 : 27) : rng.int(33, 60);
      }
      const delivery = addDays(purchase, shipping);
      const request = spec.role === "A" ? addDays(purchase, elapsed) : addDays(delivery, elapsed);
      const window = windowFor(spec.role, spec.rulesVersion, category, true);
      return {
        label: elapsed <= window ? "aprobar" : "rechazar",
        fields: {
          solicitud: `DEV-${String(rng.int(10000, 99999))}`,
          categoria: category,
          motivo: rng.pick(reasons),
          fecha_compra: purchase,
          fecha_entrega: delivery,
          fecha_solicitud: request,
        },
      };
    });

    const batchId = batchIdFor("devoluciones", devoluciones.version, spec);
    const { items, truth } = materialize(batchId, rows);
    return {
      batch: {
        batchId,
        scenario: "devoluciones",
        context: CONTEXT[spec.role],
        schemaVersion: devoluciones.schemaFor(spec.role, spec.rulesVersion),
        rulesVersion: spec.rulesVersion,
        items,
      },
      truth,
    };
  },
  policies: {
    naive: decide(false, false),
    legacy: decide(true, false),
    reference: decide(true, true),
  },
};
