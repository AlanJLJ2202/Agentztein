CREATE TABLE "app"."agent_cores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"files" jsonb NOT NULL,
	"core_version" text NOT NULL,
	"strategy" text NOT NULL,
	"changes" text DEFAULT '' NOT NULL,
	"parent_id" uuid,
	"run_id" uuid,
	"builder" text NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"verdict" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "agent_cores_status_chk" CHECK ("app"."agent_cores"."status" in ('candidate', 'active', 'rejected', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "app"."evolve_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"builder" text NOT NULL,
	"proposal" jsonb NOT NULL,
	"base_core_id" uuid,
	"candidate_core_id" uuid,
	"token_hash" text NOT NULL,
	"key_fetched_at" timestamp with time zone,
	"max_usd" numeric(10, 4) NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ci_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evolve_runs_status_chk" CHECK ("app"."evolve_runs"."status" in ('queued', 'building', 'passed', 'rejected', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_cores_version" ON "app"."agent_cores" USING btree ("user_id","version");--> statement-breakpoint
CREATE INDEX "agent_cores_user" ON "app"."agent_cores" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "evolve_runs_user" ON "app"."evolve_runs" USING btree ("user_id","created_at");--> statement-breakpoint
-- A core version's code is frozen once written, and versions are never deleted: a run can only add a new
-- version and move statuses (candidate → active/rejected, active → retired).
CREATE FUNCTION skillab_core_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'agent cores are append-only';
  END IF;
  IF NEW.files IS DISTINCT FROM OLD.files OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
     OR NEW.core_version IS DISTINCT FROM OLD.core_version OR NEW.builder IS DISTINCT FROM OLD.builder THEN
    RAISE EXCEPTION 'a core version cannot be rewritten; build a new version';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER frozen BEFORE UPDATE OR DELETE ON app.agent_cores FOR EACH ROW EXECUTE FUNCTION skillab_core_frozen();
