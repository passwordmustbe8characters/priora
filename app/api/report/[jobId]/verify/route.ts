import { after } from "next/server";
import type { NextRequest } from "next/server";
import { runVerificationStage } from "../../../../lib/report/orchestrate";
import { checkReportBypassAccess } from "../../../../lib/report/bypassGate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Internal hand-off target — not meant to be called from the browser,
 * only server-to-server from runGenerationStage's own trigger call (see
 * orchestrate.ts's file-level doc comment for the full reasoning on why
 * verification runs as its own separate invocation). Responds
 * immediately and does the actual work via after(), same "respond now,
 * keep working after" pattern /api/report/start already uses — that's
 * what gives verification its own fresh ~60s wall-clock budget instead
 * of continuing to spend whatever's left of the caller's.
 *
 * Gated the same way as the other bypass routes even though the caller
 * is this app's own server, not a browser — it's still a real
 * network-reachable endpoint, and there's no reason to make it the one
 * exception.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const bypassKey = typeof record.bypassKey === "string" ? record.bypassKey : null;
  if (!checkReportBypassAccess(bypassKey)) {
    return Response.json({ error: { code: "FORBIDDEN", message: "Not available yet." } }, { status: 403 });
  }

  const { jobId } = await params;
  after(() => runVerificationStage(jobId));
  return Response.json({ status: "accepted" }, { status: 202 });
}
