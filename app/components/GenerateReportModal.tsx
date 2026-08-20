"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { VerdictResponse } from "../lib/verdict";
import { ProgressCircle } from "./ProgressCircle";

type Market = "african" | "global";
type Step = "questions" | "generating" | "ready" | "failed";
type Stage = "researching" | "synthesizing" | "verifying" | null;

const STAGE_MESSAGE: Record<NonNullable<Stage>, string> = {
  researching: "Researching competitors and market data…",
  synthesizing: "Analyzing patterns and positioning…",
  verifying: "Double-checking every claim against its source…",
};

// Coarse, not literal — there's no real percentage to report (three
// discrete stages, not a byte counter), so these are just "roughly how
// far through" markers for the fill level. The point is a visibly
// rising fill as stages actually change, not a precise measurement.
const STAGE_PROGRESS: Record<NonNullable<Stage>, number> = {
  researching: 0.3,
  synthesizing: 0.62,
  verifying: 0.85,
};

/**
 * Popup version of the report-generate flow — renders via a portal
 * straight onto document.body, not nested under ResultsPanel, because
 * ResultsPanel's own open/close animation applies a CSS transform
 * (translate-x-*), and any non-none transform on an ancestor turns
 * `position: fixed` into "fixed relative to that ancestor" instead of
 * the real viewport (a CSS spec quirk, not a bug) — this would otherwise
 * clip the modal to ResultsPanel's box instead of covering the screen.
 *
 * Takes `result` directly as a prop rather than the sessionStorage
 * round-trip PurchaseFlow.tsx used (that existed to survive a full page
 * navigation to /report/purchase; this never navigates away at all, so
 * there's nothing to survive).
 *
 * TEMP — payment bypass, same as PurchaseFlow.tsx: this goes straight
 * from questions to generation to a direct PDF download against
 * /api/report/[jobId]/{status,pdf}, no payment step. See that file's
 * own TEMP comment for the restore path once Paystack/Resend/Blob are
 * wired up (that page's payment code stays commented-in-place;  this
 * modal is the current primary entry point until then).
 */
export function GenerateReportModal({
  result,
  bypassKey,
  onClose,
}: {
  result: VerdictResponse;
  bypassKey: string | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("questions");
  const [market, setMarket] = useState<Market>("african");
  const [painPoint, setPainPoint] = useState("");
  const [reportJobId, setReportJobId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>(null);
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

  // Polls /status once generation has started, driving both the live
  // stage message and the eventual switch to "ready"/"failed".
  useEffect(() => {
    if (!reportJobId || step !== "generating") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const statusUrl = new URL(`/api/report/${reportJobId}/status`, window.location.origin);
        if (bypassKey) statusUrl.searchParams.set("key", bypassKey);
        const res = await fetch(statusUrl);
        const data = (await res.json()) as { status?: Step; stage?: Stage; failureReason?: string | null };
        if (cancelled) return;
        if (data.status === "ready") {
          setStep("ready");
          return;
        }
        if (data.status === "failed") {
          setError(data.failureReason || "Report generation failed.");
          setStep("failed");
          return;
        }
        setStage(data.stage ?? null);
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
  }, [reportJobId, step, bypassKey]);

  const generate = async () => {
    setError(null);
    setStep("generating");
    try {
      const res = await fetch("/api/report/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ideaText: result.idea.raw,
          freeVerdict: result,
          market,
          painPoint: painPoint.trim() || undefined,
          bypassKey,
        }),
      });
      const data = (await res.json()) as { reportJobId?: string; error?: { message?: string } };
      if (!res.ok || !data.reportJobId) throw new Error(data.error?.message || "Couldn't start your report.");
      setReportJobId(data.reportJobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start your report.");
      setStep("failed");
    }
  };

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
        <h1 className="font-display mt-1 text-2xl font-bold text-ink sm:text-3xl">Get the full competitive report</h1>
        <p className="font-body mt-2 text-sm text-ink-soft">{result.idea.normalized}</p>

        {step === "questions" && (
          <div className="mt-6 flex flex-col gap-6 sm:mt-8 sm:gap-8">
            <div>
              <p className="font-body text-sm font-semibold text-ink">Which market should this focus on?</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {(
                  [
                    { value: "african" as const, label: "African market", sub: "Nigeria-focused sourcing & pricing" },
                    { value: "global" as const, label: "Global market", sub: "No specific regional focus" },
                  ]
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMarket(opt.value)}
                    className={`font-body cursor-pointer rounded-2xl border p-4 text-left transition ${
                      market === opt.value
                        ? "border-ink bg-ink text-surface"
                        : "border-ink/15 bg-background text-ink hover:border-ink/40"
                    }`}
                  >
                    <span className="block font-semibold">{opt.label}</span>
                    <span className={`block text-xs ${market === opt.value ? "text-surface/70" : "text-ink-soft"}`}>
                      {opt.sub}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <label className="font-body block text-sm font-medium text-ink">
              What&apos;s the exact pain point you&apos;re trying to solve?{" "}
              <span className="font-normal text-ink-soft">(optional)</span>
              <textarea
                value={painPoint}
                onChange={(e) => setPainPoint(e.target.value)}
                placeholder="e.g. freelancers waiting weeks to get paid after sending an invoice"
                rows={3}
                maxLength={500}
                className="font-body mt-1.5 w-full resize-none rounded-xl border border-ink/15 bg-background p-4 text-ink outline-none transition focus:border-ink/40"
              />
            </label>

            <button
              type="button"
              onClick={generate}
              className="font-body h-12 w-full cursor-pointer rounded-xl bg-ink text-surface transition hover:opacity-90"
            >
              Generate my report
            </button>
          </div>
        )}

        {(step === "generating" || step === "ready") && (
          <div className="mt-10 flex flex-col items-center py-4 text-center">
            {/* Same element across both steps (not two swapped in and
                out) — that's what lets the fill settle and the
                checkmark draw in as a continuous motion instead of a
                cut between two different pieces of UI. */}
            <ProgressCircle progress={stage ? STAGE_PROGRESS[stage] : 0.08} done={step === "ready"} />

            {step === "generating" ? (
              <>
                <p className="font-body mt-5 text-sm font-medium text-ink">
                  {stage ? STAGE_MESSAGE[stage] : "Getting your report ready…"}
                </p>
                <p className="font-body mt-1.5 text-xs text-ink-soft">This usually takes about a minute.</p>
              </>
            ) : (
              reportJobId && (
                <>
                  <p className="font-display mt-4 text-xl font-bold text-ink">Your report is ready</p>
                  <a
                    href={`/api/report/${reportJobId}/pdf${bypassKey ? `?key=${encodeURIComponent(bypassKey)}` : ""}`}
                    className="font-body mt-6 flex h-12 w-full max-w-xs cursor-pointer items-center justify-center rounded-xl bg-ink text-surface transition hover:opacity-90"
                  >
                    Download report (PDF)
                  </a>
                </>
              )
            )}
          </div>
        )}

        {step === "failed" && (
          <div className="mt-10 flex flex-col items-center py-4 text-center">
            <p className="font-body text-sm text-red-600">{error || "Something went wrong. Please try again."}</p>
            <button
              type="button"
              onClick={() => setStep("questions")}
              className="font-body mt-6 h-12 w-full max-w-xs cursor-pointer rounded-xl bg-ink text-surface transition hover:opacity-90"
            >
              Try again
            </button>
          </div>
        )}

        {step !== "questions" && (
          <p className="font-body mt-6 text-center text-xs text-ink-soft">
            Payment is temporarily disabled for testing — this generates and downloads the report directly.
          </p>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
