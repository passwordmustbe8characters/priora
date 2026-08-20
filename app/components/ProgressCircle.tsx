"use client";

/**
 * Water-fill progress indicator for GenerateReportModal. A wavy fill
 * rises to `progress` (0–1) while generating, then `done` smoothly
 * settles it into a solid circle and draws a checkmark on top — one
 * persistent element carrying the whole motion, not two different
 * pieces of UI swapped at the end. For that morph to actually animate
 * (rather than just cut), the caller must keep this component mounted
 * continuously across the generating→ready transition rather than
 * conditionally rendering two separate instances.
 *
 * Colors come from the ink/surface tokens already used throughout this
 * card (not the page's background/foreground pair) — this card is a
 * fixed white surface by design regardless of site light/dark mode
 * (see globals.css), so ink/surface *is* this component's theme, not a
 * separate light/dark variant to maintain.
 */
export function ProgressCircle({ progress, done }: { progress: number; done: boolean }) {
  const fillPercent = done ? 100 : Math.round(Math.max(6, Math.min(94, progress * 100)));

  return (
    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-ink/15 bg-ink/5">
      <div
        className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out"
        style={{ height: `${fillPercent}%` }}
      >
        {/* Solid base — always fills the layer's full height, so once
            the wave fades out at `done` what's left reads as a clean
            settled circle rather than an abrupt color swap. */}
        <div className="absolute inset-0 bg-ink" />

        {/* Wavy surface texture, riding the top edge of the fill.
            Two copies of the same path side by side (viewBox 0 0 200
            20), scrolled by exactly 50% (= one copy's width) on a loop
            — see the water-wave-scroll keyframes in globals.css. */}
        <svg
          viewBox="0 0 200 20"
          preserveAspectRatio="none"
          className={`animate-water-wave absolute top-[-9px] left-0 h-5 w-[200%] text-ink transition-opacity duration-500 ${
            done ? "opacity-0" : "opacity-100"
          }`}
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M0,10 C25,2 25,18 50,10 C75,2 75,18 100,10 L100,20 L0,20 Z M100,10 C125,2 125,18 150,10 C175,2 175,18 200,10 L200,20 L100,20 Z"
          />
        </svg>
      </div>

      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-out ${
          done ? "scale-100 opacity-100" : "scale-75 opacity-0"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-surface">
          <path
            d="M5 12.5 9.5 17 19 7"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={done ? 0 : 1}
            style={{ transition: "stroke-dashoffset 0.5s ease 0.2s" }}
          />
        </svg>
      </div>
    </div>
  );
}
