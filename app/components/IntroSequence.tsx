"use client";

import { useEffect, useState } from "react";
import { playSwoosh, playTypeTick, primeAudio } from "../lib/sound";

const COPY =
  "Most startup ideas already exist somewhere. Priora tells you which ones — in seconds, with real sources — before you spend months building the wrong thing.";
const HOLD_MS = 3000; // pause after typing finishes, before swiping up
const SWIPE_MS = 900; // must match the transition duration below, and the swoosh

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/** Deliberately uneven, like someone hunting-and-pecking with one hand
 * rather than a perfectly uniform machine cadence — longer at word and
 * punctuation boundaries, a bit of random jitter on ordinary letters. */
function nextDelay(char: string) {
  if (char === " ") return rand(140, 220);
  if (",.—".includes(char)) return rand(220, 320);
  return rand(90, 170);
}

/**
 * First thing rendered on load: a black screen that types out a short
 * definition of Priora (hero-sized, matching the old headline's weight),
 * at a deliberately uneven one-hand-typing pace with a mechanical
 * typewriter clack per character, then an airplane-style whoosh as it
 * swipes up to reveal the page underneath. A muted-speaker icon follows
 * the cursor with a "click for sound" hint until the first click/keypress
 * unlocks audio (browsers block sound before any user gesture), then it
 * disappears. Calls `onDone` once the swipe finishes so the parent can
 * stop rendering this entirely rather than just hiding it.
 */
export function IntroSequence({ onDone }: { onDone: () => void }) {
  const [typed, setTyped] = useState("");
  const [swiping, setSwiping] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // Browsers block audio until a real user gesture — this grabs the
  // earliest possible one so sound has the best chance of being live by
  // the time typing/swoosh actually happen, and also retires the
  // "click for sound" cue once it's been acted on.
  useEffect(() => {
    const unlock = () => {
      primeAudio();
      setAudioUnlocked(true);
    };
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
        typeTimer = setTimeout(typeNext, nextDelay(char));
      } else {
        holdTimer = setTimeout(() => {
          setSwiping(true);
          playSwoosh();
          swipeTimer = setTimeout(onDone, SWIPE_MS);
        }, HOLD_MS);
      }
    }
    typeTimer = setTimeout(typeNext, nextDelay(COPY[0]));

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
      onMouseMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black px-6 transition-transform duration-900 ease-[cubic-bezier(0.65,0,0.35,1)] sm:px-12 ${
        swiping ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <p className="font-display max-w-5xl text-center text-[clamp(2rem,5vw,4.25rem)] leading-[1.05] font-bold tracking-tight text-white text-balance">
        {typed}
        <span className="ml-1 inline-block h-[0.85em] w-[0.06em] animate-pulse bg-white align-middle" aria-hidden />
      </p>

      {cursor && !audioUnlocked && (
        <div
          className="pointer-events-none fixed z-10 flex -translate-x-1/2 translate-y-5 items-center gap-2"
          style={{ left: cursor.x, top: cursor.y }}
          aria-hidden
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 backdrop-blur-sm">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-white">
              <path
                d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z"
                fill="currentColor"
              />
              <path
                d="M16.5 9.5l4 4m0-4-4 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="font-body text-xs whitespace-nowrap text-white/60">Click for sound</span>
        </div>
      )}
    </div>
  );
}
