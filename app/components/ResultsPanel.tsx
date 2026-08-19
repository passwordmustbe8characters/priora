"use client";

import type { Phase } from "../lib/useVerdictFlow";
import type { VerdictResponse } from "../lib/verdict";
import { VerdictDetail } from "./VerdictDetail";
import { VerdictSkeleton } from "./VerdictSkeleton";

/**
 * Slides in from the right over the whole screen. Uses the same
 * foreground/background token pair as the search card, so it flips
 * with the light/dark theme toggle too (this is the "results page" the
 * toggle needs to reach). Read-only: editing a query happens back in
 * the search card itself (desktop) — this shows a bit more detail on
 * the same matches, plus (on mobile, where the search card never
 * visually expands — see page.tsx) the loading/error states directly,
 * since this becomes the ONLY results surface there.
 *
 * Padding is deliberately much tighter on mobile (`py-6` vs `sm:py-24`)
 * — the generous desktop whitespace read as "cramped into a small box"
 * on a short mobile viewport instead of a true full-screen surface.
 */
export function ResultsPanel({
  open,
  phase,
  result,
  errorMessage,
  onClose,
  onRetry,
}: {
  open: boolean;
  phase: Phase;
  result: VerdictResponse | null;
  errorMessage: string | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <div
      className={`fixed inset-0 z-30 flex flex-col overflow-hidden bg-foreground text-background transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
      aria-hidden={!open}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-8 sm:py-24">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          tabIndex={open ? 0 : -1}
          className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-background text-foreground transition hover:opacity-80"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
            <path
              d="M19 12H5.5M11 6l-6.5 6 6.5 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
          {phase === "loading" && <VerdictSkeleton />}
          {phase === "result" && result && <VerdictDetail result={result} />}
          {phase === "error" && (
            <div className="flex h-full flex-col items-start justify-center gap-3">
              <p className="font-body text-background/70">{errorMessage}</p>
              <button
                type="button"
                onClick={onRetry}
                className="font-body cursor-pointer rounded-full bg-background px-5 py-2 text-sm font-semibold text-foreground transition hover:opacity-90"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
