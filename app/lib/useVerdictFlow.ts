"use client";

import { useState } from "react";
import { submitIdea, VerdictError, type VerdictResponse } from "./verdict";

export type Phase = "idle" | "active" | "loading" | "result" | "error";

/**
 * Owns the whole search→verdict lifecycle. `submit` takes the idea text
 * directly as an argument rather than reading a shared input ref — there
 * are now two separate inputs (the landing search bar, and the results
 * panel's own editable field for a follow-up query), so the hook doesn't
 * own or care which DOM node the text came from. `lastIdea` is exposed so
 * whichever input renders next (e.g. the panel opening) can be
 * pre-filled with what was actually submitted.
 */
export function useVerdictFlow() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<VerdictResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastIdea, setLastIdea] = useState("");

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
    try {
      const data = await submitIdea(idea);
      setResult(data);
      setPhase("result");
    } catch (err) {
      setErrorMessage(err instanceof VerdictError ? err.message : "Something went wrong. Try again.");
      setPhase("error");
    }
  };

  const reset = () => {
    setResult(null);
    setErrorMessage(null);
    setLastIdea("");
    setPhase("idle");
  };

  return { phase, result, errorMessage, lastIdea, activate, cancel, submit, reset, clearErrorOnEdit };
}
