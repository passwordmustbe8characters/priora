# Source Ingestion — Western & African

Phase 2 components (see master spec). Seed and refresh the `companies`
table from external sources, independent of the reactive per-idea live
search the verdict pipeline already does.

## Trigger

On-demand only for now — `POST /api/admin/ingest`, authenticated via
`Authorization: Bearer <ADMIN_SECRET>` (set your own value in
`.env.local` / Vercel env vars). No scheduled cron yet; the spec allows
either, and adding one later is just a scheduled handler calling the same
`runIngestion()` function this route calls.

```
POST /api/admin/ingest
Authorization: Bearer <ADMIN_SECRET>
Content-Type: application/json

{ "sources": ["yc", "product-hunt"], "limit": 100, "filter": "fintech" }
```

All fields optional. `sources` defaults to every registered connector.
`filter` meaning is source-specific (YC/YC-Africa: industry/tag
substring, Product Hunt: a topic slug, App Store Search: an actual
search term — **required** for that one, there's no "browse everything"
endpoint) — sources that don't support filtering ignore it.

Response: one result per requested source —
`{ source, ok, fetched, upsert?: { inserted, failed, errors }, error? }`.

The RSS-based sources (TechCabal, Techpoint Africa) run one LLM
extraction call per article, sequentially — keep `limit` modest (10-15)
to stay well inside the request time budget.

## Sources — what's actually live vs stubbed

The master spec names four Western sources (Crunchbase, Product Hunt, YC
directory, G2) and a set of African ones (Briter Bridges, Disrupt
Africa, TechCabal, Techpoint Africa, WeeTracker, accelerator portfolios,
app store search). Several of these don't have a free, ToS-compliant
path to data, so they're stubbed rather than faked or scraped:

| Source | Status | Notes |
|---|---|---|
| **YC Directory** | ✅ Live, no key needed | Pulls from `yc-oss.github.io/api` — a community-maintained open mirror of YC's own public company-directory data, republished as static JSON. Not scraped, not an official API, but openly published for exactly this kind of use. Western companies only — African ones are filtered out here and covered by `yc-africa` instead. |
| **Product Hunt** | ✅ Live, needs a free token | Official GraphQL API v2. Create a free app at [producthunt.com/v2/oauth/applications](https://www.producthunt.com/v2/oauth/applications), generate a "Developer Token" on it, set `PRODUCT_HUNT_API_TOKEN`. Note: the `url` field it returns is a Product Hunt click-tracking redirect (`producthunt.com/r/...`), not the raw destination — that's intentional on their end for attribution, confirmed their redirect endpoint blocks non-browser requests (403 even with a browser user-agent), so it's stored as-is rather than "unwrapped." |
| **YC Directory (Africa)** | ✅ Live, no key needed | Same dataset as `yc`, filtered to YC's African-founder companies instead. A **partial stand-in for "accelerator portfolios"** — YC is itself a major accelerator, but the spec's other named accelerators (Flat6Labs, MEST, CcHub, Techstars Lagos, etc.) would each need a bespoke scraper against a different site. Not built — real, documented gap, not silently skipped. |
| **App Store Search** | ✅ Live, no key needed | Apple's official iTunes Search API, searched across Nigeria/Kenya/South Africa/Ghana/Egypt country codes. No Google Play equivalent — the only free options there are unofficial scrapers of Play Store's internal endpoints, same ToS risk as the stubbed sources below, so it's left out. |
| **TechCabal** | ⚠️ Works locally, blocked in production | Public RSS feed + an LLM extraction pass per article. Verified working repeatedly from a residential/local IP; verified consistently **403-blocked when called from Vercel's production serverless network** — looks like IP-reputation bot-blocking (shared/datacenter IP ranges get flagged more readily than residential ones), not a headers/UA issue. Real signal when it works, not a structured directory — see the dedup caveat below. |
| **Techpoint Africa** | ⚠️ Blocked from this app specifically | Same approach as TechCabal, different feed — but this one 403s Node's `fetch` (undici) from *both* a residential IP and Vercel's network, while `curl` against the exact same feed URL from the same residential machine succeeds. That points at a client-fingerprint block (TLS/HTTP-stack level, not headers — a full browser user-agent didn't help), not an IP-reputation one. Currently unusable from this codebase either way. |
| **Crunchbase** | ⛔ Stubbed | No free tier for company search — API access is paid-only. |
| **G2** | ⛔ Stubbed | No free API; data access is paid/partner-only, and their ToS prohibits scraping. |
| **Briter Bridges** | ⛔ Stubbed | Their data platform (Briter Intelligence) is subscription-only. |
| **WeeTracker** | ⛔ Stubbed | Their company/investor database ("The BASE") is a paid product. |
| **Disrupt Africa** | ⛔ Stubbed | Their 3,000+ startup database is sold as bespoke research, not a queryable API. |

Every connector — live or stubbed — implements the same `SourceConnector`
interface (`app/lib/ingestion/types.ts`), so wiring in any of the
stubbed ones later (if/when there's paid access) is just filling in that
connector's `fetch`, not a redesign.

## Category tagging

Each connector carries over that source's own tags/topics/industries (or,
for the RSS sources, LLM-extracted tags), lowercased and capped at ~6-8,
as a best-effort `categoryTags` value. This is deliberately not a
consistent taxonomy across sources — building one is the separate
**Category Tagging System** component, not this one's job.

## Known dedup gap (RSS sources)

`upsertCompanies` dedupes on URL — see its own doc comment: rows without
a URL always insert fresh rather than updating an existing one. News
articles frequently don't name a company's own canonical URL, so
TechCabal/Techpoint rows often end up with `url: null`. Repeated
ingestion runs over the same articles will accumulate duplicate rows for
the same company until something better than URL-based dedup exists
(name-based matching is a natural fit for the Category Tagging System
work, not this component).

## Region

Every row from these components is tagged `region: "western"` or
`"african"` depending on which track found it — per the schema's
convention, `region` records *which Source Ingestion track found it*,
not a literal claim about where the company operates.
