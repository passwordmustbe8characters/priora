import type { VerdictResponse } from "../lib/verdict";

/** Landscape-oriented variant: matches lay out in a grid, not a stacked
 * list, so up to 5 results fit inside a wide-but-short rectangle without
 * needing their own scroll. */
export function VerdictResults({ result }: { result: VerdictResponse }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="font-body text-xs text-ink-soft sm:text-sm">
        <span className="text-ink">{result.idea.normalized}</span>
      </p>

      <h2 className="font-display mt-1 line-clamp-2 text-lg leading-tight font-bold text-ink sm:text-2xl">
        {result.verdict.headline}
      </h2>

      {result.matches.length > 0 ? (
        <div className="mt-3 grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {result.matches.map((match) => (
            <a
              key={match.url}
              href={match.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex cursor-pointer flex-col justify-between gap-1 rounded-xl border border-ink/10 bg-surface/70 p-3 backdrop-blur-sm transition hover:border-ink/25 hover:bg-surface"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display truncate text-sm font-semibold text-ink">{match.name}</span>
                  <span className="font-body shrink-0 text-xs font-semibold text-ink">{match.matchScore}%</span>
                </div>
                <p className="font-body mt-1 line-clamp-2 text-xs text-ink-soft">{match.description}</p>
              </div>
              <span className="font-body max-w-28 truncate self-start rounded-full bg-ink/5 px-2 py-0.5 text-[10px] text-ink-soft">
                {match.source}
              </span>
            </a>
          ))}
        </div>
      ) : (
        <p className="font-body mt-3 flex-1 rounded-xl bg-ink/[0.03] p-3 text-xs text-ink-soft sm:text-sm">
          We couldn&apos;t find a clear existing match for this — that&apos;s a good sign, not a guarantee. Worth
          digging deeper before you commit real time to it.
        </p>
      )}
    </div>
  );
}
