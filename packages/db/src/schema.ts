import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Append-only tables (ADR-009) are protected by triggers in migration 0001_immutability.sql:
// skill_versions, skill_events, decisions, evidence, episodes, test_access_log, sealed.truth.

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const ruleVersions = pgTable("rule_versions", {
  id: text("id").primaryKey(),
  supersedes: text("supersedes"),
  definition: jsonb("definition").notNull(),
  createdAt: createdAt(),
});

/** One row per generated (split, family) dataset; the hash ties DB content to datasets/manifest.json. */
export const datasets = pgTable(
  "datasets",
  {
    id: text("id").primaryKey(),
    split: text("split").notNull(),
    family: text("family").notNull(),
    generatorVersion: text("generator_version").notNull(),
    configVersion: text("config_version").notNull(),
    hash: text("hash").notNull(),
    caseCount: integer("case_count").notNull(),
    /** A used test split is "burned" and must be regenerated before informing another search. */
    burnedAt: timestamp("burned_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("datasets_split_family_hash").on(t.split, t.family, t.hash),
    check("datasets_split_chk", sql`${t.split} in ('adaptation', 'validation', 'test')`),
  ],
);

/** Agent-visible batches for adaptation and validation. Test batches live in sealed.test_cases. */
export const cases = pgTable(
  "cases",
  {
    caseId: text("case_id").primaryKey(),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => datasets.id),
    split: text("split").notNull(),
    family: text("family").notNull(),
    seed: integer("seed").notNull(),
    idx: integer("idx").notNull(),
    batchId: text("batch_id").notNull().unique(),
    scenario: text("scenario").notNull(),
    context: text("context").notNull(),
    schemaVersion: text("schema_version").notNull(),
    rulesVersion: text("rules_version")
      .notNull()
      .references(() => ruleVersions.id),
    batch: jsonb("batch").notNull(),
  },
  (t) => [check("cases_split_chk", sql`${t.split} in ('adaptation', 'validation')`)],
);

export const sealed = pgSchema("sealed");

export const testCases = sealed.table("test_cases", {
  caseId: text("case_id").primaryKey(),
  datasetId: text("dataset_id")
    .notNull()
    .references(() => datasets.id),
  family: text("family").notNull(),
  seed: integer("seed").notNull(),
  idx: integer("idx").notNull(),
  batchId: text("batch_id").notNull().unique(),
  scenario: text("scenario").notNull(),
  context: text("context").notNull(),
  schemaVersion: text("schema_version").notNull(),
  rulesVersion: text("rules_version")
    .notNull()
    .references(() => ruleVersions.id),
  batch: jsonb("batch").notNull(),
});

/** Ground truth for every split; readable only by the evaluator role (E3/E4). */
export const truth = sealed.table("truth", {
  caseId: text("case_id").primaryKey(),
  split: text("split").notNull(),
  labels: jsonb("labels").notNull(),
  createdAt: createdAt(),
});

export const testAccessLog = pgTable("test_access_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  datasetId: text("dataset_id")
    .notNull()
    .references(() => datasets.id),
  actor: text("actor").notNull(),
  purpose: text("purpose").notNull(),
  experimentId: text("experiment_id"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const experiments = pgTable(
  "experiments",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    variants: jsonb("variants").notNull(),
    preregHash: text("prereg_hash"),
    status: text("status").notNull(),
    budgetUsd: numeric("budget_usd", { precision: 12, scale: 6 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "experiments_status_chk",
      sql`${t.status} in ('planned', 'running', 'completed', 'budget_exhausted', 'failed')`,
    ),
  ],
);

/** Every episode is persisted with cost and trace, including failures and timeouts (I6). */
export const episodes = pgTable(
  "episodes",
  {
    id: text("id").primaryKey(),
    experimentId: text("experiment_id")
      .notNull()
      .references(() => experiments.id),
    caseId: text("case_id").notNull(),
    split: text("split").notNull(),
    variant: text("variant").notNull(),
    repetition: integer("repetition").notNull(),
    status: text("status").notNull(),
    modelId: text("model_id").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull(),
    latencyMs: integer("latency_ms").notNull(),
    appliedSkills: jsonb("applied_skills").notNull(),
    selectorDecision: jsonb("selector_decision").notNull(),
    output: jsonb("output"),
    error: text("error"),
    traceBlob: text("trace_blob").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("episodes_experiment_idx").on(t.experimentId),
    check("episodes_status_chk", sql`${t.status} in ('ok', 'invalid_output', 'timeout', 'error', 'budget_exhausted')`),
    check("episodes_trace_blob_chk", sql`${t.traceBlob} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const skillVersions = pgTable(
  "skill_versions",
  {
    skillId: text("skill_id").notNull(),
    version: integer("version").notNull(),
    parentVersion: integer("parent_version"),
    contentHash: text("content_hash").notNull(),
    createdBy: text("created_by").notNull(),
    hypothesis: text("hypothesis").notNull(),
    scope: jsonb("scope").notNull(),
    procedure: jsonb("procedure").notNull(),
    validity: jsonb("validity").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.skillId, t.version] }),
    check("skill_versions_version_chk", sql`${t.version} > 0`),
    check("skill_versions_parent_chk", sql`${t.parentVersion} is null or ${t.parentVersion} < ${t.version}`),
    check("skill_versions_hash_chk", sql`${t.contentHash} ~ '^[0-9a-f]{64}$'`),
    check("skill_versions_created_by_chk", sql`${t.createdBy} in ('proposer', 'human', 'seed')`),
  ],
);

export const decisions = pgTable(
  "decisions",
  {
    id: text("id").primaryKey(),
    skillId: text("skill_id").notNull(),
    version: integer("version").notNull(),
    outcome: text("outcome").notNull(),
    reason: text("reason").notNull(),
    criteriaHash: text("criteria_hash").notNull(),
    evaluatorVersion: text("evaluator_version").notNull(),
    evaluatorHash: text("evaluator_hash").notNull(),
    thresholds: jsonb("thresholds").notNull(),
    perFamily: jsonb("per_family").notNull(),
    hardConstraintViolations: jsonb("hard_constraint_violations").notNull(),
    humanApproval: jsonb("human_approval"),
    promotedVersion: integer("promoted_version"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.skillId, t.version], foreignColumns: [skillVersions.skillId, skillVersions.version] }),
    check("decisions_outcome_chk", sql`${t.outcome} in ('promote', 'restrict', 'reject', 'insufficient_evidence')`),
  ],
);

export const skillEvents = pgTable(
  "skill_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    skillId: text("skill_id").notNull(),
    version: integer("version").notNull(),
    fromState: text("from_state"),
    toState: text("to_state").notNull(),
    reason: text("reason").notNull(),
    decisionId: text("decision_id").references(() => decisions.id),
    actor: text("actor").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.skillId, t.version], foreignColumns: [skillVersions.skillId, skillVersions.version] }),
    index("skill_events_skill_idx").on(t.skillId, t.version),
  ],
);

export const evidence = pgTable(
  "evidence",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    skillId: text("skill_id").notNull(),
    version: integer("version").notNull(),
    experimentId: text("experiment_id")
      .notNull()
      .references(() => experiments.id),
    family: text("family").notNull(),
    rulesVersion: text("rules_version")
      .notNull()
      .references(() => ruleVersions.id),
    scenario: text("scenario").notNull(),
    context: text("context").notNull(),
    split: text("split").notNull(),
    successes: integer("successes").notNull(),
    trials: integer("trials").notNull(),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull(),
    // Evidence is never edited or deleted; rule changes record invalidations separately (E5).
    traceRefs: jsonb("trace_refs").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.skillId, t.version], foreignColumns: [skillVersions.skillId, skillVersions.version] }),
    check("evidence_counts_chk", sql`${t.successes} >= 0 and ${t.successes} <= ${t.trials}`),
  ],
);

/* ---------- App (signed-in users) ----------
   Mutable product state, kept apart from the append-only research tables. Lives in its own schema `app`,
   which the Supabase Data API does not expose: only the server functions in /api read or write it. */
export const app = pgSchema("app");

/** One model-provider API key per user and provider, encrypted by the server (AES-256-GCM). */
export const providerKeys = app.table(
  "provider_keys",
  {
    userId: uuid("user_id").notNull(),
    provider: text("provider").notNull(),
    /** `v1:<iv>:<tag>:<ciphertext>`, base64; bound to user and provider as additional data. */
    secret: text("secret").notNull(),
    /** Last characters of the key, to recognise it without decrypting. */
    hint: text("hint").notNull(),
    model: text("model"),
    models: jsonb("models").notNull().default(sql`'[]'::jsonb`),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider] })],
);

/** What the research triage decided about each story it read, per user. */
export const researchNotes = app.table(
  "research_notes",
  {
    userId: uuid("user_id").notNull(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    discussionUrl: text("discussion_url"),
    points: integer("points"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    capability: text("capability"),
    verdict: text("verdict").notNull(),
    gain: text("gain").notNull(),
    cost: text("cost").notNull(),
    why: text("why").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.source, t.externalId] }),
    index("research_notes_user_created").on(t.userId, t.createdAt),
    check("research_notes_verdict_chk", sql`${t.verdict} in ('experiment', 'watch', 'skip')`),
  ],
);
