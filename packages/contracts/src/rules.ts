import { z } from "zod";
import { RulesVersionId, SchemaVersion, Vendor } from "./env.js";

/** An explicit change of environment rules (the MVP does not detect drift). */
export const RuleChange = z
  .object({
    vendor: Vendor,
    fromSchema: SchemaVersion,
    toSchema: SchemaVersion,
    fields: z.array(z.string().min(1)).min(1),
    description: z.string().min(1),
  })
  .strict();

export const RuleVersion = z
  .object({
    id: RulesVersionId,
    supersedes: RulesVersionId.nullable(),
    schemas: z.record(Vendor, SchemaVersion),
    changes: z.array(RuleChange),
    description: z.string().min(1),
  })
  .strict();
export type RuleVersion = z.infer<typeof RuleVersion>;
