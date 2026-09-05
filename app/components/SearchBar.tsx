"use client";

import { useEffect, useRef } from "react";
import type { Phase } from "../lib/useVerdictFlow";
import type { RegionScope, VerdictResponse } from "../lib/verdict";
import { VerdictResults } from "./VerdictResults";
import { VerdictSkeleton } from "./VerdictSkeleton";

/**
 * The landing page's single entry point. Idle/active is just a floating
 * pill. On submit it morphs in place into a card (BouncingCircles reads
 * the same "expanded" condition to grow its keepout zone, so nearby
 * circles physically get pushed out of the way instead of overlapping
 * it) showing the same compact results grid as the card's own preview,
 * plus a "Read more" button that hands off to the side panel for a
 * more detailed look at the same matches.
 *
 * `expanded` is a prop, not derived from `phase` internally — page.tsx
 * forces it false on mobile, where the full-screen panel takes over
 * directly instead of this card ever growing (no room for both).
 *
 * A one-line greeting sits above the pill, and the region-scope toggle
 * sits below it, both hidden once `expanded` (no room, and a search is
 * already in flight or done by then). These exist because real user
 * feedback said the intro's one-shot typing animation alone doesn't
 * reliably land — see IntroSequence.tsx's doc comment — so what the site
 * does needs to also live somewhere persistent, not just in a few
 * seconds of black-screen copy nobody may actually read.
 */
export function SearchBar({
  phase,
  result,
  loadingMore,
  errorMessage,
  lastIdea,
  expanded,
  regionScope,
  onRegionScopeChange,
  onActivate,
  onCancel,
  onSubmit,
  onReadMore,
  onReset,
}: {
  phase: Phase;
  result: VerdictResponse | null;
  loadingMore: boolean;
  errorMessage: string | null;
  lastIdea: string;
  expanded: boolean;
  regionScope: RegionScope;
  onRegionScopeChange: (scope: RegionScope) => void;
  onActivate: () => void;
  onCancel: () => void;
  onSubmit: (idea: string) => void;
  onReadMore: () => void;
  onReset: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const active = phase !== "idle";
  const canSubmit = phase !== "loading";

  useEffect(() => {
    if (phase === "idle" && inputRef.current) inputRef.current.value = "";
  }, [phase]);

  // Once expanded, keep the field in sync with whatever was actually
  // submitted (e.g. re-deriving after a reset) without stomping on it
  // while someone's actively editing it for a follow-up query.
  useEffect(() => {
    if (expanded && inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.value = lastIdea;
    }
  }, [expanded, lastIdea]);

  useEffect(() => {
    if (phase !== "active") return;
    const handlePointerDown = (event: PointerEvent) => {
      if (groupRef.current && !groupRef.current.contains(event.target as Node)) {
        inputRef.current?.blur();
        onCancel();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [phase, onCancel]);

  const submit = () => onSubmit(inputRef.current?.value ?? "");

  const setRegion = (scope: Exclude<RegionScope, null>) =>
    onRegionScopeChange(regionScope === scope ? null : scope);

  return (
    // groupRef now wraps the greeting + toggle row too, not just the
    // pill/card itself — the outside-click "collapse back to idle"
    // handler above checks `groupRef.current.contains(...)`, and a
    // click on a region pill (which renders outside the pill/card's own
    // box) must not count as "outside" or it'd blur/cancel the bar the
    // founder is actively typing into.
    <div ref={groupRef} className="pointer-events-auto flex w-full flex-col items-center gap-3">
      {!expanded && (
        <p className="font-body max-w-md px-2 text-center text-sm text-foreground/70 sm:text-base">
          <span className="font-semibold text-foreground">Hi, I&rsquo;m Priora.</span> Tell me your
          idea — I&rsquo;ll tell you if it already exists.
        </p>
      )}

      <div
        className={`relative flex w-full flex-col overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          expanded
            ? "max-w-3xl rounded-[2rem] bg-foreground shadow-[0_20px_60px_rgba(0,0,0,0.3)] ring-1 ring-foreground/10"
            : "max-w-xl rounded-full"
        }`}
        style={expanded ? { height: "min(68vh, 560px)" } : undefined}
      >
        <div className={`flex shrink-0 items-center gap-3 ${expanded ? "p-4 sm:p-5" : ""}`}>
          {expanded && (
            <button
              type="button"
              onClick={onReset}
              aria-label="Start a new search"
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-background text-foreground transition hover:opacity-80"
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
          )}

          <div className="relative min-w-0 flex-1">
            <input
              ref={inputRef}
              type="text"
              onFocus={onActivate}
              readOnly={phase === "loading"}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) submit();
              }}
              placeholder="Tell us your idea - we'll tell you if it exists already"
              className={`font-body h-12 w-full rounded-full px-5 pr-14 text-sm outline-none transition-colors duration-300 sm:h-14 sm:px-6 sm:pr-16 sm:text-base ${
                expanded
                  ? "bg-background/10 text-background ring-1 ring-background/15 placeholder:text-background/40 focus:ring-background/30"
                  : "bg-white text-black shadow-[0_8px_40px_rgba(0,0,0,0.18)] ring-1 ring-black/10 placeholder:text-black/45"
              }`}
            />
            <button
              type="button"
              onClick={submit}
              aria-label="Check if it exists"
              disabled={!canSubmit}
              tabIndex={active ? 0 : -1}
              className={`absolute top-1/2 right-1.5 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full transition-all duration-300 disabled:opacity-60 sm:right-2 sm:h-10 sm:w-10 ${
                expanded ? "bg-background text-foreground" : "bg-black text-white"
              } ${active ? "scale-100 opacity-100" : "pointer-events-none scale-75 opacity-0"}`}
            >
              {phase === "loading" ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
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

        {expanded && (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5 sm:pb-5">
            {phase === "loading" && <VerdictSkeleton />}
            {phase === "result" && result && <VerdictResults result={result} loadingMore={loadingMore} />}
            {phase === "error" && (
              <div className="flex h-full flex-col items-start justify-center gap-3">
                <p className="font-body text-background/70">{errorMessage}</p>
                <button
                  type="button"
                  onClick={submit}
                  className="font-body cursor-pointer rounded-full bg-background px-5 py-2 text-sm font-semibold text-foreground transition hover:opacity-90"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        )}

        {phase === "result" && result && (
          <div className="shrink-0 border-t border-background/10 p-4 sm:p-5">
            <button
              type="button"
              onClick={onReadMore}
              className="font-body group flex cursor-pointer items-center gap-2 text-sm font-semibold text-background transition hover:opacity-80"
            >
              Read more
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                aria-hidden
              >
                <path
                  d="M5 12h13.5M13 6l6.5 6-6.5 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {!expanded && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRegion("africa")}
            aria-pressed={regionScope === "africa"}
            title="Scope results to companies serving Africa"
            className={`font-body cursor-pointer rounded-full px-4 py-1.5 text-xs font-medium transition sm:text-sm ${
              regionScope === "africa"
                ? "bg-foreground text-background"
                : "bg-foreground/8 text-foreground/70 hover:bg-foreground/15"
            }`}
          >
            Africa
          </button>
          <button
            type="button"
            onClick={() => setRegion("western")}
            aria-pressed={regionScope === "western"}
            title="Scope results to companies serving the US/Europe"
            className={`font-body cursor-pointer rounded-full px-4 py-1.5 text-xs font-medium transition sm:text-sm ${
              regionScope === "western"
                ? "bg-foreground text-background"
                : "bg-foreground/8 text-foreground/70 hover:bg-foreground/15"
            }`}
          >
            Western
          </button>
        </div>
      )}
    </div>
  );
}
