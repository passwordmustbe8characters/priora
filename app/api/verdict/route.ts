import type { NextRequest } from "next/server";
import { runVerdictPipeline } from "../../lib/pipeline";
import { getCachedVerdict, setCachedVerdict } from "../../lib/cache";
import { recordVerdictEvent } from "../../lib/db/analytics";
import { checkRateLimit } from "../../lib/rateLimit";
import type { UpsertResult } from "../../lib/db/companies";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // web search + reasoning can take a while

// This is the whole product's public entry point (no auth, no gate) —
// the limit is sized for a real person trying several related ideas in
// one sitting, not for scraping it as a bulk research API.
const RATE_LIMIT_REQUESTS = 12;
const RATE_LIMIT_WINDOW = "1 h" as const;

function errorResponse(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return Response.json({ error: { code, message, ...extra } }, { status });
}

export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(request, "verdict", RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW);
  if (!rateLimit.allowed) {
    return Response.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "You've checked a lot of ideas in a short time — try again in a bit.",
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
    return errorResponse(400, "INVALID_IDEA", "Request body must be valid JSON.");
  }

  const idea =
    typeof body === "object" && body !== null && "idea" in body
      ? String((body as { idea: unknown }).idea ?? "").trim()
      : "";

  if (idea.length < 10 || idea.length > 2000) {
    // Awaited, not fire-and-forget — same reasoning as the company
    // upsert below: a serverless function can freeze the instant its
    // response is sent, so a detached promise here risks the event
    // never actually being written. recordVerdictEvent itself never
    // throws (see its own doc comment), so this can't turn a validation
    // rejection into a 500.
    await recordVerdictEvent({ outcome: "validation_error" });
    return errorResponse(400, "INVALID_IDEA", "Tell us a bit more — ideas need to be at least 10 characters.");
  }

  const cached = getCachedVerdict(idea);
  if (cached) {
    await recordVerdictEvent({
      outcome: "success",
      cacheStatus: "HIT",
      verdictStatus: cached.verdict.status,
      // Not available on a Phase 1 in-memory cache hit — the categories
      // were already recorded once, on this same idea's original request.
      categoryTags: [],
    });
    // Fresh requestId per request for logging/support purposes even
    // though the underlying analysis is reused; generatedAt stays as the
    // original analysis time — that's the honest timestamp here.
    return Response.json(
      { ...cached, requestId: crypto.randomUUID() },
      { headers: { "X-Cache": "HIT" } },
    );
  }

  try {
    const debug: { cacheHit?: boolean; upsertResult?: UpsertResult; categoryTags?: string[] } = {};
    const result = await runVerdictPipeline(idea, debug);
    setCachedVerdict(idea, result);
    const cacheStatus = debug.cacheHit ? "COMPANY-DB-HIT" : "MISS";
    await recordVerdictEvent({
      outcome: "success",
      cacheStatus,
      verdictStatus: result.verdict.status,
      categoryTags: debug.categoryTags ?? [],
    });
    const headers: Record<string, string> = { "X-Cache": cacheStatus };
    if (debug.upsertResult) {
      headers["X-Cache-Write"] = `inserted=${debug.upsertResult.inserted} failed=${debug.upsertResult.failed}`;
      if (debug.upsertResult.errors.length) {
        headers["X-Cache-Write-Error"] = debug.upsertResult.errors[0].slice(0, 300);
      }
    }
    return Response.json(result, { headers });
  } catch (err) {
    console.error("verdict pipeline failed:", err);
    await recordVerdictEvent({ outcome: "pipeline_error" });
    return errorResponse(502, "VERDICT_UNAVAILABLE", "Couldn't check that idea right now. Please try again.");
  }
}
