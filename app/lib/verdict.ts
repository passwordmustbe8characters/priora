// Client-side types + fetch helper for the Core API Contract
// (see docs/api-contract.md). Mirrors the shape returned by
// app/api/verdict/route.ts exactly — update both together.

export type VerdictStatus = "exists" | "partial_overlap" | "no_clear_match";

/** The match-list cap everywhere in the UI — kept here (not just in
 * pipeline.ts, which is server-only) so client components can size
 * their "still loading more" skeleton placeholders without importing
 * server code. Must match pipeline.ts's own MAX_DISPLAY_MATCHES. */
export const MAX_DISPLAY_MATCHES = 5;

export interface VerdictMatch {
  name: string;
  url: string;
  description: string;
  source: string;
  matchScore: number;
}

export interface VerdictResponse {
  requestId: string;
  idea: { raw: string; normalized: string };
  verdict: { status: VerdictStatus; headline: string; confidence: number };
  matches: VerdictMatch[];
  // Free Verdict Teaser (Phase 3, Section 11's free-tier half) — one
  // honest sentence each for the case to proceed and the case to
  // reconsider, produced by the same Relevance Matcher call that
  // already scored `matches` (no extra search, no extra LLM call).
  // Null only for a verdict generated before this shipped, or if the
  // matcher's own response happened to omit them — never something the
  // frontend should treat as an error, just skip rendering the teaser.
  bullTeaser: string | null;
  bearTeaser: string | null;
  generatedAt: string;
  // Cache-then-live progressive search — present (true) only on the
  // instant cache-phase response from /api/verdict when it didn't
  // already reach the full match cap on its own; absent on any final
  // response (a plain cache hit that was already complete, an
  // in-memory idea-cache hit, or the live phase's own result). While
  // true, `verdict`/`matches` above may be incomplete — see
  // useVerdictFlow.ts for how the client treats this as "keep showing
  // what's here, then call submitIdeaLive next," not as an error.
  needsLiveSearch?: boolean;
  // Only present alongside needsLiveSearch: true — everything
  // submitIdeaLive needs to run the live phase without re-normalizing
  // the idea from scratch.
  categoryTags?: string[];
}

export class VerdictError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function submitIdea(idea: string): Promise<VerdictResponse> {
  let res: Response;
  try {
    res = await fetch("/api/verdict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea }),
    });
  } catch {
    throw new VerdictError("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.");
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new VerdictError("INTERNAL_ERROR", "Something went wrong reading the response.");
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } })?.error;
    throw new VerdictError(err?.code ?? "UNKNOWN", err?.message ?? "Something went wrong.");
  }

  return data as VerdictResponse;
}

/**
 * Phase 2 of the cache-then-live flow — called only when submitIdea's
 * response came back with needsLiveSearch: true. Sends back exactly
 * what the live phase needs (the already-normalized idea, its category
 * tags, and whatever matches are already confirmed/shown) so it never
 * has to re-run the idea normalizer or re-decide anything the cache
 * phase already settled.
 */
export async function submitIdeaLive(params: {
  ideaRaw: string;
  normalizedIdea: string;
  categoryTags: string[];
  existingMatches: VerdictMatch[];
}): Promise<VerdictResponse> {
  let res: Response;
  try {
    res = await fetch("/api/verdict/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    throw new VerdictError("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.");
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new VerdictError("INTERNAL_ERROR", "Something went wrong reading the response.");
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } })?.error;
    throw new VerdictError(err?.code ?? "UNKNOWN", err?.message ?? "Something went wrong.");
  }

  return data as VerdictResponse;
}
