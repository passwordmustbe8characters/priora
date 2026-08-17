CREATE TYPE "public"."region" AS ENUM('western', 'african', 'global');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"url" text,
	"source" text NOT NULL,
	"region" "region" DEFAULT 'global' NOT NULL,
	"category_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"pricing" text,
	"funding_stage" text,
	"raw_snippet" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "companies_name_idx" ON "companies" USING btree ("name");--> statement-breakpoint
CREATE INDEX "companies_category_tags_idx" ON "companies" USING gin ("category_tags");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_url_unique" ON "companies" USING btree ("url") WHERE "companies"."url" IS NOT NULL;