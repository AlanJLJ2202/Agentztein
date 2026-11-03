CREATE TABLE "app"."harness_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"effort" text,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cost_usd" numeric(12, 6) NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."user_limits" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"monthly_budget_usd" numeric(10, 2) DEFAULT '5' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."research_notes" ADD COLUMN "decision" text;--> statement-breakpoint
ALTER TABLE "app"."research_notes" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "harness_runs_user_created" ON "app"."harness_runs" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "app"."research_notes" ADD CONSTRAINT "research_notes_decision_chk" CHECK ("app"."research_notes"."decision" is null or "app"."research_notes"."decision" in ('approved', 'rejected'));--> statement-breakpoint
-- The harness log can't be edited or deleted (same rule as the research tables, ADR-009).
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON app.harness_runs FOR EACH ROW EXECUTE FUNCTION skillab_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER append_only_truncate BEFORE TRUNCATE ON app.harness_runs FOR EACH STATEMENT EXECUTE FUNCTION skillab_forbid_mutation();
