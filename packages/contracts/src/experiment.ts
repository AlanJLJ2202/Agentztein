import { z } from "zod";
import { SHA256_RE } from "./canonical.js";
import { Split } from "./env.js";
import { ToolName } from "./skill.js";

export const Variant = z.enum(["frozen", "accumulate", "global", "scoped", "scoped_no_validity", "scoped_no_scope"]);
export type Variant = z.infer<typeof Variant>;

export const ExperimentStatus = z.enum(["planned", "running", "completed", "budget_exhausted", "failed"]);

export const Experiment = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    variants: z.array(Variant).min(1),
    preregHash: z.string().regex(SHA256_RE).nullable(),
    status: ExperimentStatus,
    budgetUsd: z.number().positive(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type Experiment = z.infer<typeof Experiment>;

export const EpisodeStatus = z.enum(["ok", "invalid_output", "timeout", "error", "budget_exhausted"]);
export type EpisodeStatus = z.infer<typeof EpisodeStatus>;

export const Usage = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
    cacheWriteTokens: z.number().int().nonnegative(),
  })
  .strict();
export type Usage = z.infer<typeof Usage>;

export const AppliedSkill = z
  .object({ skillId: z.string().min(1), version: z.number().int().positive(), contentHash: z.string().regex(SHA256_RE) })
  .strict();

/** Why the selector chose or discarded each skill; persisted in every trace. */
export const SelectorDecision = z
  .object({
    selected: z.array(AppliedSkill),
    discarded: z.array(AppliedSkill.extend({ reason: z.string().min(1) }).strict()),
    conflict: z.string().min(1).optional(),
    abstained: z.boolean(),
  })
  .strict();
export type SelectorDecision = z.infer<typeof SelectorDecision>;

export const ToolCallRecord = z
  .object({ name: ToolName, input: z.unknown(), output: z.unknown(), error: z.string().optional() })
  .strict();

/** Episode summary row; the full message transcript lives in the BlobStore under traceBlob. */
export const Episode = z
  .object({
    id: z.string().min(1),
    experimentId: z.string().min(1),
    caseId: z.string().min(1),
    split: Split,
    variant: Variant,
    repetition: z.number().int().nonnegative(),
    status: EpisodeStatus,
    modelId: z.string().min(1),
    usage: Usage,
    costUsd: z.number().nonnegative(),
    latencyMs: z.number().int().nonnegative(),
    appliedSkills: z.array(AppliedSkill),
    selectorDecision: SelectorDecision,
    output: z.unknown().optional(),
    error: z.string().optional(),
    traceBlob: z.string().regex(SHA256_RE),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
  })
  .strict();
export type Episode = z.infer<typeof Episode>;
