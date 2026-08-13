const COVER = "Your ideas are cheap";
const REVEAL = "Your execution is what matters";

/**
 * Both lines are stacked in the same grid cell (so the box sizes to
 * whichever wraps taller) and cross-fade with a slight vertical drift —
 * `revealed` is lifted to the page so clicking the idea input can trigger
 * the rewrite from outside.
 */
export function Headline({ revealed }: { revealed: boolean }) {
  return (
    <h1 className="font-display grid w-full text-center text-[clamp(3rem,9vw,8.5rem)] leading-[0.95] font-bold tracking-tight text-foreground">
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
