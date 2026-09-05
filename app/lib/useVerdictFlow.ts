"use client";

import { useRef, useState } from "react";
import { submitIdea, submitIdeaLive, VerdictError, type RegionScope, type VerdictResponse } from "./verdict";

export type Phase = "idle" | "active" | "loading" | "result" | "error";

/**
 * Owns the whole search→verdict lifecycle. `submit` takes the idea text
 * directly as an argument rather than reading a shared input ref — there
 * are now two separate inputs (the landing search bar, and the results
 * panel's own editable field for a follow-up query), so the hook doesn't
 * own or care which DOM node the text came from. `lastIdea` is exposed so
 * whichever input renders next (e.g. the panel opening) can be
 * pre-filled with what was actually submitted.
 *
 * Cache-then-live is two requests now, not one (see pipeline.ts's
 * "Orchestrator" doc comment) — `submit` awaits only the fast cache
 * phase before flipping to `phase: "result"`. If that response says
 * `needsLiveSearch`, `result` is still shown (whatever real matches the
 * cache already found) with `loadingMore: true` alongside it, and the
 * live phase is kicked off in the background; `result` is swapped for
 * the complete answer and `loadingMore` clears once it resolves. A
 * generation counter (not a boolean "is a request in flight") guards
 * against a stale live-phase response landing after the user has
 * already started a whole new search — see `submit`.
 */
export function useVerdictFlow() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<VerdictResponse | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastIdea, setLastIdea] = useState("");
  // The search bar's Africa/Western toggle. Deliberately NOT reset by
  // `reset()` below — it's a standing preference like the theme toggle,
  // not part of one search's transient state, so starting a new search
  // keeps whatever scope was last selected instead of silently widening
  // back out to "all round".
  const [regionScope, setRegionScope] = useState<RegionScope>(null);
  const generationRef = useRef(0);

  const activate = () => {
    if (phase === "idle") setPhase("active");
  };

  const clearErrorOnEdit = () => {
    if (errorMessage) setErrorMessage(null);
  };

  // Only meaningful while just focused/typing with nothing submitted yet —
  // an accidental outside click shouldn't discard a result or an error.
  const cancel = () => {
    setPhase("idle");
    setErrorMessage(null);
  };

  const submit = async (rawIdea: string) => {
    const idea = rawIdea.trim();
    setLastIdea(idea);
    if (idea.length < 10) {
      setErrorMessage("Tell us a bit more — ideas need to be at least 10 characters.");
      return;
    }
    if (idea.length > 2000) {
      setErrorMessage("That's a lot of idea — keep it under 2000 characters.");
      return;
    }
    setErrorMessage(null);
    setPhase("loading");
    setLoadingMore(false);
    // Bumped on every new submit — a live-phase response only gets
    // applied if this hasn't moved on since, so a slow phase 2 from an
    // abandoned search can never clobber a result the user has already
    // moved past (a fresh submit, or a reset).
    const generation = ++generationRef.current;

    // Captured once per submit, not read live off state mid-flight — a
    // search should stay scoped to whatever was selected the moment it
    // was submitted, even if the founder flips the toggle again while
    // this request is still in progress.
    const scope = regionScope;

    try {
      const data = await submitIdea(idea, scope);
      if (generation !== generationRef.current) return;
      setResult(data);
      setPhase("result");

      if (data.needsLiveSearch) {
        setLoadingMore(true);
        try {
          const finalData = await submitIdeaLive({
            ideaRaw: idea,
            normalizedIdea: data.idea.normalized,
            categoryTags: data.categoryTags ?? [],
            existingMatches: data.matches,
            regionScope: scope,
          });
          if (generation !== generationRef.current) return;
          setResult(finalData);
        } catch {
          // The live phase failing shouldn't take away the real,
          // already-shown cache matches — same "a later stage failing
          // doesn't invalidate what already succeeded" principle as the
          // paid report's own multi-stage pipeline. Silently stop
          // waiting; whatever the cache phase found stays on screen.
        } finally {
          if (generation === generationRef.current) setLoadingMore(false);
        }
      }
    } catch (err) {
      if (generation !== generationRef.current) return;
      setErrorMessage(err instanceof VerdictError ? err.message : "Something went wrong. Try again.");
      setPhase("error");
    }
  };

  const reset = () => {
    generationRef.current++;
    setResult(null);
    setLoadingMore(false);
    setErrorMessage(null);
    setLastIdea("");
    setPhase("idle");
  };

  return {
    phase,
    result,
    loadingMore,
    errorMessage,
    lastIdea,
    regionScope,
    setRegionScope,
    activate,
    cancel,
    submit,
    reset,
    clearErrorOnEdit,
  };
}
