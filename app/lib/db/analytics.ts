import { and, desc, gt, isNotNull, lte, sql } from "drizzle-orm";
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

export interface PeriodStats {
  totalSearches: number;
  successRate: number; // 0-1
  cacheHitRate: number; // 0-1
}

async function getPeriodStats(from: Date, to: Date | null): Promise<PeriodStats> {
  const db = getDb();
  const bounds = to ? and(gt(verdictEvents.createdAt, from), lte(verdictEvents.createdAt, to)) : gt(verdictEvents.createdAt, from);

  const rows = (await db.execute(sql`
    select
      count(*)::int as total,
      count(*) filter (where outcome = 'success')::int as success_count,
      count(*) filter (where cache_status in ('HIT', 'COMPANY-DB-HIT'))::int as cache_hit_count,
      count(*) filter (where cache_status is not null)::int as cache_eligible_count
    from verdict_events
    where ${bounds}
  `)) as unknown as { total: number; success_count: number; cache_hit_count: number; cache_eligible_count: number }[];

  const r = rows[0] ?? { total: 0, success_count: 0, cache_hit_count: 0, cache_eligible_count: 0 };
  return {
    totalSearches: r.total,
    successRate: r.total > 0 ? r.success_count / r.total : 0,
    cacheHitRate: r.cache_eligible_count > 0 ? r.cache_hit_count / r.cache_eligible_count : 0,
  };
}

/** Stat-tile deltas (dataviz skill's figure contract: "delta, signed,
 * vs a named period") — the CURRENT window vs the immediately
 * preceding window of the same length (e.g. for 30d, the 30 days
 * before that). Two separate queries, not derivable from
 * getAnalyticsSummary's single-window numbers. */
export async function getPreviousPeriodStats(days: number): Promise<PeriodStats> {
  const now = new Date();
  const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const previousStart = new Date(now.getTime() - days * 2 * 24 * 60 * 60 * 1000);
  return getPeriodStats(previousStart, currentStart);
}

export interface RecentSearch {
  verdictStatus: string | null;
  confidence: number | null;
  matchCount: number | null;
  categoryTags: string[];
  createdAt: string;
}

/** Individual real searches (not aggregated) — what the top-of-page
 * category/rate summaries can't give you: a single example outcome
 * (category, status, confidence, match count) for hand-picking into
 * social content. Deliberately carries nothing that narrates what the
 * founder actually typed — see confidence/matchCount's own doc comment
 * on schema.ts for why even the verdict headline didn't clear that bar
 * (it reconstructs the idea almost verbatim, just reworded). Only rows
 * with matchCount set are returned — that field was added after this
 * table's original aggregate-only design, so anything searched before
 * this shipped (or any non-success outcome) has nothing to show here
 * and is correctly excluded rather than shown blank. */
export async function getRecentSearches(days = 30, limit = 20): Promise<RecentSearch[]> {
  const db = getDb();
  const cutoff = periodCutoff(days);

  const rows = await db
    .select({
      verdictStatus: verdictEvents.verdictStatus,
      confidence: verdictEvents.confidence,
      matchCount: verdictEvents.matchCount,
      categoryTags: verdictEvents.categoryTags,
      createdAt: verdictEvents.createdAt,
    })
    .from(verdictEvents)
    .where(and(gt(verdictEvents.createdAt, cutoff), isNotNull(verdictEvents.matchCount)))
    .orderBy(desc(verdictEvents.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    verdictStatus: r.verdictStatus,
    confidence: r.confidence,
    matchCount: r.matchCount,
    categoryTags: r.categoryTags,
    createdAt: r.createdAt.toISOString(),
  }));
}

export interface CategoryVerdictRate {
  tag: string;
  total: number;
  existsCount: number;
  existsRate: number; // 0-1
}

// Below this sample size, an "exists rate" is more noise than signal —
// one search landing on "exists" makes a tag look like a 100% rate,
// which isn't a real pattern worth putting in front of an audience.
// Excluded from the ranking entirely rather than shown with a caveat,
// since the whole point of this query is "safe to quote in a post."
const MIN_SAMPLE_FOR_RATE = 3;

/** Per-category "already exists" rate — e.g. "ideas in fintech came
 * back 'exists' 80% of the time, vs. 20% for agritech." Distinct from
 * topTags (which only ranks search VOLUME per category, not outcome)
 * — this is the query behind the "which category had the highest/
 * lowest exists rate" half of the marketing-post data pull. */
export async function getCategoryVerdictRates(days = 30): Promise<CategoryVerdictRate[]> {
  const db = getDb();
  const cutoff = periodCutoff(days);

  const rows = (await db.execute(sql`
    select
      tag,
      count(*)::int as total,
      count(*) filter (where verdict_status = 'exists')::int as exists_count
    from verdict_events, unnest(category_tags) as tag
    where created_at > ${cutoff.toISOString()}
    group by tag
    having count(*) >= ${MIN_SAMPLE_FOR_RATE}
    order by total desc
  `)) as unknown as { tag: string; total: number; exists_count: number }[];

  return rows.map((r) => ({
    tag: r.tag,
    total: r.total,
    existsCount: r.exists_count,
    existsRate: r.total > 0 ? r.exists_count / r.total : 0,
  }));
}

// How many other tags to show per category when it's clicked open —
// enough to read as a real niche breakdown, not so many it turns into
// the full tag list again.
const MAX_COOCCURRING_TAGS = 6;

/** For each category tag, the OTHER tags that most often showed up
 * alongside it in the same search — e.g. clicking "b2c" shows
 * "fintech, marketplace, consumer..." revealing the niches inside that
 * category. Same privacy stance as everything else added this session:
 * this is classification co-occurrence (which tags travel together),
 * never anything that narrates what a founder actually typed. A
 * self-join over unnest — cheap at this data volume (tens to low
 * hundreds of rows/period), no reason to reach for anything fancier. */
export async function getCategoryCooccurrence(days = 30): Promise<Record<string, { tag: string; count: number }[]>> {
  const db = getDb();
  const cutoff = periodCutoff(days);

  const rows = (await db.execute(sql`
    select a.tag as tag, b.tag as co_tag, count(*)::int as n
    from verdict_events, unnest(category_tags) as a(tag), unnest(category_tags) as b(tag)
    where a.tag <> b.tag
      and created_at > ${cutoff.toISOString()}
    group by a.tag, b.tag
    order by a.tag, n desc
  `)) as unknown as { tag: string; co_tag: string; n: number }[];

  const byTag: Record<string, { tag: string; count: number }[]> = {};
  for (const r of rows) {
    const list = byTag[r.tag] ?? (byTag[r.tag] = []);
    if (list.length < MAX_COOCCURRING_TAGS) list.push({ tag: r.co_tag, count: r.n });
  }
  return byTag;
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
