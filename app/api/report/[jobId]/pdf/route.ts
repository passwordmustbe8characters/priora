import type { NextRequest } from "next/server";
import { getDeepReportContent, getReportJob } from "../../../../lib/db/reportJobs";
import { renderReportPdf } from "../../../../lib/report/pdf";
import { checkReportBypassAccess } from "../../../../lib/report/bypassGate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * TEMP — payment-bypass testing route. Renders and streams the PDF
 * directly from the response (no Vercel Blob upload, no Resend email —
 * neither is configured yet), so the report can be looked at without
 * payment or either of those two services. Regenerates the PDF on every
 * call rather than caching it — fine for manual testing, not meant to
 * survive once the real paid flow (assemble.ts + email.ts, gated on
 * payment via orchestrate.ts's maybeDeliver) is wired up and this route
 * gets removed alongside the commented-out payment step in
 * PurchaseFlow.tsx.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  if (!checkReportBypassAccess(request.nextUrl.searchParams.get("key"))) {
    return Response.json({ error: { code: "FORBIDDEN", message: "Not available yet." } }, { status: 403 });
  }

  const { jobId } = await params;
  const job = await getReportJob(jobId);
  if (!job) {
    return Response.json({ error: { code: "NOT_FOUND", message: "No such report job." } }, { status: 404 });
  }
  if (job.status === "failed") {
    return Response.json(
      { error: { code: "GENERATION_FAILED", message: job.failureReason || "Report generation failed." } },
      { status: 500 },
    );
  }
  if (job.status !== "ready") {
    return Response.json({ status: job.status }, { status: 202 });
  }

  const report = getDeepReportContent(job);
  if (!report) {
    return Response.json({ error: { code: "SERVER_ERROR", message: "Report content missing." } }, { status: 500 });
  }

  const generatedDateDisplay = new Date(job.updatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const pdf = await renderReportPdf(report, generatedDateDisplay);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="priora-report.pdf"',
    },
  });
}
