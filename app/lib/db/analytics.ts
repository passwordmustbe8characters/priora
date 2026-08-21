import { gt, sql } from "drizzle-orm";
import { getDb } from "./client";
import { verdictEvents, type NewVerdictEvent } from "./schema";

function periodCutoff(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** Fire-and-checked, not fire-and-forget: awaited by the caller, but a
 * failure here logs and moves on rather than throwing — a founder
 * should never get a 500 because analytics logging hiccuped. */
export async function recordVerdictEvent(event: NewVerdictEvent): Promise<void> {
  const db = getDb();
  try {
    await db.insert(verdictEvents).values(event);
  } catch (err) {
    console.error("failed to record verdict event:", err);
  }
}

export interface AnalyticsSummary {
  periodDays: number;
  totalSearches: number;
  outcomeBreakdown: { outcome: string; count: number }[];
  cacheBreakdown: { cacheStatus: string; count: number }[];
  verdictBreakdown: { verdictStatus: string; count: number }[];
  topTags: { tag: string; count: number }[];
  dailyCounts: { date: string; count: number }[];
}

/** Everything the Usage Analytics Dashboard needs, for the given
 * trailing window — "what categories are being searched most,
 * free-to-verdict conversion [outcomeBreakdown], and any patterns worth
 * acting on" per the master spec. */
export async function getAnalyticsSummary(days = 30): Promise<AnalyticsSummary> {
  const db = getDb();
  const cutoff = periodCutoff(days);

  const totalRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(verdictEvents)
    .where(gt(verdictEvents.createdAt, cutoff));
  const totalSearches = totalRows[0]?.n ?? 0;

  const outcomeRows = await db
    .select({ outcome: verdictEvents.outcome, n: sql<number>`count(*)::int` })
    .from(verdictEvents)
    .where(gt(verdictEvents.createdAt, cutoff))
    .groupBy(verdictEvents.outcome);

  const cacheRows = await db
    .select({ cacheStatus: verdictEvents.cacheStatus, n: sql<number>`count(*)::int` })
    .from(verdictEvents)
    .where(gt(verdictEvents.createdAt, cutoff))
    .groupBy(verdictEvents.cacheStatus);

  const verdictRows = await db
    .select({ verdictStatus: verdictEvents.verdictStatus, n: sql<number>`count(*)::int` })
    .from(verdictEvents)
    .where(gt(verdictEvents.createdAt, cutoff))
    .groupBy(verdictEvents.verdictStatus);

  const tagRows = (await db.execute(sql`
    select tag, count(*)::int as n
    from verdict_events, unnest(category_tags) as tag
    where created_at > ${cutoff.toISOString()}
    group by tag
    order by n desc
    limit 15
  `)) as unknown as { tag: string; n: number }[];

  const dailyRows = (await db.execute(sql`
    select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date, count(*)::int as n
    from verdict_events
    where created_at > ${cutoff.toISOString()}
    group by 1
    order by 1
  `)) as unknown as { date: string; n: number }[];

  return {
    periodDays: days,
    totalSearches,
    outcomeBreakdown: outcomeRows.map((r) => ({ outcome: r.outcome, count: r.n })),
    cacheBreakdown: cacheRows.map((r) => ({ cacheStatus: r.cacheStatus ?? "none", count: r.n })),
    verdictBreakdown: verdictRows.map((r) => ({ verdictStatus: r.verdictStatus ?? "none", count: r.n })),
    topTags: tagRows.map((r) => ({ tag: r.tag, count: r.n })),
    dailyCounts: dailyRows.map((r) => ({ date: r.date, count: r.n })),
  };
}

export interface ReportJobsSummary {
  total: number;
  statusBreakdown: { status: string; count: number }[];
  paymentBreakdown: { paymentStatus: string; count: number }[];
}

/** Report-generation funnel — how many deep reports are generating,
 * ready, or failed, and where they sit on payment. Same trailing-window
 * shape as getAnalyticsSummary, kept as a separate query since
 * report_jobs and verdict_events are unrelated tables (one row per
 * report attempt vs. one row per free verdict). */
export async function getReportJobsSummary(days = 30): Promise<ReportJobsSummary> {
  const db = getDb();
  const cutoff = periodCutoff(days);

  const totalRows = (await db.execute(sql`
    select count(*)::int as n from report_jobs where created_at > ${cutoff.toISOString()}
  `)) as unknown as { n: number }[];

  const statusRows = (await db.execute(sql`
    select status, count(*)::int as n from report_jobs
    where created_at > ${cutoff.toISOString()}
    group by status
  `)) as unknown as { status: string; n: number }[];

  const paymentRows = (await db.execute(sql`
    select payment_status, count(*)::int as n from report_jobs
    where created_at > ${cutoff.toISOString()}
    group by payment_status
  `)) as unknown as { payment_status: string; n: number }[];

  return {
    total: totalRows[0]?.n ?? 0,
    statusBreakdown: statusRows.map((r) => ({ status: r.status, count: r.n })),
    paymentBreakdown: paymentRows.map((r) => ({ paymentStatus: r.payment_status, count: r.n })),
  };
}

export interface PricingFeedbackSummary {
  total: number;
  byCurrency: { currency: string; count: number; avgMajor: number; medianMajor: number }[];
}

/** Phase 3 add-on (Section 8) — aggregate pricing-slider signal, not
 * individual rows (this is research data, not something to browse
 * submission-by-submission). Values converted from the stored smallest
 * unit (kobo/cents) to the currency's major unit for display. */
export async function getPricingFeedbackSummary(days = 30): Promise<PricingFeedbackSummary> {
  const db = getDb();
  const cutoff = periodCutoff(days);

  const totalRows = (await db.execute(sql`
    select count(*)::int as n from pricing_feedback where created_at > ${cutoff.toISOString()}
  `)) as unknown as { n: number }[];

  const rows = (await db.execute(sql`
    select
      currency,
      count(*)::int as n,
      avg(slider_value)::float as avg_value,
      percentile_cont(0.5) within group (order by slider_value)::float as median_value
    from pricing_feedback
    where created_at > ${cutoff.toISOString()}
    group by currency
  `)) as unknown as { currency: string; n: number; avg_value: number; median_value: number }[];

  return {
    total: totalRows[0]?.n ?? 0,
    byCurrency: rows.map((r) => ({
      currency: r.currency,
      count: r.n,
      avgMajor: r.avg_value / 100,
      medianMajor: r.median_value / 100,
    })),
  };
}
