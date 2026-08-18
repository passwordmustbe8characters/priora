import type { IngestedCompany, SourceConnector } from "../types";

const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";

// Apple's official, free, ToS-compliant search endpoint — no key needed.
// There's no Google Play equivalent: the free options there are all
// unofficial scrapers of Play Store's internal endpoints, same ToS risk
// profile as the stubbed Crunchbase/G2/etc. connectors, so it's left out
// rather than built that way.
const AFRICAN_COUNTRY_CODES: Record<string, string> = {
  ng: "Nigeria",
  ke: "Kenya",
  za: "South Africa",
  gh: "Ghana",
  eg: "Egypt",
};

interface ItunesResult {
  trackName?: string;
  description?: string;
  trackViewUrl?: string;
  sellerUrl?: string;
  primaryGenreName?: string;
  genres?: string[];
}

export const appStoreConnector: SourceConnector = {
  id: "app-store",
  label: "App Store Search",
  available: true,

  async fetch({ limit = 100, filter }): Promise<IngestedCompany[]> {
    // Unlike YC/RSS, the App Store has no "browse everything" endpoint —
    // only term search, so this connector can't do anything meaningful
    // without a real search term (a category tag, "fintech", etc).
    if (!filter) {
      throw new Error('App Store Search requires a `filter` search term (e.g. "fintech", "delivery")');
    }

    const countries = Object.keys(AFRICAN_COUNTRY_CODES);
    const perCountry = Math.max(1, Math.ceil(limit / countries.length));
    const seen = new Set<string>();
    const out: IngestedCompany[] = [];

    for (const cc of countries) {
      const url = `${ITUNES_SEARCH_URL}?term=${encodeURIComponent(filter)}&country=${cc}&entity=software&limit=${perCountry}`;
      let res: Response;
      try {
        res = await fetch(url);
      } catch {
        continue; // best-effort per country — one network hiccup shouldn't kill the whole run
      }
      if (!res.ok) continue;

      const json = (await res.json()) as { results?: ItunesResult[] };
      for (const r of json.results ?? []) {
        if (!r.trackName || !r.trackViewUrl) continue;
        if (seen.has(r.trackViewUrl)) continue;
        seen.add(r.trackViewUrl);

        out.push({
          name: r.trackName,
          description: r.description?.slice(0, 2000) || r.primaryGenreName || "",
          url: r.sellerUrl || r.trackViewUrl,
          source: "App Store Search",
          region: "african" as const,
          country: AFRICAN_COUNTRY_CODES[cc],
          categoryTags: [r.primaryGenreName, ...(r.genres ?? [])]
            .filter((t): t is string => Boolean(t))
            .map((t) => t.toLowerCase())
            .slice(0, 6),
          yearFounded: null,
          companyStage: null,
          fundingStage: null,
        });
      }
    }

    return out.slice(0, limit);
  },
};
