import type { VerdictResponse } from "./verdict";

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

function normalizeKey(idea: string): string {
  return idea
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "");
}

export function getCachedVerdict(idea: string): VerdictResponse | null {
  const key = normalizeKey(idea);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function setCachedVerdict(idea: string, data: VerdictResponse): void {
  store.set(normalizeKey(idea), { data, expiresAt: Date.now() + TTL_MS });
}
