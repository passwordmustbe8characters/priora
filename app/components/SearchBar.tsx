"use client";

import { useEffect, useRef } from "react";
import type { Phase } from "../lib/useVerdictFlow";

/**
 * The landing page's centered entry point — idle/active only, no morph.
 * Once submitted, the ResultsPanel takes over with its own editable
 * input; this one just resets quietly when the flow returns to idle.
 */
export function SearchBar({
  phase,
  onActivate,
  onCancel,
  onSubmit,
}: {
  phase: Phase;
  onActivate: () => void;
  onCancel: () => void;
  onSubmit: (idea: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const active = phase !== "idle";

  useEffect(() => {
    if (phase === "idle" && inputRef.current) inputRef.current.value = "";
  }, [phase]);

  useEffect(() => {
    if (phase !== "active") return;
    const handlePointerDown = (event: PointerEvent) => {
      if (groupRef.current && !groupRef.current.contains(event.target as Node)) {
        inputRef.current?.blur();
        onCancel();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [phase, onCancel]);

  const submit = () => onSubmit(inputRef.current?.value ?? "");

  return (
    <div ref={groupRef} className="pointer-events-auto relative w-full max-w-xl">
      <input
        ref={inputRef}
        type="text"
        onFocus={onActivate}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Tell us your idea - we'll tell you if it exists already"
        className={`font-body h-14 w-full rounded-full bg-white px-6 text-black shadow-[0_8px_40px_rgba(0,0,0,0.18)] ring-1 ring-black/10 outline-none transition-[padding] duration-500 ease-out placeholder:text-black/45 ${
          active ? "pr-16" : ""
        }`}
      />
      <button
        type="button"
        onClick={submit}
        aria-label="Check if it exists"
        tabIndex={active ? 0 : -1}
        className={`absolute top-1/2 right-2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black text-white transition-all duration-300 ${
          active ? "scale-100 opacity-100" : "pointer-events-none scale-75 opacity-0"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
          <path
            d="M5 12h13.5M13 6l6.5 6-6.5 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
