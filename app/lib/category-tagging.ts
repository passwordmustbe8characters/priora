import { getOpenAI, VERDICT_MODEL } from "./openai";
import { CATEGORY_TAXONOMY, isCanonicalTag } from "./taxonomy";

/**
 * Maps ingestion sources' own raw tags/topics/genres onto the shared
 * CATEGORY_TAXONOMY (see app/lib/taxonomy.ts). Unlike normalizeIdea in
 * pipeline.ts (a single LLM call we can enum-constrain directly),
 * ingestion connectors mostly aren't LLM calls at all — YC's
 * `industries`, Product Hunt's topics, and iTunes' genre names are each
 * that source's own vocabulary, passed through as-is by the connector.
 * This is the layer that reconciles all of that onto one vocabulary.
 *
 * Two-tier resolution: an exact/dictionary match is free; anything left
 * over goes through ONE batched LLM call for the whole ingestion run,
 * not one per company — the same raw tags repeat heavily within a
 * single run (YC's own industry vocabulary alone is reused across
 * thousands of companies), so resolving each *distinct* raw tag once
 * is what keeps this cheap.
 */

// Seeded from real raw tag values observed during live testing (YC,
// Product Hunt, iTunes/App Store) — extend as new sources surface new
// phrasings the dictionary doesn't already cover.
const SYNONYMS: Record<string, string[]> = {
  // YC
  "artificial intelligence": ["ai"],
  "ai assistant": ["ai"],
  "reinforcement learning": ["machine-learning"],
  "data labeling": ["data-analytics"],
  "hard tech": ["industrials"],
  drones: ["industrials"],
  "health tech": ["healthtech"],
  "digital health": ["healthtech"],
  "primary care": ["healthcare"],
  "travel, leisure and tourism": ["travel"],
  aiops: ["ai", "devtools"],
  "consumer electronics": ["hardware", "consumer"],
  semiconductors: ["hardware"],

  // Product Hunt
  notes: ["productivity"],
  meetings: ["productivity", "communication"],
  calendar: ["productivity"],
  "developer tools": ["devtools"],
  advertising: ["adtech"],
  "social media marketing": ["martech"],
  "software engineering": ["devtools"],
  sales: ["martech"],
  marketing: ["martech"],
  "open source": ["devtools"],
  seo: ["martech"],

  // iTunes / App Store genres
  finance: ["fintech"],
  business: ["b2b"],
  utilities: ["productivity"],
  shopping: ["e-commerce"],
  "food & drink": ["foodtech"],
  "health & fitness": ["fitness"],
  lifestyle: ["consumer"],
  "social networking": ["social"],
  medical: ["healthcare"],
  news: ["media"],
  reference: ["education"],
  music: ["entertainment"],
  "photo & video": ["media"],
  sports: ["fitness"],
  navigation: ["mobility"],
  books: ["education"],
  "magazines & newspapers": ["media"],
  "graphics & design": ["devtools"],

  // common generic variants
  "financial services": ["fintech"],
  "digital banking": ["fintech", "banking"],
  "money transfer": ["remittances"],
  "online store": ["e-commerce"],
  "delivery service": ["delivery"],
};

const MAP_SYSTEM_PROMPT = `You map raw category/topic tags from various data sources onto a fixed taxonomy. You'll get a numbered list of raw tags. For EACH one, return its index and the 1-2 closest canonical tags from this list, or an empty array if nothing genuinely fits — never force a bad match:

${CATEGORY_TAXONOMY.join(", ")}`;

const MAP_SCHEMA = {
  type: "object" as const,
  properties: {
    mappings: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          index: { type: "number" as const },
          canonicalTags: {
            type: "array" as const,
            items: { type: "string" as const, enum: [...CATEGORY_TAXONOMY] },
          },
        },
        required: ["index", "canonicalTags"],
        additionalProperties: false,
      },
    },
  },
  required: ["mappings"],
  additionalProperties: false,
};

// Indexed rather than asking the model to echo the raw tag string back
// — avoids depending on exact-string round-tripping through the model.
async function resolveViaLlm(rawTags: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (rawTags.length === 0) return result;

  const client = getOpenAI();
  const numbered = rawTags.map((t, i) => `${i}. ${t}`).join("\n");

  let raw: string | null;
  try {
    const response = await client.responses.create({
      model: VERDICT_MODEL,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: MAP_SYSTEM_PROMPT },
        { role: "user", content: numbered },
      ],
      text: { format: { type: "json_schema", name: "map_tags", schema: MAP_SCHEMA, strict: true } },
    });
    raw = response.output_text;
  } catch (err) {
    console.error("category tag mapping failed:", err);
    return result; // best-effort — unresolved tags just get dropped, not fatal to ingestion
  }
  if (!raw) return result;

  const parsed = JSON.parse(raw) as { mappings: { index: number; canonicalTags: string[] }[] };
  for (const m of parsed.mappings) {
    const rawTag = rawTags[m.index];
    if (rawTag) result.set(rawTag.toLowerCase().trim(), m.canonicalTags);
  }
  return result;
}

/** Resolves a batch of raw (possibly non-canonical) tag arrays to the
 * shared taxonomy in one pass — pass every ingested row's tags through
 * this together (see ingestion/index.ts) rather than calling it per
 * row, so repeated raw tags only ever hit the LLM fallback once. */
export async function normalizeCategoryTags(tagSets: string[][]): Promise<string[][]> {
  const resolved = new Map<string, string[]>();
  const unresolved = new Set<string>();

  for (const tags of tagSets) {
    for (const raw of tags) {
      const key = raw.toLowerCase().trim();
      if (!key || resolved.has(key)) continue;
      if (isCanonicalTag(key)) {
        resolved.set(key, [key]);
      } else if (SYNONYMS[key]) {
        resolved.set(key, SYNONYMS[key]);
      } else {
        unresolved.add(key);
      }
    }
  }

  if (unresolved.size > 0) {
    const llmResolved = await resolveViaLlm([...unresolved]);
    for (const [key, tags] of llmResolved) resolved.set(key, tags);
  }

  return tagSets.map((tags) => {
    const out = new Set<string>();
    for (const raw of tags) {
      const key = raw.toLowerCase().trim();
      for (const canon of resolved.get(key) ?? []) out.add(canon);
    }
    return [...out].slice(0, 8);
  });
}
