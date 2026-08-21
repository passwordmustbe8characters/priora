import { after } from "next/server";
import type { NextRequest } from "next/server";
import { getReportJobFresh } from "../../../../lib/db/reportJobs";
import { checkReportBypassAccess } from "../../../../lib/report/bypassGate";
import { maybeStartDebate, maybeStartVerification } from "../../../../lib/report/orchestrate";

export const dynamic = "force-dynamic";
// Needs real room now, not just a quick read — a poll landing exactly
// when stage flips to "verifying" claims and runs the whole
// verification stage via after() (see orchestrate.ts's doc comment on
// why the client poll, not a server-to-server fetch, is what drives
// this hand-off). Every other poll before/after that one instant stays
// a cheap read.
export const maxDuration = 60;

/**
 * TEMP — payment-bypass testing route, added to let report generation be
 * checked directly (no Paystack/Resend/Blob configured yet). Cheap
 * status poll backing the generate modal's live progress. Remove
 * alongside the rest of the bypass once payment is wired up for real —
 * see app/lib/reportBypass.ts for the access-gate half of this.
 *
 * Uses getReportJobFresh, not getReportJob directly — a job stuck
 * "generating" for too long (see that function's own comment) reports
 * as failed here rather than leaving the modal polling forever.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  if (!checkReportBypassAccess(request.nextUrl.searchParams.get("key"))) {
    return Response.json({ error: { code: "FORBIDDEN", message: "Not available yet." } }, { status: 403 });
  }

  const { jobId } = await params;
  const job = await getReportJobFresh(jobId);
  if (!job) {
    return Response.json({ error: { code: "NOT_FOUND", message: "No such report job." } }, { status: 404 });
  }

  // Fire-and-continue, not awaited — the response below reports
  // whatever the job's state was at read time (still "generating"),
  // and this poll's own invocation keeps running the actual
  // verification/debate work after that response is sent. A no-op for
  // every poll except the one that wins the relevant claim — both
  // checks are cheap and safe to call on every single poll regardless
  // of which stage the job is actually at.
  after(() => maybeStartVerification(jobId));
  after(() => maybeStartDebate(jobId));

  return Response.json({ status: job.status, stage: job.stage, failureReason: job.failureReason });
}
