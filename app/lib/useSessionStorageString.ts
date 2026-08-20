"use client";

import { useSyncExternalStore } from "react";

/**
 * Reads a sessionStorage value safely across SSR/hydration — same
 * reasoning as useIsTouchDevice: sessionStorage doesn't exist during
 * SSR, and reading it via a plain useState+useEffect pair (setState in
 * an effect) risks the exact hydration-mismatch class of bug already
 * hit twice in this project. useSyncExternalStore is the React-
 * sanctioned tool for exactly this.
 *
 * Returns the raw string, not a parsed object — getSnapshot must return
 * a referentially-stable value when nothing changed (React compares via
 * Object.is), and JSON.parse would allocate a new object every call,
 * causing an infinite re-render loop. Parse the returned string in the
 * caller instead, in the render body (cheap, no memoization needed for
 * something this small).
 */
function subscribeNoop() {
  return () => {};
}
function getServerSnapshot() {
  return null;
}

export function useSessionStorageString(key: string): string | null {
  const getSnapshot = () => (typeof window === "undefined" ? null : sessionStorage.getItem(key));
  return useSyncExternalStore(subscribeNoop, getSnapshot, getServerSnapshot);
}
