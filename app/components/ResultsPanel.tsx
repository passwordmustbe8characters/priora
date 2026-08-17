"use client";

import type { VerdictResponse } from "../lib/verdict";
import { VerdictDetail } from "./VerdictDetail";

/**
 * The "Read more" destination — slides in from the right over the whole
 * screen. Uses the same foreground/background token pair as the search
 * card, so it flips with the light/dark theme toggle too (this is the
 * "results page" the toggle needs to reach). Read-only: editing and
 * follow-up queries happen back in the search card itself, this just
 * shows a bit more detail on the same matches.
 */
export function ResultsPanel({
  open,
  result,
  onClose,
}: {
  open: boolean;
  result: VerdictResponse | null;
  onClose: () => void;
}) {
  return (
    <div
      className={`fixed inset-0 z-30 flex flex-col overflow-hidden bg-foreground text-background transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
      aria-hidden={!open}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 py-20 sm:px-8 sm:py-24">
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

        <div className="mt-6 min-h-0 flex-1 overflow-y-auto">{result && <VerdictDetail result={result} />}</div>
      </div>
    </div>
  );
}
