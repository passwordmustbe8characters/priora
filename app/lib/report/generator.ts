import { getOpenAI, VERDICT_MODEL } from "../openai";
import { stripMarkdownLinks } from "../pipeline";
import type { VerdictResponse } from "../verdict";
import type { CompetitorProfile, DeepReportContent } from "./types";

/**
 * Phase 3 — Deep Report Generator. Takes the free verdict as a starting
 * point and goes meaningfully further.
 *
 * "2-3 additional targeted search passes" (spec wording) is implemented
 * as one web_search-enabled call whose prompt explicitly directs the
 * model across multiple distinct research angles (deepen known
 * competitors, broaden to find more, hunt specifically for pricing/
 * business-model detail) — the model's own tool-use loop can issue
 * several actual searches within that single call, same underlying
 * mechanism the free verdict's liveSearchAndMatch already relies on.
 * Chaining 2-3 separate sequential API round-trips instead would add
 * real latency risk against the spec's own "target under 90 seconds"
 * criterion for comparatively little benefit — one call with a wider
 * research mandate and a bigger context budget is the better trade.
 *
 * Synthesis is a genuinely separate second call, per the spec's own
 * explicit requirement — reasoning over the gathered facts, never
 * touching search itself.
 *
 * Both calls use "low" reasoning effort, not "medium" — this account
 * appears to be on Vercel's Hobby plan, which hard-caps a serverless
 * function at 60s regardless of any `maxDuration` config, and the
 * spec's own "under 90s" target already exceeds that ceiling. Getting
 * silently killed mid-generation (leaving a job stuck at "generating"
 * forever) is a worse outcome than slightly shallower reasoning —
 * revisit this trade if the account moves to a plan with a longer
 * function budget.
 */

const RESEARCH_SYSTEM_PROMPT = `You are Priora's deep-report researcher, producing the sourced-fact foundation of a paid competitive report — a real step beyond the free verdict's lighter single pass. You'll get a founder's normalized idea and the competitors already found in that earlier pass.

Research thoroughly with web search, across multiple angles in the same pass:
1. Go deeper on each already-known competitor — find their actual pricing tiers, funding stage, and target customer where discoverable.
2. Search more broadly for competitors the earlier, lighter pass may have missed, including adjacent/indirect players solving a related problem a different way.
3. Look specifically for pricing and business-model detail — this is often thin or missing from a first pass and is exactly what makes this report worth more. Populate \`pricingModel\` with a plain-text description of HOW pricing works whenever you find any pricing information at all, even if it doesn't reduce to a clean entry/top tier — e.g. "volume-based maker/taker schedule starting at 0.20%" or "embedded in the exchange rate, first trade free" both belong in \`pricingModel\` even though neither is a simple number. \`entryPrice\`/\`topPrice\` are for when a clean tiered number genuinely exists; \`pricingModel\` should capture pricing shape independently of that, not only as a fallback label for a tier that's already clean. IMPORTANT: keep \`description\` focused on what the product IS and does, not on pricing specifics — if you know a fee schedule well enough to write it in prose, that same detail belongs in \`pricingModel\`, never ONLY in \`description\` with \`pricingModel\` left null. A profile where pricing detail is sitting in \`description\` while \`pricingModel\` is null is exactly the mistake to avoid: that pricing information becomes invisible to the report's Pricing Benchmarks table.
4. Also look for: founding year, headquarters/primary market, a region classification (see \`region\` below), named investors (distinct from just the funding round type — actual investor names when a source states them), and a one-sentence differentiator IF the company's own materials state one directly (e.g. a stated positioning line) — these add real depth to a profile but are exactly the kind of detail worth skipping (null) rather than guessing at when a source doesn't clearly say so. A differentiator is only worth including if it states something genuinely NOT already covered by \`description\` — if it would just restate the same fact in different words, leave it null; padding a profile with a redundant quote is not depth.

For \`region\`, classify each company's primary market as "western" (US/EU/other non-African developed markets), "african" (Africa-focused or Africa-headquartered), or "global" (genuinely operates broadly across regions, not centered on one) — use null only if the source text doesn't make this reasonably clear, never guess from the company name alone.

If a target market is specified, weight research toward companies and pricing actually relevant to that market (e.g. "african" means prioritize African/Nigeria-relevant players and local pricing over purely US/EU-only products, though a genuinely dominant global player is still worth including). This weighting is about which companies you spend search effort finding — it is never a filter on what you're allowed to report back. A genuinely relevant competitor is included regardless of its own region; the region field above describes what you found, it never decides whether to include it. If a specific pain point is given, let it sharpen which competitor details you dig for (the parts of a competitor's offering that bear on that exact problem), not just a generic profile.

Classify every company (existing or newly found) as "direct" (solves the same core problem, for the same primary user, with the same business model) or "adjacent" (related but not a direct substitute). Business model and target user matter just as much as topic/category overlap — two companies can share the exact same broad category and still not be direct competitors. For example, a B2B infrastructure product that lets OTHER BUSINESSES accept a type of payment is Adjacent to a consumer-facing app that lets individual people transact directly, even though both are in the same broad category — they solve different problems for different customers. Cap the total list at 8, prioritizing direct matches.

Every fact field must be genuinely evidenced by search results — use null rather than guessing for anything not confidently found, and never invent a company, a detail, or a URL. Include a short source snippet (the actual text a claim was drawn from) for every company and for the executive summary / market landscape write-ups — a later verification pass checks every claim against this snippet, so it must be real quoted/paraphrased source text, not a restatement of your own claim.

Write the executive summary and market landscape sections as plain, sourced description of what the research actually found — no interpretation or speculation, that is a separate step done afterward. Address the reader directly as "you"/"your" throughout — never third person like "the founder" or "the user."`;

const RESEARCH_SCHEMA = {
  type: "object" as const,
  properties: {
    executiveSummary: { type: "string" as const },
    executiveSummarySnippet: { type: ["string", "null"] as const },
    marketLandscapeFact: { type: "string" as const },
    marketLandscapeFactSnippet: { type: ["string", "null"] as const },
    competitors: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          companyName: { type: "string" as const },
          category: { type: "string" as const, enum: ["direct", "adjacent"] },
          description: { type: "string" as const },
          pricing: { type: ["string", "null"] as const },
          entryPrice: { type: ["string", "null"] as const },
          topPrice: { type: ["string", "null"] as const },
          pricingModel: { type: ["string", "null"] as const },
          fundingStage: { type: ["string", "null"] as const },
          targetUser: { type: ["string", "null"] as const },
          foundedYear: { type: ["string", "null"] as const },
          headquarters: { type: ["string", "null"] as const },
          namedInvestors: { type: ["string", "null"] as const },
          region: { type: ["string", "null"] as const, enum: ["western", "african", "global", null] },
          differentiator: { type: ["string", "null"] as const },
          sourceUrl: { type: "string" as const },
          sourceLabel: { type: "string" as const },
          sourceSnippet: { type: ["string", "null"] as const },
        },
        required: [
          "companyName",
          "category",
          "description",
          "pricing",
          "entryPrice",
          "topPrice",
          "pricingModel",
          "fundingStage",
          "targetUser",
          "foundedYear",
          "headquarters",
          "namedInvestors",
          "region",
          "differentiator",
          "sourceUrl",
          "sourceLabel",
          "sourceSnippet",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["executiveSummary", "executiveSummarySnippet", "marketLandscapeFact", "marketLandscapeFactSnippet", "competitors"],
  additionalProperties: false,
};

interface ResearchOutput {
  executiveSummary: string;
  executiveSummarySnippet: string | null;
  marketLandscapeFact: string;
  marketLandscapeFactSnippet: string | null;
  competitors: Omit<CompetitorProfile, "contentType">[];
}

const SYNTHESIS_SYSTEM_PROMPT = `You are producing strategic analysis based on research findings, not raw facts. You'll get a founder's idea and a set of researched competitor profiles. Reason across this data to identify patterns, gaps, and positioning opportunities — you may synthesize and interpret, but every claim must trace back to a pattern actually present in the given data, not outside knowledge or assumption.

Produce:
1. A market landscape synthesis (2-4 sentences) — your read on what the competitive picture actually means for the reader.
2. One or more named sections (e.g. "Gaps & Differentiation Opportunities", "Customer Segments") going deeper on where a real opening might exist, or where this idea would struggle against what's already out there.

If a specific pain point was given, make sure at least one section speaks directly to it — does the researched competitive picture suggest that exact problem is well-served already, poorly served, or open. If a target market was specified, frame positioning and gaps in those terms: an "African market" focus should reason about local distribution, pricing, and payment realities, not just feature parity with global players; a "Global" focus should weigh every competitor found — regardless of where any individual one happens to be based — on equal footing, never defaulting to a regional narrative just because part of the researched set happens to skew that way.

Write reasoned inference as inference — "this suggests," "a credible gap appears to be" — never as a confirmed fact. If the competitor data is thin, keep sections general rather than forcing specific claims about any one company. Address the reader directly as "you"/"your" throughout — never third person like "the founder" or "the user."`;

const SYNTHESIS_SCHEMA = {
  type: "object" as const,
  properties: {
    marketLandscapeSynthesis: { type: "string" as const },
    sections: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          heading: { type: "string" as const },
          bodyText: { type: "string" as const },
        },
        required: ["heading", "bodyText"],
        additionalProperties: false,
      },
    },
  },
  required: ["marketLandscapeSynthesis", "sections"],
  additionalProperties: false,
};

interface SynthesisOutput {
  marketLandscapeSynthesis: string;
  sections: { heading: string; bodyText: string }[];
}

export interface GenerateOptions {
  market?: "african" | "global" | null;
  painPoint?: string | null;
  /** Fires once research() finishes and synthesize() is about to start —
   * lets the caller flip a live-progress "stage" without generator.ts
   * needing to know anything about job persistence itself. */
  onStage?: (stage: "synthesizing") => void | Promise<void>;
}

// Section 12, Fix 5 — the market toggle governs narrative framing only,
// never which competitors get reported (research()'s own prompt already
// says as much — "weighting is about search effort, never a filter").
// That distinction matters most for synthesis, though, not research:
// research() produces plain sourced description with "no interpretation
// or speculation" per its own system prompt, so it has little room to
// drift into a regional narrative in the first place. synthesize() is
// where actual interpretation happens, and where a live report was
// confirmed to lean Africa-centric in Global mode despite the idea
// never mentioning Africa — because "Global, no specific regional
// focus" reads as passively neutral, not as an active instruction to
// counteract that default. `forSynthesis` only strengthens the Global
// wording; the African-mode wording and research()'s own call are
// unchanged.
function contextLine(options?: GenerateOptions, { forSynthesis = false }: { forSynthesis?: boolean } = {}): string {
  const parts: string[] = [];
  if (options?.market) {
    const globalWording = forSynthesis
      ? "Global — present African and international competitors on equal footing in your narrative; do not default to an Africa-centric framing just because some of the competitors found happen to be African."
      : "Global, no specific regional focus";
    parts.push(`Target market: ${options.market === "african" ? "African (Nigeria-focused, weight research accordingly)" : globalWording}.`);
  }
  if (options?.painPoint) {
    parts.push(`Specific pain point the reader wants addressed: ${options.painPoint}`);
  }
  return parts.length ? `\n\n${parts.join("\n")}` : "";
}

async function research(freeVerdict: VerdictResponse, options?: GenerateOptions): Promise<ResearchOutput> {
  const client = getOpenAI();
  const existingList = freeVerdict.matches
    .map((m) => `- ${m.name} (${m.url}): ${m.description}`)
    .join("\n");

  const response = await client.responses.create({
    model: VERDICT_MODEL,
    tools: [{ type: "web_search", search_context_size: "medium" }],
    reasoning: { effort: "low" },
    input: [
      { role: "system", content: RESEARCH_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Idea: ${freeVerdict.idea.normalized}\n\nCompetitors already found in the free verdict pass:\n${existingList || "(none found yet)"}${contextLine(options)}`,
      },
    ],
    text: {
      format: { type: "json_schema", name: "deep_research", schema: RESEARCH_SCHEMA, strict: true },
    },
  });

  const raw = response.output_text;
  if (!raw) throw new Error("Empty response from deep report research pass");
  return JSON.parse(raw) as ResearchOutput;
}

async function synthesize(
  freeVerdict: VerdictResponse,
  competitors: ResearchOutput["competitors"],
  options?: GenerateOptions,
): Promise<SynthesisOutput> {
  const client = getOpenAI();
  const competitorSummary = competitors
    .map((c) => `- ${c.companyName} (${c.category}): ${c.description}${c.pricing ? ` — pricing: ${c.pricing}` : ""}`)
    .join("\n");

  const response = await client.responses.create({
    model: VERDICT_MODEL,
    reasoning: { effort: "low" },
    input: [
      { role: "system", content: SYNTHESIS_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Idea: ${freeVerdict.idea.normalized}\n\nResearched competitors:\n${competitorSummary || "(no competitors found)"}${contextLine(options, { forSynthesis: true })}`,
      },
    ],
    text: {
      format: { type: "json_schema", name: "synthesis", schema: SYNTHESIS_SCHEMA, strict: true },
    },
  });

  const raw = response.output_text;
  if (!raw) throw new Error("Empty response from deep report synthesis pass");
  return JSON.parse(raw) as SynthesisOutput;
}

// Section 12, Fix 1 — confirmed live, twice, that the prompt-only
// instruction above ("keep pricing detail out of description, put it in
// pricingModel") is not reliably followed: the model still regularly
// writes real pricing detail straight into `description` while leaving
// `pricing`/`entryPrice`/`topPrice`/`pricingModel` all null (e.g. "Kraken
// ... carries a 1% trading fee, while custom orders carry a 1.5% fee"
// sitting only in description). Prompt-tightening alone didn't close
// this reliably across two separate real report runs, so this is a
// deterministic backstop, not a replacement for the prompt fix: if every
// pricing field came back null, mechanically pull whatever sentences in
// the ALREADY-GENERATED description look pricing-related back out into
// pricingModel. This invents nothing — it's the same already-sourced,
// already-verified-eligible text, just recovered into the field the
// Pricing Benchmarks table (derivePricingBenchmarks) actually reads.
// Deliberately NOT matching on bare "price"/"pricing"/"tier" — those
// words show up constantly in feature-y prose that isn't actually
// pricing detail (e.g. "price alerts," "volume-based tiers" as a
// feature mention with no figures attached) and produced false
// positives in testing. Requiring a number/currency figure or an
// unambiguous fee-specific word keeps this precise — it's fine to miss
// a rare edge case here since the prompt fix above is still the first
// line of defense; this backstop only needs to catch the common case
// where real numeric pricing detail landed in the wrong field.
const PRICING_SIGNAL = /\$\d|%|\bfee(s)?\b|\bcommission\b|\bfree\b|\bcharge(s)?\b/i;

function fallbackPricingModel(description: string): string | null {
  // Naive sentence split — good enough for this purpose (a mechanical
  // recovery pass over prose already written by the same call, not a
  // parser that needs to be linguistically precise).
  const sentences = description.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const pricingSentences = sentences.filter((s) => PRICING_SIGNAL.test(s));
  return pricingSentences.length ? pricingSentences.join(" ") : null;
}

export async function generateDeepReport(freeVerdict: VerdictResponse, options?: GenerateOptions): Promise<DeepReportContent> {
  const researched = await research(freeVerdict, options);

  const competitors: CompetitorProfile[] = researched.competitors.map((c) => {
    const description = stripMarkdownLinks(c.description);
    const hasPricingField = Boolean(c.pricing || c.entryPrice || c.topPrice || c.pricingModel);
    const pricingModel = hasPricingField ? c.pricingModel : fallbackPricingModel(description);
    return { ...c, contentType: "fact", description, pricingModel };
  });

  await options?.onStage?.("synthesizing");
  const synthesized = await synthesize(freeVerdict, researched.competitors, options);

  return {
    ideaOneLiner: freeVerdict.idea.normalized,
    executiveSummary: {
      contentType: "fact",
      text: stripMarkdownLinks(researched.executiveSummary),
      sourceSnippet: researched.executiveSummarySnippet,
    },
    marketLandscape: {
      fact: {
        contentType: "fact",
        text: stripMarkdownLinks(researched.marketLandscapeFact),
        sourceSnippet: researched.marketLandscapeFactSnippet,
      },
      synthesis: { contentType: "synthesis", text: synthesized.marketLandscapeSynthesis },
    },
    competitors,
    synthesisSections: synthesized.sections.map((s) => ({ contentType: "synthesis" as const, ...s })),
    // Filled in by the debate stage, which runs after verification —
    // see orchestrate.ts and debate.ts. Null here is the correct
    // starting state, not a placeholder to fix later in this function.
    debate: null,
    generatedAt: new Date().toISOString(),
  };
}
