import { renderReportPdf } from "./pdf";
import type { DeepReportContent } from "./types";

/**
 * Phase 3 — Report Document Assembly. Pure formatting: takes already-
 * verified content and produces the final PDF, no new content
 * decisions made here (per spec).
 *
 * No persistent storage — the only delivery mechanism is the email
 * attachment (email.ts), which uses these bytes directly. An earlier
 * version also uploaded to Vercel Blob "as a record/re-send fallback,"
 * but nothing ever actually read that URL — it was a real, unused
 * external dependency carried for a capability (recovering/re-viewing
 * a report after the fact) that was never built. Dropped rather than
 * kept half-wired; add real storage back deliberately if that
 * capability gets built for real.
 */
export async function assembleReport(report: DeepReportContent): Promise<{ pdf: Buffer }> {
  const generatedDate = new Date(report.generatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const pdf = await renderReportPdf(report, generatedDate);

  return { pdf };
}
