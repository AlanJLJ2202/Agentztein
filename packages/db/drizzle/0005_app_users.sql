CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TABLE "app"."provider_keys" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"secret" text NOT NULL,
	"hint" text NOT NULL,
	"model" text,
	"models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_keys_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "app"."research_notes" (
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"discussion_url" text,
	"points" integer,
	"posted_at" timestamp with time zone,
	"capability" text,
	"verdict" text NOT NULL,
	"gain" text NOT NULL,
	"cost" text NOT NULL,
	"why" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_notes_user_id_source_external_id_pk" PRIMARY KEY("user_id","source","external_id"),
	CONSTRAINT "research_notes_verdict_chk" CHECK ("app"."research_notes"."verdict" in ('experiment', 'watch', 'skip'))
);
--> statement-breakpoint
CREATE INDEX "research_notes_user_created" ON "app"."research_notes" USING btree ("user_id","created_at");