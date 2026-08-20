import { claimDelivery, getDeepReportContent, getFreeVerdict, getReportJob, updateReportJob } from "../db/reportJobs";
import { assembleReport } from "./assemble";
import { sendReportEmail } from "./email";
import { generateDeepReport } from "./generator";
import { verifyDeepReport } from "./verify";

/**
 * Phase 3 — Payment Webhook Handler's actual coordination logic (see
 * priora-phase3-spec-for-claude-code.md, "Resolving the Timing Race").
 * Generation and payment are two independent async processes; whichever
 * finishes second is what triggers final assembly + email. Both
 * `runDeepReportPipeline` (generation side) and the payment webhook
 * route (payment side) call `maybeDeliver` — it's a no-op unless both
 * conditions are actually true, so calling it from both places is safe
 * and is exactly how the race resolves without polling.
 *
 * Guarded against running twice concurrently for the same job (e.g.
 * both triggers firing at nearly the same instant) via claimDelivery —
 * a conditional UPDATE ... WHERE delivery_started_at IS NULL, atomic at
 * the Postgres row level, so only one of two simultaneous callers can
 * ever win it. Claimed before any assembly/email work starts, not
 * after, which is what actually closes the race window.
 */

/** Deep Report Trigger's async pipeline: generate → verify → assemble
 * is deferred until delivery is actually possible (see maybeDeliver) —
 * this stage only takes generation through to `status: ready`. */
export async function runDeepReportPipeline(jobId: string): Promise<void> {
  const job = await getReportJob(jobId);
  if (!job) {
    console.error(`runDeepReportPipeline: job ${jobId} not found`);
    return;
  }

  try {
    const freeVerdict = getFreeVerdict(job);
    await updateReportJob(jobId, { stage: "researching" });
    const generated = await generateDeepReport(freeVerdict, {
      market: job.market,
      painPoint: job.painPoint,
      onStage: async (stage) => {
        await updateReportJob(jobId, { stage });
      },
    });
    await updateReportJob(jobId, { stage: "verifying" });
    const verified = await verifyDeepReport(generated);
    await updateReportJob(jobId, { status: "ready", stage: null, deepReportMatches: verified });

    // If payment already cleared while this was running, deliver now —
    // this is generation finishing second.
    await maybeDeliver(jobId);
  } catch (err) {
    console.error(`Deep report generation failed for job ${jobId}:`, err);
    await updateReportJob(jobId, {
      status: "failed",
      stage: null,
      failureReason: err instanceof Error ? err.message : String(err),
    });
  }
}

/** No-op unless the job is genuinely paid + ready + not yet delivered.
 * Called from both the generation side (above) and the payment webhook
 * — whichever call actually finds both conditions true is the one that
 * does the work. */
export async function maybeDeliver(jobId: string): Promise<void> {
  const job = await getReportJob(jobId);
  if (!job) return;
  if (job.paymentStatus !== "paid") return;
  if (job.status !== "ready") return;
  if (job.deliveryStartedAt) return; // already delivered, or another caller has the claim

  if (!job.email) {
    console.error(`maybeDeliver: job ${jobId} is paid+ready but has no email on file — cannot deliver`);
    return;
  }

  const content = getDeepReportContent(job);
  if (!content) {
    console.error(`maybeDeliver: job ${jobId} is 'ready' but has no deepReportMatches`);
    return;
  }

  // Atomic claim, not a plain flag write — the read above is just a
  // cheap pre-check to skip the common case; this is what actually
  // decides the race if two callers reach here at nearly the same time.
  const won = await claimDelivery(jobId);
  if (!won) return;

  try {
    const { pdf } = await assembleReport(content);
    await sendReportEmail({ to: job.email, ideaOneLiner: content.ideaOneLiner, pdf });
  } catch (err) {
    // Deliberately doesn't flip `status` to 'failed' — generation
    // itself succeeded; this is an assembly/email-specific failure,
    // which the spec calls out as its own alert-worthy case rather
    // than conflating with "the research failed." Logged loudly per
    // the spec's "real-money edge case worth being paranoid about."
    // Also deliberately doesn't release the delivery claim — retrying
    // automatically risks a duplicate email if the failure happened
    // after Resend actually sent it (only the DB write after would have
    // failed); this stays a human-follow-up case, matching the rest of
    // this function's error handling.
    console.error(`ALERT: delivery failed for paid job ${jobId} (email: ${job.email}):`, err);
  }
}

/** Payment webhook fired for a job whose generation previously failed —
 * retries once rather than leaving a paying customer with nothing. If
 * the retry also fails, runDeepReportPipeline's own catch block already
 * logs it loudly and leaves status: 'failed' for manual follow-up. */
export async function retryFailedGeneration(jobId: string): Promise<void> {
  await updateReportJob(jobId, { status: "generating", failureReason: null });
  await runDeepReportPipeline(jobId);
}
