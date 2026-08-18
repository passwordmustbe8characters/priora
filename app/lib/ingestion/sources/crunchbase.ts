import type { SourceConnector } from "../types";

/** Crunchbase's API is paid-only — no free tier covers company search,
 * and scraping their site directly violates their ToS and is heavily
 * bot-protected. Wired into the same interface as the other connectors
 * so plugging in real credentials later (once there's a paid plan) is
 * just filling in `fetch`, not a redesign. */
export const crunchbaseConnector: SourceConnector = {
  id: "crunchbase",
  label: "Crunchbase",
  available: false,
  unavailableReason: "Crunchbase's API requires a paid subscription — not wired up yet.",
  async fetch() {
    throw new Error("Crunchbase connector is not available (paid API access required)");
  },
};
