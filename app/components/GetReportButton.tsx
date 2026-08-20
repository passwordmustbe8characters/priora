"use client";

import { useState } from "react";
import type { VerdictResponse } from "../lib/verdict";
import { GenerateReportModal } from "./GenerateReportModal";
import { PricingFeedbackModal } from "./PricingFeedbackModal";
import { REPORT_BYPASS_STORAGE_KEY } from "../lib/reportBypass";
import { useSessionStorageString } from "../lib/useSessionStorageString";

/**
 * Phase 3 entry point. Always visible now (see Section 8 of the spec —
 * the "Coming Soon + Price Validation" add-on) — routes to one of two
 * popups depending on whether a report-bypass key is present:
 *
 * - Key present: the real GenerateReportModal. This key isn't a launch
 *   gate in the usual sense — it's how a small, deliberately chosen
 *   set of founders get the actual generation experience (so they can
 *   say what the *report itself* is worth), separate from the general
 *   public price-slider signal below.
 * - No key: PricingFeedbackModal — no generation, no payment, just an
 *   honest "coming soon" screen plus a price-comfort slider for public
 *   visitors. This is what changed: this button used to render nothing
 *   at all without a key (built that way specifically to keep the
 *   costly generation flow off the public internet); now it always
 *   shows, since the no-key destination carries no generation cost.
 */
export function GetReportButton({ result }: { result: VerdictResponse }) {
  const [open, setOpen] = useState(false);
  const bypassKey = useSessionStorageString(REPORT_BYPASS_STORAGE_KEY);

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

      {open &&
        (bypassKey ? (
          <GenerateReportModal result={result} bypassKey={bypassKey} onClose={() => setOpen(false)} />
        ) : (
          <PricingFeedbackModal result={result} onClose={() => setOpen(false)} />
        ))}
    </>
  );
}
