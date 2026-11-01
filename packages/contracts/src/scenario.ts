import { z } from "zod";
import { Family, RulesVersionId, Split } from "./env.js";

/**
 * Generic shape shared by every business scenario (ADR-016). Each scenario has two observable
 * contexts whose correct procedures conflict, and an explicit rule change (R1 → R2) that affects
 * only the second context. The bank-reconciliation environment is one scenario among several.
 */
export const ScenarioId = z.string().regex(/^[a-z][a-z0-9_]*$/);

export const FieldValue = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);

export const Item = z.object({ itemId: z.string().min(1), fields: z.record(z.string(), FieldValue) }).strict();
export type Item = z.infer<typeof Item>;

export const ScenarioLabel = z
  .object({ itemId: z.string().min(1), label: z.string().min(1), target: z.string().min(1).optional() })
  .strict();
export type ScenarioLabel = z.infer<typeof ScenarioLabel>;

/** What the agent learns about a batch before acting: the observable context, never the answer. */
export const ContextMetadata = z
  .object({
    batchId: z.string().min(1),
    scenario: ScenarioId,
    context: z.string().min(1),
    schemaVersion: z.string().min(1),
    rulesVersion: RulesVersionId,
  })
  .strict();
export type ContextMetadata = z.infer<typeof ContextMetadata>;

export const ScenarioBatch = ContextMetadata.extend({ items: z.array(Item) }).strict();
export type ScenarioBatch = z.infer<typeof ScenarioBatch>;

export const ScenarioSubmit = z.object({ batchId: z.string().min(1), labels: z.array(ScenarioLabel) }).strict();

export const ScenarioCase = z
  .object({
    caseId: z.string().min(1),
    scenario: ScenarioId,
    family: Family,
    split: Split,
    seed: z.number().int().nonnegative(),
    index: z.number().int().nonnegative(),
    batch: ScenarioBatch,
    truth: z.array(ScenarioLabel),
  })
  .strict();
export type ScenarioCase = z.infer<typeof ScenarioCase>;
