CREATE SCHEMA "sealed";
--> statement-breakpoint
CREATE TABLE "cases" (
	"case_id" text PRIMARY KEY NOT NULL,
	"dataset_id" text NOT NULL,
	"split" text NOT NULL,
	"family" text NOT NULL,
	"seed" integer NOT NULL,
	"idx" integer NOT NULL,
	"batch_id" text NOT NULL,
	"vendor" text NOT NULL,
	"schema_version" text NOT NULL,
	"rules_version" text NOT NULL,
	"batch" jsonb NOT NULL,
	CONSTRAINT "cases_batch_id_unique" UNIQUE("batch_id"),
	CONSTRAINT "cases_split_chk" CHECK ("cases"."split" in ('adaptation', 'validation'))
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" text PRIMARY KEY NOT NULL,
	"split" text NOT NULL,
	"family" text NOT NULL,
	"generator_version" text NOT NULL,
	"config_version" text NOT NULL,
	"hash" text NOT NULL,
	"case_count" integer NOT NULL,
	"burned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "datasets_split_chk" CHECK ("datasets"."split" in ('adaptation', 'validation', 'test'))
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"skill_id" text NOT NULL,
	"version" integer NOT NULL,
	"outcome" text NOT NULL,
	"criteria_hash" text NOT NULL,
	"evaluator_version" text NOT NULL,
	"evaluator_hash" text NOT NULL,
	"thresholds" jsonb NOT NULL,
	"per_family" jsonb NOT NULL,
	"hard_constraint_violations" jsonb NOT NULL,
	"human_approval" jsonb,
	"promoted_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decisions_outcome_chk" CHECK ("decisions"."outcome" in ('promote', 'restrict', 'reject', 'insufficient_evidence'))
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" text PRIMARY KEY NOT NULL,
	"experiment_id" text NOT NULL,
	"case_id" text NOT NULL,
	"split" text NOT NULL,
	"variant" text NOT NULL,
	"repetition" integer NOT NULL,
	"status" text NOT NULL,
	"model_id" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) NOT NULL,
	"latency_ms" integer NOT NULL,
	"applied_skills" jsonb NOT NULL,
	"selector_decision" jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"trace_blob" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	CONSTRAINT "episodes_status_chk" CHECK ("episodes"."status" in ('ok', 'invalid_output', 'timeout', 'error', 'budget_exhausted')),
	CONSTRAINT "episodes_trace_blob_chk" CHECK ("episodes"."trace_blob" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"skill_id" text NOT NULL,
	"version" integer NOT NULL,
	"experiment_id" text NOT NULL,
	"family" text NOT NULL,
	"rules_version" text NOT NULL,
	"vendor" text NOT NULL,
	"split" text NOT NULL,
	"successes" integer NOT NULL,
	"trials" integer NOT NULL,
	"cost_usd" numeric(12, 6) NOT NULL,
	"trace_refs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_counts_chk" CHECK ("evidence"."successes" >= 0 and "evidence"."successes" <= "evidence"."trials")
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"variants" jsonb NOT NULL,
	"prereg_hash" text,
	"status" text NOT NULL,
	"budget_usd" numeric(12, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiments_status_chk" CHECK ("experiments"."status" in ('planned', 'running', 'completed', 'budget_exhausted', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "rule_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"supersedes" text,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"skill_id" text NOT NULL,
	"version" integer NOT NULL,
	"from_state" text,
	"to_state" text NOT NULL,
	"reason" text NOT NULL,
	"decision_id" text,
	"actor" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_versions" (
	"skill_id" text NOT NULL,
	"version" integer NOT NULL,
	"parent_version" integer,
	"content_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"hypothesis" text NOT NULL,
	"scope" jsonb NOT NULL,
	"procedure" jsonb NOT NULL,
	"validity" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_versions_skill_id_version_pk" PRIMARY KEY("skill_id","version"),
	CONSTRAINT "skill_versions_version_chk" CHECK ("skill_versions"."version" > 0),
	CONSTRAINT "skill_versions_parent_chk" CHECK ("skill_versions"."parent_version" is null or "skill_versions"."parent_version" < "skill_versions"."version"),
	CONSTRAINT "skill_versions_hash_chk" CHECK ("skill_versions"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "skill_versions_created_by_chk" CHECK ("skill_versions"."created_by" in ('proposer', 'human', 'seed'))
);
--> statement-breakpoint
CREATE TABLE "test_access_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"dataset_id" text NOT NULL,
	"actor" text NOT NULL,
	"purpose" text NOT NULL,
	"experiment_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sealed"."test_cases" (
	"case_id" text PRIMARY KEY NOT NULL,
	"dataset_id" text NOT NULL,
	"family" text NOT NULL,
	"seed" integer NOT NULL,
	"idx" integer NOT NULL,
	"batch_id" text NOT NULL,
	"vendor" text NOT NULL,
	"schema_version" text NOT NULL,
	"rules_version" text NOT NULL,
	"batch" jsonb NOT NULL,
	CONSTRAINT "test_cases_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
CREATE TABLE "sealed"."truth" (
	"case_id" text PRIMARY KEY NOT NULL,
	"split" text NOT NULL,
	"labels" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_rules_version_rule_versions_id_fk" FOREIGN KEY ("rules_version") REFERENCES "public"."rule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_skill_id_version_skill_versions_skill_id_version_fk" FOREIGN KEY ("skill_id","version") REFERENCES "public"."skill_versions"("skill_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_rules_version_rule_versions_id_fk" FOREIGN KEY ("rules_version") REFERENCES "public"."rule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_skill_id_version_skill_versions_skill_id_version_fk" FOREIGN KEY ("skill_id","version") REFERENCES "public"."skill_versions"("skill_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_events" ADD CONSTRAINT "skill_events_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_events" ADD CONSTRAINT "skill_events_skill_id_version_skill_versions_skill_id_version_fk" FOREIGN KEY ("skill_id","version") REFERENCES "public"."skill_versions"("skill_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_access_log" ADD CONSTRAINT "test_access_log_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sealed"."test_cases" ADD CONSTRAINT "test_cases_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sealed"."test_cases" ADD CONSTRAINT "test_cases_rules_version_rule_versions_id_fk" FOREIGN KEY ("rules_version") REFERENCES "public"."rule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "datasets_split_family_hash" ON "datasets" USING btree ("split","family","hash");--> statement-breakpoint
CREATE INDEX "episodes_experiment_idx" ON "episodes" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "skill_events_skill_idx" ON "skill_events" USING btree ("skill_id","version");