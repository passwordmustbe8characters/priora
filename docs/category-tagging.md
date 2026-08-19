# Category Tagging System

Phase 2 component (see master spec): "Consistent tagging taxonomy so
cached companies can be matched against future normalized problem
profiles without needing a fresh live search every time."

## The problem this fixes

`findFreshCandidates()` (`app/lib/db/companies.ts`) finds cache
candidates by *tag overlap* — a company needs at least `MIN_SHARED_TAGS`
(2) tags in common with a founder's normalized idea to surface as a
candidate. Before this component, tags came from wherever they were
generated with no shared vocabulary enforced:

- `normalizeIdea()` (pipeline.ts) — an LLM call, free to write any tag it liked
- Source Ingestion connectors — each source's own vocabulary passed through as-is (YC's `industries`, Product Hunt's topics, iTunes' genre names, LLM-extracted tags from news articles)

A company correctly tagged `"financial services"` and an idea normalized
to `"fintech"` mean the same thing but share zero tags — the cache
lookup would never find it, silently degrading the whole point of
Phase 2's Caching Layer.

## The fix

One shared, closed vocabulary — `CATEGORY_TAXONOMY` in
`app/lib/taxonomy.ts` — that both sides of the match are constrained to
draw from:

- **`normalizeIdea()`** (`app/lib/pipeline.ts`) — this is a single LLM
  call already, so it's enum-constrained directly: `categoryTags` items
  must be one of `CATEGORY_TAXONOMY`'s values via the JSON schema, not
  just told to via the prompt. Guaranteed canonical, zero added latency
  (same call, just a tighter schema).
- **Ingestion connectors** (`app/lib/ingestion/index.ts`) — most of
  these aren't LLM calls at all (YC/Product Hunt/App Store just pass
  through their source's own tags), so they go through
  `normalizeCategoryTags()` (`app/lib/category-tagging.ts`) centrally in
  `runIngestion()`, right before upserting. Two-tier resolution: an
  exact match to a canonical tag or a known synonym resolves for free;
  anything left over is batched into **one** LLM call per ingestion run
  (not per company — the same raw tags repeat heavily within a run, so
  resolving each *distinct* raw tag once keeps this cheap).

Deliberately a flat list, not a hierarchy — this system only needs
exact-match overlap scoring, not browsing/rollups, so a hierarchy would
add complexity for no benefit here.

## Extending it

New raw-tag phrasings a source surfaces that aren't already covered by
the `SYNONYMS` dictionary in `category-tagging.ts` don't break anything
— they just fall through to the LLM fallback every time instead of
resolving for free. Add them to `SYNONYMS` once they're observed
repeating, rather than trying to anticipate every possible phrasing
upfront.

## Existing rows

This doesn't retroactively fix `categoryTags` on companies already in
the database before this shipped — those keep whatever tags they were
inserted with until they're naturally refreshed (ingestion re-run, or a
live search upsert touches that URL again). No backfill migration was
run as part of this component.
