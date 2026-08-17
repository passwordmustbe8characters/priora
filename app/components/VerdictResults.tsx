import type { VerdictResponse } from "../lib/verdict";

/** Lives inside ResultsPanel, which is always solid black regardless of
 * theme — styled for white-on-black, not theme-conditional. Landscape
 * grid layout so results spread horizontally instead of stacking tall. */
export function VerdictResults({ result }: { result: VerdictResponse }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="font-body text-xs text-white/50 sm:text-sm">
        <span className="text-white/80">{result.idea.normalized}</span>
      </p>

      <h2 className="font-display mt-1 text-lg leading-tight font-bold text-white sm:text-2xl">
        {result.verdict.headline}
      </h2>

      {result.matches.length > 0 ? (
        <div className="mt-4 grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {result.matches.map((match) => (
            <a
              key={match.url}
              href={match.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex cursor-pointer flex-col justify-between gap-1 rounded-xl border border-white/10 bg-white/5 p-3 transition hover:border-white/25 hover:bg-white/10"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display truncate text-sm font-semibold text-white">{match.name}</span>
                  <span className="font-body shrink-0 text-xs font-semibold text-white/80">{match.matchScore}%</span>
                </div>
                <p className="font-body mt-1 line-clamp-2 text-xs text-white/50">{match.description}</p>
              </div>
              <span className="font-body max-w-28 truncate self-start rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50">
                {match.source}
              </span>
            </a>
          ))}
        </div>
      ) : (
        <p className="font-body mt-4 flex-1 rounded-xl bg-white/5 p-3 text-xs text-white/60 sm:text-sm">
          We couldn&apos;t find a clear existing match for this — that&apos;s a good sign, not a guarantee. Worth
          digging deeper before you commit real time to it.
        </p>
      )}
    </div>
  );
}
