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
