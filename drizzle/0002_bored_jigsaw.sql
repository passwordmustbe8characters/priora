CREATE TABLE "verdict_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"cache_status" text,
	"verdict_status" text,
	"outcome" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "verdict_events_created_at_idx" ON "verdict_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "verdict_events_category_tags_idx" ON "verdict_events" USING gin ("category_tags");