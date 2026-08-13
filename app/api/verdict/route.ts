import type { NextRequest } from "next/server";
import { runVerdictPipeline } from "../../lib/pipeline";

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

  try {
    const result = await runVerdictPipeline(idea);
    return Response.json(result);
  } catch (err) {
    console.error("verdict pipeline failed:", err);
    return errorResponse(502, "VERDICT_UNAVAILABLE", "Couldn't check that idea right now. Please try again.");
  }
}
