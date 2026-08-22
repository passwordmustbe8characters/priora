import { MAX_DISPLAY_MATCHES, type VerdictResponse } from "../lib/verdict";

/** Lives inside the search card once it's morphed open — that card's
 * background is `bg-foreground`, so this reads off `--background`
 * (the inverse token) for its own colors, which is what makes it
 * flip correctly with the light/dark theme toggle rather than being
 * hardcoded to one look. Grid layout so results spread out instead of
 * stacking tall.
 *
 * `loadingMore` — cache-then-live progressive search (see
 * useVerdictFlow.ts): true while the cache phase's real matches are
 * already shown but a live search is still running to backfill the
 * remaining slots. Renders pulsing placeholder tiles for exactly the
 * slots not yet filled, so the grid visibly "completes" rather than
 * jumping in size once the live phase resolves. */
export function VerdictResults({ result, loadingMore = false }: { result: VerdictResponse; loadingMore?: boolean }) {
  const remaining = loadingMore ? Math.max(0, MAX_DISPLAY_MATCHES - result.matches.length) : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="font-body text-xs text-background/50 sm:text-sm">
        <span className="text-background/80">{result.idea.normalized}</span>
      </p>

      {/* Suppressed while still-empty-and-loading-more — a "no match"
          headline shown now would flatly contradict whatever the live
          search finds moments later. Once there's at least one real
          match, or the live phase has actually settled, this is safe
          to show and simply gets replaced in place if it changes. */}
      {!(loadingMore && result.matches.length === 0) && (
        <h2 className="font-display mt-1 text-lg leading-tight font-bold text-background sm:text-2xl">
          {result.verdict.headline}
        </h2>
      )}

      {result.matches.length > 0 || remaining > 0 ? (
        <div className="mt-4 grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {result.matches.map((match) => (
            <a
              key={match.url}
              href={match.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex cursor-pointer flex-col justify-between gap-1 rounded-xl border border-background/10 bg-background/5 p-3 transition hover:border-background/25 hover:bg-background/10"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display truncate text-sm font-semibold text-background">{match.name}</span>
                  <span className="font-body shrink-0 text-xs font-semibold text-background/80">
                    {match.matchScore}%
                  </span>
                </div>
                <p className="font-body mt-1 line-clamp-2 text-xs text-background/50">{match.description}</p>
              </div>
              <span className="font-body max-w-28 truncate self-start rounded-full bg-background/10 px-2 py-0.5 text-[10px] text-background/50">
                {match.source}
              </span>
            </a>
          ))}
          {Array.from({ length: remaining }).map((_, i) => (
            <div key={`skeleton-${i}`} className="h-20 animate-pulse rounded-xl bg-background/5" aria-hidden />
          ))}
        </div>
      ) : (
        <p className="font-body mt-4 flex-1 rounded-xl bg-background/5 p-3 text-xs text-background/60 sm:text-sm">
          We couldn&apos;t find a clear existing match for this — that&apos;s a good sign, not a guarantee. Worth
          digging deeper before you commit real time to it.
        </p>
      )}
    </div>
  );
}
