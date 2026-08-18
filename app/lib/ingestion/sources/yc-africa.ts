import type { IngestedCompany, SourceConnector } from "../types";
import { buildTags, deriveCountry, fetchYcDataset, isAfricanCompany } from "./yc-shared";

/**
 * A partial, honest stand-in for "accelerator portfolios" — the spec
 * names a whole set of African accelerators (Flat6Labs, MEST, CcHub,
 * Techstars Lagos, etc.), each of which would need its own bespoke
 * scraper against a different site structure, with real ongoing
 * maintenance burden for uncertain payoff. Rather than build one and
 * pretend the item is covered, this reuses the YC dataset already
 * fetched by yc.ts and filters to YC's own African-founder companies —
 * YC is itself a major accelerator, so this is real accelerator-
 * portfolio data, just from one accelerator instead of the whole named
 * list. The rest of that list is a documented gap, not silently skipped.
 */
export const ycAfricaConnector: SourceConnector = {
  id: "yc-africa",
  label: "YC Directory (Africa)",
  available: true,

  async fetch({ limit = 200, filter }): Promise<IngestedCompany[]> {
    const all = await fetchYcDataset();
    const filterLower = filter?.toLowerCase();

    return all
      .filter((c) => c.status === "Active" && c.name && (c.long_description || c.one_liner))
      .filter(isAfricanCompany)
      .filter((c) => {
        if (!filterLower) return true;
        const haystack = [...(c.industries ?? []), ...(c.tags ?? [])].join(" ").toLowerCase();
        return haystack.includes(filterLower);
      })
      .sort((a, b) => (b.launched_at ?? 0) - (a.launched_at ?? 0))
      .slice(0, limit)
      .map((c) => ({
        name: c.name,
        description: c.long_description || c.one_liner || "",
        url: c.website || c.url || null,
        source: "YC Directory",
        region: "african" as const,
        country: deriveCountry(c.all_locations),
        categoryTags: buildTags(c),
        yearFounded: c.launched_at ? new Date(c.launched_at * 1000).getFullYear() : null,
        companyStage: c.stage || null,
        fundingStage: null,
      }));
  },
};
