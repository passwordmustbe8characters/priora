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
 * Idle/active is a taller rounded rectangle (not a thin pill), laid out
 * like a chat composer: the input fills the top, and a bottom row holds
 * the region-scope toggle at the left and the submit arrow at the
 * right, both inside the same white card. That bottom row (and the
 * whole rectangle shape) disappears once `expanded` (no room, and a
 * search is already in flight or done by then) — the expanded card
 * keeps its original single-row header layout untouched.
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
    <div
      ref={groupRef}
      className={`pointer-events-auto relative flex w-full flex-col overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        expanded
          ? "max-w-3xl rounded-[2rem] bg-foreground shadow-[0_20px_60px_rgba(0,0,0,0.3)] ring-1 ring-foreground/10"
          : // A rounded rectangle, not a thin pill, specifically so the
            // region-toggle row below has room to sit inside this same
            // white card rather than floating separately next to it.
            "max-w-xl rounded-[1.75rem] bg-white p-2 shadow-[0_8px_40px_rgba(0,0,0,0.18)] ring-1 ring-black/10 sm:p-2.5"
      }`}
      style={expanded ? { height: "min(68vh, 560px)" } : undefined}
    >
      {expanded ? (
        <div className="flex shrink-0 items-center gap-3 p-4 sm:p-5">
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
              className="font-body h-12 w-full rounded-full bg-background/10 px-4 pr-14 text-sm text-background outline-none ring-1 ring-background/15 transition-colors duration-300 placeholder:text-background/40 focus:ring-background/30 sm:h-14 sm:px-4 sm:pr-16 sm:text-base"
            />
            <button
              type="button"
              onClick={submit}
              aria-label="Check if it exists"
              disabled={!canSubmit}
              tabIndex={active ? 0 : -1}
              className={`absolute top-1/2 right-1.5 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-background text-foreground transition-all duration-300 disabled:opacity-60 sm:right-2 sm:h-10 sm:w-10 ${
                active ? "scale-100 opacity-100" : "pointer-events-none scale-75 opacity-0"
              }`}
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
      ) : (
        // Chat-composer layout: the input fills the top on its own line
        // (taller card, room to breathe), then one bottom row holds the
        // region toggle at the left and the submit arrow at the right —
        // no divider between them, just vertical spacing, so it reads as
        // one continuous card rather than two stacked sections.
        <div className="flex min-h-26 flex-col justify-between gap-3 p-1 sm:min-h-30 sm:p-1.5">
          <input
            ref={inputRef}
            type="text"
            onFocus={onActivate}
            readOnly={phase === "loading"}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) submit();
            }}
            placeholder="Tell us your idea - we'll tell you if it exists already"
            className="font-body w-full bg-transparent px-3 pt-2 text-base text-black outline-none placeholder:text-black/45 sm:px-4 sm:pt-2.5 sm:text-lg"
          />

          <div className="flex items-center justify-between gap-2 px-2 pb-1 sm:px-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRegion("africa")}
                aria-pressed={regionScope === "africa"}
                title="Scope results to companies serving Africa"
                className={`font-body cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition sm:text-sm ${
                  regionScope === "africa" ? "bg-black text-white" : "bg-black/5 text-black/70 hover:bg-black/10"
                }`}
              >
                Africa
              </button>
              <button
                type="button"
                onClick={() => setRegion("western")}
                aria-pressed={regionScope === "western"}
                title="Scope results to companies serving the US/Europe"
                className={`font-body cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition sm:text-sm ${
                  regionScope === "western" ? "bg-black text-white" : "bg-black/5 text-black/70 hover:bg-black/10"
                }`}
              >
                Western
              </button>
            </div>

            <button
              type="button"
              onClick={submit}
              aria-label="Check if it exists"
              disabled={!canSubmit}
              tabIndex={active ? 0 : -1}
              className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black text-white transition-all duration-300 disabled:opacity-60 sm:h-10 sm:w-10 ${
                active ? "scale-100 opacity-100" : "pointer-events-none scale-75 opacity-0"
              }`}
            >
              {phase === "loading" ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
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
      )}

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
  );
}
