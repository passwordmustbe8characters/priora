CREATE TYPE "public"."report_payment_status" AS ENUM('pending', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."report_currency" AS ENUM('NGN', 'USD');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('generating', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "report_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_text" text NOT NULL,
	"free_verdict" jsonb NOT NULL,
	"deep_report_matches" jsonb,
	"status" "report_status" DEFAULT 'generating' NOT NULL,
	"payment_status" "report_payment_status" DEFAULT 'pending' NOT NULL,
	"currency" "report_currency",
	"amount" integer,
	"email" text,
	"pdf_url" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "report_jobs_status_idx" ON "report_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "report_jobs_payment_status_idx" ON "report_jobs" USING btree ("payment_status");