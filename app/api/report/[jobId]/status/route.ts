import type { NextRequest } from "next/server";
import { getReportJob } from "../../../../lib/db/reportJobs";

export const dynamic = "force-dynamic";

/**
 * TEMP — payment-bypass testing route, added to let report generation be
 * checked directly (no Paystack/Resend/Blob configured yet). Cheap
 * status poll backing the "Download PDF" button in PurchaseFlow.tsx
 * while its payment step is commented out. Remove alongside that
 * bypass once payment is wired up for real — see this repo's own note
 * in PurchaseFlow.tsx for the other half of this.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getReportJob(jobId);
  if (!job) {
    return Response.json({ error: { code: "NOT_FOUND", message: "No such report job." } }, { status: 404 });
  }
  return Response.json({ status: job.status, failureReason: job.failureReason });
}
