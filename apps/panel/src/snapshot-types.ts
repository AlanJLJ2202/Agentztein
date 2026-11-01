import type { DatasetManifest, RulesVersionId, ScenarioCase } from "@skillab/contracts";
import type { ScenarioInfo } from "@skillab/scenarios";

/** Everything the static panel shows, computed at build time. Never contains the sealed test split. */
export interface Snapshot {
  builtAt: string;
  commit: string | null;
  manifest: DatasetManifest;
  scenarios: ScenarioSnapshot[];
}

export type PolicyId = "naive" | "legacy" | "reference";

export interface ScenarioSnapshot {
  id: string;
  info: ScenarioInfo;
  results: {
    policy: PolicyId;
    role: "A" | "B";
    context: string;
    rulesVersion: RulesVersionId;
    batches: { success: number; total: number };
    items: { correct: number; total: number };
  }[];
  examples: { role: "A" | "B"; rulesVersion: RulesVersionId; case: ScenarioCase; shown: number }[];
  counts: { cases: number; items: number };
}
