"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the primary pointer is coarse (touch) rather than fine
 * (mouse/trackpad). Uses useSyncExternalStore rather than a plain
 * useState+useEffect pair specifically to avoid a hydration mismatch —
 * this value is unknowable during SSR (no window), and calling setState
 * from an effect to "correct" it post-mount is exactly the pattern that
 * caused a real hydration-mismatch bug earlier in this project
 * (IntroSequence's cursor-vs-tap sound cue). getServerSnapshot below is
 * the React-sanctioned way to give a safe default for the SSR pass
 * while still resolving correctly on the client without an error.
 */
function subscribeNoop() {
  return () => {};
}
function getSnapshot() {
  return window.matchMedia("(pointer: coarse)").matches;
}
function getServerSnapshot() {
  return false;
}

export function useIsTouchDevice(): boolean {
  return useSyncExternalStore(subscribeNoop, getSnapshot, getServerSnapshot);
}
