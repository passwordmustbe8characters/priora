"use client";

import { useState } from "react";
import type { VerdictResponse } from "../lib/verdict";
import { GenerateReportModal } from "./GenerateReportModal";

/**
 * Phase 3 entry point. Opens GenerateReportModal as a popup over the
 * current results panel rather than navigating to /report/purchase —
 * see that modal's own doc comment for why it's a portal-rendered
 * overlay instead of a route. result is passed straight through as a
 * prop; no sessionStorage needed since nothing navigates away anymore.
 */
export function GetReportButton({ result }: { result: VerdictResponse }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-body mt-4 flex w-full shrink-0 cursor-pointer items-center justify-between gap-3 rounded-2xl bg-background px-5 py-4 text-left text-foreground transition hover:opacity-90"
      >
        <span>
          <span className="block text-sm font-semibold">Get the full report</span>
          <span className="block text-xs text-foreground/60">
            Deeper competitor profiles, pricing benchmarks, and gap analysis — delivered to your email.
          </span>
        </span>
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
          <path d="M5 12h13.5M13 6l6.5 6-6.5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && <GenerateReportModal result={result} onClose={() => setOpen(false)} />}
    </>
  );
}
