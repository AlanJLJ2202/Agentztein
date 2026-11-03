CREATE TABLE "app"."agent_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scenario" text NOT NULL,
	"executor" text NOT NULL,
	"planner" text NOT NULL,
	"effort" text,
	"phase" text NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."agent_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scenario" text NOT NULL,
	"context" text NOT NULL,
	"version" integer NOT NULL,
	"instructions" text NOT NULL,
	"rationale" text NOT NULL,
	"parent_id" uuid,
	"model" text NOT NULL,
	"note_id" text,
	"job_id" uuid,
	"status" text DEFAULT 'candidate' NOT NULL,
	"verdict" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "agent_skills_status_chk" CHECK ("app"."agent_skills"."status" in ('candidate', 'active', 'rejected', 'retired'))
);
--> statement-breakpoint
CREATE INDEX "agent_jobs_user" ON "app"."agent_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_skills_version" ON "app"."agent_skills" USING btree ("user_id","scenario","context","version");--> statement-breakpoint
CREATE INDEX "agent_skills_user" ON "app"."agent_skills" USING btree ("user_id","scenario");--> statement-breakpoint
-- A skill version's text and scope are frozen once written, and skills are never deleted: the agent can
-- only add new versions and move their status (candidate → active/rejected, active → retired).
CREATE FUNCTION skillab_skill_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'agent skills are append-only';
  END IF;
  IF NEW.instructions IS DISTINCT FROM OLD.instructions OR NEW.scenario IS DISTINCT FROM OLD.scenario
     OR NEW.context IS DISTINCT FROM OLD.context OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.rationale IS DISTINCT FROM OLD.rationale THEN
    RAISE EXCEPTION 'a skill version cannot be rewritten; propose a new version';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER frozen BEFORE UPDATE OR DELETE ON app.agent_skills FOR EACH ROW EXECUTE FUNCTION skillab_skill_frozen();
