import type { SourceConnector } from "../types";

/** WeeTracker's company/investor database ("The BASE") is their paid
 * product — no free API. Same interface as the working connectors, so
 * plugging in real credentials later is filling in `fetch`, not a
 * redesign. */
export const weetrackerConnector: SourceConnector = {
  id: "weetracker",
  label: "WeeTracker",
  available: false,
  unavailableReason: "WeeTracker's database (\"The BASE\") is a paid product — not wired up yet.",
  async fetch() {
    throw new Error("WeeTracker connector is not available (paid product required)");
  },
};
