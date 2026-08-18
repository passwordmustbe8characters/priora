import type { NextRequest } from "next/server";
import { CONNECTORS, runIngestion } from "../../../lib/ingestion";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // YC dataset is ~10MB, PH is a network round-trip per source

/**
 * On-demand trigger for Source Ingestion — Western (see master spec,
 * Phase 2). No scheduled cron yet, deliberately: this satisfies the
 * spec's "scheduled or on-demand" either/or, and a cron route can be
 * added later by calling runIngestion() from a scheduled handler
 * instead — same underlying function either way.
 *
 * Body: { sources?: string[]; limit?: number; filter?: string }
 * sources defaults to every registered connector (stubs just report
 * back as unavailable rather than erroring the whole batch).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return Response.json({ error: { code: "ADMIN_NOT_CONFIGURED", message: "ADMIN_SECRET is not set." } }, { status: 500 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid admin token." } }, { status: 401 });
  }

  let body: { sources?: string[]; limit?: number; filter?: string } = {};
  try {
    body = await request.json();
  } catch {
    // No body / invalid JSON is fine — defaults apply.
  }

  const sources = body.sources?.length ? body.sources : Object.keys(CONNECTORS);

  try {
    const results = await runIngestion(sources, { limit: body.limit, filter: body.filter });
    return Response.json({ results });
  } catch (err) {
    console.error("ingestion run failed:", err);
    return Response.json(
      { error: { code: "INGESTION_FAILED", message: "Ingestion run failed unexpectedly." } },
      { status: 502 },
    );
  }
}
