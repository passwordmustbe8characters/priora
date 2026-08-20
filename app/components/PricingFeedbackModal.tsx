"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { VerdictResponse } from "../lib/verdict";

type Currency = "NGN" | "USD";

// Smallest-unit ranges match the API route's own RANGES constant —
// keep these two in sync if the pricing research window changes.
const RANGE = {
  NGN: { min: 5000, max: 10000, step: 500, default: 5000 },
  USD: { min: 10, max: 15, step: 1, default: 15 },
} as const;

function formatMajor(currency: Currency, major: number): string {
  return currency === "NGN" ? `₦${major.toLocaleString()}` : `$${major.toLocaleString()}`;
}

/**
 * Phase 3 add-on — "Coming Soon + Price Validation" (Section 8 of the
 * spec). Shown instead of GenerateReportModal to visitors without the
 * report-bypass key: no generation, no payment, just an honest "this
 * is coming" screen plus a price slider, since real signal on a
 * comfortable price is more useful right now than a placeholder.
 *
 * Portal + overlay pattern copied from GenerateReportModal (see that
 * file's own comment on why a portal specifically — ResultsPanel's
 * transform would otherwise trap a nested fixed overlay to its own box
 * instead of the viewport).
 */
export function PricingFeedbackModal({ result, onClose }: { result: VerdictResponse; onClose: () => void }) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [sliderValue, setSliderValue] = useState<number>(RANGE.USD.default);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Best-effort geo default — a wrong or missing detection is fine,
  // the visible switcher below is the actual fix, same framing the
  // original (never-shipped) currency detection used.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/geo-currency")
      .then((res) => res.json())
      .then((data: { currency?: Currency }) => {
        if (!cancelled && data.currency) {
          setCurrency(data.currency);
          setSliderValue(RANGE[data.currency].default);
        }
      })
      .catch(() => {
        // Stays on the USD default — no visible error, this is a
        // convenience, not something worth surfacing as a failure.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const switchCurrency = (next: Currency) => {
    setCurrency(next);
    // Reset rather than convert — a slider position in one currency's
    // range doesn't mean anything in the other's.
    setSliderValue(RANGE[next].default);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/pricing-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency,
          sliderValue: sliderValue * 100, // major unit -> smallest unit (kobo/cents)
          email: email.trim() || undefined,
          ideaText: result.idea.raw,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } };
        throw new Error(data.error?.message || "Couldn't submit that — please try again.");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit that — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const range = RANGE[currency];

  const modal = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-y-auto rounded-3xl bg-surface p-6 sm:max-h-[88vh] sm:p-12">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-6 right-6 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-ink-soft transition hover:bg-ink/5 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <p className="font-body text-xs font-semibold tracking-wide text-ink-soft uppercase">Priora Report</p>
        <h1 className="font-display mt-1 text-2xl font-bold text-ink sm:text-3xl">The full report is coming soon</h1>
        <p className="font-body mt-2 text-sm text-ink-soft">
          We&apos;re finishing up payment so we can turn this on. In the meantime, help us land on a fair price.
        </p>

        {!submitted ? (
          <div className="mt-6 flex flex-col gap-6 sm:mt-8 sm:gap-8">
            <ul className="font-body space-y-2 text-sm text-ink">
              <li>&middot; Deeper competitor profiles, sourced and verified</li>
              <li>&middot; Pricing benchmarks across the market</li>
              <li>&middot; Market positioning and gap analysis</li>
              <li>&middot; Delivered as a downloadable PDF</li>
            </ul>

            <div>
              <div className="flex items-center justify-between">
                <p className="font-body text-sm font-semibold text-ink">What would feel like a fair price?</p>
                <div className="flex gap-1 rounded-full bg-ink/5 p-1">
                  {(["NGN", "USD"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => switchCurrency(c)}
                      className={`font-body cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition ${
                        currency === c ? "bg-ink text-surface" : "text-ink-soft hover:text-ink"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-ink/15 bg-background p-5">
                <p className="font-display text-center text-3xl font-bold text-ink">
                  {formatMajor(currency, sliderValue)}
                </p>
                <input
                  type="range"
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  value={sliderValue}
                  onChange={(e) => setSliderValue(Number(e.target.value))}
                  className="mt-4 w-full cursor-pointer accent-ink"
                />
                <div className="font-body mt-1 flex justify-between text-xs text-ink-soft">
                  <span>{formatMajor(currency, range.min)}</span>
                  <span>{formatMajor(currency, range.max)}</span>
                </div>
              </div>
            </div>

            <label className="font-body block text-sm font-medium text-ink">
              Email <span className="font-normal text-ink-soft">(optional — we&apos;ll let you know when it launches)</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="font-body mt-1.5 h-12 w-full rounded-xl border border-ink/15 bg-background px-4 text-ink outline-none transition focus:border-ink/40"
              />
            </label>

            {error && <p className="font-body text-sm text-red-600">{error}</p>}

            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="font-body h-12 w-full cursor-pointer rounded-xl bg-ink text-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        ) : (
          <div className="mt-10 flex flex-col items-center py-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink/5">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-ink">
                <path d="M5 12.5 9.5 17 19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="font-display mt-4 text-xl font-bold text-ink">Thanks — that&apos;s genuinely useful</p>
            <p className="font-body mt-2 text-sm text-ink-soft">
              {email ? "We'll let you know the moment the full report launches." : "We'll use this to help land on a fair price."}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
