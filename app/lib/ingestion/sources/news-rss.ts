import { XMLParser } from "fast-xml-parser";
import { getOpenAI, VERDICT_MODEL } from "../../openai";
import type { IngestedCompany, SourceConnector } from "../types";

/**
 * TechCabal and Techpoint Africa (and Disrupt Africa, WeeTracker, Briter
 * Bridges) have no free structured company-directory API — they're media
 * sites and/or paid intelligence platforms. What TechCabal and Techpoint
 * Africa DO have is a public RSS feed, which is legitimately free to
 * read (that's what syndication is for). Getting *companies* out of
 * *news articles* isn't a simple field mapping though — it needs an LLM
 * read of each article to decide "is this substantively about one real
 * company, and if so what is it" — reusing the same cheap structured-
 * output pattern the rest of the pipeline already uses.
 *
 * Real, known limitation: unlike YC/Product Hunt, articles often don't
 * name a clean canonical company URL, so many rows here end up with
 * url: null — which means upsertCompanies can't dedupe them by URL on a
 * repeat run (see its own doc comment: rows without a URL always insert
 * fresh). Repeated ingestion runs over the same articles will accumulate
 * duplicate rows for the same company until something better than
 * URL-based dedup exists (a natural fit for the later Category Tagging
 * System work, not this component).
 */

interface RssItem {
  title?: string;
  link?: string;
  description?: string;
  "content:encoded"?: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchFeedItems(feedUrl: string, limit: number): Promise<RssItem[]> {
  const res = await fetch(feedUrl, { headers: { "User-Agent": "PrioraIngestionBot/1.0 (+https://priora-chi.vercel.app/)" } });
  if (!res.ok) throw new Error(`RSS fetch failed for ${feedUrl}: ${res.status}`);
  const xml = await res.text();

  const parser = new XMLParser({ ignoreAttributes: true });
  const parsed = parser.parse(xml) as { rss?: { channel?: { item?: RssItem | RssItem[] } } };
  const rawItems = parsed.rss?.channel?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  return items.slice(0, limit);
}

const EXTRACT_SYSTEM_PROMPT = `You are Priora's news-to-company extractor. You'll get the title and a text snippet of one article from an African tech news publication. Decide whether the article is substantively ABOUT one specific real company or startup — not a passing mention, not generic industry commentary, not a "top N" listicle covering many companies at once.

If yes, also decide whether that company is itself African — headquartered in Africa, founded there, or specifically built for/operating in African markets. A global company that merely gets reviewed, compared, or mentioned by an African publication (e.g. a smartphone spec comparison, international market commentary) is NOT African-relevant even though the article is about it — this pipeline is building African market coverage, not indexing every company an African publication happens to write about.

Only when it's about one specific company AND that company is African-relevant: extract its name, a 1-2 sentence description of what it does (based only on what's stated in the article — never invent or assume details not present), 2-5 lowercase category tags, the country it's based in or primarily serves, and its own website URL only if the article actually names or clearly implies it (never guess or fabricate a URL — leave it null if unsure).

Otherwise (not about one company, or about a company that isn't African-relevant), set isAboutCompany to false and leave every other field null/empty.`;

const EXTRACT_SCHEMA = {
  type: "object" as const,
  properties: {
    isAboutCompany: { type: "boolean" as const },
    companyName: { type: ["string", "null"] as const },
    description: { type: ["string", "null"] as const },
    categoryTags: { type: "array" as const, items: { type: "string" as const } },
    country: { type: ["string", "null"] as const },
    websiteUrl: { type: ["string", "null"] as const },
  },
  required: ["isAboutCompany", "companyName", "description", "categoryTags", "country", "websiteUrl"],
  additionalProperties: false,
};

interface ExtractOutput {
  // True only when the article is about one specific company AND that
  // company is African-relevant — see the prompt. A global company
  // merely reviewed/mentioned by an African publication is neither.
  isAboutCompany: boolean;
  companyName: string | null;
  description: string | null;
  categoryTags: string[];
  country: string | null;
  websiteUrl: string | null;
}

async function extractCompanyFromArticle(title: string, bodySnippet: string): Promise<ExtractOutput | null> {
  const client = getOpenAI();
  const response = await client.responses.create({
    model: VERDICT_MODEL,
    reasoning: { effort: "low" },
    input: [
      { role: "system", content: EXTRACT_SYSTEM_PROMPT },
      { role: "user", content: `Title: ${title}\n\nArticle text:\n${bodySnippet.slice(0, 3000)}` },
    ],
    text: {
      format: { type: "json_schema", name: "extract_company", schema: EXTRACT_SCHEMA, strict: true },
    },
  });
  const raw = response.output_text;
  if (!raw) return null;
  return JSON.parse(raw) as ExtractOutput;
}

/** Builds a connector for one RSS-based African news source — TechCabal
 * and Techpoint Africa share this, only the feed URL and label differ. */
export function buildNewsRssConnector(id: string, label: string, feedUrl: string): SourceConnector {
  return {
    id,
    label,
    available: true,

    async fetch({ limit = 15 }): Promise<IngestedCompany[]> {
      const items = await fetchFeedItems(feedUrl, limit);
      const out: IngestedCompany[] = [];

      for (const item of items) {
        const title = item.title?.trim();
        const bodyRaw = item["content:encoded"] || item.description || "";
        const body = stripHtml(bodyRaw);
        if (!title || !body) continue;

        let extracted: ExtractOutput | null;
        try {
          extracted = await extractCompanyFromArticle(title, body);
        } catch (err) {
          console.error(`${label} extraction failed for "${title}":`, err);
          continue; // one bad article shouldn't kill the whole run
        }
        if (!extracted || !extracted.isAboutCompany || !extracted.companyName || !extracted.description) continue;

        out.push({
          name: extracted.companyName,
          description: extracted.description,
          url: extracted.websiteUrl || null,
          source: label,
          region: "african" as const,
          country: extracted.country,
          categoryTags: extracted.categoryTags.map((t) => t.toLowerCase()).slice(0, 6),
          yearFounded: null,
          companyStage: null,
          fundingStage: null,
        });
      }

      return out;
    },
  };
}
