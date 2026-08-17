"use client";

import { useEffect, useRef } from "react";
import type { Phase } from "../lib/useVerdictFlow";
import type { VerdictResponse } from "../lib/verdict";
import { VerdictResults } from "./VerdictResults";
import { VerdictSkeleton } from "./VerdictSkeleton";

/**
 * Slides in from the right, covering the landing page — always solid
 * black regardless of the light/dark theme toggle, which is what was
 * asked for. Carries its own editable input (pre-filled with whatever
 * was last submitted) so a follow-up search doesn't need to close the
 * panel first.
 */
export function ResultsPanel({
  phase,
  result,
  errorMessage,
  lastIdea,
  onSubmit,
  onReset,
}: {
  phase: Phase;
  result: VerdictResponse | null;
  errorMessage: string | null;
  lastIdea: string;
  onSubmit: (idea: string) => void;
  onReset: () => void;
}) {
  const open = phase === "loading" || phase === "result" || phase === "error";
  const canSubmit = phase !== "loading";
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the panel's own field in sync with the last submitted idea
  // (e.g. reopening from idle) — but don't stomp on it while someone's
  // actively editing it for a follow-up query.
  useEffect(() => {
    if (open && inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.value = lastIdea;
    }
  }, [open, lastIdea]);

  const submit = () => onSubmit(inputRef.current?.value ?? "");

  return (
    <div
      className={`fixed inset-0 z-30 flex flex-col overflow-hidden bg-black text-white transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
      aria-hidden={!open}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 py-20 sm:px-8 sm:py-24">
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={onReset}
            aria-label="Start a new search"
            tabIndex={open ? 0 : -1}
            className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-black transition hover:opacity-80"
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

          <div className="relative min-w-0 flex-1">
            <input
              ref={inputRef}
              type="text"
              readOnly={phase === "loading"}
              tabIndex={open ? 0 : -1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) submit();
              }}
              placeholder="Tell us your idea - we'll tell you if it exists already"
              className="font-body h-14 w-full rounded-full bg-white/10 px-6 pr-16 text-white outline-none ring-1 ring-white/15 transition focus:ring-white/30"
            />
            <button
              type="button"
              onClick={submit}
              aria-label="Check if it exists"
              disabled={!canSubmit}
              tabIndex={open ? 0 : -1}
              className="absolute top-1/2 right-2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white text-black transition hover:opacity-90 disabled:opacity-60"
            >
              {phase === "loading" ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
                  <path
                    d="M5 12h13.5M13 6l6.5 6-6.5 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
          {phase === "loading" && <VerdictSkeleton />}
          {phase === "result" && result && <VerdictResults result={result} />}
          {phase === "error" && (
            <div className="flex h-full flex-col items-start justify-center gap-3">
              <p className="font-body text-white/70">{errorMessage}</p>
              <button
                type="button"
                onClick={submit}
                className="font-body cursor-pointer rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:opacity-90"
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
