import type { NextRequest } from "next/server";
import { runLivePhase } from "../../../lib/pipeline";
import { setCachedVerdict } from "../../../lib/cache";
import { recordVerdictEvent } from "../../../lib/db/analytics";
import { checkRateLimit } from "../../../lib/rateLimit";
import type { VerdictMatch } from "../../../lib/verdict";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // web search + reasoning can take a while

// A separate bucket from "verdict" (not the same one at the same
// limit) — one logical search can trigger this route at most once, but
// it shouldn't quietly halve the "verdict" bucket's effective budget
// for people whose searches never need to reach this route at all
// (cache already sufficient, see CACHE_SUFFICIENT_MATCHES in
// pipeline.ts). Same 5/hour number as "verdict" for now while the
// OpenAI budget behind this is small — this route's calls are the
// expensive ones (real web_search), so worth capping independently
// rather than trusting "verdict"'s limit to also bound this.
const RATE_LIMIT_REQUESTS = 5;
const RATE_LIMIT_WINDOW = "1 h" as const;

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

function isPlausibleMatch(value: unknown): value is VerdictMatch {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.name === "string" &&
    typeof m.url === "string" &&
    typeof m.description === "string" &&
    typeof m.source === "string" &&
    typeof m.matchScore === "number"
  );
}

/**
 * Phase 2 of the cache-then-live flow — see pipeline.ts's "Orchestrator"
 * doc comment. Only ever called by the client after /api/verdict came
 * back with needsLiveSearch: true (see useVerdictFlow.ts), passing back
 * exactly what runLivePhase needs to avoid re-normalizing the idea or
 * re-deciding what phase 1 already settled.
 *
 * `existingMatches` is client-supplied, not re-derived server-side —
 * trusting it is fine here because runLivePhase (via mergeMatches in
 * pipeline.ts) only ever uses it to KEEP entries already shown, never
 * to fabricate new ones; a malformed or empty array just means nothing
 * gets carried forward; it can't inject a fake match into the final
 * list since every entry still has to independently justify its own
 * matchScore against the merge/sort, and this route's own schema check
 * below rejects anything not shaped like a real match to begin with.
 */
export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(request, "verdict-live", RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW);
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
    return errorResponse(400, "VALIDATION_ERROR", "Request body must be valid JSON.");
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const ideaRaw = typeof record.ideaRaw === "string" ? record.ideaRaw.trim() : "";
  const normalizedIdea = typeof record.normalizedIdea === "string" ? record.normalizedIdea.trim() : "";
  const categoryTags = Array.isArray(record.categoryTags)
    ? record.categoryTags.filter((t): t is string => typeof t === "string")
    : [];
  const existingMatches = Array.isArray(record.existingMatches) ? record.existingMatches.filter(isPlausibleMatch) : [];

  if (!ideaRaw || !normalizedIdea || categoryTags.length === 0) {
    return errorResponse(400, "VALIDATION_ERROR", "ideaRaw, normalizedIdea, and categoryTags are required.");
  }

  try {
    const result = await runLivePhase({ ideaRaw, normalizedIdea, categoryTags, existingMatches });
    // Cached and recorded here, not in /api/verdict — this is the
    // final answer for the search regardless of whether the cache
    // phase found 0 or 4 matches first, so this is the one place a
    // complete, analytics-worthy result for this search actually exists.
    setCachedVerdict(ideaRaw, result);
    const cacheStatus = existingMatches.length > 0 ? "MIXED" : "MISS";
    await recordVerdictEvent({
      outcome: "success",
      cacheStatus,
      verdictStatus: result.verdict.status,
      categoryTags,
    });
    return Response.json(result, { headers: { "X-Cache": cacheStatus } });
  } catch (err) {
    console.error("verdict live phase failed:", err);
    await recordVerdictEvent({ outcome: "pipeline_error" });
    return errorResponse(502, "VERDICT_UNAVAILABLE", "Couldn't finish checking that idea right now.");
  }
}
