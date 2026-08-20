import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "./client";
import { reportJobs, type NewReportJob, type ReportJob } from "./schema";
import type { VerdictResponse } from "../verdict";
import type { DeepReportContent } from "../report/types";

/** Creates the row the moment "Get the full report" is clicked — before
 * payment, per the Phase 3 spec's core timing decision. market/painPoint
 * are the light, optional personalization collected in the generate
 * modal right before this fires. */
export async function createReportJob(
  ideaText: string,
  freeVerdict: VerdictResponse,
  options?: { market?: "african" | "global"; painPoint?: string | null },
): Promise<ReportJob> {
  const db = getDb();
  const [row] = await db
    .insert(reportJobs)
    .values({
      ideaText,
      freeVerdict,
      status: "generating",
      paymentStatus: "pending",
      market: options?.market,
      painPoint: options?.painPoint || null,
    })
    .returning();
  return row;
}

export async function getReportJob(id: string): Promise<ReportJob | null> {
  const db = getDb();
  const [row] = await db.select().from(reportJobs).where(eq(reportJobs.id, id)).limit(1);
  return row ?? null;
}

// Confirmed live (production): a serverless function running the
// generation pipeline can get killed mid-flight by Vercel's per-
// invocation duration cap with no error ever recorded — the job's
// status just stays "generating" forever, and a client polling it
// would spin indefinitely with no way to know anything went wrong.
// Comfortably above the ~60s cap this account has hit, not a tight
// bound — this exists to catch a genuinely dead job, not to second-
// guess one that's still legitimately working.
const STALE_GENERATING_MS = 2 * 60 * 1000;

/** Wraps getReportJob with a staleness check: a job stuck at status
 * "generating" for too long with no progress is treated (and
 * persisted) as failed, so every read path gets this for free instead
 * of needing its own timeout logic. Safe to call from any read path —
 * a no-op for a job that's actually still progressing (each stage
 * transition bumps updatedAt) or already terminal. */
export async function getReportJobFresh(id: string): Promise<ReportJob | null> {
  const job = await getReportJob(id);
  if (!job || job.status !== "generating") return job;

  const age = Date.now() - job.updatedAt.getTime();
  if (age < STALE_GENERATING_MS) return job;

  const failed = await updateReportJob(id, {
    status: "failed",
    stage: null,
    failureReason: "Generation timed out — please try again.",
  });
  return failed ?? job;
}

/** Generic patch — report_jobs has several independent actors writing
 * to it at different stages (generation, checkout, webhook), so one
 * flexible updater is a better fit than a setter per field. Always
 * bumps updatedAt. */
export async function updateReportJob(
  id: string,
  patch: Partial<
    Pick<
      NewReportJob,
      | "status"
      | "paymentStatus"
      | "currency"
      | "amount"
      | "email"
      | "failureReason"
      | "deepReportMatches"
      | "stage"
    >
  >,
): Promise<ReportJob | null> {
  const db = getDb();
  const [row] = await db
    .update(reportJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(reportJobs.id, id))
    .returning();
  return row ?? null;
}

/** Atomic claim for the delivery race guard (see schema.ts's
 * deliveryStartedAt doc comment) — a conditional UPDATE, not a
 * read-then-write, so two near-simultaneous callers can't both think
 * they're first. Returns true only for whichever call actually won the
 * claim; false means someone else already has it (or already delivered). */
export async function claimDelivery(id: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .update(reportJobs)
    .set({ deliveryStartedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(reportJobs.id, id), isNull(reportJobs.deliveryStartedAt)))
    .returning({ id: reportJobs.id });
  return Boolean(row);
}

/** Typed accessor — deepReportMatches is stored as jsonb (no schema
 * enforcement from Postgres itself), this is the one place that casts
 * it back to the real shape rather than every caller doing so ad hoc. */
export function getDeepReportContent(job: ReportJob): DeepReportContent | null {
  return (job.deepReportMatches as DeepReportContent | null) ?? null;
}

export function getFreeVerdict(job: ReportJob): VerdictResponse {
  return job.freeVerdict as VerdictResponse;
}
