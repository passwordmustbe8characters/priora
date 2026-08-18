import type { SourceConnector } from "../types";

/** Disrupt Africa's 3,000+ startup database is sold as bespoke research
 * and their "Intelligence" product — no free API for it (they do
 * publish occasional funding-report PDFs for purchase, not a queryable
 * dataset). Same interface as the working connectors, so plugging in
 * real access later is filling in `fetch`, not a redesign. */
export const disruptAfricaConnector: SourceConnector = {
  id: "disrupt-africa",
  label: "Disrupt Africa",
  available: false,
  unavailableReason: "Disrupt Africa's startup database is a paid/bespoke research product — not wired up yet.",
  async fetch() {
    throw new Error("Disrupt Africa connector is not available (paid access required)");
  },
};
