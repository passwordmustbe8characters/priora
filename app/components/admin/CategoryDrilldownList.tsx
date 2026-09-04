"use client";

import { useState } from "react";

const GRID = "#e8e6df";

/**
 * The interactive twin of the plain BarList used elsewhere on the
 * dashboard — same visual language (numbered rows, thin bar, tabular
 * counts), but each row is a toggle: click a category and it expands
 * to show which OTHER tags most often showed up in the same search,
 * revealing the niche inside that category (e.g. click "b2c" and see
 * "fintech, marketplace, consumer..."). All data is fetched once on
 * the server and passed in — expanding a row is a pure client-side
 * state toggle, no extra request.
 *
 * Deliberately shows co-occurring TAGS only, never anything that
 * narrates an actual idea — same privacy stance as the rest of this
 * dashboard (see RecentSearch's own doc comment in lib/db/analytics.ts
 * for the fuller reasoning).
 */
export function CategoryDrilldownList({
  title,
  rows,
  color,
  cooccurrence,
}: {
  title: string;
  rows: { key: string; count: number }[];
  color: string;
  cooccurrence: Record<string, { tag: string; count: number }[]>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="rounded-2xl border border-ink/10 bg-surface p-5">
      <h2 className="font-body text-sm font-semibold text-ink">{title}</h2>
      <p className="font-body mt-1 text-xs text-ink-soft">Click a category to see what niches it broke down into.</p>
      {rows.length === 0 ? (
        <p className="font-body mt-3 text-sm text-ink-soft">No data in this period.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2.5">
          {rows.map((row, i) => {
            const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
            const widthPct = Math.round((row.count / max) * 100);
            const isOpen = expanded === row.key;
            const co = cooccurrence[row.key] ?? [];
            return (
              <li key={row.key}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : row.key)}
                  className="-mx-2 w-[calc(100%+1rem)] cursor-pointer rounded-lg px-2 py-1 text-left transition-colors hover:bg-ink/[0.03]"
                  aria-expanded={isOpen}
                >
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="font-body flex items-center gap-2 truncate text-sm text-ink">
                      <span className="font-body w-4 shrink-0 text-right text-xs tabular-nums text-ink-soft/70">{i + 1}</span>
                      {row.key}
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className={`h-3 w-3 shrink-0 text-ink-soft/50 transition-transform ${isOpen ? "rotate-90" : ""}`}
                        aria-hidden
                      >
                        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="font-body shrink-0 text-xs tabular-nums text-ink-soft" title={`${row.count} of ${total}`}>
                      {row.count} · {pct}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full" style={{ backgroundColor: GRID }}>
                    <div
                      className="h-2.5 rounded-r-full transition-[width]"
                      style={{ width: `${Math.max(widthPct, 3)}%`, backgroundColor: color }}
                    />
                  </div>
                </button>
                {isOpen && (
                  <div className="mt-2 ml-6 rounded-lg bg-ink/[0.03] p-3">
                    {co.length === 0 ? (
                      <p className="font-body text-xs text-ink-soft">
                        No other tags co-occurred with &quot;{row.key}&quot; this period — these searches were only
                        tagged {row.key}.
                      </p>
                    ) : (
                      <>
                        <p className="font-body text-xs text-ink-soft">
                          Niches within <span className="font-medium text-ink">{row.key}</span> this period:
                        </p>
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {co.map((c) => (
                            <li
                              key={c.tag}
                              className="font-body rounded-full bg-surface px-2.5 py-1 text-xs text-ink tabular-nums"
                            >
                              {c.tag} <span className="text-ink-soft">· {c.count}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
