"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { VerdictResponse } from "../../lib/verdict";
import { useSessionStorageString } from "../../lib/useSessionStorageString";

type Currency = "NGN" | "USD";

const PRICE_DISPLAY: Record<Currency, string> = { NGN: "₦5,000", USD: "$15" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface StoredSource {
  ideaText: string;
  freeVerdict: VerdictResponse;
}

export function PurchaseFlow({ defaultCurrency }: { defaultCurrency: Currency }) {
  const router = useRouter();

  const [reportJobId, setReportJobId] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read whatever GetReportButton stashed before navigating here — if
  // it's missing (direct visit, or a stale/cleared tab), there's
  // nothing to sell yet, so send them back rather than show a broken form.
  // rawSource === null covers both "not hydrated yet" (server snapshot)
  // and "genuinely missing" (client snapshot, no such key) — both fall
  // through to the same not-found UI below, which is fine: this page is
  // always reached via client-side navigation from GetReportButton, so
  // there's no meaningful "server-rendered with real data" case to
  // distinguish from — the brief null-on-first-paint frame just matches
  // what a direct/stale visit looks like anyway.
  const rawSource = useSessionStorageString("priora_report_source");
  let source: StoredSource | null = null;
  let notFound = true;
  if (rawSource) {
    try {
      source = JSON.parse(rawSource) as StoredSource;
      notFound = false;
    } catch {
      notFound = true;
    }
  }

  // Fires POST /api/report/start the moment this screen is reached —
  // per spec, before payment, and the user never sees or waits on this
  // call directly (it just silently backs the "Pay" button becoming
  // usable once a reportJobId exists).
  useEffect(() => {
    if (!source || reportJobId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/report/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(source),
        });
        const data = (await res.json()) as { reportJobId?: string; error?: { message?: string } };
        if (!res.ok || !data.reportJobId) throw new Error(data.error?.message || "Couldn't start your report.");
        if (!cancelled) setReportJobId(data.reportJobId);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't start your report.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, reportJobId]);

  const emailValid = EMAIL_RE.test(email);
  const canPay = Boolean(reportJobId) && emailValid && !paying;

  const pay = async () => {
    if (!reportJobId || !emailValid) return;
    setPaying(true);
    setError(null);
    try {
      const res = await fetch("/api/payment/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportJobId, currency, email }),
      });
      const data = (await res.json()) as {
        checkoutUrl?: string;
        amount?: number;
        currency?: Currency;
        error?: { message?: string };
      };
      if (!res.ok || !data.checkoutUrl) throw new Error(data.error?.message || "Couldn't start checkout.");

      // Read back by the confirmation page after Paystack's redirect —
      // see that page's own comment on why this (not a server round
      // trip) is the source for what it displays.
      sessionStorage.setItem(
        "priora_report_confirmation",
        JSON.stringify({ email, amount: data.amount, currency: data.currency }),
      );
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setPaying(false);
    }
  };

  if (notFound) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center">
          <p className="font-display text-xl font-bold text-ink">Let&apos;s start with your idea first</p>
          <p className="font-body mt-2 text-sm text-ink-soft">
            Head back and run a free check — you can get the full report from there.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="font-body mt-6 cursor-pointer rounded-full bg-ink px-6 py-3 text-sm font-semibold text-surface transition hover:opacity-90"
          >
            Back to Priora
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-ink/10 bg-surface p-8">
        <p className="font-body text-xs font-semibold tracking-wide text-ink-soft uppercase">Priora Report</p>
        <h1 className="font-display mt-1 text-2xl font-bold text-ink">Get the full competitive report</h1>
        {source && <p className="font-body mt-2 text-sm text-ink-soft">{source.freeVerdict.idea.normalized}</p>}

        <ul className="font-body mt-5 space-y-2 text-sm text-ink">
          <li>&middot; Deeper competitor profiles, sourced and verified</li>
          <li>&middot; Pricing benchmarks across the market</li>
          <li>&middot; Market positioning and gap analysis</li>
          <li>&middot; Delivered as a PDF to your email</li>
        </ul>

        <div className="mt-6 flex items-center justify-between rounded-xl border border-ink/10 bg-background px-4 py-3">
          <span className="font-display text-2xl font-bold text-ink">{PRICE_DISPLAY[currency]}</span>
          <div className="flex gap-1 rounded-full bg-ink/5 p-1">
            {(["NGN", "USD"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`font-body cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition ${
                  currency === c ? "bg-ink text-surface" : "text-ink-soft hover:text-ink"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <label className="font-body mt-5 block text-sm font-medium text-ink">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            placeholder="you@example.com"
            className="font-body mt-1.5 h-12 w-full rounded-xl border border-ink/15 bg-background px-4 text-ink outline-none transition focus:border-ink/40"
          />
        </label>
        {emailTouched && email && !emailValid && (
          <p className="font-body mt-1.5 text-xs text-red-600">Enter a valid email address.</p>
        )}

        {error && <p className="font-body mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={pay}
          disabled={!canPay}
          className="font-body mt-5 h-12 w-full cursor-pointer rounded-xl bg-ink text-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {paying ? "Redirecting to payment…" : !reportJobId && !error ? "Preparing your report…" : `Pay ${PRICE_DISPLAY[currency]}`}
        </button>

        <p className="font-body mt-4 text-center text-xs text-ink-soft">
          Your report is emailed to you, usually within a few minutes of payment.
        </p>
      </div>
    </main>
  );
}
