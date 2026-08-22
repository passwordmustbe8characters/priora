# Core API Contract — Phase 1

Defines the request/response shape between the frontend (Idea Input Flow /
Free Verdict Display) and the backend (Idea Normalizer → Candidate
Retrieval → Relevance Matcher → Free Verdict Assembly). Both sides build
against this document; changes to it should be agreed on before either
side reworks around a new shape.

A mock implementation living at `app/api/verdict/route.ts` returns data in
this exact shape today, so the frontend can integrate against something
real before the backend pipeline exists.

## Pipeline — two endpoints, cache-then-live

As of the cache-then-live progressive search rework, this is genuinely
TWO public endpoints, not one — the branching used to be invisible to
the frontend (an either/or choice made entirely server-side in one
request); it no longer is, because the whole point now is to show the
founder real cache-backed matches instantly rather than making them
wait through a live search that might not even be needed. Full detail
(freshness window, what counts as "enough" cached candidates) is in
[db-schema.md](./db-schema.md).

```
raw idea text
     │
     ▼
1. Idea Normalizer   → cleans/restates the idea, extracts category tags
     │                  (a cheap call — no search yet)
     ▼
2. Cache lookup       → companies table, filtered by category tag overlap
     │                  + freshness window
     ▼
3. Relevance Matcher (cache) → re-scores cached candidates, no search
     │
     ▼
POST /api/verdict responds HERE — with whatever real matches the cache
found (0 to 5) and needsLiveSearch: true if that's fewer than 5.
     │
     │  (only if needsLiveSearch was true)
     ▼
4. Client calls POST /api/verdict/live, passing back the matches
   already shown — Candidate Retrieval + Relevance Matcher (live), a
   paid web search that finds ADDITIONAL competitors beyond that list,
   never replaces what's already confirmed (see pipeline.ts's
   mergeMatches), then upserts newly-found companies into the cache.
     │
     ▼
5. Free Verdict Assembly → composes the final status + headline + full
     │                      match list into the response below
     ▼
  final response
```

The response shape below is identical from both endpoints — the only
difference is `needsLiveSearch`/`categoryTags`, present only on a
partial (cache-phase) response, absent on a final one.

## `POST /api/verdict`

The only endpoint the Idea Input Flow calls.

### Request

```json
{
  "idea": "An app that helps Nigerian freelancers invoice international clients and get paid in dollars"
}
```

| Field  | Type   | Required | Constraints                     |
| ------ | ------ | -------- | -------------------------------- |
| `idea` | string | yes      | trimmed length 10–2000 characters |

### Response — `200 OK`

```json
{
  "requestId": "b3e2c9f0-6a3a-4e9a-9c3a-1e2f3a4b5c6d",
  "idea": {
    "raw": "An app that helps Nigerian freelancers invoice international clients and get paid in dollars",
    "normalized": "A cross-border invoicing and payments tool for Nigerian freelancers working with international clients."
  },
  "verdict": {
    "status": "exists",
    "headline": "We found 3 products doing something similar.",
    "confidence": 0.78
  },
  "matches": [
    {
      "name": "Grey",
      "url": "https://grey.co",
      "description": "Cross-border banking and invoicing for African freelancers and remote workers, with USD/GBP/EUR accounts.",
      "source": "Web Search",
      "matchScore": 86
    }
  ],
  "bullTeaser": "Grey already validates demand for this exact problem, but none of the current players lean into instant-settlement pricing the way you're describing.",
  "bearTeaser": "You'd be entering a market with an established, well-funded incumbent already solving this for the same audience.",
  "generatedAt": "2026-08-13T10:15:00.000Z"
}
```

| Field                  | Type                                                | Notes                                                                 |
| ----------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `requestId`              | string (uuid)                                        | echoed in logs; useful for support/debugging                          |
| `idea.raw`                | string                                              | exactly what the founder typed                                        |
| `idea.normalized`          | string                                              | Idea Normalizer's canonical restatement                               |
| `verdict.status`            | `"exists"` \| `"partial_overlap"` \| `"no_clear_match"` | drives which headline/empty-state the Free Verdict Display shows      |
| `verdict.headline`           | string                                              | one sentence, ready to render as-is                                   |
| `verdict.confidence`          | number, 0–1                                         | Relevance Matcher's aggregate confidence in the status                |
| `matches`                       | array, 0–5 items                                    | empty when `status` is `"no_clear_match"`                             |
| `matches[].name`                  | string                                              | competitor/product name                                               |
| `matches[].url`                    | string                                              | source link, shown to the founder as evidence                         |
| `matches[].description`             | string                                              | 1–2 sentence snippet, not marketing copy — why it's a match           |
| `matches[].source`                   | string                                              | e.g. `"Product Hunt"`, `"Crunchbase"`, `"Web Search"`                  |
| `matches[].matchScore`                | integer, 0–100                                      | Relevance Matcher's score for this specific candidate                 |
| `bullTeaser`                            | string \| null                                      | Free Verdict Teaser — one-sentence case to proceed, from the same Relevance Matcher call that produced `matches` (no extra search/LLM call); `null` on older verdicts or if the matcher omitted it |
| `bearTeaser`                            | string \| null                                      | one-sentence case to reconsider, same origin/nullability as `bullTeaser` |
| `generatedAt`                           | string (ISO 8601)                                   | when the verdict was assembled                                        |
| `needsLiveSearch`                       | boolean, optional                                   | present (`true`) only on a partial, cache-phase response — tells the client to call `POST /api/verdict/live` next. Absent on any final response |
| `categoryTags`                          | string[], optional                                  | present only alongside `needsLiveSearch: true` — pass straight through to `/api/verdict/live` so it doesn't re-run the Idea Normalizer |

### `POST /api/verdict/live` — phase 2, only called when `needsLiveSearch` was true

Request body: `{ ideaRaw, normalizedIdea, categoryTags, existingMatches }` —
`existingMatches` is whatever `matches` the cache phase already returned
(shown to the founder already); the live phase keeps every one of them
unchanged and only adds genuinely new competitors it finds via search,
capped at 5 total. Response shape is the same `VerdictResponse` above,
always final (no `needsLiveSearch`/`categoryTags` on the way out).

### Error responses

All errors share one shape:

```json
{
  "error": {
    "code": "INVALID_IDEA",
    "message": "Tell us a bit more — ideas need to be at least 10 characters."
  }
}
```

| Status | `code`             | When                                                      |
| ------ | ------------------ | ---------------------------------------------------------- |
| 400    | `INVALID_IDEA`      | `idea` missing, empty, or outside the 10–2000 char range     |
| 429    | `RATE_LIMITED`        | too many requests from the same client; body also includes `retryAfterSeconds` |
| 502    | `VERDICT_UNAVAILABLE`  | Candidate Retrieval's upstream search failed                |
| 500    | `INTERNAL_ERROR`        | anything unexpected                                        |

Frontend should show a friendly retry state for 429/502/500 — never surface
raw error text to the founder.

## `GET /api/health`

Plain liveness check for Hosting & Environment Setup. Returns `200` with
`{ "status": "ok" }` and nothing else — no auth, no dependencies checked.

## Out of scope for Phase 1

- No auth — the free verdict is anonymous, no login
- No streaming/partial results — the frontend waits for the full response

As of Phase 2, companies found during a live search *are* persisted (see
[db-schema.md](./db-schema.md)) — this powers the cache, not a
user-facing feature. Nothing about a specific founder's request is
stored; the cache is keyed on category tags, not on who asked.
