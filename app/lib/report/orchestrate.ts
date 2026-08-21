import {
  claimDebate,
  claimDelivery,
  claimVerification,
  getDeepReportContent,
  getFreeVerdict,
  getReportJob,
  updateReportJob,
} from "../db/reportJobs";
import { assembleReport } from "./assemble";
import { generateDebate } from "./debate";
import { sendReportEmail } from "./email";
import { generateDeepReport } from "./generator";
import { verifyDeepReport } from "./verify";

/**
 * Phase 3 — Payment Webhook Handler's actual coordination logic (see
 * priora-phase3-spec-for-claude-code.md, "Resolving the Timing Race").
 * Generation and payment are two independent async processes; whichever
 * finishes second is what triggers final assembly + email. Both the
 * generation side (below) and the payment webhook route (payment side)
 * call `maybeDeliver` — it's a no-op unless both conditions are
 * actually true, so calling it from both places is safe and is exactly
 * how the race resolves without polling.
 *
 * Guarded against running twice concurrently for the same job (e.g.
 * both triggers firing at nearly the same instant) via claimDelivery —
 * a conditional UPDATE ... WHERE delivery_started_at IS NULL, atomic at
 * the Postgres row level, so only one of two simultaneous callers can
 * ever win it. Claimed before any assembly/email work starts, not
 * after, which is what actually closes the race window.
 *
 * Generation itself is split across TWO separate serverless
 * invocations (runGenerationStage, then runVerificationStage), not one
 * continuous function call — confirmed live in production that one
 * invocation covering research+synthesize+verify was slow enough to
 * exceed Vercel's per-invocation duration cap on this account's plan,
 * silently killing the job mid-verification with no error recorded
 * (chunking the verification call itself, tried first, cut its own
 * latency a lot but wasn't sufficient on its own — research+synthesize
 * alone already spend most of a 60s budget).
 *
 * The hand-off between stages is NOT a server-to-server fetch — an
 * earlier version tried exactly that (runGenerationStage calling a
 * sibling /api/report/[jobId]/verify route directly) and confirmed live
 * in production that the internal call got blocked before ever
 * reaching the route handler, most likely Vercel deployment protection
 * intercepting it (not confirmable further without dashboard access).
 * Instead, the CLIENT's own /status poll triggers each next stage: the
 * first poll that observes a given stage with no claim yet on it wins
 * that claim (claimVerification / claimDebate, same atomic conditional-
 * UPDATE pattern as claimDelivery) and runs the corresponding stage
 * from within THAT poll's own request handling — a fresh invocation
 * with its own duration budget, going through a path (the public
 * /status endpoint) already proven reliable by every other test in
 * this project rather than a fetch whose actual failure mode was never
 * fully diagnosable. See status/route.ts for the trigger side of this.
 *
 * Three stages now, not two — Section 11's bull/bear debate needs
 * already-verified data to reason over (grounding only works if the
 * facts it's grounded in have already passed verification), so it's
 * chained as a third stage after verification rather than folded into
 * either existing one: runGenerationStage -> runVerificationStage ->
 * runDebateStage -> ready.
 */

/** Stage 1: generate (research + synthesize) through to having
 * unverified content. Stashes the unverified result in
 * deepReportMatches while status stays "generating" — safe, since
 * nothing reads deepReportMatches before status flips to "ready", and
 * runVerificationStage overwrites it with the verified version before
 * that happens. Does NOT trigger stage 2 itself — see this file's
 * doc comment for why that's the client poll's job now. */
export async function runGenerationStage(jobId: string): Promise<void> {
  const job = await getReportJob(jobId);
  if (!job) {
    console.error(`runGenerationStage: job ${jobId} not found`);
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
    await updateReportJob(jobId, { stage: "verifying", deepReportMatches: generated });
  } catch (err) {
    console.error(`Deep report generation failed for job ${jobId}:`, err);
    await updateReportJob(jobId, {
      status: "failed",
      stage: null,
      failureReason: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Claims and (if the claim was actually won) runs stage 2 — called
 * from GET /api/report/[jobId]/status on every poll; a no-op unless the
 * job is genuinely at stage="verifying" with no claim yet. Safe to call
 * on every single poll request precisely because of that claim check —
 * only the one poll that actually wins it does any work. */
export async function maybeStartVerification(jobId: string): Promise<void> {
  const job = await getReportJob(jobId);
  if (!job) return;
  if (job.status !== "generating" || job.stage !== "verifying") return;
  if (job.verificationStartedAt) return;

  const won = await claimVerification(jobId);
  if (!won) return;

  await runVerificationStage(jobId);
}

/** Stage 2: takes the unverified content stashed by runGenerationStage
 * and verifies it. Hands off to stage 3 (debate) the same way stage 1
 * hands off to this one — stashes the verified content, sets
 * stage="debating", does NOT flip status to "ready" itself anymore
 * (that's stage 3's job now that a stage exists after this one). Only
 * ever called via maybeStartVerification's claim check above. */
export async function runVerificationStage(jobId: string): Promise<void> {
  const job = await getReportJob(jobId);
  if (!job) {
    console.error(`runVerificationStage: job ${jobId} not found`);
    return;
  }

  try {
    const generated = getDeepReportContent(job);
    if (!generated) throw new Error("No generated content found to verify");

    const verified = await verifyDeepReport(generated);
    await updateReportJob(jobId, { stage: "debating", deepReportMatches: verified });
  } catch (err) {
    console.error(`Verification failed for job ${jobId}:`, err);
    await updateReportJob(jobId, {
      status: "failed",
      stage: null,
      failureReason: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Claims and (if the claim was actually won) runs stage 3 — called
 * from GET /api/report/[jobId]/status on every poll, same no-op-unless-
 * eligible pattern as maybeStartVerification. */
export async function maybeStartDebate(jobId: string): Promise<void> {
  const job = await getReportJob(jobId);
  if (!job) return;
  if (job.status !== "generating" || job.stage !== "debating") return;
  if (job.debateStartedAt) return;

  const won = await claimDebate(jobId);
  if (!won) return;

  await runDebateStage(jobId);
}

/** Stage 3: generates the bull/bear debate from the now-verified report
 * content, and — this stage's job now, not stage 2's — is what
 * actually flips status to "ready". Debate generation failing does NOT
 * fail the whole report: per the spec, this is an enhancement a report
 * can ship without, not a required section (template.ts omits it
 * cleanly when debate is null) — so on failure this still reaches
 * "ready" with debate left null, rather than throwing the otherwise-
 * complete report away over an optional section. Only ever called via
 * maybeStartDebate's claim check above. */
export async function runDebateStage(jobId: string): Promise<void> {
  const job = await getReportJob(jobId);
  if (!job) {
    console.error(`runDebateStage: job ${jobId} not found`);
    return;
  }

  const verified = getDeepReportContent(job);
  if (!verified) {
    console.error(`runDebateStage: job ${jobId} has no content to debate`);
    await updateReportJob(jobId, { status: "ready", stage: null });
    await maybeDeliver(jobId);
    return;
  }

  let finalContent = verified;
  try {
    const debate = await generateDebate(verified);
    finalContent = { ...verified, debate };
  } catch (err) {
    console.error(`Debate generation failed for job ${jobId}, shipping without it:`, err);
  }

  await updateReportJob(jobId, { status: "ready", stage: null, deepReportMatches: finalContent });
  await maybeDeliver(jobId);
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
 * the retry also fails, runGenerationStage's own catch block already
 * logs it loudly and leaves status: 'failed' for manual follow-up. */
export async function retryFailedGeneration(jobId: string): Promise<void> {
  await updateReportJob(jobId, { status: "generating", failureReason: null });
  await runGenerationStage(jobId);
}
