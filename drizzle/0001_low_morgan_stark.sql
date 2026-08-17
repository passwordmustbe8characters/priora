ALTER TABLE "companies" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "year_founded" integer;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "company_stage" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "target_audience" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "customer_type" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "business_model" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "core_problem" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "key_features" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "value_proposition" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "positioning" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "primary_competitors" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "competitive_advantage" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "weaknesses" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "opportunity_gap" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "traction_notes" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "notable_partnerships" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "key_takeaway" text;--> statement-breakpoint
CREATE INDEX "companies_country_idx" ON "companies" USING btree ("country");