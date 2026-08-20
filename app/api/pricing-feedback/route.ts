import type { NextRequest } from "next/server";
import { createPricingFeedback } from "../../lib/db/pricingFeedback";
import { checkRateLimit } from "../../lib/rateLimit";

export const dynamic = "force-dynamic";

// Generous relative to the other endpoints — this is a cheap DB insert,
// no LLM/search cost behind it, so there's no real abuse-cost concern
// to protect against here. Just a sane ceiling against spam/scripting.
const RATE_LIMIT_REQUESTS = 20;
const RATE_LIMIT_WINDOW = "1 h" as const;

// Smallest currency unit (kobo / cents), matching report_jobs.amount's
// existing convention — see schema.ts's pricingFeedback doc comment.
const RANGES = {
  NGN: { min: 500_000, max: 1_000_000 }, // ₦5,000 – ₦10,000
  USD: { min: 1_000, max: 1_500 }, // $10 – $15
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Phase 3 add-on — "Coming Soon + Price Validation" (Section 8).
 * Records a price-slider response from a public visitor. No auth
 * beyond rate limiting, no payment, no report generation — this is
 * pure market research, deliberately isolated from every other Phase 3
 * table/endpoint (see schema.ts's pricingFeedback doc comment).
 */
export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(request, "pricing-feedback", RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW);
  if (!rateLimit.allowed) {
    return Response.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many submissions in a short time — try again in a bit.",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
      },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: "VALIDATION_ERROR", message: "Request body must be valid JSON." } }, { status: 400 });
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const currency = record.currency;
  const sliderValue = record.sliderValue;

  if (currency !== "NGN" && currency !== "USD") {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "currency must be NGN or USD." } },
      { status: 400 },
    );
  }
  if (typeof sliderValue !== "number" || !Number.isFinite(sliderValue)) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "sliderValue is required." } },
      { status: 400 },
    );
  }
  const range = RANGES[currency];
  if (sliderValue < range.min || sliderValue > range.max) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: `sliderValue out of range for ${currency}.` } },
      { status: 400 },
    );
  }

  const email = typeof record.email === "string" ? record.email.trim() : "";
  if (email && !EMAIL_RE.test(email)) {
    return Response.json({ error: { code: "VALIDATION_ERROR", message: "Enter a valid email address." } }, { status: 400 });
  }

  const ideaText = typeof record.ideaText === "string" ? record.ideaText.trim().slice(0, 2000) : null;

  await createPricingFeedback({
    currency,
    sliderValue,
    email: email || null,
    ideaText,
  });

  return Response.json({ received: true }, { status: 201 });
}
