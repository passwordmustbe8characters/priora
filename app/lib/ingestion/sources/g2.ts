import type { SourceConnector } from "../types";

/** G2 has no free public API for product/company data — access is
 * paid, partner-only, and their ToS explicitly prohibits scraping.
 * Wired into the same interface as the other connectors so plugging in
 * real credentials later (if a data partnership happens) is just
 * filling in `fetch`, not a redesign. */
export const g2Connector: SourceConnector = {
  id: "g2",
  label: "G2",
  available: false,
  unavailableReason: "G2 has no free API — data access requires a paid partner agreement.",
  async fetch() {
    throw new Error("G2 connector is not available (paid partner access required)");
  },
};
