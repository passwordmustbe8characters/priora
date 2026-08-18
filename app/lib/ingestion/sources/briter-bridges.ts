import type { SourceConnector } from "../types";

/** Briter's data platform (Briter Intelligence) is subscription-only —
 * no free API for its company/deal directory. Wired into the same
 * interface as the working connectors so plugging in real credentials
 * later (if there's ever a paid plan) is filling in `fetch`, not a
 * redesign. */
export const briterBridgesConnector: SourceConnector = {
  id: "briter-bridges",
  label: "Briter Bridges",
  available: false,
  unavailableReason: "Briter's data platform is subscription-only — not wired up yet.",
  async fetch() {
    throw new Error("Briter Bridges connector is not available (paid subscription required)");
  },
};
