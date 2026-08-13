import type { VerdictResponse } from "../lib/verdict";

export function VerdictDisplay({
  result,
  onReset,
}: {
  result: VerdictResponse;
  onReset: () => void;
}) {
  return (
    <div className="w-full max-w-2xl rounded-3xl bg-surface p-6 shadow-2xl sm:p-8">
      <button
        type="button"
        onClick={onReset}
        aria-label="Try another idea"
        className="mb-6 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-ink text-white transition hover:opacity-80"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
          <path d="M19 12H5.5M11 6l-6.5 6 6.5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <p className="font-body text-sm text-ink-soft">
        Here&apos;s what we understood: <span className="text-ink">{result.idea.normalized}</span>
      </p>

      <h2 className="font-display mt-2 text-2xl leading-tight font-bold text-ink sm:text-3xl">
        {result.verdict.headline}
      </h2>

      {result.matches.length > 0 ? (
        <ul className="mt-6 flex flex-col gap-3">
          {result.matches.map((match) => (
            <li key={match.url}>
              <a
                href={match.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-ink/10 p-4 transition hover:border-ink/25 hover:bg-ink/2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-semibold text-ink">{match.name}</span>
                    <span className="font-body max-w-40 truncate rounded-full bg-ink/5 px-2 py-0.5 text-xs text-ink-soft">
                      {match.source}
                    </span>
                  </div>
                  <p className="font-body mt-1 line-clamp-2 text-sm text-ink-soft">{match.description}</p>
                </div>
                <span className="font-body shrink-0 text-sm font-semibold text-ink">{match.matchScore}%</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-body mt-6 rounded-2xl bg-ink/[0.03] p-4 text-sm text-ink-soft">
          We couldn&apos;t find a clear existing match for this — that&apos;s a good sign, not a guarantee. Worth
          digging deeper before you commit real time to it.
        </p>
      )}

      <button
        type="button"
        onClick={onReset}
        className="font-body mt-6 cursor-pointer text-sm font-semibold text-ink underline decoration-ink/30 underline-offset-4 transition hover:decoration-ink"
      >
        Try another idea
      </button>
    </div>
  );
}
