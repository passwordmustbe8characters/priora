import { LogoutButton } from "../../components/admin/LogoutButton";
import {
  getAnalyticsSummary,
  getCategoryVerdictRates,
  getPricingFeedbackSummary,
  getReportJobsSummary,
} from "../../lib/db/analytics";

/**
 * Phase 2 — Usage Analytics Dashboard (see docs/analytics.md). Gated by
 * proxy.ts (a real login page + session cookie against ADMIN_SECRET),
 * not by anything in this component.
 *
 * Simpler than the spec's literal "backend builds the data pipeline,
 * frontend builds the view" split: this is a Server Component that
 * calls getAnalyticsSummary() directly rather than round-tripping
 * through a separate JSON API — idiomatic for the App Router, and there
 * was no other consumer that needed a standalone API for this data.
 *
 * Always renders in light mode — an internal one-off page doesn't need
 * its own theme toggle, so it just uses the site's default light tokens
 * rather than wiring up data-theme here too.
 *
 * Colors are the dataviz skill's validated default palette (light
 * mode only, see dataviz skill references/palette.md) — Priora doesn't
 * have its own categorical/status palette defined yet, and this is the
 * first place the app needed one.
 */

const CATEGORICAL = { blue: "#2a78d6", orange: "#eb6834", aqua: "#1baf7a" };
const STATUS = { good: "#0ca30c", warning: "#fab219", critical: "#d03b3b" };
const GRID = "#e8e6df";

const PERIODS = [7, 30, 90] as const;

// Must match MIN_SAMPLE_FOR_RATE in lib/db/analytics.ts — the query
// already excludes low-sample tags server-side, this is only for the
// caption text explaining why some searched categories don't appear here.
const MIN_SAMPLE_FOR_RATE_DISPLAY = 3;

const CACHE_LABELS: Record<string, string> = {
  HIT: "In-memory cache",
  "COMPANY-DB-HIT": "Company DB cache",
  // Cache-then-live progressive search: the DB cache found SOME real
  // matches instantly, and a live search then backfilled the rest —
  // see pipeline.ts's "Orchestrator" doc comment.
  MIXED: "Cache + live search",
  MISS: "Live search",
  none: "N/A (errored before cache check)",
};

const VERDICT_LABELS: Record<string, string> = {
  exists: "Exists",
  partial_overlap: "Partial overlap",
  no_clear_match: "No clear match",
  none: "N/A (errored)",
};

const OUTCOME_META: Record<string, { label: string; color: string; icon: "check" | "warn" | "x" }> = {
  success: { label: "Success", color: STATUS.good, icon: "check" },
  validation_error: { label: "Validation error", color: STATUS.warning, icon: "warn" },
  pipeline_error: { label: "Pipeline error", color: STATUS.critical, icon: "x" },
};

const REPORT_STATUS_LABELS: Record<string, string> = {
  generating: "Generating",
  ready: "Ready",
  failed: "Failed",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pending (payment not live yet)",
  paid: "Paid",
  failed: "Payment failed",
};

function formatMajor(currency: string, major: number): string {
  const rounded = Math.round(major);
  return currency === "NGN" ? `₦${rounded.toLocaleString()}` : `$${rounded.toLocaleString()}`;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function StatusIcon({ kind, color }: { kind: "check" | "warn" | "x"; color: string }) {
  const paths = {
    check: "M5 12.5 9.5 17 19 7",
    warn: "M12 9v4.5M12 16.5h.01M10.6 4.6 2.9 18a1.5 1.5 0 0 0 1.3 2.2h15.6a1.5 1.5 0 0 0 1.3-2.2L13.4 4.6a1.5 1.5 0 0 0-2.8 0Z",
    x: "M7 7l10 10M17 7 7 17",
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0" aria-hidden>
      <path d={paths[kind]} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-surface p-5">
      <p className="font-body text-sm text-ink-soft">{label}</p>
      <p className="font-body mt-1 text-4xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function BarList({
  title,
  rows,
  labelMap,
  color,
}: {
  title: string;
  rows: { key: string; count: number }[];
  labelMap?: Record<string, string>;
  color: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="rounded-2xl border border-ink/10 bg-surface p-5">
      <h2 className="font-body text-sm font-semibold text-ink">{title}</h2>
      {rows.length === 0 ? (
        <p className="font-body mt-3 text-sm text-ink-soft">No data in this period.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((row) => {
            const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
            const widthPct = Math.round((row.count / max) * 100);
            return (
              <li key={row.key}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="font-body truncate text-sm text-ink">{labelMap?.[row.key] ?? row.key}</span>
                  <span className="font-body shrink-0 text-xs text-ink-soft" title={`${row.count} of ${total}`}>
                    {row.count} · {pct}%
                  </span>
                </div>
                {/* Bar: ≤24px thick (using 10px), 4px rounded data-end,
                    square at the baseline (the left edge, where it grows
                    from) — rounded-r only, not rounded-l. */}
                <div className="h-2.5 w-full rounded-full" style={{ backgroundColor: GRID }}>
                  <div
                    className="h-2.5 rounded-r-full"
                    style={{ width: `${Math.max(widthPct, 3)}%`, backgroundColor: color }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Same visual language as BarList, but the bar encodes a rate (0-1)
 * against a fixed 100% scale rather than each row's count against the
 * row list's own max — a category's exists-rate bar should read the
 * same length regardless of what else is in the list. */
function RateList({
  title,
  rows,
  color,
}: {
  title: string;
  rows: { tag: string; total: number; existsRate: number }[];
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-surface p-5">
      <h2 className="font-body text-sm font-semibold text-ink">{title}</h2>
      <p className="font-body mt-1 text-xs text-ink-soft">
        Categories with at least {MIN_SAMPLE_FOR_RATE_DISPLAY} searches this period, ranked highest to lowest.
      </p>
      {rows.length === 0 ? (
        <p className="font-body mt-3 text-sm text-ink-soft">Not enough volume in any single category yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.tag}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="font-body truncate text-sm text-ink">{row.tag}</span>
                <span className="font-body shrink-0 text-xs text-ink-soft">
                  {Math.round(row.existsRate * 100)}% · {row.total} searches
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full" style={{ backgroundColor: GRID }}>
                <div
                  className="h-2.5 rounded-r-full"
                  style={{ width: `${Math.max(Math.round(row.existsRate * 100), 3)}%`, backgroundColor: color }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TrendChart({ daily, periodDays }: { daily: { date: string; count: number }[]; periodDays: number }) {
  const width = 640;
  const height = 160;
  const padding = { top: 12, right: 12, bottom: 24, left: 12 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const max = Math.max(1, ...daily.map((d) => d.count));
  const n = Math.max(daily.length, 2);
  const points = daily.map((d, i) => {
    const x = padding.left + (n === 1 ? 0 : (i / (n - 1)) * plotW);
    const y = padding.top + plotH - (d.count / max) * plotH;
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath =
    points.length > 0
      ? `${linePath} L${points[points.length - 1].x.toFixed(1)},${padding.top + plotH} L${points[0].x.toFixed(1)},${padding.top + plotH} Z`
      : "";

  const gridY = [0, 0.5, 1].map((t) => padding.top + plotH * t);

  return (
    <div className="rounded-2xl border border-ink/10 bg-surface p-5">
      <h2 className="font-body text-sm font-semibold text-ink">Searches per day · last {periodDays}d</h2>
      {daily.length === 0 ? (
        <p className="font-body mt-3 text-sm text-ink-soft">No data in this period.</p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" role="img" aria-label="Searches per day">
          {gridY.map((y) => (
            <line key={y} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={GRID} strokeWidth="1" />
          ))}
          <path d={areaPath} fill={CATEGORICAL.blue} opacity="0.1" />
          <path d={linePath} fill="none" stroke={CATEGORICAL.blue} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p) => (
            <g key={p.date}>
              <circle cx={p.x} cy={p.y} r="6" fill="var(--surface)" />
              <circle cx={p.x} cy={p.y} r="4" fill={CATEGORICAL.blue} />
            </g>
          ))}
          {/* No length guard needed for the array itself — this branch
              only renders when daily.length > 0, so points is always
              non-empty. But with exactly one point, start and end are
              the same point at the same x — two opposite-anchored
              labels there would overlap into unreadable text, so only
              the single label renders in that case. */}
          <text x={points[0].x} y={height - 4} fontSize="10" fill="var(--ink-soft)" textAnchor={points.length === 1 ? "middle" : "start"}>
            {points[0].date}
          </text>
          {points.length > 1 && (
            <text x={points[points.length - 1].x} y={height - 4} fontSize="10" fill="var(--ink-soft)" textAnchor="end">
              {points[points.length - 1].date}
            </text>
          )}
        </svg>
      )}
    </div>
  );
}

/**
 * Pre-filled copy for the social-post template ("This [week/month],
 * the most-checked category was ___ — followed by ___ and ___" / "Also
 * noticed: ideas in ___ had the [highest/lowest] 'already exists'
 * rate") — reads the exact numbers off the queries above rather than
 * making the founder eyeball the charts and do the ranking/percentage
 * math by hand before every post. `periodDays` picks the [week/month]
 * wording automatically off whichever filter is active.
 */
function PostDataCallout({
  periodDays,
  topTags,
  categoryRates,
}: {
  periodDays: number;
  topTags: { tag: string; count: number }[];
  categoryRates: { tag: string; total: number; existsRate: number }[];
}) {
  const periodWord = periodDays <= 7 ? "week" : periodDays <= 30 ? "month" : `${periodDays} days`;
  const [top1, top2, top3] = topTags;

  const sorted = [...categoryRates].sort((a, b) => b.existsRate - a.existsRate);
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];
  // Same tag can't usefully be both ends of "highest vs lowest" when
  // there's only one tag with enough samples — that's not a contrast
  // worth posting, so treat it the same as "not enough data."
  const hasRateContrast = sorted.length >= 2 && highest.tag !== lowest.tag;

  return (
    <div className="mt-8 rounded-2xl border border-ink/15 bg-ink/[0.03] p-5">
      <h2 className="font-body text-sm font-semibold text-ink">Ready for your post — {periodWord}</h2>
      <p className="font-body mt-1 text-xs text-ink-soft">
        Real numbers from this period, in the shape of your IG/Threads template. Copy directly, or use as a sanity
        check on the fill-in-the-blank version.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <div className="rounded-xl bg-surface p-4">
          {top1 ? (
            <p className="font-body text-sm text-ink">
              This {periodWord}, the most-checked category on Priora was <strong>{top1.tag}</strong> ({top1.count}
              {top1.count === 1 ? " check" : " checks"})
              {top2 && (
                <>
                  {" "}
                  — followed by <strong>{top2.tag}</strong> ({top2.count}){top3 && <> and <strong>{top3.tag}</strong> ({top3.count})</>}.
                </>
              )}
            </p>
          ) : (
            <p className="font-body text-sm text-ink-soft">Not enough searches yet this {periodWord} to name a top category.</p>
          )}
        </div>

        <div className="rounded-xl bg-surface p-4">
          {hasRateContrast ? (
            <p className="font-body text-sm text-ink">
              Ideas in <strong>{highest.tag}</strong> had the highest &quot;already exists&quot; rate of anything
              checked ({Math.round(highest.existsRate * 100)}% across {highest.total} searches) — <strong>{lowest.tag}</strong>{" "}
              had the lowest ({Math.round(lowest.existsRate * 100)}% across {lowest.total} searches).
            </p>
          ) : (
            <p className="font-body text-sm text-ink-soft">
              Not enough categories with {`>=3`} searches yet this {periodWord} for a meaningful highest/lowest
              comparison — check back once volume picks up, or widen the period above.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const requested = Number(params.days);
  const days = (PERIODS as readonly number[]).includes(requested) ? requested : 30;

  const [summary, categoryRates, reportJobs, pricingFeedback] = await Promise.all([
    getAnalyticsSummary(days),
    getCategoryVerdictRates(days),
    getReportJobsSummary(days),
    getPricingFeedbackSummary(days),
  ]);

  const successCount = summary.outcomeBreakdown.find((o) => o.outcome === "success")?.count ?? 0;
  const successRate = summary.totalSearches > 0 ? Math.round((successCount / summary.totalSearches) * 100) : 0;

  const cacheHits = summary.cacheBreakdown
    .filter((c) => c.cacheStatus === "HIT" || c.cacheStatus === "COMPANY-DB-HIT")
    .reduce((sum, c) => sum + c.count, 0);
  const cacheEligible = summary.cacheBreakdown.reduce((sum, c) => sum + c.count, 0);
  const cacheHitRate = cacheEligible > 0 ? Math.round((cacheHits / cacheEligible) * 100) : 0;

  return (
    <main className="min-h-screen bg-background px-6 py-10 sm:px-10 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">Usage Analytics</h1>
            <p className="font-body mt-1 text-sm text-ink-soft">
              What categories are being searched, how often the cache is doing its job, and the free-to-verdict
              conversion funnel.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <nav className="flex gap-2" aria-label="Time period">
              {PERIODS.map((p) => (
                <a
                  key={p}
                  href={`/admin/analytics?days=${p}`}
                  className={`font-body rounded-full px-4 py-1.5 text-sm transition ${
                    p === days ? "bg-ink text-surface" : "bg-ink/5 text-ink-soft hover:bg-ink/10"
                  }`}
                >
                  {p}d
                </a>
              ))}
            </nav>
            <LogoutButton />
          </div>
        </div>

        <PostDataCallout periodDays={days} topTags={summary.topTags} categoryRates={categoryRates} />

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile label="Total searches" value={formatCompact(summary.totalSearches)} />
          <StatTile label="Free-to-verdict conversion" value={`${successRate}%`} />
          <StatTile label="Cache hit rate" value={`${cacheHitRate}%`} />
        </div>

        <div className="mt-4 rounded-2xl border border-ink/10 bg-surface p-5">
          <h2 className="font-body text-sm font-semibold text-ink">Outcome breakdown</h2>
          <ul className="mt-4 flex flex-wrap gap-6">
            {(["success", "validation_error", "pipeline_error"] as const).map((key) => {
              const meta = OUTCOME_META[key];
              const count = summary.outcomeBreakdown.find((o) => o.outcome === key)?.count ?? 0;
              const pct = summary.totalSearches > 0 ? Math.round((count / summary.totalSearches) * 100) : 0;
              return (
                <li key={key} className="flex items-center gap-2">
                  <StatusIcon kind={meta.icon} color={meta.color} />
                  <span className="font-body text-sm text-ink">{meta.label}</span>
                  <span className="font-body text-sm text-ink-soft">
                    {count} · {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-4">
          <TrendChart daily={summary.dailyCounts} periodDays={days} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BarList
            title="Cache status"
            rows={summary.cacheBreakdown.map((c) => ({ key: c.cacheStatus, count: c.count }))}
            labelMap={CACHE_LABELS}
            color={CATEGORICAL.blue}
          />
          <BarList
            title="Verdict status"
            rows={summary.verdictBreakdown.map((v) => ({ key: v.verdictStatus, count: v.count }))}
            labelMap={VERDICT_LABELS}
            color={CATEGORICAL.orange}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BarList
            title="Top category tags searched"
            rows={summary.topTags.map((t) => ({ key: t.tag, count: t.count }))}
            color={CATEGORICAL.aqua}
          />
          <RateList
            title={`"Already exists" rate by category`}
            rows={[...categoryRates].sort((a, b) => b.existsRate - a.existsRate)}
            color={CATEGORICAL.orange}
          />
        </div>

        <h2 className="font-display mt-10 text-xl font-bold text-ink">Deep report funnel</h2>
        <p className="font-body mt-1 text-sm text-ink-soft">
          Report-bypass key holders only, for now — this is generation activity, separate from the free-verdict
          numbers above.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BarList
            title={`Generation status · ${reportJobs.total} total`}
            rows={reportJobs.statusBreakdown.map((s) => ({ key: s.status, count: s.count }))}
            labelMap={REPORT_STATUS_LABELS}
            color={CATEGORICAL.blue}
          />
          <BarList
            title="Payment status"
            rows={reportJobs.paymentBreakdown.map((p) => ({ key: p.paymentStatus, count: p.count }))}
            labelMap={PAYMENT_STATUS_LABELS}
            color={CATEGORICAL.orange}
          />
        </div>

        <h2 className="font-display mt-10 text-xl font-bold text-ink">Pricing feedback</h2>
        <p className="font-body mt-1 text-sm text-ink-soft">
          From the public &quot;coming soon&quot; screen&apos;s price slider — {pricingFeedback.total} submission
          {pricingFeedback.total === 1 ? "" : "s"} in this period.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {pricingFeedback.byCurrency.length === 0 ? (
            <div className="rounded-2xl border border-ink/10 bg-surface p-5 sm:col-span-2">
              <p className="font-body text-sm text-ink-soft">No submissions in this period.</p>
            </div>
          ) : (
            pricingFeedback.byCurrency.map((row) => (
              <div key={row.currency} className="rounded-2xl border border-ink/10 bg-surface p-5">
                <p className="font-body text-sm font-semibold text-ink">
                  {row.currency} · {row.count} submission{row.count === 1 ? "" : "s"}
                </p>
                <div className="mt-3 flex gap-6">
                  <div>
                    <p className="font-body text-xs text-ink-soft">Average</p>
                    <p className="font-body text-2xl font-semibold text-ink">{formatMajor(row.currency, row.avgMajor)}</p>
                  </div>
                  <div>
                    <p className="font-body text-xs text-ink-soft">Median</p>
                    <p className="font-body text-2xl font-semibold text-ink">{formatMajor(row.currency, row.medianMajor)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </main>
  );
}
