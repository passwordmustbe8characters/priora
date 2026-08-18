import { upsertCompanies, type UpsertResult } from "../db/companies";
import { crunchbaseConnector } from "./sources/crunchbase";
import { g2Connector } from "./sources/g2";
import { productHuntConnector } from "./sources/product-hunt";
import { ycConnector } from "./sources/yc";
import type { SourceConnector, SourceFetchParams } from "./types";

/**
 * Phase 2 — Source Ingestion (Western). Every connector shares the same
 * interface regardless of whether it's actually usable yet — Crunchbase
 * and G2 are both paid-only and stubbed (`available: false`) rather than
 * scraped or faked; YC and Product Hunt are real. Category tagging here
 * is deliberately best-effort (each source's own topics/industries,
 * lowercased) — building a consistent taxonomy across sources is the
 * separate Category Tagging System component, not this one's job.
 */
export const CONNECTORS: Record<string, SourceConnector> = {
  yc: ycConnector,
  "product-hunt": productHuntConnector,
  crunchbase: crunchbaseConnector,
  g2: g2Connector,
};

export interface IngestSourceResult {
  source: string;
  ok: boolean;
  fetched: number;
  upsert?: UpsertResult;
  error?: string;
}

export async function runIngestion(sourceIds: string[], params: SourceFetchParams = {}): Promise<IngestSourceResult[]> {
  const results: IngestSourceResult[] = [];

  for (const id of sourceIds) {
    const connector = CONNECTORS[id];
    if (!connector) {
      results.push({ source: id, ok: false, fetched: 0, error: `Unknown source "${id}"` });
      continue;
    }
    if (!connector.available) {
      results.push({
        source: connector.label,
        ok: false,
        fetched: 0,
        error: connector.unavailableReason || "Source not available",
      });
      continue;
    }
    try {
      const rows = await connector.fetch(params);
      const upsert = await upsertCompanies(rows);
      results.push({ source: connector.label, ok: true, fetched: rows.length, upsert });
    } catch (err) {
      results.push({
        source: connector.label,
        ok: false,
        fetched: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
