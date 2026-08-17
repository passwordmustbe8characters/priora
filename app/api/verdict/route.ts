import type { NextRequest } from "next/server";
import { runVerdictPipeline } from "../../lib/pipeline";
import { getCachedVerdict, setCachedVerdict } from "../../lib/cache";
import type { UpsertResult } from "../../lib/db/companies";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // web search + reasoning can take a while

function errorResponse(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return Response.json({ error: { code, message, ...extra } }, { status });
}

export async function POST(request: NextRequest) {
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
    return errorResponse(400, "INVALID_IDEA", "Tell us a bit more — ideas need to be at least 10 characters.");
  }

  const cached = getCachedVerdict(idea);
  if (cached) {
    // Fresh requestId per request for logging/support purposes even
    // though the underlying analysis is reused; generatedAt stays as the
    // original analysis time — that's the honest timestamp here.
    return Response.json(
      { ...cached, requestId: crypto.randomUUID() },
      { headers: { "X-Cache": "HIT" } },
    );
  }

  try {
    const debug: { cacheHit?: boolean; upsertResult?: UpsertResult } = {};
    const result = await runVerdictPipeline(idea, debug);
    setCachedVerdict(idea, result);
    const headers: Record<string, string> = { "X-Cache": debug.cacheHit ? "COMPANY-DB-HIT" : "MISS" };
    if (debug.upsertResult) {
      headers["X-Cache-Write"] = `inserted=${debug.upsertResult.inserted} failed=${debug.upsertResult.failed}`;
      if (debug.upsertResult.errors.length) {
        headers["X-Cache-Write-Error"] = debug.upsertResult.errors[0].slice(0, 300);
      }
    }
    return Response.json(result, { headers });
  } catch (err) {
    console.error("verdict pipeline failed:", err);
    return errorResponse(502, "VERDICT_UNAVAILABLE", "Couldn't check that idea right now. Please try again.");
  }
}
