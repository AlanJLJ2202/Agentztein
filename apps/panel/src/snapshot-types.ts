import type { DatasetManifest, Family, Label, Row, RulesVersionId, SchemaVersion, Split, Vendor } from "@skillab/contracts";

/** Everything the static panel shows, computed at build time. Never contains the sealed test split. */
export interface Snapshot {
  builtAt: string;
  commit: string | null;
  generatorVersion: string;
  configVersion: string;
  manifest: DatasetManifest;
  conflict: ConflictFamily[];
  labelCounts: { split: Exclude<Split, "test">; counts: Record<Label["kind"], number> }[];
  examples: ExampleBatch[];
}

export interface ConflictFamily {
  family: Family;
  rows: {
    policy: string;
    projection: "full" | "dedupe";
    vendor: Vendor;
    rulesVersion: RulesVersionId;
    batches: { success: number; total: number };
    rowsCorrect: { correct: number; total: number };
  }[];
}

export interface ExampleBatch {
  key: string;
  caseId: string;
  batchId: string;
  vendor: Vendor;
  schemaVersion: SchemaVersion;
  rulesVersion: RulesVersionId;
  rows: Row[];
  truth: Label[];
}
