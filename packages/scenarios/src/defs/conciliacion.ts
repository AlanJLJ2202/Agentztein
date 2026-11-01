import { Row, type Batch, type Label, type ScenarioBatch, type ScenarioLabel } from "@skillab/contracts";
import {
  caseSpec,
  generateBatch,
  naiveRuleOracle,
  referenceOracle,
  schemaFor,
  signRuleOracle,
  type Oracle,
} from "@skillab/env-recon";
import type { ScenarioDefinition } from "../types.js";

/** Adapter: the original bank-reconciliation environment (env-recon) expressed as a generic scenario. */

const ROLE_TO_VENDOR = { A: "vendorA", B: "vendorB" } as const;

function toScenarioBatch(batch: Batch): ScenarioBatch {
  return {
    batchId: batch.batchId,
    scenario: "conciliacion",
    context: batch.vendor,
    schemaVersion: batch.schemaVersion,
    rulesVersion: batch.rulesVersion,
    items: batch.rows.map(({ rowId, ...fields }) => ({ itemId: rowId, fields })),
  };
}

function fromScenarioBatch(batch: ScenarioBatch): Batch {
  return {
    batchId: batch.batchId,
    vendor: batch.context === "vendorA" ? "vendorA" : "vendorB",
    schemaVersion: batch.schemaVersion as Batch["schemaVersion"],
    rulesVersion: batch.rulesVersion,
    rows: batch.items.map((i) => Row.parse({ rowId: i.itemId, ...i.fields })),
  };
}

function toLabel(l: Label): ScenarioLabel {
  return l.kind === "legitimate"
    ? { itemId: l.rowId, label: l.kind }
    : { itemId: l.rowId, label: l.kind, target: l.target };
}

const wrap = (oracle: Oracle) => (batch: ScenarioBatch) => oracle(fromScenarioBatch(batch)).map(toLabel);

export const conciliacion: ScenarioDefinition = {
  id: "conciliacion",
  version: "1",
  info: {
    industry: "Finanzas y contabilidad",
    title: "Conciliación de movimientos bancarios",
    summary: "Ordenar los movimientos que llegan de dos bancos: qué es duplicado, qué es reembolso y qué es transferencia.",
    problem:
      "Las empresas importan movimientos de varios bancos. Si un movimiento se importa dos veces se paga o se cobra doble; si una compra legítima se marca como duplicada, desaparece de la contabilidad.",
    task: "Etiquetar cada movimiento como legítimo, duplicado de otro, reembolso de otro o parte de una transferencia entre cuentas propias.",
    contexts: {
      A: { id: "vendorA", name: "Banco A", rule: "Trae un folio único por operación: dos filas con el mismo folio son la misma operación." },
      B: {
        id: "vendorB",
        name: "Banco B",
        rule: "No trae folio. Dos cafés iguales el mismo día son compras distintas; solo la hora en la descripción distingue un duplicado real.",
      },
    },
    labels: [
      { id: "legitimate", meaning: "Movimiento válido" },
      { id: "duplicate_of", meaning: "Copia de otro movimiento ya importado" },
      { id: "refund_of", meaning: "Devolución de una compra anterior" },
      { id: "transfer_pair", meaning: "Una de las dos patas de una transferencia entre cuentas propias" },
    ],
    trap: "“Si tiene el mismo importe y la misma fecha, es duplicado.” Funciona en el Banco A y borra compras reales en el Banco B.",
    change: "El Banco B cambia su formato: los importes llegan siempre en positivo y un campo nuevo indica si es cargo o abono. Las reglas que leían el signo dejan de servir solo ahí.",
    scopedSkill: "“Deduplicar por folio” con alcance: solo Banco A, formato A@1, requiere el campo vendor_txn_id.",
    whyItMatters: "Es el ejemplo del anteproyecto: una regla útil en un lugar puede dañar otro, y un cambio de formato invalida solo parte de lo aprendido.",
  },
  schemaFor: (role, rules) => schemaFor(ROLE_TO_VENDOR[role], rules),
  caseSpec: (family, split, index, count) => {
    const s = caseSpec(family, split, index, count);
    return { split, family, seed: s.seed, role: s.vendor === "vendorA" ? "A" : "B", rulesVersion: s.rulesVersion, profile: s.profile };
  },
  generate: (spec) => {
    const { batch, truth } = generateBatch({
      split: spec.split,
      family: spec.family,
      seed: spec.seed,
      vendor: ROLE_TO_VENDOR[spec.role],
      rulesVersion: spec.rulesVersion,
      profile: spec.profile,
    });
    return { batch: toScenarioBatch(batch), truth: truth.map(toLabel) };
  },
  policies: { naive: wrap(naiveRuleOracle), legacy: wrap(signRuleOracle), reference: wrap(referenceOracle) },
};
