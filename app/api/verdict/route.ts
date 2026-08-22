import type { NextRequest } from "next/server";
import { runCachePhase } from "../../lib/pipeline";
import { getCachedVerdict, setCachedVerdict } from "../../lib/cache";
import { recordVerdictEvent } from "../../lib/db/analytics";
import { checkRateLimit } from "../../lib/rateLimit";
import type { VerdictResponse } from "../../lib/verdict";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // reasoning-only re-score can still take a moment

// This is the whole product's public entry point (no auth, no gate) —
// the limit is sized for a real person trying several related ideas in
// one sitting, not for scraping it as a bulk research API.
const RATE_LIMIT_REQUESTS = 12;
const RATE_LIMIT_WINDOW = "1 h" as const;

function errorResponse(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return Response.json({ error: { code, message, ...extra } }, { status });
}

/**
 * Cache phase only, now — see pipeline.ts's "Orchestrator" doc comment
 * for the full two-phase design. This route never runs a live web
 * search itself anymore; it returns whatever the DB-cache-backed
 * Relevance Matcher can show instantly, plus `needsLiveSearch` telling
 * the client whether to follow up with POST /api/verdict/live.
 *
 * The in-memory idea-level cache (getCachedVerdict/setCachedVerdict)
 * still short-circuits everything below when it hits — it only ever
 * stores a FINAL (post-live, or cache-alone-was-enough) result, never
 * a partial one, so a hit here is always complete and never sets
 * needsLiveSearch.
 */
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
    // upsert in pipeline.ts: a serverless function can freeze the
    // instant its response is sent, so a detached promise here risks
    // the event never actually being written. recordVerdictEvent
    // itself never throws (see its own doc comment), so this can't
    // turn a validation rejection into a 500.
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
    const phase = await runCachePhase(idea);
    const response: VerdictResponse = {
      requestId: phase.requestId,
      idea: phase.idea,
      verdict: { status: phase.status, headline: phase.headline, confidence: phase.confidence },
      matches: phase.matches,
      bullTeaser: phase.bullTeaser,
      bearTeaser: phase.bearTeaser,
      generatedAt: new Date().toISOString(),
    };

    if (!phase.needsLiveSearch) {
      // The cache alone already reached the full match cap — a
      // complete answer, exactly like the old single-phase flow.
      setCachedVerdict(idea, response);
      await recordVerdictEvent({
        outcome: "success",
        cacheStatus: "COMPANY-DB-HIT",
        verdictStatus: response.verdict.status,
        categoryTags: phase.categoryTags,
      });
      return Response.json(response, { headers: { "X-Cache": "COMPANY-DB-HIT" } });
    }

    // Partial — the client renders `matches` (0 to 4 real cards) right
    // away and is expected to call /api/verdict/live next with
    // categoryTags below. Deliberately NOT cached at the idea level and
    // NOT recorded as an analytics event yet — this isn't the final
    // answer, and /api/verdict/live records the one event for this
    // logical search once it actually is.
    return Response.json(
      { ...response, needsLiveSearch: true, categoryTags: phase.categoryTags },
      { headers: { "X-Cache": phase.matches.length > 0 ? "PARTIAL" : "MISS" } },
    );
  } catch (err) {
    console.error("verdict cache phase failed:", err);
    await recordVerdictEvent({ outcome: "pipeline_error" });
    return errorResponse(502, "VERDICT_UNAVAILABLE", "Couldn't check that idea right now. Please try again.");
  }
}
