"use client";

import { useEffect, useState } from "react";

const COPY =
  "Most startup ideas already exist somewhere. Priora tells you which ones — in seconds, with real sources — before you spend months building the wrong thing.";
const TYPE_SPEED_MS = 28; // per character
const HOLD_MS = 1400; // pause after typing finishes, before swiping up
const SWIPE_MS = 700; // must match the transition duration below

/**
 * First thing rendered on load: a black screen that types out a short
 * definition of Priora, holds for a beat, then swipes up to reveal the
 * page underneath. Calls `onDone` once the swipe finishes so the parent
 * can stop rendering this entirely rather than just hiding it.
 */
export function IntroSequence({ onDone }: { onDone: () => void }) {
  const [typed, setTyped] = useState("");
  const [swiping, setSwiping] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      onDone();
      return;
    }

    let i = 0;
    let typeTimer: ReturnType<typeof setTimeout>;
    let holdTimer: ReturnType<typeof setTimeout>;
    let swipeTimer: ReturnType<typeof setTimeout>;

    function typeNext() {
      i++;
      setTyped(COPY.slice(0, i));
      if (i < COPY.length) {
        typeTimer = setTimeout(typeNext, TYPE_SPEED_MS);
      } else {
        holdTimer = setTimeout(() => {
          setSwiping(true);
          swipeTimer = setTimeout(onDone, SWIPE_MS);
        }, HOLD_MS);
      }
    }
    typeTimer = setTimeout(typeNext, TYPE_SPEED_MS);

    return () => {
      clearTimeout(typeTimer);
      clearTimeout(holdTimer);
      clearTimeout(swipeTimer);
    };
    // Intentionally runs once on mount only — onDone is stable enough
    // for a one-shot intro and re-running this on every render would
    // restart the typewriter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black px-6 transition-transform duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] ${
        swiping ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <p className="font-body max-w-xl text-center text-lg text-white sm:text-xl">
        {typed}
        <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-white align-middle" aria-hidden />
      </p>
    </div>
  );
}
