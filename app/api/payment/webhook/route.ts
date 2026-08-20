import { after } from "next/server";
import type { NextRequest } from "next/server";
import { getReportJob, updateReportJob } from "../../../lib/db/reportJobs";
import { maybeDeliver, retryFailedGeneration } from "../../../lib/report/orchestrate";
import { verifyPaystackSignature, type PaystackWebhookPayload } from "../../../lib/report/payment";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Phase 3 — Payment Webhook Handler. This is the coordination point
 * between two independent async processes (payment, generation) — see
 * orchestrate.ts's doc comment for the full race-resolution logic this
 * calls into. This route's own job is narrow: verify the signature,
 * record the payment, and hand off to whichever follow-up action the
 * job's current `status` calls for — all via `after()` so the webhook
 * itself responds fast (Paystack expects a prompt ack, not one held
 * open through a full generation retry or PDF assembly).
 */
export async function POST(request: NextRequest) {
  // Signature verification must run against the exact raw body text,
  // before any JSON parsing — parsing first and re-stringifying would
  // not reliably reproduce the exact bytes Paystack signed.
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyPaystackSignature(rawBody, signature)) {
    return Response.json({ error: { code: "VALIDATION_ERROR", message: "Invalid signature." } }, { status: 400 });
  }

  let payload: PaystackWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as PaystackWebhookPayload;
  } catch {
    return Response.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON body." } }, { status: 400 });
  }

  // Acknowledge and ignore anything that isn't a successful charge —
  // Paystack sends other event types too, this handler only needs this one.
  if (payload.event !== "charge.success") {
    return Response.json({ received: true });
  }

  const reportJobId = payload.data.metadata?.report_job_id;
  if (!reportJobId) {
    return Response.json({ error: { code: "NOT_FOUND", message: "No report_job_id in webhook metadata." } }, { status: 404 });
  }

  const job = await getReportJob(reportJobId);
  if (!job) {
    // Real-money edge case worth being paranoid about, per the spec —
    // this should never happen if job creation always precedes
    // checkout, so log loudly rather than fail quietly.
    console.error(`ALERT: payment webhook fired for unknown report_job_id ${reportJobId}`, payload.data);
    return Response.json({ error: { code: "NOT_FOUND", message: "Report job not found." } }, { status: 404 });
  }

  await updateReportJob(reportJobId, { paymentStatus: "paid" });

  if (job.status === "failed") {
    after(() => retryFailedGeneration(reportJobId));
  } else if (job.status === "ready") {
    after(() => maybeDeliver(reportJobId));
  }
  // status === "generating": nothing more to do here — the original
  // runDeepReportPipeline call (from /api/report/start) will call
  // maybeDeliver itself once generation finishes and sees paid.

  return Response.json({ received: true });
}
