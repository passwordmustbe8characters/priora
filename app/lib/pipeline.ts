import { getOpenAI, VERDICT_MODEL } from "./openai";
import { findFreshCandidates, upsertCompanies, type UpsertResult } from "./db/companies";
import type { Company } from "./db/schema";
import { CATEGORY_TAXONOMY } from "./taxonomy";
import type { RegionScope, VerdictMatch, VerdictResponse, VerdictStatus } from "./verdict";

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
 *   3. cachedMatch, then (if it didn't already reach MAX_DISPLAY_MATCHES
 *      on its own) liveSearchAndMatch to backfill the rest
 *
 * Cache and live search are no longer an either/or choice made in one
 * request — see the "Orchestrator" section below (runCachePhase /
 * runLivePhase) for why this is now two client-driven phases instead
 * of one atomic call, and app/lib/useVerdictFlow.ts for the client
 * side of that sequencing.
 */

const MIN_CACHE_CANDIDATES = 3;
// Cache retrieval (findFreshCandidates) is a coarse tag-overlap filter,
// not a relevance judgment — the model must score every candidate it's
// handed, so a genuinely irrelevant one it correctly scores low would
// otherwise still show up as a "match" just for surviving retrieval.
// This is the actual relevance floor.
const MIN_CACHED_MATCH_SCORE = 30;
// The target total the free verdict aims to show whenever the live
// phase actually runs — the absolute cap on matches returned/merged,
// not the bar for whether live search fires at all (see
// CACHE_SUFFICIENT_MATCHES below for that).
const MAX_DISPLAY_MATCHES = 5;
// The bar for "the cache alone is a good enough answer, skip live
// search." Deliberately lower than MAX_DISPLAY_MATCHES — cost-tuned:
// with a very small OpenAI budget backing the public free tool, every
// live search costs real money (~$0.01+, dominated by the flat
// web_search tool fee) while a cache-only hit costs a small fraction of
// a cent. 3 solid matches is treated as a complete-enough answer; only
// below that does the live phase run to backfill up to
// MAX_DISPLAY_MATCHES. Raise this back toward MAX_DISPLAY_MATCHES once
// budget is less of a constraint — the trade-off is real (a category
// with exactly 3-4 cached matches won't get topped up to 5), not free.
const CACHE_SUFFICIENT_MATCHES = 3;

// ---------------------------------------------------------------------
// Stage 1: Idea Normalizer
// ---------------------------------------------------------------------

const NORMALIZE_SYSTEM_PROMPT = `You are Priora's idea normalizer. A founder gives you a raw, possibly rambling description of a startup idea. Extract a structured profile:

1. A clear one-sentence canonical restatement (the "normalized" idea).
2. 2-5 category tags for what kind of product this is, chosen ONLY from this fixed list — pick the closest matches, never invent a tag outside it: ${CATEGORY_TAXONOMY.join(", ")}. These are used to search a cache of previously-found companies by tag overlap, so sticking to this shared vocabulary (rather than a synonym like "financial services" instead of "fintech") is what actually makes that matching work.
3. The core problem being solved, in one sentence.
4. Who the target user is, in a few words.`;

// enum-constraining categoryTags (not just documenting the list in the
// prompt) is what actually guarantees canonical output — see
// app/lib/taxonomy.ts for why a shared vocabulary matters here.
const NORMALIZE_SCHEMA = {
  type: "object" as const,
  properties: {
    normalizedIdea: { type: "string" as const },
    categoryTags: {
      type: "array" as const,
      items: { type: "string" as const, enum: [...CATEGORY_TAXONOMY] },
    },
    coreProblem: { type: "string" as const },
    targetUser: { type: "string" as const },
  },
  required: ["normalizedIdea", "categoryTags", "coreProblem", "targetUser"],
  additionalProperties: false,
};

export interface NormalizeOutput {
  normalizedIdea: string;
  categoryTags: string[];
  coreProblem: string;
  targetUser: string;
}

// Exported — Phase 3's Deep Report Generator needs this as a standalone,
// reusable stage (see priora-phase3-spec-for-claude-code.md, Deep Report
// Trigger's explicit dependency note), not just wired into the free
// verdict route.
export async function normalizeIdea(rawIdea: string): Promise<NormalizeOutput> {
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
// Exported — the same discipline applies to any model-generated text
// field in Phase 3's deep report, not just free-verdict matches.
export function stripMarkdownLinks(text: string): string {
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

Write the headline as one plain sentence a non-technical founder would understand — no jargon, no hedging filler. Return a score for every candidate you were given, in the same order.

Also write two one-sentence teasers, addressed directly to the reader as "you"/"your" — a free, lightweight preview of the paid report's deeper bull/bear case, not the full case itself:
- bullTeaser: the single strongest honest reason this could still be worth pursuing, given the candidates above (thin or weak competition is a legitimate reason; don't invent one if the data doesn't support it).
- bearTeaser: the single strongest honest reason to pause and reconsider, given the candidates above.
Base both ONLY on the candidates and scores you just produced — never introduce a new company or fact. Don't soften either sentence to seem balanced; each should stand as the strongest honest one-liner for its side.`;

const CACHED_MATCH_SCHEMA = {
  type: "object" as const,
  properties: {
    status: { type: "string" as const, enum: ["exists", "partial_overlap", "no_clear_match"] },
    headline: { type: "string" as const },
    confidence: { type: "number" as const },
    scores: { type: "array" as const, items: { type: "number" as const } },
    bullTeaser: { type: "string" as const },
    bearTeaser: { type: "string" as const },
  },
  required: ["status", "headline", "confidence", "scores", "bullTeaser", "bearTeaser"],
  additionalProperties: false,
};

interface CachedMatchOutput {
  status: VerdictStatus;
  headline: string;
  confidence: number;
  scores: number[];
  bullTeaser: string;
  bearTeaser: string;
}

// Doesn't change the judgment logic — candidates are already scope-
// filtered by findFreshCandidates before this runs — but naming the
// scope in the prompt gets a more honestly-worded headline/teaser out
// of the model (e.g. "no close match in the African market" instead of
// a generic sentence that reads as if the whole world was searched).
function scopeNote(regionScope: RegionScope): string {
  if (regionScope === "africa") return " (The founder only cares about the African market.)";
  if (regionScope === "western") return " (The founder only cares about the Western/US-Europe market.)";
  return "";
}

async function cachedMatch(
  normalizedIdea: string,
  candidates: Company[],
  regionScope: RegionScope = null,
): Promise<{
  status: VerdictStatus;
  headline: string;
  confidence: number;
  matches: VerdictMatch[];
  bullTeaser: string | null;
  bearTeaser: string | null;
}> {
  const client = getOpenAI();
  const candidateList = candidates
    .map((c, i) => `${i + 1}. ${c.name} — ${c.description}`)
    .join("\n");

  const response = await client.responses.create({
    model: VERDICT_MODEL,
    reasoning: { effort: "low" },
    input: [
      { role: "system", content: CACHED_MATCH_SYSTEM_PROMPT },
      { role: "user", content: `Idea: ${normalizedIdea}${scopeNote(regionScope)}\n\nCandidates:\n${candidateList}` },
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
    .filter((m) => m.matchScore >= MIN_CACHED_MATCH_SCORE)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, MAX_DISPLAY_MATCHES)
    .map(sanitizeMatch);

  return {
    status: parsed.status,
    headline: parsed.headline,
    confidence: parsed.confidence,
    matches,
    // trim() -> null rather than trusting an empty string through to the
    // UI as a rendered-but-blank teaser box.
    bullTeaser: parsed.bullTeaser?.trim() || null,
    bearTeaser: parsed.bearTeaser?.trim() || null,
  };
}

// ---------------------------------------------------------------------
// Stage 3b: cache miss — pay for a real live search, then cache results
// ---------------------------------------------------------------------

const LIVE_SEARCH_SYSTEM_PROMPT = `You are Priora's competitor search engine. You'll be given a founder's idea, already normalized into one clear sentence, and a set of category tags for it. You may also be given a list of "Already-confirmed matches" found in an earlier pass and already shown to the founder — if so, treat every one of them as real and settled: never drop, contradict, or re-litigate them. Your job in that case is to find ADDITIONAL real competitors beyond that list, then judge the overall status/headline/teasers on the COMBINED picture (the given matches plus whatever new ones you find), not just on what's new. If no such list is given, judge the idea from scratch as normal. You:

1. Use web search to look for real, currently-existing products or companies solving a similar problem — across multiple distinct query angles in this same pass, not just one search on the idea's own wording. Try the core problem/action in plain terms, try it with the target market or region named explicitly (e.g. adding "Nigeria" or "Africa" for a locally-focused idea), and try any obvious close synonyms for the product category — a niche or locally-specific idea often has real competitors that only surface under a differently-worded query, not the founder's own phrasing. Check well-known Western startup sources (Crunchbase, Product Hunt, Y Combinator, G2) and African startup sources (Briter Bridges, Disrupt Africa, TechCabal, Techpoint Africa, WeeTracker) where relevant to the idea's market, as well as app stores (Google Play, Apple App Store) for consumer-facing ideas — a real competitor with no press coverage still shows up there.
2. For each real result you find, score how closely it matches the idea, 0-100.
3. Decide an overall status, over the combined picture described above:
   - "exists" if two or more matches (combined) score 70+
   - "partial_overlap" if something scores as related but not a close match
   - "no_clear_match" if nothing meaningfully similar turned up
4. Write the headline as one plain sentence a non-technical founder would understand — no jargon, no hedging filler.
5. Also write two one-sentence teasers, addressed directly to the reader as "you"/"your" — a free, lightweight preview of the paid report's deeper bull/bear case, not the full case itself:
   - bullTeaser: the single strongest honest reason this could still be worth pursuing, given what you found (thin or weak competition is a legitimate reason; don't invent one if the data doesn't support it).
   - bearTeaser: the single strongest honest reason to pause and reconsider, given what you found.
   Base both ONLY on the combined picture above — never introduce a new company or fact just for the teaser. Don't soften either sentence to seem balanced; each should stand as the strongest honest one-liner for its side.

Only include matches you found real evidence for via search (plus any already-confirmed matches you were given). Never invent a company, product, or URL. Your returned "matches" array must include the already-confirmed ones (unchanged) plus whatever new ones you found, combined, capped at ${MAX_DISPLAY_MATCHES}, ordered by matchScore descending. If status is "no_clear_match", matches must be an empty array.

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
    bullTeaser: { type: "string" as const },
    bearTeaser: { type: "string" as const },
  },
  required: ["status", "headline", "confidence", "matches", "bullTeaser", "bearTeaser"],
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
  bullTeaser: string;
  bearTeaser: string;
}

// Deterministic, not model-trusted — the same categorical rule every
// prompt in this file already states in English, computed in code so
// the badge/status can never drift out of sync with the actual merged
// match list (see mergeMatches below — the model's own "status" is a
// judgment call made without necessarily re-deriving it correctly once
// existing + newly-found matches are combined).
function deriveStatus(matches: VerdictMatch[]): VerdictStatus {
  if (matches.filter((m) => m.matchScore >= 70).length >= 2) return "exists";
  if (matches.length > 0) return "partial_overlap";
  return "no_clear_match";
}

// Guarantees an already-shown match can never silently vanish or change
// underneath the founder once the live phase resolves — `existing`
// entries always win on name collision, keeping their original
// url/description/score exactly as already displayed; only genuinely
// new names get appended. Case-insensitive on name since that's the
// only stable identifier cache-sourced matches and live-search matches
// reliably share (urls can differ — a tracked domain vs. an app-store
// listing for the same company, for instance).
function mergeMatches(existing: VerdictMatch[], found: VerdictMatch[]): VerdictMatch[] {
  const byName = new Map<string, VerdictMatch>();
  for (const m of existing) byName.set(m.name.trim().toLowerCase(), m);
  for (const m of found) {
    const key = m.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, m);
  }
  return [...byName.values()].sort((a, b) => b.matchScore - a.matchScore).slice(0, MAX_DISPLAY_MATCHES);
}

// Appended to LIVE_SEARCH_SYSTEM_PROMPT, not baked into the constant
// itself — most searches run unscoped ("all round"), so the base prompt
// stays the honest default and this only tacks on a restriction when the
// founder actually asked for one via the search bar's region toggle.
function scopeClause(regionScope: RegionScope): string {
  if (regionScope === "africa") {
    return "\n\nSearch scope: the founder only cares about the African market. Only search for and include competitors based in or primarily serving Africa — ignore ones that only serve Western/other markets with no real African presence. If genuinely nothing turns up for Africa specifically, say so honestly (a low-match/no_clear_match verdict) rather than reporting an unrelated non-African competitor just to have a match.";
  }
  if (regionScope === "western") {
    return "\n\nSearch scope: the founder only cares about the Western (US/Europe) market. Only search for and include competitors based in or primarily serving the US/Europe — ignore ones that only serve African/other regional markets with no real Western presence. If genuinely nothing turns up for the Western market specifically, say so honestly (a low-match/no_clear_match verdict) rather than reporting an unrelated non-Western competitor just to have a match.";
  }
  return "";
}

async function liveSearchAndMatch(
  normalizedIdea: string,
  categoryTags: string[],
  existingMatches: VerdictMatch[] = [],
  regionScope: RegionScope = null,
): Promise<{
  status: VerdictStatus;
  headline: string;
  confidence: number;
  matches: VerdictMatch[];
  raw: LiveMatch[];
  bullTeaser: string | null;
  bearTeaser: string | null;
}> {
  const client = getOpenAI();

  const existingBlock = existingMatches.length
    ? `\n\nAlready-confirmed matches from an earlier pass (keep these in your final matches list; find additional real competitors beyond them):\n${existingMatches.map((m, i) => `${i + 1}. ${m.name} — ${m.description}`).join("\n")}`
    : "";

  const response = await client.responses.create({
    model: VERDICT_MODEL,
    // "medium" search context (not "low") — this is the free tool's ONLY
    // search pass (no deeper follow-up the way the paid deep report gets),
    // so it needs enough room to actually run the multi-angle search the
    // prompt above asks for. "low" was confirmed live to under-search:
    // real, findable competitors for niche/locally-specific ideas (e.g. a
    // Nigeria-specific WhatsApp inventory tool) came back with zero
    // matches on "low" context, then turned up several real ones minutes
    // later when the same idea went through the deep report's "medium"-
    // context research call. Reasoning effort stays "low" — OpenAI's own
    // guidance recommends that specifically for tool-use/search tasks, and
    // the gap here was breadth of search, not depth of reasoning over it.
    tools: [{ type: "web_search", search_context_size: "medium" }],
    reasoning: { effort: "low" },
    input: [
      { role: "system", content: LIVE_SEARCH_SYSTEM_PROMPT + scopeClause(regionScope) },
      { role: "user", content: `Idea: ${normalizedIdea}\nCategory tags: ${categoryTags.join(", ")}${existingBlock}` },
    ],
    text: {
      format: { type: "json_schema", name: "live_search", schema: LIVE_SEARCH_SCHEMA, strict: true },
    },
  });

  const raw = response.output_text;
  if (!raw) throw new Error("Empty response from live search");
  const parsed = JSON.parse(raw) as LiveSearchOutput;

  const found = parsed.matches
    .map((m) => sanitizeMatch({ name: m.name, url: m.url, description: m.description, source: m.source, matchScore: m.matchScore }));
  // Merged in code, not just trusted from the model's own returned list
  // — see mergeMatches' doc comment above.
  const matches = mergeMatches(existingMatches, found);

  return {
    status: deriveStatus(matches),
    headline: parsed.headline,
    confidence: parsed.confidence,
    matches,
    raw: parsed.matches,
    bullTeaser: parsed.bullTeaser?.trim() || null,
    bearTeaser: parsed.bearTeaser?.trim() || null,
  };
}

// ---------------------------------------------------------------------
// Orchestrator — two client-driven phases, not one atomic call
// ---------------------------------------------------------------------
//
// Cache-then-live used to be an either/or choice made entirely inside
// one request: enough fresh cache candidates meant live search never
// ran at all; not enough meant the cache was discarded and live search
// ran alone. That kept cost down but meant the founder waited through
// a full live search (or a wrong/incomplete cache result) before
// seeing anything.
//
// Now it's two separate calls the CLIENT drives, same "client-poll-
// triggered stage" pattern this codebase already uses for the paid
// report's multi-stage pipeline (see report/orchestrate.ts) rather
// than a server-side background job or a streaming response — it's a
// pattern already proven here, not a new one:
//
//   1. runCachePhase — fast, no search. Returns whatever the cache
//      scores as real matches (0 to MAX_DISPLAY_MATCHES) instantly, so
//      the UI can render real match cards the moment this resolves.
//   2. runLivePhase — only called by the client when phase 1 says
//      needsLiveSearch (cache didn't already reach MAX_DISPLAY_MATCHES
//      on its own). Runs a live search to backfill the REMAINING
//      slots — never to replace what phase 1 already showed, see
//      mergeMatches above — and returns the final, complete answer.
//
// See app/api/verdict/route.ts (phase 1) and
// app/api/verdict/live/route.ts (phase 2) for the HTTP side of this,
// and app/lib/useVerdictFlow.ts for how the client sequences them.

export interface CachePhaseResult {
  requestId: string;
  idea: { raw: string; normalized: string };
  categoryTags: string[];
  status: VerdictStatus;
  headline: string;
  confidence: number;
  matches: VerdictMatch[];
  bullTeaser: string | null;
  bearTeaser: string | null;
  // True whenever matches.length < CACHE_SUFFICIENT_MATCHES — the
  // client's signal to run the live phase next. When true AND matches
  // is empty, status/headline/confidence below are inert placeholders
  // (there was nothing to judge yet), not a real "no match" verdict —
  // the caller must gate on this flag, not read those fields literally,
  // until the live phase resolves.
  needsLiveSearch: boolean;
}

export async function runCachePhase(rawIdea: string, regionScope: RegionScope = null): Promise<CachePhaseResult> {
  const normalized = await normalizeIdea(rawIdea);
  const cached = await findFreshCandidates(normalized.categoryTags, 10, regionScope);

  const base = { requestId: crypto.randomUUID(), idea: { raw: rawIdea, normalized: normalized.normalizedIdea }, categoryTags: normalized.categoryTags };

  if (cached.length < MIN_CACHE_CANDIDATES) {
    return {
      ...base,
      status: "no_clear_match",
      headline: "",
      confidence: 0,
      matches: [],
      bullTeaser: null,
      bearTeaser: null,
      needsLiveSearch: true,
    };
  }

  const cacheResult = await cachedMatch(normalized.normalizedIdea, cached, regionScope);
  return {
    ...base,
    status: cacheResult.status,
    headline: cacheResult.headline,
    confidence: cacheResult.confidence,
    matches: cacheResult.matches,
    bullTeaser: cacheResult.bullTeaser,
    bearTeaser: cacheResult.bearTeaser,
    needsLiveSearch: cacheResult.matches.length < CACHE_SUFFICIENT_MATCHES,
  };
}

export interface LivePhaseInput {
  ideaRaw: string;
  normalizedIdea: string;
  categoryTags: string[];
  // Whatever runCachePhase already found and the client already
  // rendered — always kept as-is in the final result, see
  // mergeMatches. Empty when the cache had nothing at all.
  existingMatches: VerdictMatch[];
  // Same toggle runCachePhase already applied to the cache lookup —
  // passed again here so the live search backfill honors the same
  // scope instead of quietly widening it back out. See scopeClause
  // above for exactly what it does to the search itself.
  regionScope?: RegionScope;
}

export async function runLivePhase(input: LivePhaseInput, debug?: { upsertResult?: UpsertResult }): Promise<VerdictResponse> {
  const live = await liveSearchAndMatch(
    input.normalizedIdea,
    input.categoryTags,
    input.existingMatches,
    input.regionScope ?? null,
  );

  // Deeper research fields (business model, positioning, weaknesses,
  // etc.) are deliberately left unset here — that's Phase 3's Deep
  // Report Generator's job, which does 2-3 additional targeted passes.
  // This upsert only captures what a single medium-context search pass
  // can reliably ground in real results, and only the genuinely NEW
  // companies this call found (live.raw) — existingMatches came from
  // the cache and are already in the DB.
  //
  // Awaited, not fire-and-forget: a serverless function can freeze or
  // get torn down the instant its response is sent, so a detached
  // promise here risks the cache write never actually completing.
  // Reports back via `debug` rather than throwing — a cache-write
  // failure shouldn't fail the request; the founder still gets their
  // verdict even if caching this round didn't work.
  const upsertResult = await upsertCompanies(
    live.raw.map((m) => ({
      name: m.name,
      description: m.description,
      url: m.url || null,
      source: m.source,
      region: m.region ?? "global",
      country: m.country,
      categoryTags: input.categoryTags,
      pricing: m.pricing,
      fundingStage: m.fundingStage,
    })),
  );
  if (upsertResult.failed > 0) {
    console.error("company cache upsert had failures:", upsertResult.errors);
  }
  if (debug) debug.upsertResult = upsertResult;

  return {
    requestId: crypto.randomUUID(),
    idea: { raw: input.ideaRaw, normalized: input.normalizedIdea },
    verdict: { status: live.status, headline: live.headline, confidence: live.confidence },
    matches: live.matches,
    bullTeaser: live.bullTeaser,
    bearTeaser: live.bearTeaser,
    generatedAt: new Date().toISOString(),
  };
}
