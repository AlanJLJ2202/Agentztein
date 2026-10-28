import { z } from "zod";
import { SHA256_RE } from "./canonical.js";
import { Family, RulesVersionId, SchemaVersion, Split, Vendor } from "./env.js";

const Sha256 = z.string().regex(SHA256_RE);
const IsoDateTime = z.iso.datetime();

/** Tools the agent can call in env-recon; a skill's permissions must be a subset. */
export const ToolName = z.enum(["list_rows", "get_row", "get_import_metadata", "submit_labels"]);
export type ToolName = z.infer<typeof ToolName>;

/** Observable conditions under which a skill may be applied (I5). */
export const SkillScope = z
  .object({
    task: z.string().min(1),
    vendors: z.array(Vendor).min(1),
    schemaVersions: z.array(SchemaVersion).min(1),
    rulesVersions: z.array(RulesVersionId).min(1),
    requiredFields: z.array(z.string().min(1)).optional(),
    permissions: z.array(ToolName),
  })
  .strict();
export type SkillScope = z.infer<typeof SkillScope>;

export const SkillProcedure = z
  .object({
    instructions: z.string().min(1),
    inputs: z.array(z.string()),
    outputs: z.array(z.string()),
    knownLimits: z.array(z.string()),
  })
  .strict();

export const SkillValidity = z
  .object({
    evaluatedAgainst: z.array(z.object({ rulesVersion: RulesVersionId, schemaVersion: SchemaVersion }).strict()),
    reviewBy: IsoDateTime.optional(),
    revalidateWhen: z.array(z.string().min(1)),
  })
  .strict();

/** The hashed part of a skill version: everything that defines its behaviour and claims. */
export const SkillContent = z
  .object({
    skillId: z.string().min(1),
    version: z.number().int().positive(),
    parentVersion: z.number().int().positive().nullable(),
    createdBy: z.enum(["proposer", "human", "seed"]),
    hypothesis: z.string().min(1),
    scope: SkillScope,
    procedure: SkillProcedure,
    validity: SkillValidity,
  })
  .strict();
export type SkillContent = z.infer<typeof SkillContent>;

export const SkillVersion = SkillContent.extend({ contentHash: Sha256, createdAt: IsoDateTime }).strict();
export type SkillVersion = z.infer<typeof SkillVersion>;

export const SkillState = z.enum([
  "candidate",
  "evaluating",
  "active",
  "restricted",
  "retired",
  "insufficient_evidence",
  "rejected",
]);
export type SkillState = z.infer<typeof SkillState>;

export const SkillOperation = z.enum(["create", "revise", "restrict", "split", "retire", "reactivate"]);

export const SkillEvent = z
  .object({
    skillId: z.string().min(1),
    version: z.number().int().positive(),
    from: SkillState.nullable(),
    to: SkillState,
    reason: z.string().min(1),
    decisionId: z.string().min(1).optional(),
    at: IsoDateTime,
    actor: z.string().min(1),
  })
  .strict();
export type SkillEvent = z.infer<typeof SkillEvent>;

export const Evidence = z
  .object({
    skillId: z.string().min(1),
    version: z.number().int().positive(),
    experimentId: z.string().min(1),
    family: Family,
    rulesVersion: RulesVersionId,
    vendor: Vendor,
    split: Split,
    successes: z.number().int().nonnegative(),
    trials: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
    traceRefs: z.array(z.string().min(1)),
  })
  .strict()
  .refine((e) => e.successes <= e.trials, { message: "successes cannot exceed trials" });
export type Evidence = z.infer<typeof Evidence>;

export const DecisionOutcome = z.enum(["promote", "restrict", "reject", "insufficient_evidence"]);

export const FamilyResult = z
  .object({
    family: Family,
    rulesVersion: RulesVersionId,
    vendor: Vendor,
    baseline: z.object({ successes: z.number().int().nonnegative(), trials: z.number().int().nonnegative() }),
    candidate: z.object({ successes: z.number().int().nonnegative(), trials: z.number().int().nonnegative() }),
    diff: z.number(),
    ci95: z.tuple([z.number(), z.number()]),
    inScope: z.boolean(),
  })
  .strict();

export const Decision = z
  .object({
    id: z.string().min(1),
    skillId: z.string().min(1),
    version: z.number().int().positive(),
    outcome: DecisionOutcome,
    /** The motive in words: a decision must be explainable, not only a set of numbers. */
    reason: z.string().min(1),
    criteriaHash: Sha256,
    evaluatorVersion: z.string().min(1),
    evaluatorHash: Sha256,
    thresholds: z.record(z.string(), z.number()),
    perFamily: z.array(FamilyResult),
    hardConstraintViolations: z.array(z.string()),
    humanApproval: z.object({ by: z.string().min(1), at: IsoDateTime, note: z.string() }).strict().optional(),
    promotedVersion: z.number().int().positive().optional(),
    createdAt: IsoDateTime,
  })
  .strict();
export type Decision = z.infer<typeof Decision>;
