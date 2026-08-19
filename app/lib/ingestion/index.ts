import { normalizeCategoryTags } from "../category-tagging";
import { upsertCompanies, type UpsertResult } from "../db/companies";
import { appStoreConnector } from "./sources/app-store";
import { briterBridgesConnector } from "./sources/briter-bridges";
import { crunchbaseConnector } from "./sources/crunchbase";
import { disruptAfricaConnector } from "./sources/disrupt-africa";
import { g2Connector } from "./sources/g2";
import { productHuntConnector } from "./sources/product-hunt";
import { techcabalConnector } from "./sources/techcabal";
import { techpointAfricaConnector } from "./sources/techpoint-africa";
import { weetrackerConnector } from "./sources/weetracker";
import { ycConnector } from "./sources/yc";
import { ycAfricaConnector } from "./sources/yc-africa";
import type { SourceConnector, SourceFetchParams } from "./types";

/**
 * Phase 2 — Source Ingestion (Western + African). Every connector shares
 * the same interface regardless of whether it's actually usable yet —
 * paid/gated sources (Crunchbase, G2, Briter Bridges, WeeTracker,
 * Disrupt Africa) are stubbed (`available: false`) rather than scraped
 * or faked; the rest are real. Each connector still returns its own
 * source's raw tags/topics/genres — normalizeCategoryTags() below is
 * the Category Tagging System component that reconciles all of that
 * onto one shared vocabulary before anything gets upserted.
 */
export const CONNECTORS: Record<string, SourceConnector> = {
  yc: ycConnector,
  "product-hunt": productHuntConnector,
  crunchbase: crunchbaseConnector,
  g2: g2Connector,
  "yc-africa": ycAfricaConnector,
  "app-store": appStoreConnector,
  techcabal: techcabalConnector,
  "techpoint-africa": techpointAfricaConnector,
  "briter-bridges": briterBridgesConnector,
  weetracker: weetrackerConnector,
  "disrupt-africa": disruptAfricaConnector,
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
      // Batched across the whole fetched set, not per row — repeated
      // raw tags (e.g. YC's own industry vocabulary reused across
      // thousands of companies) only ever hit the LLM fallback once.
      const canonicalTagSets = await normalizeCategoryTags(rows.map((r) => r.categoryTags ?? []));
      // normalizeCategoryTags preserves 1:1 order/length with its input,
      // so this index is always in bounds at runtime — the fallback is
      // just to satisfy noUncheckedIndexedAccess, not a real code path.
      const canonicalRows = rows.map((row, i) => ({ ...row, categoryTags: canonicalTagSets[i] ?? row.categoryTags }));
      const upsert = await upsertCompanies(canonicalRows);
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
