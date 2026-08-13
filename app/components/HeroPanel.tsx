"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { submitIdea, VerdictError, type VerdictResponse } from "../lib/verdict";
import { VerdictDisplay } from "./VerdictDisplay";
import { VerdictSkeleton } from "./VerdictSkeleton";

type Theme = "light" | "dark";
type Phase = "idle" | "active" | "loading" | "result";

export function HeroPanel({
  theme,
  onRevealedChange,
}: {
  theme: Theme;
  onRevealedChange: (revealed: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<VerdictResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onRevealedChange(phase !== "idle");
  }, [phase, onRevealedChange]);

  // Submitting "lifts" the panel into full view — if the founder is still
  // up on the hero (hasn't scrolled), they'd otherwise submit and stare at
  // clouds while the sticky panel is still catching up below the fold.
  useEffect(() => {
    if (phase === "loading") {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [phase]);

  // Click anywhere outside the pill reverts it — but only while just
  // focused/typing. Once a request is in flight or a result is showing,
  // an accidental outside click shouldn't discard it; "Try another idea"
  // is the explicit way back from there.
  useEffect(() => {
    if (phase !== "active") return;
    const handlePointerDown = (event: PointerEvent) => {
      if (groupRef.current && !groupRef.current.contains(event.target as Node)) {
        inputRef.current?.blur();
        setPhase("idle");
        setErrorMessage(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [phase]);

  const handleSubmit = async () => {
    const idea = inputRef.current?.value.trim() ?? "";
    if (idea.length < 10) {
      setErrorMessage("Tell us a bit more — ideas need to be at least 10 characters.");
      return;
    }
    setErrorMessage(null);
    setPhase("loading");
    try {
      const data = await submitIdea(idea);
      setResult(data);
      setPhase("result");
    } catch (err) {
      setPhase("active");
      setErrorMessage(err instanceof VerdictError ? err.message : "Something went wrong. Try again.");
    }
  };

  const handleReset = () => {
    setResult(null);
    setErrorMessage(null);
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  const active = phase === "active" || phase === "loading";

  // Only key on the blocks that are actually visually/structurally
  // different (form vs skeleton vs result) — keying on raw `phase` would
  // also remount between "idle" and "active", destroying the <input>'s
  // DOM node (and with it, focus and whatever the founder already typed)
  // the instant they click in.
  const contentKey = phase === "idle" || phase === "active" ? "form" : phase;

  return (
    <div
      ref={rootRef}
      className="sticky top-0 h-screen w-full overflow-hidden rounded-t-[2.5rem] sm:rounded-t-[3.5rem]"
    >
      {/* Both skies stay mounted and cross-fade on theme change, instead of
          swapping `src` on one <Image>, so toggling never shows a blank
          frame while the new (large) image decodes. Each drifts slowly on
          its own animation loop for a dreamy, living quality. */}
      <Image
        src="/images/sky-light.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className={`animate-sky-drift object-cover transition-opacity duration-500 ${
          theme === "light" ? "opacity-100" : "opacity-0"
        }`}
      />
      <Image
        src="/images/sky-dark.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className={`animate-sky-drift object-cover transition-opacity duration-500 ${
          theme === "dark" ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Soft vignette — keeps the crop from reading as a hard photo pasted
          into a rounded rectangle; edges recede, center stays luminous. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_10%,transparent_45%,rgba(0,0,0,0.16)_100%)]" />

      {/* Anchored a comfortable distance from the panel's own top edge
          (not viewport-centered), so it tracks the panel as it moves.
          overflow-y-auto is a safety net: a 5-match result can be taller
          than the viewport, and this panel is a fixed h-screen. */}
      <div className="relative z-10 flex h-full w-full justify-center overflow-y-auto px-6 pt-14 pb-10 sm:pt-16">
        <div key={contentKey} className="animate-panel-in flex w-full flex-col items-center">
          {phase === "result" && result && <VerdictDisplay result={result} onReset={handleReset} />}

          {phase === "loading" && <VerdictSkeleton />}

          {(phase === "idle" || phase === "active") && (
            <>
              <div
                ref={groupRef}
                className={`relative w-full transition-[max-width] duration-500 ease-out ${
                  active ? "max-w-3xl" : "max-w-xl"
                }`}
              >
                <input
                  ref={inputRef}
                  type="text"
                  onFocus={() => phase === "idle" && setPhase("active")}
                  onChange={() => errorMessage && setErrorMessage(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && phase === "active") handleSubmit();
                  }}
                  placeholder="Tell us your idea - we'll tell you if it exists already"
                  className={`font-body h-14 w-full rounded-full bg-surface/80 px-6 text-ink shadow-[0_8px_40px_rgba(0,0,0,0.18)] ring-1 ring-white/50 backdrop-blur-md outline-none transition-[padding] duration-500 ease-out placeholder:text-ink/50 ${
                    active ? "pr-16" : ""
                  }`}
                />
                <button
                  type="button"
                  onClick={handleSubmit}
                  aria-label="Check if it exists"
                  tabIndex={active ? 0 : -1}
                  className={`absolute top-1/2 right-2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-ink text-white transition-all duration-300 ${
                    active ? "scale-100 opacity-100" : "pointer-events-none scale-75 opacity-0"
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
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
              {errorMessage && (
                <p className="font-body mt-3 max-w-xl text-center text-sm text-ink-soft">{errorMessage}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
