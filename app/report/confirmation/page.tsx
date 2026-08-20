"use client";

import Link from "next/link";
import { useSessionStorageString } from "../../lib/useSessionStorageString";

interface StoredConfirmation {
  email: string;
  amount: number; // smallest currency unit — kobo or cents
  currency: "NGN" | "USD";
}

function formatAmount(amount: number, currency: "NGN" | "USD"): string {
  const major = amount / 100;
  return currency === "NGN" ? `₦${major.toLocaleString()}` : `$${major.toLocaleString()}`;
}

/**
 * Phase 3 — Post-Purchase Confirmation UI. Static, no polling — per
 * spec, the email itself is the real confirmation, this screen is
 * reassurance. Reads what it displays from sessionStorage (written by
 * the purchase page right before the Paystack redirect) rather than a
 * server round-trip: it's already known client-side what was charged,
 * and there's no "no polling endpoint for v1" API to ask anyway. If
 * that storage is missing (different tab, direct link, cleared
 * session), a calm generic version still shows — payment already
 * succeeded if this page was reached at all; a missing detail here
 * doesn't change that.
 */
export default function ReportConfirmationPage() {
  const raw = useSessionStorageString("priora_report_confirmation");
  let info: StoredConfirmation | null = null;
  if (raw) {
    try {
      info = JSON.parse(raw) as StoredConfirmation;
    } catch {
      // leave info null — falls through to the generic version below
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-ink/10 bg-surface p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ink/5">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-ink">
            <path d="M5 12.5 9.5 17 19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h1 className="font-display mt-4 text-2xl font-bold text-ink">Payment confirmed</h1>

        {info ? (
          <p className="font-body mt-2 text-sm text-ink-soft">
            {formatAmount(info.amount, info.currency)} charged. Your report is on its way to{" "}
            <span className="text-ink">{info.email}</span> — usually within a few minutes.
          </p>
        ) : (
          <p className="font-body mt-2 text-sm text-ink-soft">
            Your report is on its way to your email — usually within a few minutes.
          </p>
        )}

        <Link
          href="/"
          className="font-body mt-6 inline-block cursor-pointer rounded-full bg-ink px-6 py-3 text-sm font-semibold text-surface transition hover:opacity-90"
        >
          Back to Priora
        </Link>
      </div>
    </main>
  );
}
