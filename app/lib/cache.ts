import type { RegionScope, VerdictResponse } from "./verdict";

/**
 * In-memory, TTL-based cache for verdicts. Every web_search call costs a
 * flat $0.01 regardless of model — the one real lever we have on cost
 * (short of dropping search entirely) is not re-paying for the same idea
 * twice. This is a stopgap for Phase 1, not Phase 2's real cache: it's
 * scoped to a single server process, so on Vercel it only helps within one
 * warm serverless instance and resets on cold start / redeploy. Good
 * enough to blunt duplicate/rapid-fire submissions during testing and
 * early usage; a shared cache (Postgres/Redis) is the Phase 2 upgrade.
 */

interface CacheEntry {
  data: VerdictResponse;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

const TTL_MS = (Number(process.env.CACHE_TTL_SECONDS) || 3600) * 1000;

// regionScope is part of the key, not just the idea text — the same
// idea scoped to "africa" and scoped to "western" (or unscoped) can
// legitimately return different matches/verdicts, so collapsing them to
// one cache entry would silently serve a founder the wrong scope's
// answer the second time they search the same idea text with a
// different toggle selected.
function normalizeKey(idea: string, regionScope: RegionScope): string {
  const ideaKey = idea
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "");
  return `${regionScope ?? "all"}:${ideaKey}`;
}

export function getCachedVerdict(idea: string, regionScope: RegionScope = null): VerdictResponse | null {
  const key = normalizeKey(idea, regionScope);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function setCachedVerdict(idea: string, data: VerdictResponse, regionScope: RegionScope = null): void {
  store.set(normalizeKey(idea, regionScope), { data, expiresAt: Date.now() + TTL_MS });
}
