const COVER = "Your ideas are cheap";
const REVEAL = "Your execution is what matters";

/**
 * Both lines are stacked in the same grid cell (so the box sizes to
 * whichever wraps taller) and cross-fade with a slight vertical drift —
 * `revealed` is lifted to the page so clicking the idea input can trigger
 * the rewrite from outside. `compact` shrinks it once a search is loading
 * or showing a result, freeing up room for the results rectangle to grow
 * into without ever needing the page itself to scroll.
 */
export function Headline({ revealed, compact }: { revealed: boolean; compact: boolean }) {
  return (
    <h1
      className={`font-display grid w-full text-center leading-[0.95] font-bold tracking-tight text-foreground transition-all duration-500 ease-out ${
        compact ? "mb-3 text-[clamp(1.75rem,4.5vw,3rem)] sm:mb-4" : "mb-6 text-[clamp(4.5rem,10vw,9.5rem)] sm:mb-8"
      }`}
    >
      <span
        aria-hidden={revealed}
        className={`text-balance transition-all duration-500 ease-out [grid-area:1/1] ${
          revealed ? "-translate-y-3 opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        {COVER}
      </span>
      <span
        aria-hidden={!revealed}
        className={`text-balance transition-all duration-500 ease-out [grid-area:1/1] ${
          revealed ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        {REVEAL}
      </span>
    </h1>
  );
}
