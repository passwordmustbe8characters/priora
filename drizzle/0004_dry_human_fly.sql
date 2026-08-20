CREATE TYPE "public"."report_market" AS ENUM('african', 'global');--> statement-breakpoint
ALTER TABLE "report_jobs" ADD COLUMN "market" "report_market";--> statement-breakpoint
ALTER TABLE "report_jobs" ADD COLUMN "pain_point" text;--> statement-breakpoint
ALTER TABLE "report_jobs" ADD COLUMN "stage" text;