import type { VerdictResponse } from "../lib/verdict";

/** The side panel's view — same data as the in-place preview card
 * (VerdictResults), but a bit more room to breathe: full descriptions
 * instead of line-clamped, one column instead of a grid, and the
 * confidence score surfaced (not shown in the compact preview). Not a
 * different report, just a little more detail on the same matches. */
export function VerdictDetail({ result }: { result: VerdictResponse }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="font-body text-xs text-background/50 sm:text-sm">
        <span className="text-background/80">{result.idea.normalized}</span>
      </p>

      <div className="mt-1 flex items-start justify-between gap-4">
        <h2 className="font-display text-lg leading-tight font-bold text-background sm:text-2xl">
          {result.verdict.headline}
        </h2>
        <span className="font-body shrink-0 rounded-full bg-background/10 px-3 py-1 text-xs font-semibold text-background/70">
          {Math.round(result.verdict.confidence * 100)}% confidence
        </span>
      </div>

      {result.matches.length > 0 ? (
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
        </ul>
      ) : (
        <p className="font-body mt-4 flex-1 rounded-xl bg-background/5 p-4 text-sm text-background/60">
          We couldn&apos;t find a clear existing match for this — that&apos;s a good sign, not a guarantee. Worth
          digging deeper before you commit real time to it.
        </p>
      )}
    </div>
  );
}
