import { after } from "next/server";
import type { NextRequest } from "next/server";
import { createReportJob } from "../../../lib/db/reportJobs";
import { runDeepReportPipeline } from "../../../lib/report/orchestrate";
import { checkReportBypassAccess } from "../../../lib/report/bypassGate";
import type { VerdictResponse } from "../../../lib/verdict";

export const dynamic = "force-dynamic";
// Covers generation + verification only (assembly/email only happen
// once payment has also cleared, via the webhook route separately) —
// see generator.ts's doc comment for why this stays at "low" reasoning
// and this route's own note above maxDuration for the Hobby-plan cap
// this needs to fit inside regardless of the number configured here.
export const maxDuration = 60;

/**
 * Phase 3 — Deep Report Trigger. Creates the report_jobs row and starts
 * generation the moment someone clicks "Get the full report" —
 * deliberately before payment, so the report is ready or close to it
 * by the time checkout finishes (see Section 0 of the spec).
 *
 * Uses `after()` rather than a bare unawaited promise — Next.js's
 * purpose-built API for "respond now, keep working after" in a
 * serverless function (backed by Vercel's `waitUntil` under the hood),
 * not the fire-and-forget pattern this codebase already learned the
 * hard way not to trust (a serverless function can freeze the instant
 * its response is sent; `after()` is specifically designed not to).
 *
 * Deviates from the spec's literal request shape: accepts `ideaText` +
 * the free verdict's full response, not a separate `normalized_profile`
 * object — see schema.ts's reportJobs doc comment for the reasoning.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: "VALIDATION_ERROR", message: "Request body must be valid JSON." } }, { status: 400 });
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const bypassKey = typeof record.bypassKey === "string" ? record.bypassKey : null;
  if (!checkReportBypassAccess(bypassKey)) {
    return Response.json({ error: { code: "FORBIDDEN", message: "Not available yet." } }, { status: 403 });
  }

  const ideaText = typeof record.ideaText === "string" ? record.ideaText.trim() : "";
  const freeVerdict = record.freeVerdict;
  const market = record.market === "african" || record.market === "global" ? record.market : undefined;
  const painPoint = typeof record.painPoint === "string" ? record.painPoint.trim().slice(0, 2000) : null;

  if (!ideaText || !freeVerdict || typeof freeVerdict !== "object") {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "ideaText and freeVerdict are required." } },
      { status: 400 },
    );
  }

  const job = await createReportJob(ideaText, freeVerdict as VerdictResponse, { market, painPoint });

  after(() => runDeepReportPipeline(job.id));

  return Response.json({ reportJobId: job.id, status: job.status }, { status: 201 });
}
