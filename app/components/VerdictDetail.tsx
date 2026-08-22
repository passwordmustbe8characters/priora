import { GetReportButton } from "./GetReportButton";
import { MAX_DISPLAY_MATCHES, type VerdictResponse } from "../lib/verdict";

/** The side panel's view — same data as the in-place preview card
 * (VerdictResults), but a bit more room to breathe: full descriptions
 * instead of line-clamped, one column instead of a grid, and the
 * confidence score surfaced (not shown in the compact preview). Not a
 * different report, just a little more detail on the same matches.
 *
 * `loadingMore` — see VerdictResults' doc comment; same cache-then-live
 * progressive behavior, just rendered as list rows instead of a grid. */
export function VerdictDetail({ result, loadingMore = false }: { result: VerdictResponse; loadingMore?: boolean }) {
  const remaining = loadingMore ? Math.max(0, MAX_DISPLAY_MATCHES - result.matches.length) : 0;
  const stillFullyLoading = loadingMore && result.matches.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="font-body text-xs text-background/50 sm:text-sm">
        <span className="text-background/80">{result.idea.normalized}</span>
      </p>

      {/* Suppressed while still-empty-and-loading-more — see
          VerdictResults for why a "no match"/confidence readout
          shouldn't render before there's anything to actually judge. */}
      {!stillFullyLoading && (
        <div className="mt-1 flex items-start justify-between gap-4">
          <h2 className="font-display text-lg leading-tight font-bold text-background sm:text-2xl">
            {result.verdict.headline}
          </h2>
          <span className="font-body shrink-0 rounded-full bg-background/10 px-3 py-1 text-xs font-semibold text-background/70">
            {Math.round(result.verdict.confidence * 100)}% confidence
          </span>
        </div>
      )}

      {result.matches.length > 0 || remaining > 0 ? (
        <ul className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {result.matches.map((match) => (
            <li key={match.url}>
              <a
                href={match.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-background/10 p-4 transition hover:border-background/25 hover:bg-background/5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-semibold text-background">{match.name}</span>
                    <span className="font-body rounded-full bg-background/10 px-2 py-0.5 text-xs text-background/50">
                      {match.source}
                    </span>
                  </div>
                  <p className="font-body mt-1 text-sm text-background/60">{match.description}</p>
                </div>
                <span className="font-body shrink-0 text-sm font-semibold text-background">
                  {match.matchScore}%
                </span>
              </a>
            </li>
          ))}
          {Array.from({ length: remaining }).map((_, i) => (
            <li key={`skeleton-${i}`} className="h-20 animate-pulse rounded-2xl bg-background/5" aria-hidden />
          ))}
        </ul>
      ) : (
        <p className="font-body mt-4 flex-1 rounded-xl bg-background/5 p-4 text-sm text-background/60">
          We couldn&apos;t find a clear existing match for this — that&apos;s a good sign, not a guarantee. Worth
          digging deeper before you commit real time to it.
        </p>
      )}

      {/* Free Verdict Teaser — one honest sentence each for the case to
          proceed and the case to reconsider, produced by the same call
          that already scored the matches above (no extra search, no
          extra LLM call). A free, lightweight preview of the paid
          report's own "The Case For / The Case Against" section, named
          the same way on purpose — the fuller version lives one tap
          below. Not flex-1: this stays visible alongside the CTA rather
          than scrolling away with a long match list. */}
      {(result.bullTeaser || result.bearTeaser) && (
        <div className="mt-4 grid shrink-0 gap-3 sm:grid-cols-2">
          {result.bullTeaser && (
            <div className="rounded-2xl border border-background/10 bg-background/5 p-4">
              <span className="font-body text-xs font-semibold tracking-wide text-background/50 uppercase">
                The case for
              </span>
              <p className="font-body mt-1.5 text-sm text-background/80">{result.bullTeaser}</p>
            </div>
          )}
          {result.bearTeaser && (
            <div className="rounded-2xl border border-background/10 bg-background/5 p-4">
              <span className="font-body text-xs font-semibold tracking-wide text-background/50 uppercase">
                The case against
              </span>
              <p className="font-body mt-1.5 text-sm text-background/80">{result.bearTeaser}</p>
            </div>
          )}
        </div>
      )}

      <GetReportButton result={result} />
    </div>
  );
}
