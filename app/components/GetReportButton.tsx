"use client";

import { useRouter } from "next/navigation";
import type { VerdictResponse } from "../lib/verdict";

/**
 * Phase 3 entry point. Stashes the free verdict in sessionStorage
 * rather than passing it through a URL/query param — simpler, and this
 * app already has a precedent for "abandoning and restarting is fine"
 * (the spec explicitly doesn't require resuming an abandoned checkout),
 * so there's no need for anything more durable than the tab's own
 * session storage here.
 */
export function GetReportButton({ result }: { result: VerdictResponse }) {
  const router = useRouter();

  const start = () => {
    sessionStorage.setItem(
      "priora_report_source",
      JSON.stringify({ ideaText: result.idea.raw, freeVerdict: result }),
    );
    router.push("/report/purchase");
  };

  return (
    <button
      type="button"
      onClick={start}
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
  );
}
