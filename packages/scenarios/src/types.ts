import type { Family, RulesVersionId, ScenarioBatch, ScenarioLabel, Split } from "@skillab/contracts";

export type Profile = "train" | "heldout";
export type Role = "A" | "B";

/** Plain-language description shown in the panel and docs; no field here affects generation. */
export interface ScenarioInfo {
  industry: string;
  title: string;
  summary: string;
  problem: string;
  task: string;
  contexts: Record<Role, { id: string; name: string; rule: string }>;
  labels: { id: string; meaning: string }[];
  /** The global rule that looks reasonable: right in context A, wrong in context B. */
  trap: string;
  /** The explicit R1 → R2 change, which only affects context B. */
  change: string;
  /** What a well-scoped skill would look like (an example, not something the system has learned). */
  scopedSkill: string;
  whyItMatters: string;
}

export interface GenerateSpec {
  split: Split;
  family: Family;
  seed: number;
  role: Role;
  rulesVersion: RulesVersionId;
  profile: Profile;
}

export type Policy = (batch: ScenarioBatch) => ScenarioLabel[];

export interface PolicySet {
  /** One global rule for every context: correct in A, wrong in B. */
  naive: Policy;
  /** Correct per context under R1, unaware of the R2 change. */
  legacy: Policy;
  /** Correct everywhere: proves the scenario is solvable from observable data. */
  reference: Policy;
}

export interface ScenarioDefinition {
  id: string;
  /** Bump when generation changes: part of every batch id and dataset hash. */
  version: string;
  info: ScenarioInfo;
  schemaFor(role: Role, rules: RulesVersionId): string;
  generate(spec: GenerateSpec): { batch: ScenarioBatch; truth: ScenarioLabel[] };
  policies: PolicySet;
  /** Overrides the standard seed/role/rules assignment (used by the original reconciliation scenario). */
  caseSpec?: (family: Family, split: Split, index: number, count: number) => GenerateSpec;
}
