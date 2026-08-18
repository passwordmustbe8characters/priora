# Source Ingestion — Western

Phase 2 component (see master spec). Seeds and refreshes the `companies`
table from external Western-market sources, independent of the reactive
per-idea live search the verdict pipeline already does.

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
`filter` meaning is source-specific (YC: industry/tag substring, Product
Hunt: a topic slug) — sources that don't support filtering ignore it.

Response: one result per requested source —
`{ source, ok, fetched, upsert?: { inserted, failed, errors }, error? }`.

## Sources — what's actually live vs stubbed

The master spec names four sources: Crunchbase, Product Hunt, YC
directory, G2. Two of those don't have a free, ToS-compliant path to
data, so they're stubbed rather than faked or scraped:

| Source | Status | Notes |
|---|---|---|
| **YC Directory** | ✅ Live, no key needed | Pulls from `yc-oss.github.io/api` — a community-maintained open mirror of YC's own public company-directory data, republished as static JSON. Not scraped, not an official API, but openly published for exactly this kind of use. |
| **Product Hunt** | ✅ Live, needs a free token | Official GraphQL API v2. Create a free app at [producthunt.com/v2/oauth/applications](https://www.producthunt.com/v2/oauth/applications), generate a "Developer Token" on it, set `PRODUCT_HUNT_API_TOKEN`. |
| **Crunchbase** | ⛔ Stubbed | No free tier for company search — API access is paid-only. |
| **G2** | ⛔ Stubbed | No free API; data access is paid/partner-only, and their ToS prohibits scraping. |

Every connector — live or stubbed — implements the same `SourceConnector`
interface (`app/lib/ingestion/types.ts`), so wiring in Crunchbase or G2
later (if/when there's paid access) is just filling in that connector's
`fetch`, not a redesign.

## Category tagging

Each connector carries over that source's own tags/topics/industries
(lowercased, deduped, capped at ~8) as a best-effort `categoryTags`
value. This is deliberately not a consistent taxonomy across sources —
building one is the separate **Category Tagging System** component,
not this one's job.

## Region

Every row from this component is tagged `region: "western"` — per the
schema's convention, `region` records *which Source Ingestion track
found it*, not a literal claim about where the company operates.
