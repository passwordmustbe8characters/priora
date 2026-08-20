import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * Phase 3 add-on — currency geo-detection as its own tiny endpoint,
 * reusing the exact logic already validated in app/report/purchase/
 * page.tsx (a Server Component tied to a route nothing links to
 * anymore). The new pricing-feedback screen renders inline as a modal
 * on the main page — a Client Component top to bottom — which can't
 * read request headers directly, so this gives it the same detection
 * via one cheap fetch on mount instead of duplicating page.tsx's
 * server-component structure just for this.
 */
export async function GET() {
  const hdrs = await headers();
  const country = hdrs.get("x-vercel-ip-country");
  const currency: "NGN" | "USD" = country === "NG" ? "NGN" : "USD";
  return Response.json({ currency });
}
