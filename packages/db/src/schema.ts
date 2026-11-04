import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
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
    /** The person's call on the idea: nothing goes to the lab without it. */
    decision: text("decision"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.source, t.externalId] }),
    check("research_notes_decision_chk", sql`${t.decision} is null or ${t.decision} in ('approved', 'rejected')`),
    index("research_notes_user_created").on(t.userId, t.createdAt),
    check("research_notes_verdict_chk", sql`${t.verdict} in ('experiment', 'watch', 'skip')`),
  ],
);

/** The harness: each user's spending limit. */
export const userLimits = app.table("user_limits", {
  userId: uuid("user_id").primaryKey(),
  monthlyBudgetUsd: numeric("monthly_budget_usd", { precision: 10, scale: 2 }).notNull().default("5"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The harness log: every model call with its tokens and cost. Append-only (trigger in migration 0006). */
export const harnessRuns = app.table(
  "harness_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").notNull(),
    kind: text("kind").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    effort: text("effort"),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull(),
    outcome: text("outcome").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("harness_runs_user_created").on(t.userId, t.createdAt)],
);

/**
 * The agent's own skills: versioned instructions it wrote for itself, scoped to one scenario context.
 * The text of a version never changes (trigger in migration 0007); only its status moves, and only an
 * "active" skill is used by the agent. Candidates wait for a person's approval.
 */
export const agentSkills = app.table(
  "agent_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    scenario: text("scenario").notNull(),
    context: text("context").notNull(),
    version: integer("version").notNull(),
    instructions: text("instructions").notNull(),
    rationale: text("rationale").notNull(),
    parentId: uuid("parent_id"),
    model: text("model").notNull(),
    noteId: text("note_id"),
    jobId: uuid("job_id"),
    status: text("status").notNull().default("candidate"),
    verdict: jsonb("verdict"),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("agent_skills_version").on(t.userId, t.scenario, t.context, t.version),
    index("agent_skills_user").on(t.userId, t.scenario),
    check("agent_skills_status_chk", sql`${t.status} in ('candidate', 'active', 'rejected', 'retired')`),
  ],
);

/** One improvement cycle, advanced one model call at a time (serverless-friendly). */
export const agentJobs = app.table(
  "agent_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    scenario: text("scenario").notNull(),
    executor: text("executor").notNull(),
    planner: text("planner").notNull(),
    effort: text("effort"),
    phase: text("phase").notNull(),
    state: jsonb("state").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** When a dream digested this cycle into lessons (null: not yet). */
    dreamtAt: timestamp("dreamt_at", { withTimezone: true }),
  },
  (t) => [index("agent_jobs_user").on(t.userId, t.createdAt)],
);

/**
 * The agent's semantic memory (ADR-031): short lessons it wrote while dreaming over its finished cycles, scoped to
 * the whole lab, one exam or one situation. A lesson's text and scope never change (trigger in migration 0009): a
 * dream that corrects one supersedes it with a new row (parent_id). `strength` (0–5) rises when a dream keeps it and
 * falls when it is neither kept nor used; at 0 it fades. A person can pin it (never fades) or forget it. Never
 * deleted. Only the planner, the director and the talk read it; the executor never does.
 */
export const agentMemories = app.table(
  "agent_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    scope: text("scope").notNull(),
    kind: text("kind").notNull(),
    text: text("text").notNull(),
    evidence: jsonb("evidence").notNull().default(sql`'[]'::jsonb`),
    strength: integer("strength").notNull().default(2),
    pinned: boolean("pinned").notNull().default(false),
    status: text("status").notNull().default("active"),
    parentId: uuid("parent_id"),
    dreamId: uuid("dream_id"),
    uses: integer("uses").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("agent_memories_user").on(t.userId, t.status),
    check("agent_memories_status_chk", sql`${t.status} in ('active', 'faded', 'superseded', 'forgotten')`),
    check("agent_memories_kind_chk", sql`${t.kind} in ('rule', 'dead-end', 'strategy', 'fact')`),
    check("agent_memories_strength_chk", sql`${t.strength} between 0 and 5`),
  ],
);

/** One dream: which cycles it digested, with which model, what it cost and what changed in memory. Append-only. */
export const agentDreams = app.table(
  "agent_dreams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    model: text("model").notNull(),
    jobs: jsonb("jobs").notNull().default(sql`'[]'::jsonb`),
    summary: text("summary").notNull().default(""),
    stats: jsonb("stats").notNull().default(sql`'{}'::jsonb`),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    jobId: uuid("job_id"),
    createdAt: createdAt(),
  },
  (t) => [index("agent_dreams_user").on(t.userId, t.createdAt)],
);

/**
 * Each user's own version of the agent's core (packages/agent-core), written by the builder (Muse Code or Forja)
 * in a run of the evolve workflow. `files` is the whole package (path → text). A version's code never changes
 * (trigger in migration 0008); only its status moves. No row means the user runs the platform's core (v0).
 * Only an "active" version answers the user's exams, always in a sandboxed child process (api/_lib/sandbox.js).
 */
export const agentCores = app.table(
  "agent_cores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    version: integer("version").notNull(),
    files: jsonb("files").notNull(),
    coreVersion: text("core_version").notNull(),
    strategy: text("strategy").notNull(),
    changes: text("changes").notNull().default(""),
    parentId: uuid("parent_id"),
    runId: uuid("run_id"),
    builder: text("builder").notNull(),
    status: text("status").notNull().default("candidate"),
    verdict: jsonb("verdict"),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("agent_cores_version").on(t.userId, t.version),
    index("agent_cores_user").on(t.userId, t.status),
    check("agent_cores_status_chk", sql`${t.status} in ('candidate', 'active', 'rejected', 'retired')`),
  ],
);

/**
 * One run of the evolve workflow for one user: Muse Wonder's hypothesis, then GitHub Actions builds and judges it
 * with that user's own Meta key, fetched once with the run's one-time token (only its hash is stored here).
 */
export const evolveRuns = app.table(
  "evolve_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    status: text("status").notNull().default("queued"),
    builder: text("builder").notNull(),
    proposal: jsonb("proposal").notNull(),
    baseCoreId: uuid("base_core_id"),
    candidateCoreId: uuid("candidate_core_id"),
    tokenHash: text("token_hash").notNull(),
    keyFetchedAt: timestamp("key_fetched_at", { withTimezone: true }),
    maxUsd: numeric("max_usd", { precision: 10, scale: 4 }).notNull(),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    detail: jsonb("detail").notNull().default(sql`'{}'::jsonb`),
    ciUrl: text("ci_url"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("evolve_runs_user").on(t.userId, t.createdAt),
    check("evolve_runs_status_chk", sql`${t.status} in ('queued', 'building', 'passed', 'rejected', 'failed')`),
  ],
);

/**
 * Site traffic (ADR-034): one row per thing a visitor did, from the landing or the app. `visitor_id` is a random id the
 * browser keeps (no cookie, no IP, no fingerprint); `session_id` changes after 30 minutes without activity. `user_id` is
 * only set on "signed_in", after the server checked the Supabase session, which ties a visitor to the account they made.
 * Rows from obvious bots are dropped before they get here. Read only by /api/visits, for the people in ADMIN_EMAILS.
 */
export const visitEvents = app.table(
  "visit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    visitorId: text("visitor_id").notNull(),
    sessionId: text("session_id").notNull(),
    page: text("page").notNull(),
    event: text("event").notNull(),
    /** the section, tab or button: `como-funciona`, `agent`, `hero-create`… */
    target: text("target"),
    /** "leave": milliseconds the page was visible */
    value: integer("value"),
    /** host of the page that sent them here (never the full URL) */
    referrer: text("referrer"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    /** ISO country code from Vercel's edge (x-vercel-ip-country) */
    country: text("country"),
    device: text("device"),
    lang: text("lang"),
    userId: uuid("user_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("visit_events_created").on(t.createdAt),
    index("visit_events_visitor").on(t.visitorId, t.createdAt),
    index("visit_events_user").on(t.userId),
    check("visit_events_page_chk", sql`${t.page} in ('landing', 'app')`),
    check("visit_events_event_chk", sql`${t.event} in ('view', 'section', 'cta', 'lab', 'leave', 'tab', 'signin', 'signed_in')`),
    check("visit_events_device_chk", sql`${t.device} is null or ${t.device} in ('mobile', 'tablet', 'desktop')`),
  ],
);
