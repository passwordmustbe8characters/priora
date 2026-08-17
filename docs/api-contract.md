# Core API Contract — Phase 1

Defines the request/response shape between the frontend (Idea Input Flow /
Free Verdict Display) and the backend (Idea Normalizer → Candidate
Retrieval → Relevance Matcher → Free Verdict Assembly). Both sides build
against this document; changes to it should be agreed on before either
side reworks around a new shape.

A mock implementation living at `app/api/verdict/route.ts` returns data in
this exact shape today, so the frontend can integrate against something
real before the backend pipeline exists.

## Pipeline (internal, not separate endpoints)

One public endpoint fronts the internal pipeline. As of Phase 2's Caching
Layer, this branches on whether fresh cached candidates exist — full
detail (freshness window, what triggers a cache hit vs miss) is in
[db-schema.md](./db-schema.md). The request/response contract below is
unchanged either way; the branching is invisible to the frontend.

```
raw idea text
     │
     ▼
1. Idea Normalizer   → cleans/restates the idea, extracts category tags
     │                  (a cheap call — no search yet)
     ▼
2. Cache lookup       → companies table, filtered by category tag overlap
     │                  + freshness window
     │
     ├─ enough fresh matches ──► 3a. Relevance Matcher (cache)
     │                            re-scores cached candidates, no search
     │
     └─ not enough ────────────► 3b. Candidate Retrieval + Relevance
                                     Matcher (live) — paid web search,
                                     then upserts results into the cache
                                     for next time
     │
     ▼
4. Free Verdict Assembly → composes status + headline + top matches
     │                      into the response below
     ▼
  response
```

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
| `generatedAt`                           | string (ISO 8601)                                   | when the verdict was assembled                                        |

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
