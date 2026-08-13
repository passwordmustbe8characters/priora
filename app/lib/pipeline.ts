import { getOpenAI, VERDICT_MODEL } from "./openai";
import type { VerdictMatch, VerdictResponse, VerdictStatus } from "./verdict";

/**
 * Real Phase 1 backend pipeline (see docs/api-contract.md for the pipeline
 * diagram). Idea Normalizer, Candidate Retrieval, and Relevance Matcher
 * collapse into one Responses API call — the model normalizes the idea,
 * searches the web via the hosted web_search tool, and scores what it
 * finds, all in one pass. Free Verdict Assembly is the thin wrapper here
 * that adds requestId/generatedAt and hands back the contract shape.
 */

const SYSTEM_PROMPT = `You are Priora's idea-validation engine. A founder gives you a raw, possibly rambling description of a startup idea. You:

1. Restate it as one clear, canonical sentence (the "normalized" idea).
2. Use web search to look for real, currently-existing products or companies solving a similar problem. Check well-known Western startup sources (Crunchbase, Product Hunt, Y Combinator, G2) and African startup sources (Briter Bridges, Disrupt Africa, TechCabal, Techpoint Africa, WeeTracker) where relevant to the idea's market.
3. For each real result you find, score how closely it matches the idea, 0-100.
4. Decide an overall status:
   - "exists" if you found two or more strong matches (score 70+)
   - "partial_overlap" if you found something related but not a close match
   - "no_clear_match" if nothing meaningfully similar turned up
5. Write the headline as one plain sentence a non-technical founder would understand — no jargon, no hedging filler.

Only include matches you found real evidence for via search. Never invent a company, product, or URL. Cap matches at 5, ordered by matchScore descending. If status is "no_clear_match", matches must be an empty array.

Every field is rendered as plain text in the UI, not markdown — never include markdown links, citation brackets, or inline URLs in any field (the "url" field already carries that separately).

"source" must be a short label only, 1-3 words, naming where you found it — e.g. "Product Hunt", "Crunchbase", "Official website", "Google Play". Never put a description, a sentence, or a citation in "source".`;

const RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    normalizedIdea: { type: "string" as const },
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
        },
        required: ["name", "url", "description", "source", "matchScore"],
        additionalProperties: false,
      },
    },
  },
  required: ["normalizedIdea", "status", "headline", "confidence", "matches"],
  additionalProperties: false,
};

interface PipelineOutput {
  normalizedIdea: string;
  status: VerdictStatus;
  headline: string;
  confidence: number;
  matches: VerdictMatch[];
}

// Belt-and-suspenders: the prompt tells the model to keep these fields
// plain-text, but LLM output isn't guaranteed — strip markdown-link
// citations and cap "source" length so one non-compliant response can't
// break the match-row layout (this is what actually happened once: the
// model put a full citation into "source" instead of "description").
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

export async function runVerdictPipeline(rawIdea: string): Promise<VerdictResponse> {
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
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: rawIdea },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "verdict",
        schema: RESPONSE_SCHEMA,
        strict: true,
      },
    },
  });

  const raw = response.output_text;
  if (!raw) {
    throw new Error("Empty response from model");
  }

  const parsed = JSON.parse(raw) as PipelineOutput;

  return {
    requestId: crypto.randomUUID(),
    idea: { raw: rawIdea, normalized: parsed.normalizedIdea },
    verdict: {
      status: parsed.status,
      headline: parsed.headline,
      confidence: parsed.confidence,
    },
    matches: parsed.matches.map(sanitizeMatch),
    generatedAt: new Date().toISOString(),
  };
}
