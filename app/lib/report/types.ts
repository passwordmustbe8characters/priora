/**
 * Phase 3 — the shared data contract every stage of the deep report
 * pipeline reads or writes: Deep Report Generator produces it,
 * Hallucination Verification corrects it, Report Document Assembly
 * renders it. Every rendered field maps 1:1 to a `{{field}}` in the
 * validated HTML template (priora-phase3-spec-for-claude-code.md,
 * Section 5).
 *
 * `contentType` is carried on every fact/synthesis unit at the DATA
 * level, not just applied as a rendering style later — this is a hard
 * requirement from the spec (Deep Report Generator acceptance
 * criteria), so Report Document Assembly can never accidentally mix
 * the two by construction.
 *
 * Deliberately no separate "pricing benchmarks" fact structure — the
 * spec's table (entry price / top price / model) is the exact same
 * underlying research as each competitor's own pricing fields, so it's
 * derived from `competitors` at render time (see assemble.ts) rather
 * than generated and verified as a second, easily-drifting copy of the
 * same facts.
 */

export type ContentType = "fact" | "synthesis";

export interface FactText {
  contentType: "fact";
  text: string;
  // The source text this was drawn from — Hallucination Verification's
  // ground truth. Never rendered in the report itself.
  sourceSnippet: string | null;
}

export interface SynthesisText {
  contentType: "synthesis";
  text: string;
}

export interface CompetitorProfile {
  contentType: "fact";
  category: "direct" | "adjacent";
  companyName: string;
  description: string;
  pricing: string | null;
  entryPrice: string | null;
  topPrice: string | null;
  pricingModel: string | null;
  fundingStage: string | null;
  targetUser: string | null;
  // Phase 3, Section 10 (richer content, zero extra LLM calls) — same
  // research call, wider schema, same "omit if not explicit" rule as
  // every other field here. targetUser above already covers "target
  // customer segment," so that ask from the spec isn't a new field.
  foundedYear: string | null; // e.g. "2019" — a string, not a number: source text sometimes gives "founded in early 2019" etc., no need to force-parse
  headquarters: string | null; // HQ / primary market, e.g. "Lagos, Nigeria" — free text, not categorical; see `region` below for the badge-friendly version
  namedInvestors: string | null; // distinct from fundingStage (round type, e.g. "Series A") — actual investor names when stated
  // Section 12, Fix 3 — a canonical, badge-renderable version of what
  // `headquarters` only states as free text. Mirrors Phase 1's own
  // LiveMatch.region enum exactly (same three buckets) rather than
  // inventing a new vocabulary — deliberately NOT derived from
  // `headquarters` via string-matching in code, since guessing "Lagos,
  // Nigeria" -> African from a keyword list is exactly the kind of
  // ungrounded inference this report's own hallucination-control rule
  // exists to prevent. Same research call, same "null over guessing"
  // discipline as every other field here. Never used to filter or
  // suppress a competitor (see deriveMarketStats / Section 12, Fix 5 —
  // the market toggle changes narrative framing only, never retrieval).
  region: "western" | "african" | "global" | null;
  differentiator: string | null; // one sentence, only if it states something genuinely NOT already captured in `description` — a quote that just restates the description is padding, not depth (Section 12, Fix 4), so leave this null in that case rather than including it anyway
  sourceUrl: string;
  sourceLabel: string; // short display label for the link, e.g. "Official website"
  // Ground truth for verification — same role as FactText.sourceSnippet.
  sourceSnippet: string | null;
}

export interface SynthesisSection {
  contentType: "synthesis";
  heading: string;
  bodyText: string;
}

export interface SourceRef {
  url: string;
  label: string;
}

/**
 * Section 11 — bull/bear debate. Both sides are `contentType: "synthesis"`
 * per the spec's own tagging rule (reasoning, not sourced fact), reusing
 * SynthesisText rather than inventing a parallel shape. Generated from
 * two genuinely separate LLM calls (never one call asked for both
 * sides), grounded only in the already-verified report — see debate.ts.
 * `null` on any report generated before this feature shipped, or if
 * debate generation failed; the spec explicitly treats this as an
 * enhancement a report can ship without, not a required section — see
 * template.ts, which omits the section entirely when this is null.
 */
export interface DebateContent {
  bullCase: SynthesisText;
  bearCase: SynthesisText;
}

export interface DeepReportContent {
  ideaOneLiner: string;
  executiveSummary: FactText;
  marketLandscape: {
    fact: FactText;
    synthesis: SynthesisText;
  };
  competitors: CompetitorProfile[];
  // "Gaps & Differentiation Opportunities" etc. — one or more named
  // synthesis sections beyond the market landscape one above.
  synthesisSections: SynthesisSection[];
  debate: DebateContent | null;
  generatedAt: string;
}

export interface PricingBenchmarkRow {
  companyName: string;
  entryPrice: string | null;
  topPrice: string | null;
  pricingModel: string | null;
}

/** Pure derivation, not stored — see the file-level note above. */
export function derivePricingBenchmarks(competitors: CompetitorProfile[]): PricingBenchmarkRow[] {
  return competitors
    .filter((c) => c.entryPrice || c.topPrice || c.pricingModel)
    .map((c) => ({
      companyName: c.companyName,
      entryPrice: c.entryPrice,
      topPrice: c.topPrice,
      pricingModel: c.pricingModel,
    }));
}

export interface MarketStats {
  directCount: number;
  adjacentCount: number;
  totalCount: number;
  // null when there's no safe comparison to make — see the parsing
  // note below on why this deliberately doesn't force one.
  priceComparison: {
    currencySymbol: "$" | "₦";
    cheapest: { companyName: string; entryPrice: string };
    priciest: { companyName: string; entryPrice: string };
  } | null;
}

function parsePrice(entryPrice: string): { symbol: "$" | "₦"; value: number } | null {
  const symbolMatch = entryPrice.match(/[$₦]/);
  if (!symbolMatch) return null;
  const numberMatch = entryPrice.replace(/,/g, "").match(/[0-9]+(\.[0-9]+)?/);
  if (!numberMatch) return null;
  return { symbol: symbolMatch[0] as "$" | "₦", value: parseFloat(numberMatch[0]) };
}

/**
 * Phase 3, Section 10, Technique 3 — computed, not generated: plain
 * arithmetic over already-verified fields, zero hallucination risk
 * since nothing is invented, only calculated. Tagged as sourced-fact
 * content when rendered (see template.ts) for the same reason.
 *
 * The one real risk here is silent nonsense, not invention: entryPrice
 * is free-text from research (e.g. "$15/month", "₦5,000", "Contact for
 * pricing"), and this app's own reports frequently mix African and
 * global competitors in one set — comparing raw numbers across
 * currencies would produce a technically-computed but factually
 * misleading "cheapest" claim (₦5,000 as a bare number is larger than
 * $15, despite being worth far less). So: only compute a price
 * comparison when at least two competitors have a parseable price in
 * the SAME currency; anything that doesn't parse, or the wrong
 * currency, is simply excluded from the comparison rather than forced
 * into it. No comparison at all (not a wrong one) when the set doesn't
 * cleanly support it.
 */
export function deriveMarketStats(competitors: CompetitorProfile[]): MarketStats {
  const directCount = competitors.filter((c) => c.category === "direct").length;
  const adjacentCount = competitors.filter((c) => c.category === "adjacent").length;

  const parsed = competitors
    .map((c) => ({ c, price: c.entryPrice ? parsePrice(c.entryPrice) : null }))
    .filter((row): row is { c: CompetitorProfile; price: { symbol: "$" | "₦"; value: number } } => row.price !== null);

  const bySymbol = new Map<"$" | "₦", typeof parsed>();
  for (const row of parsed) {
    const list = bySymbol.get(row.price.symbol) ?? [];
    list.push(row);
    bySymbol.set(row.price.symbol, list);
  }

  let priceComparison: MarketStats["priceComparison"] = null;
  // Only use a currency group if it's not just large by coincidence —
  // pick whichever single-currency group has the most entries, and
  // only if there are at least two to actually compare.
  let best: typeof parsed = [];
  for (const list of bySymbol.values()) {
    if (list.length > best.length) best = list;
  }
  if (best.length >= 2) {
    const cheapestRow = best.reduce((a, b) => (b.price.value < a.price.value ? b : a));
    const priciestRow = best.reduce((a, b) => (b.price.value > a.price.value ? b : a));
    priceComparison = {
      currencySymbol: best[0].price.symbol,
      cheapest: { companyName: cheapestRow.c.companyName, entryPrice: cheapestRow.c.entryPrice! },
      priciest: { companyName: priciestRow.c.companyName, entryPrice: priciestRow.c.entryPrice! },
    };
  }

  return { directCount, adjacentCount, totalCount: competitors.length, priceComparison };
}

/** Sources & Methodology page — every distinct source across the
 * report, derived rather than tracked separately so it can never drift
 * from what's actually cited inline. */
export function deriveSources(report: DeepReportContent): SourceRef[] {
  const seen = new Map<string, string>();
  for (const c of report.competitors) {
    if (!seen.has(c.sourceUrl)) seen.set(c.sourceUrl, c.sourceLabel);
  }
  return [...seen.entries()].map(([url, label]) => ({ url, label }));
}
