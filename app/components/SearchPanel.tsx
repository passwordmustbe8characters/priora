"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { useVerdictFlow, type Phase } from "../lib/useVerdictFlow";
import { VerdictResults } from "./VerdictResults";
import { VerdictSkeleton } from "./VerdictSkeleton";

type Theme = "light" | "dark";

export function SearchPanel({
  theme,
  onPhaseChange,
}: {
  theme: Theme;
  onPhaseChange: (phase: Phase) => void;
}) {
  const flow = useVerdictFlow();
  const { phase } = flow;
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onPhaseChange(phase);
  }, [phase, onPhaseChange]);

  // Click anywhere outside reverts the pill — but only while just
  // focused/typing with nothing submitted. Once morphed open (loading,
  // a result, or an error), an accidental outside click shouldn't
  // discard it.
  useEffect(() => {
    if (phase !== "active") return;
    const handlePointerDown = (event: PointerEvent) => {
      if (groupRef.current && !groupRef.current.contains(event.target as Node)) {
        flow.inputRef.current?.blur();
        flow.cancel();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [phase, flow]);

  const morphed = phase === "loading" || phase === "result" || phase === "error";
  const canSubmit = phase !== "loading";

  return (
    <div className="flex w-full flex-col items-center">
      <div
        ref={groupRef}
        className={`relative w-full overflow-hidden shadow-2xl transition-all duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          morphed
            ? "h-[54vh] max-w-5xl rounded-[2rem]"
            : "h-14 max-w-xl rounded-full shadow-[0_8px_40px_rgba(0,0,0,0.18)]"
        }`}
      >
        {/* Cloud imagery only becomes visible once morphed open — reuses
            the brand's signature painterly-sky panel, but on demand
            instead of as a permanent scroll-away section. */}
        <Image
          src="/images/sky-light.jpg"
          alt=""
          fill
          sizes="100vw"
          className={`animate-sky-drift object-cover transition-opacity duration-500 ${
            morphed && theme === "light" ? "opacity-100" : "opacity-0"
          }`}
        />
        <Image
          src="/images/sky-dark.jpg"
          alt=""
          fill
          sizes="100vw"
          className={`animate-sky-drift object-cover transition-opacity duration-500 ${
            morphed && theme === "dark" ? "opacity-100" : "opacity-0"
          }`}
        />
        {morphed && (
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_10%,transparent_45%,rgba(0,0,0,0.16)_100%)]" />
        )}

        <div
          className={`relative z-10 flex h-full w-full flex-col transition-[padding] duration-500 ease-out ${
            morphed ? "p-4 sm:p-6" : ""
          }`}
        >
          {/* Back button and input share one flex row so they're always
              vertically centered on each other, regardless of exact
              sizing — no manual offset math to keep in sync. */}
          <div className="flex shrink-0 items-center gap-3">
            {morphed && (
              <button
                type="button"
                onClick={flow.reset}
                aria-label="Start a new search"
                className="animate-fade-in-up flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink text-white transition hover:opacity-80"
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

            {/* The input itself never remounts across phases — same DOM
                node throughout — so focus and whatever's typed survives
                every transition. It sits at the top of the rectangle
                once morphed, staying editable for a follow-up search. */}
            <div className="relative min-w-0 flex-1">
              <input
                ref={flow.inputRef}
                type="text"
                readOnly={phase === "loading"}
                onFocus={flow.activate}
                onChange={flow.clearErrorOnEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) flow.submit();
                }}
                placeholder="Tell us your idea - we'll tell you if it exists already"
                className={`font-body h-14 w-full rounded-full bg-surface/85 px-6 text-ink shadow-[0_4px_20px_rgba(0,0,0,0.1)] ring-1 ring-white/50 backdrop-blur-md outline-none transition-[padding] duration-500 ease-out placeholder:text-ink/50 ${
                  phase !== "idle" ? "pr-16" : ""
                }`}
              />
              <button
                type="button"
                onClick={flow.submit}
                aria-label="Check if it exists"
                disabled={!canSubmit}
                tabIndex={phase !== "idle" ? 0 : -1}
                className={`absolute top-1/2 right-2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-ink text-white transition-all duration-300 ${
                  phase !== "idle" ? "scale-100 opacity-100" : "pointer-events-none scale-75 opacity-0"
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

          {morphed && (
            <div className="animate-fade-in-up mt-4 min-h-0 flex-1 [animation-delay:120ms]">
              {phase === "loading" && <VerdictSkeleton />}
              {phase === "result" && flow.result && <VerdictResults result={flow.result} />}
              {phase === "error" && (
                <div className="flex h-full flex-col items-start justify-center gap-3">
                  <p className="font-body text-sm text-ink-soft sm:text-base">{flow.errorMessage}</p>
                  <button
                    type="button"
                    onClick={flow.submit}
                    className="font-body cursor-pointer rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {phase === "active" && flow.errorMessage && (
        <p className="font-body mt-3 max-w-xl text-center text-sm text-foreground/60">{flow.errorMessage}</p>
      )}
    </div>
  );
}
