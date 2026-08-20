import { headers } from "next/headers";
import { PurchaseFlow } from "./PurchaseFlow";

/**
 * Phase 3 — Report Purchase Flow UI, server shell. Geo-detects currency
 * via Vercel's own `x-vercel-ip-country` request header — free,
 * zero-setup, no third-party geo-IP service needed. Only populated on
 * actual Vercel deployments; local dev always falls through to the
 * USD default, which is fine (the visible switcher is the real fix for
 * a wrong/missing detection either way, per the spec's own framing).
 */
export default async function ReportPurchasePage() {
  const hdrs = await headers();
  const country = hdrs.get("x-vercel-ip-country");
  const defaultCurrency: "NGN" | "USD" = country === "NG" ? "NGN" : "USD";

  return <PurchaseFlow defaultCurrency={defaultCurrency} />;
}
