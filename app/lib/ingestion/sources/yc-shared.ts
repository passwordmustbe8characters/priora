// Shared by both yc.ts (Western) and yc-africa.ts (African) — same
// underlying open dataset, split by region so a single run doesn't
// double-fetch the ~10MB file if both connectors are requested together.

export interface YcCompany {
  name: string;
  website?: string | null;
  url?: string | null;
  long_description?: string | null;
  one_liner?: string | null;
  all_locations?: string | null;
  industries?: string[] | null;
  tags?: string[] | null;
  regions?: string[] | null;
  stage?: string | null;
  status?: string | null;
  launched_at?: number | null; // unix seconds
}

const YC_ALL_COMPANIES_URL = "https://yc-oss.github.io/api/companies/all.json";
const CACHE_TTL_MS = 5 * 60 * 1000; // just to dedupe within a burst of calls in the same process, not a real cache

let cache: { data: YcCompany[]; fetchedAt: number } | null = null;

export async function fetchYcDataset(): Promise<YcCompany[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  const res = await fetch(YC_ALL_COMPANIES_URL);
  if (!res.ok) throw new Error(`YC directory fetch failed: ${res.status}`);
  const data = (await res.json()) as YcCompany[];
  cache = { data, fetchedAt: Date.now() };
  return data;
}

// "San Francisco, CA, USA; Redwood City, CA, USA" -> "USA" — a rough
// best-effort guess from the first listed location, not authoritative.
export function deriveCountry(allLocations?: string | null): string | null {
  if (!allLocations) return null;
  const first = allLocations.split(";")[0]?.trim();
  if (!first) return null;
  const parts = first.split(",").map((p) => p.trim());
  return parts[parts.length - 1] || null;
}

export function buildTags(c: YcCompany): string[] {
  const combined = [...(c.industries ?? []), ...(c.tags ?? [])].map((t) => t.toLowerCase().trim()).filter(Boolean);
  return Array.from(new Set(combined)).slice(0, 8);
}

// Best-effort marker match against YC's own `regions` tags plus the raw
// location string — good enough to partition the dataset, not a precise
// geocoder.
const AFRICAN_MARKERS = [
  "africa",
  "nigeria",
  "kenya",
  "south africa",
  "ghana",
  "egypt",
  "morocco",
  "tunisia",
  "uganda",
  "tanzania",
  "rwanda",
  "senegal",
  "ivory coast",
  "côte d'ivoire",
  "ethiopia",
  "zambia",
  "zimbabwe",
  "botswana",
  "namibia",
  "cameroon",
  "algeria",
  "mozambique",
];

export function isAfricanCompany(c: YcCompany): boolean {
  const haystack = [...(c.regions ?? []), c.all_locations ?? ""].join(" ").toLowerCase();
  return AFRICAN_MARKERS.some((m) => haystack.includes(m));
}
