"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { VerdictResponse } from "../../lib/verdict";
import { useSessionStorageString } from "../../lib/useSessionStorageString";

type Currency = "NGN" | "USD";

interface StoredSource {
  ideaText: string;
  freeVerdict: VerdictResponse;
}

type JobStatus = "generating" | "ready" | "failed";

// defaultCurrency is unused while the paid flow (currency switcher) is
// disabled below — kept in the prop type so the page.tsx caller and this
// component's signature don't need touching when it's restored.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PurchaseFlow({ defaultCurrency }: { defaultCurrency: Currency }) {
  const router = useRouter();

  const [reportJobId, setReportJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // TEMP — payment bypass for testing. Paystack/Resend/Vercel Blob
  // aren't configured yet, so the real paid flow (currency + email +
  // /api/payment/initialize, below) is disabled and replaced with a
  // direct "generate, then download" path against two temporary routes
  // (/api/report/[jobId]/status, /api/report/[jobId]/pdf) that render
  // the PDF straight into the response — no payment, no email, no blob
  // storage needed. To restore the real flow: delete this block and the
  // two temp API routes, and uncomment the block further down.
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

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

  // TEMP — polls the status route every few seconds until the report is
  // ready (or fails), so the download link can appear without a real
  // payment/webhook/email round trip. Remove alongside the rest of this
  // bypass once the paid flow is wired up for real.
  useEffect(() => {
    if (!reportJobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch(`/api/report/${reportJobId}/status`);
        const data = (await res.json()) as { status?: JobStatus; failureReason?: string | null };
        if (cancelled) return;
        if (data.status === "ready" || data.status === "failed") {
          setJobStatus(data.status);
          if (data.status === "failed") setStatusError(data.failureReason || "Report generation failed.");
          return;
        }
        setJobStatus("generating");
        timer = setTimeout(poll, 3000);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 3000);
      }
    };
    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reportJobId]);

  /* --- Real paid flow, disabled for now — see TEMP comment above. ---
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [paying, setPaying] = useState(false);
  const PRICE_DISPLAY: Record<Currency, string> = { NGN: "₦5,000", USD: "$15" };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
  --- end disabled block --- */

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
          <li>&middot; Delivered as a downloadable PDF</li>
        </ul>

        {error && <p className="font-body mt-4 text-sm text-red-600">{error}</p>}
        {statusError && <p className="font-body mt-4 text-sm text-red-600">{statusError}</p>}

        {jobStatus === "ready" && reportJobId ? (
          <a
            href={`/api/report/${reportJobId}/pdf`}
            className="font-body mt-6 flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-ink text-surface transition hover:opacity-90"
          >
            Download report (PDF)
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="font-body mt-6 h-12 w-full cursor-not-allowed rounded-xl bg-ink text-surface opacity-50"
          >
            {jobStatus === "failed"
              ? "Generation failed"
              : !reportJobId && !error
                ? "Preparing your report…"
                : "Generating your report… this can take a minute"}
          </button>
        )}

        <p className="font-body mt-4 text-center text-xs text-ink-soft">
          Payment is temporarily disabled for testing — this generates and downloads the report directly.
        </p>
      </div>
    </main>
  );
}
