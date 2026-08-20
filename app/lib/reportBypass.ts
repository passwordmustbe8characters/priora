"use client";

/**
 * TEMP — access gate for the payment-bypass report flow (see
 * GenerateReportModal.tsx's own TEMP comment). Without real payment
 * wired up yet, "Get the full report" is a free PDF generator; this
 * keeps it from being an open one on the live site by requiring a
 * shared key, passed once via a URL query param and remembered for the
 * rest of the tab's session.
 *
 * The key is never hardcoded into this bundle — it's read at runtime
 * from the URL the visitor actually loaded, so inspecting the shipped
 * JS can't reveal it. The real enforcement is server-side (see
 * app/lib/report/bypassGate.ts); this client half only controls
 * whether the UI *offers* the flow, matching the "hide it" request —
 * a determined caller could still hit the API routes directly, but
 * that's still rejected server-side without the key.
 *
 * Remove this whole gate once real payment (Paystack/Resend/Blob) is
 * wired up and the bypass routes are deleted.
 */

export const REPORT_BYPASS_STORAGE_KEY = "priora_report_bypass_key";
export const REPORT_BYPASS_QUERY_PARAM = "key";
export const REPORT_BYPASS_HEADER = "x-report-bypass-key";

/** Call once near the app root. If the current URL carries ?key=...,
 * stashes it in sessionStorage so it survives the rest of the tab's
 * session without needing to stay in the URL. */
export function captureReportBypassKey(): void {
  if (typeof window === "undefined") return;
  const key = new URLSearchParams(window.location.search).get(REPORT_BYPASS_QUERY_PARAM);
  if (key) sessionStorage.setItem(REPORT_BYPASS_STORAGE_KEY, key);
}
