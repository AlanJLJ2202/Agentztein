ALTER TABLE "cases" ADD COLUMN "scenario" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "context" text NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "scenario" text NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "context" text NOT NULL;--> statement-breakpoint
ALTER TABLE "sealed"."test_cases" ADD COLUMN "scenario" text NOT NULL;--> statement-breakpoint
ALTER TABLE "sealed"."test_cases" ADD COLUMN "context" text NOT NULL;