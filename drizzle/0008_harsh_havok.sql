CREATE TABLE "pricing_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"currency" "report_currency" NOT NULL,
	"slider_value" integer NOT NULL,
	"email" text,
	"idea_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
