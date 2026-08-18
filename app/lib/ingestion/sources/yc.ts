import type { IngestedCompany, SourceConnector } from "../types";

// No official YC API for bulk directory access — this is a community-
// maintained open mirror of YC's own public company-directory data,
// republished as static JSON on GitHub Pages. No key, no scraping.
const YC_ALL_COMPANIES_URL = "https://yc-oss.github.io/api/companies/all.json";

interface YcCompany {
  name: string;
  website?: string | null;
  url?: string | null;
  long_description?: string | null;
  one_liner?: string | null;
  all_locations?: string | null;
  industries?: string[] | null;
  tags?: string[] | null;
  stage?: string | null;
  status?: string | null;
  launched_at?: number | null; // unix seconds
}

// "San Francisco, CA, USA; Redwood City, CA, USA" -> "USA" — a rough
// best-effort guess from the first listed location, not authoritative.
function deriveCountry(allLocations?: string | null): string | null {
  if (!allLocations) return null;
  const first = allLocations.split(";")[0]?.trim();
  if (!first) return null;
  const parts = first.split(",").map((p) => p.trim());
  return parts[parts.length - 1] || null;
}

function buildTags(c: YcCompany): string[] {
  const combined = [...(c.industries ?? []), ...(c.tags ?? [])].map((t) => t.toLowerCase().trim()).filter(Boolean);
  return Array.from(new Set(combined)).slice(0, 8);
}

export const ycConnector: SourceConnector = {
  id: "yc",
  label: "YC Directory",
  available: true,

  async fetch({ limit = 200, filter }): Promise<IngestedCompany[]> {
    const res = await fetch(YC_ALL_COMPANIES_URL);
    if (!res.ok) throw new Error(`YC directory fetch failed: ${res.status}`);
    const all = (await res.json()) as YcCompany[];

    const filterLower = filter?.toLowerCase();

    return all
      .filter((c) => c.status === "Active" && c.name && (c.long_description || c.one_liner))
      .filter((c) => {
        if (!filterLower) return true;
        const haystack = [...(c.industries ?? []), ...(c.tags ?? [])].join(" ").toLowerCase();
        return haystack.includes(filterLower);
      })
      // Most recently launched first — more likely to reflect the
      // current startup landscape than an arbitrary dataset order.
      .sort((a, b) => (b.launched_at ?? 0) - (a.launched_at ?? 0))
      .slice(0, limit)
      .map((c) => ({
        name: c.name,
        description: c.long_description || c.one_liner || "",
        url: c.website || c.url || null,
        source: "YC Directory",
        region: "western" as const,
        country: deriveCountry(c.all_locations),
        categoryTags: buildTags(c),
        // launched_at is when they went through YC, not necessarily
        // founding year — close enough as a best-effort proxy.
        yearFounded: c.launched_at ? new Date(c.launched_at * 1000).getFullYear() : null,
        companyStage: c.stage || null,
        fundingStage: null,
      }));
  },
};
