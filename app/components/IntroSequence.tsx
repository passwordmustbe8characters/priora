"use client";

import { useEffect, useState } from "react";
import { playSwoosh, playTypeTick, primeAudio } from "../lib/sound";

const COPY =
  "Most startup ideas already exist somewhere. Priora tells you which ones — in seconds, with real sources — before you spend months building the wrong thing.";
const TYPE_SPEED_MS = 28; // per character
const HOLD_MS = 1400; // pause after typing finishes, before swiping up
const SWIPE_MS = 700; // must match the transition duration below

/**
 * First thing rendered on load: a black screen that types out a short
 * definition of Priora (hero-sized, matching the old headline's weight),
 * with a soft key-tick per character and a whoosh as it swipes up to
 * reveal the page underneath. Calls `onDone` once the swipe finishes so
 * the parent can stop rendering this entirely rather than just hiding it.
 */
export function IntroSequence({ onDone }: { onDone: () => void }) {
  const [typed, setTyped] = useState("");
  const [swiping, setSwiping] = useState(false);

  // Browsers block audio until a real user gesture — this grabs the
  // earliest possible one so sound has the best chance of being live by
  // the time typing/swoosh actually happen.
  useEffect(() => {
    const unlock = () => primeAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

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
      const char = COPY[i - 1];
      setTyped(COPY.slice(0, i));
      if (char && char.trim() !== "") playTypeTick();
      if (i < COPY.length) {
        typeTimer = setTimeout(typeNext, TYPE_SPEED_MS);
      } else {
        holdTimer = setTimeout(() => {
          setSwiping(true);
          playSwoosh();
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
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black px-6 transition-transform duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] sm:px-12 ${
        swiping ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <p className="font-display max-w-5xl text-center text-[clamp(2rem,5vw,4.25rem)] leading-[1.05] font-bold tracking-tight text-white text-balance">
        {typed}
        <span className="ml-1 inline-block h-[0.85em] w-[0.06em] animate-pulse bg-white align-middle" aria-hidden />
      </p>
    </div>
  );
}
