/**
 * TEMP — server-side half of the report-flow access gate (see
 * app/lib/reportBypass.ts for the client half and the full reasoning).
 * Called from the three bypass routes: /api/report/start,
 * /api/report/[jobId]/status, /api/report/[jobId]/pdf.
 *
 * Local dev always passes — there's nothing to gate against on your own
 * machine, and requiring the key there would just be friction while
 * building. In production, a missing REPORT_BYPASS_SECRET fails closed
 * (rejects everything) rather than silently having no gate at all —
 * forgetting to set the env var should break the flow loudly, not quietly
 * leave it wide open.
 */
export function checkReportBypassAccess(providedKey: string | null): boolean {
  const isProd = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  if (!isProd) return true;

  const secret = process.env.REPORT_BYPASS_SECRET;
  if (!secret) return false;
  return providedKey === secret;
}
