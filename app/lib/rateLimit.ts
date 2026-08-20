import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { ipAddress } from "@vercel/functions";
import type { NextRequest } from "next/server";

/**
 * Per-IP rate limiting via Upstash Redis (the standard approach on
 * Vercel — no server to run cron/cleanup on, so an in-memory counter
 * wouldn't reliably survive across serverless invocations/instances;
 * this codebase already learned that lesson the hard way once before).
 *
 * Deliberately fails OPEN (no limiting) when UPSTASH_REDIS_REST_URL/
 * TOKEN aren't set, not closed — this is a different situation from
 * app/lib/report/bypassGate.ts's fail-closed default. That gate exists
 * to keep an endpoint restricted; this exists to protect an endpoint
 * that's supposed to stay fully public (/api/verdict is the whole
 * product's entry point). Failing closed here would mean "forgot to
 * configure Upstash" takes down the actual product, which is a worse
 * outcome than temporarily having no abuse protection. Configure it in
 * production; local dev is expected to just run unlimited.
 */

let redis: Redis | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
}

const limiters = new Map<string, Ratelimit>();

function getLimiter(name: string, requests: number, window: Parameters<typeof Ratelimit.slidingWindow>[1]): Ratelimit | null {
  if (!redis) return null;
  let limiter = limiters.get(name);
  if (!limiter) {
    limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(requests, window), prefix: `priora:ratelimit:${name}` });
    limiters.set(name, limiter);
  }
  return limiter;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller can retry — only meaningful when !allowed. */
  retryAfterSeconds?: number;
}

/**
 * Checks and consumes one request against a named limit, keyed by the
 * caller's IP. `window` uses Upstash's own duration string format, e.g.
 * "1 h", "10 m".
 */
export async function checkRateLimit(
  request: NextRequest,
  name: string,
  requests: number,
  window: Parameters<typeof Ratelimit.slidingWindow>[1],
): Promise<RateLimitResult> {
  const limiter = getLimiter(name, requests, window);
  if (!limiter) return { allowed: true };

  try {
    const ip = ipAddress(request) ?? "unknown";
    const { success, reset } = await limiter.limit(`${name}:${ip}`);
    if (success) return { allowed: true };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) };
  } catch (err) {
    // A Redis-side problem (outage, quota, network blip) must not take
    // down the endpoint it's supposed to be protecting — that would
    // turn "abuse protection" into a single point of failure for the
    // whole public product. Log it, then fail open exactly like the
    // "not configured" case above.
    console.error(`rate limit check failed for "${name}", failing open:`, err);
    return { allowed: true };
  }
}
