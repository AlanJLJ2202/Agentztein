CREATE TABLE "app"."visit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"visitor_id" text NOT NULL,
	"session_id" text NOT NULL,
	"page" text NOT NULL,
	"event" text NOT NULL,
	"target" text,
	"value" integer,
	"referrer" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"country" text,
	"device" text,
	"lang" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visit_events_page_chk" CHECK ("app"."visit_events"."page" in ('landing', 'app')),
	CONSTRAINT "visit_events_event_chk" CHECK ("app"."visit_events"."event" in ('view', 'section', 'cta', 'lab', 'leave', 'tab', 'signin', 'signed_in')),
	CONSTRAINT "visit_events_device_chk" CHECK ("app"."visit_events"."device" is null or "app"."visit_events"."device" in ('mobile', 'tablet', 'desktop'))
);
--> statement-breakpoint
CREATE INDEX "visit_events_created" ON "app"."visit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "visit_events_visitor" ON "app"."visit_events" USING btree ("visitor_id","created_at");--> statement-breakpoint
CREATE INDEX "visit_events_user" ON "app"."visit_events" USING btree ("user_id");