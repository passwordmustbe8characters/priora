/**
 * Phase 2 — Category Tagging System. The single canonical vocabulary
 * every `categoryTags` value in the system is supposed to draw from —
 * founder ideas (via normalizeIdea in pipeline.ts) and ingested
 * companies (via category-tagging.ts) alike.
 *
 * Why this exists: before this, categoryTags were whatever a given LLM
 * call or ingestion source felt like writing — "fintech" from one path,
 * "financial services" from another, "digital banking" from a third.
 * findFreshCandidates() matches on tag *overlap*, so inconsistent
 * vocabulary silently broke caching — a company correctly tagged
 * "financial services" would never be found for an idea normalized to
 * "fintech", even though they mean the same thing. A closed, shared
 * taxonomy is the fix.
 *
 * Deliberately a flat list, not a hierarchy — hierarchies solve a
 * different problem (browsing/rollups) than this one (exact-match
 * overlap scoring), and add complexity findFreshCandidates' simple
 * unnest/count query doesn't need.
 *
 * Mix of industry verticals and cross-cutting business-model/audience
 * tags on purpose — a company is usually described by 2-4 tags drawn
 * from both groups together (e.g. ["fintech", "payments", "b2b"]),
 * which is also why MIN_SHARED_TAGS=2 in db/companies.ts works: a
 * single generic tag like "b2b" or "marketplace" alone is too common to
 * mean much, but two tags together narrow it down meaningfully.
 */
export const CATEGORY_TAXONOMY = [
  // Fintech & money
  "fintech",
  "payments",
  "banking",
  "lending",
  "insurtech",
  "wealthtech",
  "remittances",
  "crypto",
  "web3",

  // Health
  "healthtech",
  "healthcare",
  "telehealth",
  "biotech",
  "medtech",
  "mental-health",
  "femtech",
  "fitness",
  "wellness",

  // Education
  "edtech",
  "education",

  // Commerce & retail
  "e-commerce",
  "marketplace",
  "retail",
  "fashion",
  "beauty",
  "consumer-goods",

  // Food & agriculture
  "foodtech",
  "agritech",
  "restaurant-tech",
  "grocery-delivery",

  // Mobility & logistics
  "mobility",
  "transportation",
  "ride-hailing",
  "logistics",
  "supply-chain",
  "delivery",
  "freight",

  // Real estate & construction
  "proptech",
  "real-estate",
  "construction",

  // Work & productivity
  "hrtech",
  "recruiting",
  "productivity",
  "collaboration",
  "remote-work",

  // Enterprise & developer tools
  "saas",
  "devtools",
  "cybersecurity",
  "data-infrastructure",
  "cloud-infrastructure",
  "api-infrastructure",

  // AI & data
  "ai",
  "machine-learning",
  "computer-vision",
  "nlp",
  "data-analytics",

  // Marketing & media
  "martech",
  "adtech",
  "media",
  "entertainment",
  "streaming",
  "gaming",
  "social",
  "creator-economy",
  "publishing",

  // Communication
  "communication",
  "messaging",

  // Travel & hospitality
  "travel",
  "hospitality",
  "events",

  // Energy & climate
  "cleantech",
  "climate",
  "energy",
  "sustainability",

  // Industrial & hardware
  "manufacturing",
  "industrials",
  "robotics",
  "hardware",
  "iot",
  "aerospace",
  "defense",

  // Legal, government, nonprofit
  "legaltech",
  "govtech",
  "civic-tech",
  "nonprofit",

  // Cross-cutting business model / audience
  "b2b",
  "b2c",
  "b2b2c",
  "enterprise",
  "smb",
  "consumer",
] as const;

export type CategoryTag = (typeof CATEGORY_TAXONOMY)[number];

const TAXONOMY_SET: ReadonlySet<string> = new Set(CATEGORY_TAXONOMY);

export function isCanonicalTag(tag: string): tag is CategoryTag {
  return TAXONOMY_SET.has(tag);
}
