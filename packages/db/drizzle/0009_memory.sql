CREATE TABLE "app"."agent_dreams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"model" text NOT NULL,
	"jobs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."agent_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"strength" integer DEFAULT 2 NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"parent_id" uuid,
	"dream_id" uuid,
	"uses" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_memories_status_chk" CHECK ("app"."agent_memories"."status" in ('active', 'faded', 'superseded', 'forgotten')),
	CONSTRAINT "agent_memories_kind_chk" CHECK ("app"."agent_memories"."kind" in ('rule', 'dead-end', 'strategy', 'fact')),
	CONSTRAINT "agent_memories_strength_chk" CHECK ("app"."agent_memories"."strength" between 0 and 5)
);
--> statement-breakpoint
ALTER TABLE "app"."agent_jobs" ADD COLUMN "dreamt_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "agent_dreams_user" ON "app"."agent_dreams" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_memories_user" ON "app"."agent_memories" USING btree ("user_id","status");--> statement-breakpoint
-- A lesson's text and scope are frozen once written, and lessons are never deleted: a dream that corrects one
-- supersedes it with a new row; only strength, pinned, status, uses and last_used_at move. Dreams are append-only.
CREATE FUNCTION skillab_memory_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'agent memories are append-only';
  END IF;
  IF NEW.text IS DISTINCT FROM OLD.text OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
     OR NEW.dream_id IS DISTINCT FROM OLD.dream_id OR NEW.evidence IS DISTINCT FROM OLD.evidence THEN
    RAISE EXCEPTION 'a lesson cannot be rewritten; a dream supersedes it with a new one';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER frozen BEFORE UPDATE OR DELETE ON app.agent_memories FOR EACH ROW EXECUTE FUNCTION skillab_memory_frozen();
--> statement-breakpoint
CREATE FUNCTION skillab_dream_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'agent dreams are append-only';
END $$;
--> statement-breakpoint
CREATE TRIGGER frozen BEFORE UPDATE OR DELETE ON app.agent_dreams FOR EACH ROW EXECUTE FUNCTION skillab_dream_frozen();
