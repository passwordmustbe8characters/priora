# Company Database Schema — Phase 2

The Postgres schema behind the data moat. Defined in
[`app/lib/db/schema.ts`](../app/lib/db/schema.ts) via Drizzle ORM; this doc
is the human-readable reference — keep both in sync.

Hosted on Vercel Postgres (Neon). Connection string lives in
`DATABASE_URL` (`.env.local` locally, set in Vercel's dashboard for
deployments — never committed).

This table doubles as a market-research record, not just a
competitor-matching cache — most columns exist so a company row is a
genuinely useful research profile on its own, not only a search hit.

## `companies`

### Identity

| Column      | Type      | Notes                                                                 |
| ------------ | ---------- | ----------------------------------------------------------------------- |
| `id`            | uuid, PK    | random default                                                          |
| `name`            | text        | required                                                                |
| `description`       | text        | required                                                                |
| `url`                  | text        | unique when present — see indexes                                        |
| `source`                 | text        | e.g. `"Product Hunt"`, `"Crunchbase"`, `"Web Search"`                     |
| `region`                   | enum: `western`\|`african`\|`global` | default `global`; set by our own ingestion pipeline (which Source Ingestion track found it), not LLM-extracted — safe as a strict enum |
| `country`                    | text        | more granular than region, e.g. `"Nigeria"`, `"Kenya"` — indexed          |
| `category_tags`                 | text[]      | default `{}`; controlled taxonomy is the Category Tagging System component's job, not this one |
| `year_founded`                    | integer     |                                                                          |
| `company_stage`                     | text        | e.g. `"startup"`, `"growth-stage"`, `"established"` — free text, see note below |

### Audience & business model

| Column          | Type | Notes                                    |
| ----------------- | ---- | ------------------------------------------ |
| `target_audience`     | text |                                            |
| `customer_type`         | text | e.g. `"B2C"`, `"B2B"`, `"B2B2C"` — free text, see note below |
| `business_model`          | text | e.g. `"subscription"`, `"commission"`, `"marketplace"`, `"freemium"` |
| `pricing`                    | text |                                            |

### Product & positioning

| Column          | Type   | Notes                                                          |
| ----------------- | ------ | ------------------------------------------------------------------ |
| `core_problem`        | text   | the problem + their particular angle on solving it                  |
| `key_features`           | text[] | default `{}`                                                        |
| `value_proposition`         | text   |                                                                      |
| `positioning`                  | text   | how they frame themselves in the market                             |

### Competitive analysis

| Column          | Type   | Notes                                        |
| ----------------- | ------ | ------------------------------------------------ |
| `primary_competitors`  | text[] | default `{}`                                      |
| `competitive_advantage`     | text   |                                                    |
| `weaknesses`                    | text   |                                                    |
| `opportunity_gap`                   | text   | something a new entrant could exploit — maps directly to Priora's own value prop |

### Traction & credibility

| Column          | Type | Notes                                                    |
| ----------------- | ---- | ------------------------------------------------------------ |
| `funding_stage`       | text |                                                                |
| `traction_notes`         | text | funding amount, users, revenue, growth signals — free text since precise structured data isn't reliably available for most companies via search |
| `notable_partnerships`      | text |                                                                |

### Analysis meta

| Column          | Type        | Notes                                              |
| ----------------- | ----------- | ------------------------------------------------------ |
| `key_takeaway`        | text        | one-sentence conclusion                                  |
| `raw_snippet`             | text        | source text a claim was pulled from — Phase 3's Hallucination Verification Pass needs this; captured now so it doesn't have to be backfilled later |
| `first_seen_at`              | timestamptz | default now()                                            |
| `last_updated_at`               | timestamptz | default now()                                            |

### Indexes

- `companies_name_idx` — btree on `name`
- `companies_country_idx` — btree on `country`
- `companies_category_tags_idx` — GIN on `category_tags`, for containment queries (`WHERE category_tags && ARRAY[...]`)
- `companies_url_unique` — unique, partial (`WHERE url IS NOT NULL`) — prevents the same company being inserted twice when it has a URL, without blocking inserts for companies found without one

## Why `customer_type` and `company_stage` are plain text, not enums

`region` is safe as a strict Postgres enum because *our own pipeline* sets
it (which Source Ingestion track found the company), not the LLM. But
`customer_type` and `company_stage` will be filled in by LLM extraction —
a rigid enum would throw an insert error the moment the model phrases
something slightly differently than expected (`"growth stage"` vs.
`"growth-stage"` vs. `"Growth"`). Text stays forgiving; enforcing a
controlled vocabulary on these is the Category Tagging System component's
job when its turn comes, not this one.

## What's deliberately *not* here

Curated down from a broader market-research template. Left out, with why:

- **Product/Service** — redundant with `description`, which the app
  already renders as "why it's a match" in the verdict UI
- **Brand Personality / Visual Identity** — needs actually looking at a
  site/brand; an LLM text-search pass can't reliably judge "playful vs.
  premium" from search snippets
- **Marketing Channels / Content Strategy / Social Presence** — real
  signals, but tangential to "does this idea already exist," and these go
  stale fast (follower counts, channel mix) — better suited to a deeper
  Phase 3 report than a persistent cache row
- **Source/Link** — already covered by `url` and `source`
- **Dedup/upsert logic** — inserting/updating rows during ingestion is the
  Caching Layer component's job, not this one
- **matchScore** — deliberately excluded. It's a per-query relevance score
  computed at match time against a specific founder's idea, not an
  intrinsic property of the company — it shouldn't be persisted here

## Local commands

```bash
npm run db:generate   # regenerate SQL migration after schema.ts changes
npm run db:migrate    # apply pending migrations to DATABASE_URL
npm run db:studio     # Drizzle's local GUI browser for the DB
npm run db:verify     # sanity check: schema shape + a real insert/select round trip
```
