# Usage Analytics Dashboard

Phase 2 component (see master spec): "Simple internal view of what
categories are being searched most, free-to-verdict conversion, and any
patterns worth acting on."

## What's tracked

One row in `verdict_events` per `POST /api/verdict` call — recorded in
`app/api/verdict/route.ts` at each of the four possible outcomes:

| Outcome | When | What's recorded |
|---|---|---|
| `validation_error` | Idea text too short/long | Just the outcome — no category tags (never reached the normalizer) |
| `success` (Phase 1 cache hit) | Same idea already answered this process's lifetime | outcome, `cacheStatus: "HIT"`, verdictStatus — no category tags (not available on a repeat in-memory hit; already recorded once on the original request) |
| `success` (pipeline ran) | Normal request | outcome, `cacheStatus: "COMPANY-DB-HIT"` or `"MISS"`, verdictStatus, categoryTags |
| `pipeline_error` | Pipeline threw | Just the outcome |

Deliberately does **not** store the raw idea text — this is for spotting
aggregate category/outcome patterns, not tracking individual
submissions, and there's no reason to hold onto potentially sensitive
founder idea text longer than the request needs it.

## Where to see it

`/admin/analytics` — a real page, gated by `proxy.ts` (Next.js 16
renamed `middleware.ts` to `proxy.ts`; see that file's own doc comment)
via HTTP Basic Auth. Username can be anything, password is
`ADMIN_SECRET` — same secret the `/api/admin/*` routes use via Bearer
token, just applied through the browser-native auth prompt since this
is a page someone visits rather than an API a script calls.

Shows, for a selectable trailing window (7/30/90 days):

- Total searches, free-to-verdict conversion rate, cache hit rate (stat tiles)
- Outcome breakdown (success / validation error / pipeline error) with status colors
- Searches-per-day trend line
- Cache status and verdict status breakdowns
- Top category tags searched (ranked bar list)

Simpler than the spec's literal "backend builds the data pipeline,
frontend builds the view" split: `getAnalyticsSummary()`
(`app/lib/db/analytics.ts`) is called directly from the page's Server
Component rather than through a separate JSON API — idiomatic for the
App Router, and nothing else needed a standalone endpoint for this data.

Colors are the dataviz skill's validated default palette (light mode
only — this internal page doesn't have its own theme toggle, it just
uses the site's default light tokens).

## Migrations

New table (`verdict_events`) needs its migration applied wherever this
runs. Locally: `npm run db:migrate` (uses `.env.local`'s
`DATABASE_URL`). For production, since local intentionally no longer
has production's `DATABASE_URL` (see the local/prod database-separation
work), run it against production's own connection string from wherever
that's available to you — e.g.:

```
DATABASE_URL="<production connection string>" npm run db:migrate
```

Never paste that connection string into chat/logs — run it directly in
your own terminal.
