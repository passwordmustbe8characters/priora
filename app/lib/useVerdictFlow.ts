"use client";

import { useState, type RefObject } from "react";
import { submitIdea, VerdictError, type VerdictResponse } from "./verdict";

export type Phase = "idle" | "active" | "loading" | "result" | "error";

/**
 * Owns the whole search→verdict lifecycle so it can be shared between the
 * search pill and whatever needs to know its state (the headline shrinks
 * once a search starts). The input's value lives in the DOM (uncontrolled,
 * read via inputRef) rather than in React state — it's never cleared on a
 * successful search, so it stays visible/editable for a follow-up query,
 * and Enter re-submits from "result" or "error" just like from "active".
 *
 * inputRef is created by the caller and passed in, not created/returned
 * here — a hook returning an object that bundles a ref alongside plain
 * render state trips the react-hooks/refs lint rule, which (correctly
 * conservatively) can't prove property access on the combined object is
 * never a ref read. Keeping ref ownership in the component and state
 * ownership in the hook sidesteps that entirely.
 */
export function useVerdictFlow(inputRef: RefObject<HTMLInputElement | null>) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<VerdictResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const submit = async () => {
    const idea = inputRef.current?.value.trim() ?? "";
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
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  return { phase, result, errorMessage, activate, cancel, submit, reset, clearErrorOnEdit };
}
