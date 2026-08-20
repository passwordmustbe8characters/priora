import { put } from "@vercel/blob";
import { renderHtmlToPdf } from "./pdf";
import { renderReportHtml } from "./template";
import type { DeepReportContent } from "./types";

/**
 * Phase 3 — Report Document Assembly. Pure formatting: takes already-
 * verified content and produces the final PDF, no new content
 * decisions made here (per spec).
 *
 * Storage: Vercel Blob, not a generic "any S3-compatible bucket" — this
 * app is already Vercel-hosted, so it's the zero-extra-account choice
 * (needs Blob storage enabled on the Vercel project; the
 * BLOB_READ_WRITE_TOKEN env var gets set automatically the same way
 * DATABASE_URL was for Postgres).
 *
 * `access: "public"` for now — simplest to build, matching the spec's
 * own "either [attachment or link] is fine, pick whichever is
 * simpler." The actual delivery mechanism is an email attachment (see
 * email.ts), not this URL — the stored blob is a record/re-send
 * fallback, not the primary access path. Worth revisiting for a
 * private/signed URL if that record needs tighter access later.
 */
export async function assembleReport(jobId: string, report: DeepReportContent): Promise<{ pdf: Buffer; pdfUrl: string }> {
  const generatedDate = new Date(report.generatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const html = renderReportHtml(report, generatedDate);
  const pdf = await renderHtmlToPdf(html);

  const blob = await put(`reports/${jobId}.pdf`, pdf, { access: "public", contentType: "application/pdf" });

  return { pdf, pdfUrl: blob.url };
}
