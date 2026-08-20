import type { NextRequest } from "next/server";
import { getReportJob, updateReportJob } from "../../../lib/db/reportJobs";
import { initializePaystackTransaction } from "../../../lib/report/payment";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Phase 3 — Payment Integration, initialize step. Field names are
 * camelCase (reportJobId, not report_job_id) — deviating from the
 * spec's literal snake_case wire examples for consistency with the
 * rest of this codebase's conventions, since this endpoint only ever
 * gets called by this app's own frontend, not a third party expecting
 * the doc's exact shape.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: "VALIDATION_ERROR", message: "Request body must be valid JSON." } }, { status: 400 });
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const reportJobId = typeof record.reportJobId === "string" ? record.reportJobId : "";
  const currency = record.currency === "NGN" || record.currency === "USD" ? record.currency : null;
  const email = typeof record.email === "string" ? record.email.trim() : "";

  if (!reportJobId || !currency || !email || !EMAIL_RE.test(email)) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "reportJobId, a valid currency, and a valid email are required." } },
      { status: 400 },
    );
  }

  const job = await getReportJob(reportJobId);
  if (!job) {
    return Response.json({ error: { code: "NOT_FOUND", message: "Report job not found." } }, { status: 404 });
  }

  try {
    const callbackUrl = new URL("/report/confirmation", request.nextUrl.origin);
    callbackUrl.searchParams.set("reportJobId", reportJobId);

    const { checkoutUrl, amount, reference } = await initializePaystackTransaction({
      email,
      currency,
      reportJobId,
      callbackUrl: callbackUrl.toString(),
    });

    // Capturing email/currency/amount here (not just on webhook success)
    // means they're on record even if the webhook is delayed — the
    // webhook still owns the authoritative paymentStatus transition.
    await updateReportJob(reportJobId, { currency, amount, email });

    return Response.json({ checkoutUrl, amount, currency, reference }, { status: 200 });
  } catch (err) {
    console.error("Paystack initialize failed:", err);
    return Response.json({ error: { code: "SERVER_ERROR", message: "Couldn't start checkout. Please try again." } }, { status: 500 });
  }
}
