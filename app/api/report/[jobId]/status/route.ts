import type { NextRequest } from "next/server";
import { getReportJobFresh } from "../../../../lib/db/reportJobs";
import { checkReportBypassAccess } from "../../../../lib/report/bypassGate";

export const dynamic = "force-dynamic";

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
  return Response.json({ status: job.status, stage: job.stage, failureReason: job.failureReason });
}
