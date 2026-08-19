import type { NextRequest } from "next/server";
import { backfillCategoryTags } from "../../../lib/backfill";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // one batched LLM call for the whole unresolved-tag set, then N sequential row updates

/**
 * One-off admin trigger for the Category Tagging System's backfill —
 * re-normalizes categoryTags on existing company rows against the
 * current taxonomy. Same auth pattern as /api/admin/ingest.
 *
 * Body: { limit?: number } — defaults to 500 rows.
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

  let body: { limit?: number } = {};
  try {
    body = await request.json();
  } catch {
    // No body / invalid JSON is fine — default applies.
  }

  try {
    const result = await backfillCategoryTags(body.limit);
    return Response.json(result);
  } catch (err) {
    console.error("tag backfill failed:", err);
    return Response.json({ error: { code: "BACKFILL_FAILED", message: "Backfill failed unexpectedly." } }, { status: 502 });
  }
}
