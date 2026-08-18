import type { NewCompany } from "../db/schema";

export interface SourceFetchParams {
  limit?: number;
  /** Free-text filter — meaning differs per source (YC: an industry name
   * substring, Product Hunt: a topic slug). Optional, sources that don't
   * support filtering just ignore it. */
  filter?: string;
}

/** What a connector hands back per company — everything upsertCompanies
 * needs, minus the columns the DB itself owns (id, timestamps). */
export type IngestedCompany = Omit<NewCompany, "id" | "firstSeenAt" | "lastUpdatedAt">;

export interface SourceConnector {
  id: string;
  label: string;
  /** false = wired into the same interface as the others but not usable
   * yet (e.g. needs a paid API key we don't have) — surfaced to the
   * caller explicitly instead of silently failing or faking data. */
  readonly available: boolean;
  /** Why it's unavailable. Present exactly when `available` is false. */
  readonly unavailableReason?: string;
  fetch: (params: SourceFetchParams) => Promise<IngestedCompany[]>;
}
