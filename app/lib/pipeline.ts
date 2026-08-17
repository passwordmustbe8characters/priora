import { getOpenAI, VERDICT_MODEL } from "./openai";
import { findFreshCandidates, upsertCompanies } from "./db/companies";
import type { Company } from "./db/schema";
import type { VerdictMatch, VerdictResponse, VerdictStatus } from "./verdict";

/**
 * Real Phase 1+2 backend pipeline (see docs/api-contract.md for the
 * original pipeline diagram, docs/db-schema.md for the cache).
 *
 * Split into three LLM calls instead of Phase 1's single combined one,
 * because caching requires knowing category tags *before* deciding
 * whether to pay for a live search at all:
 *
 *   1. normalizeIdea      — cheap, no search: idea -> category tags
 *   2. findFreshCandidates — DB lookup (see db/companies.ts)
 *   3a. cachedMatch  OR  3b. liveSearchAndMatch
 *       (enough fresh cache hits)  (not enough — pay for real search,
 *                                   then upsert results for next time)
 *
 * Enough fresh candidates found → skip the paid web_search call entirely
 * and just re-score what's cached (a cheap reasoning-only call). Cache
 * lookup itself is a fast indexed query, negligible next to what it's
 * there to avoid re-paying for.
 */

const MIN_CACHE_CANDIDATES = 3;

// TEMPORARY diagnostic: surfaces a swallowed cache-write error without
// changing the response contract, so it can be read via a debug header
// in production where console logs aren't reachable. Remove once the
// current upsert issue is confirmed fixed.
export let lastUpsertError: string | null = null;

// ---------------------------------------------------------------------
// Stage 1: Idea Normalizer
// ---------------------------------------------------------------------

const NORMALIZE_SYSTEM_PROMPT = `You are Priora's idea normalizer. A founder gives you a raw, possibly rambling description of a startup idea. Extract a structured profile:

1. A clear one-sentence canonical restatement (the "normalized" idea).
2. 2-5 short lowercase category tags for what kind of product this is (e.g. "fintech", "payments", "edtech", "b2c", "marketplace"). These are used to search a cache of previously-found companies, so keep them broad and standard rather than hyper-specific.
3. The core problem being solved, in one sentence.
4. Who the target user is, in a few words.`;

const NORMALIZE_SCHEMA = {
  type: "object" as const,
  properties: {
    normalizedIdea: { type: "string" as const },
    categoryTags: { type: "array" as const, items: { type: "string" as const } },
    coreProblem: { type: "string" as const },
    targetUser: { type: "string" as const },
  },
  required: ["normalizedIdea", "categoryTags", "coreProblem", "targetUser"],
  additionalProperties: false,
};

interface NormalizeOutput {
  normalizedIdea: string;
  categoryTags: string[];
  coreProblem: string;
  targetUser: string;
}

async function normalizeIdea(rawIdea: string): Promise<NormalizeOutput> {
  const client = getOpenAI();
  const response = await client.responses.create({
    model: VERDICT_MODEL,
    reasoning: { effort: "low" },
    input: [
      { role: "system", content: NORMALIZE_SYSTEM_PROMPT },
      { role: "user", content: rawIdea },
    ],
    text: {
      format: { type: "json_schema", name: "normalize", schema: NORMALIZE_SCHEMA, strict: true },
    },
  });
  const raw = response.output_text;
  if (!raw) throw new Error("Empty response from normalizer");
  return JSON.parse(raw) as NormalizeOutput;
}

// ---------------------------------------------------------------------
// Shared: sanitizing model output before it reaches the UI
// ---------------------------------------------------------------------

// Belt-and-suspenders: prompts tell the model to keep fields plain-text,
// but LLM output isn't guaranteed — strip markdown-link citations and cap
// "source" length so one non-compliant response can't break the
// match-row layout (this is what actually happened once: the model put a
// full citation into "source" instead of "description").
function stripMarkdownLinks(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\(\s*https?:\/\/[^\s)]+\s*\)/g, "")
    .trim();
}

function sanitizeMatch(match: VerdictMatch): VerdictMatch {
  return {
    ...match,
    description: stripMarkdownLinks(match.description),
    source: stripMarkdownLinks(match.source).slice(0, 40),
  };
}

// ---------------------------------------------------------------------
// Stage 3a: cache hit — re-score cached candidates, no search
// ---------------------------------------------------------------------

const CACHED_MATCH_SYSTEM_PROMPT = `You are Priora's relevance matcher. You'll be given a founder's normalized idea and a list of candidate companies already on file (not fresh search results — you are not searching, only judging fit). For each candidate:

1. Score how closely it matches the idea, 0-100.

Then decide an overall status:
- "exists" if two or more candidates score 70+
- "partial_overlap" if something scores as related but not a close match
- "no_clear_match" if nothing meaningfully similar

Write the headline as one plain sentence a non-technical founder would understand — no jargon, no hedging filler. Return a score for every candidate you were given, in the same order.`;

const CACHED_MATCH_SCHEMA = {
  type: "object" as const,
  properties: {
    status: { type: "string" as const, enum: ["exists", "partial_overlap", "no_clear_match"] },
    headline: { type: "string" as const },
    confidence: { type: "number" as const },
    scores: { type: "array" as const, items: { type: "number" as const } },
  },
  required: ["status", "headline", "confidence", "scores"],
  additionalProperties: false,
};

interface CachedMatchOutput {
  status: VerdictStatus;
  headline: string;
  confidence: number;
  scores: number[];
}

async function cachedMatch(
  normalizedIdea: string,
  candidates: Company[],
): Promise<{ status: VerdictStatus; headline: string; confidence: number; matches: VerdictMatch[] }> {
  const client = getOpenAI();
  const candidateList = candidates
    .map((c, i) => `${i + 1}. ${c.name} — ${c.description}`)
    .join("\n");

  const response = await client.responses.create({
    model: VERDICT_MODEL,
    reasoning: { effort: "low" },
    input: [
      { role: "system", content: CACHED_MATCH_SYSTEM_PROMPT },
      { role: "user", content: `Idea: ${normalizedIdea}\n\nCandidates:\n${candidateList}` },
    ],
    text: {
      format: { type: "json_schema", name: "cached_match", schema: CACHED_MATCH_SCHEMA, strict: true },
    },
  });

  const raw = response.output_text;
  if (!raw) throw new Error("Empty response from cached matcher");
  const parsed = JSON.parse(raw) as CachedMatchOutput;

  const matches = candidates
    .map((c, i) => ({
      name: c.name,
      url: c.url ?? "",
      description: c.description,
      source: c.source,
      matchScore: parsed.scores[i] ?? 0,
    }))
    .filter((m) => m.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5)
    .map(sanitizeMatch);

  return { status: parsed.status, headline: parsed.headline, confidence: parsed.confidence, matches };
}

// ---------------------------------------------------------------------
// Stage 3b: cache miss — pay for a real live search, then cache results
// ---------------------------------------------------------------------

const LIVE_SEARCH_SYSTEM_PROMPT = `You are Priora's competitor search engine. You'll be given a founder's idea, already normalized into one clear sentence, and a set of category tags for it. You:

1. Use web search to look for real, currently-existing products or companies solving a similar problem. Check well-known Western startup sources (Crunchbase, Product Hunt, Y Combinator, G2) and African startup sources (Briter Bridges, Disrupt Africa, TechCabal, Techpoint Africa, WeeTracker) where relevant to the idea's market.
2. For each real result you find, score how closely it matches the idea, 0-100.
3. Decide an overall status:
   - "exists" if you found two or more strong matches (score 70+)
   - "partial_overlap" if you found something related but not a close match
   - "no_clear_match" if nothing meaningfully similar turned up
4. Write the headline as one plain sentence a non-technical founder would understand — no jargon, no hedging filler.

Only include matches you found real evidence for via search. Never invent a company, product, or URL. Cap matches at 5, ordered by matchScore descending. If status is "no_clear_match", matches must be an empty array.

For each match, also note when the search results make it reasonably clear (use null rather than guessing):
- region: "western", "african", or "global"
- country: the specific country it's based in or primarily serves
- pricing and fundingStage

Every field is rendered as plain text in the UI, not markdown — never include markdown links, citation brackets, or inline URLs in any field (the "url" field already carries that separately).

"source" must be a short label only, 1-3 words, naming where you found it — e.g. "Product Hunt", "Crunchbase", "Official website", "Google Play". Never put a description, a sentence, or a citation in "source".`;

const LIVE_SEARCH_SCHEMA = {
  type: "object" as const,
  properties: {
    status: { type: "string" as const, enum: ["exists", "partial_overlap", "no_clear_match"] },
    headline: { type: "string" as const },
    confidence: { type: "number" as const },
    matches: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
          url: { type: "string" as const },
          description: { type: "string" as const },
          source: { type: "string" as const },
          matchScore: { type: "number" as const },
          region: { type: ["string", "null"] as const, enum: ["western", "african", "global", null] },
          country: { type: ["string", "null"] as const },
          pricing: { type: ["string", "null"] as const },
          fundingStage: { type: ["string", "null"] as const },
        },
        required: [
          "name",
          "url",
          "description",
          "source",
          "matchScore",
          "region",
          "country",
          "pricing",
          "fundingStage",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["status", "headline", "confidence", "matches"],
  additionalProperties: false,
};

interface LiveMatch {
  name: string;
  url: string;
  description: string;
  source: string;
  matchScore: number;
  region: "western" | "african" | "global" | null;
  country: string | null;
  pricing: string | null;
  fundingStage: string | null;
}

interface LiveSearchOutput {
  status: VerdictStatus;
  headline: string;
  confidence: number;
  matches: LiveMatch[];
}

async function liveSearchAndMatch(
  normalizedIdea: string,
  categoryTags: string[],
): Promise<{ status: VerdictStatus; headline: string; confidence: number; matches: VerdictMatch[]; raw: LiveMatch[] }> {
  const client = getOpenAI();

  const response = await client.responses.create({
    model: VERDICT_MODEL,
    // "low" search context + "low" reasoning effort: this task is judging
    // search results against a short idea, not deep multi-step reasoning —
    // OpenAI's own guidance recommends "low" reasoning specifically for
    // tool-use/search tasks. Cuts latency without gutting quality.
    tools: [{ type: "web_search", search_context_size: "low" }],
    reasoning: { effort: "low" },
    input: [
      { role: "system", content: LIVE_SEARCH_SYSTEM_PROMPT },
      { role: "user", content: `Idea: ${normalizedIdea}\nCategory tags: ${categoryTags.join(", ")}` },
    ],
    text: {
      format: { type: "json_schema", name: "live_search", schema: LIVE_SEARCH_SCHEMA, strict: true },
    },
  });

  const raw = response.output_text;
  if (!raw) throw new Error("Empty response from live search");
  const parsed = JSON.parse(raw) as LiveSearchOutput;

  const matches = parsed.matches
    .map((m) => sanitizeMatch({ name: m.name, url: m.url, description: m.description, source: m.source, matchScore: m.matchScore }));

  return { status: parsed.status, headline: parsed.headline, confidence: parsed.confidence, matches, raw: parsed.matches };
}

// ---------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------

export async function runVerdictPipeline(rawIdea: string): Promise<VerdictResponse> {
  const normalized = await normalizeIdea(rawIdea);

  const cached = await findFreshCandidates(normalized.categoryTags, 10);

  let result: { status: VerdictStatus; headline: string; confidence: number; matches: VerdictMatch[] };

  if (cached.length >= MIN_CACHE_CANDIDATES) {
    result = await cachedMatch(normalized.normalizedIdea, cached);
  } else {
    const live = await liveSearchAndMatch(normalized.normalizedIdea, normalized.categoryTags);
    result = live;

    // Deeper research fields (business model, positioning, weaknesses,
    // etc.) are deliberately left unset here — that's Phase 3's Deep
    // Report Generator's job, which does 2-3 additional targeted passes.
    // This upsert only captures what a single low-context search pass
    // can reliably ground in real results.
    //
    // Awaited, not fire-and-forget: a serverless function can freeze or
    // get torn down the instant its response is sent, so a detached
    // promise here risks the cache write never actually completing.
    // Failure here shouldn't fail the request — the founder still gets
    // their verdict even if caching this round didn't work.
    try {
      await upsertCompanies(
        live.raw.map((m) => ({
          name: m.name,
          description: m.description,
          url: m.url || null,
          source: m.source,
          region: m.region ?? "global",
          country: m.country,
          categoryTags: normalized.categoryTags,
          pricing: m.pricing,
          fundingStage: m.fundingStage,
        })),
      );
    } catch (err) {
      console.error("company cache upsert failed:", err);
      lastUpsertError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    requestId: crypto.randomUUID(),
    idea: { raw: rawIdea, normalized: normalized.normalizedIdea },
    verdict: { status: result.status, headline: result.headline, confidence: result.confidence },
    matches: result.matches,
    generatedAt: new Date().toISOString(),
  };
}
