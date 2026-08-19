import { createHmac, timingSafeEqual } from "crypto";

/**
 * Still just one shared secret (ADMIN_SECRET), no accounts/database —
 * this only replaces the raw browser Basic-Auth popup with a real login
 * page. The cookie never holds ADMIN_SECRET itself: it holds a fixed,
 * non-reversible HMAC derived from it, so the secret is never sitting
 * in the browser and rotating ADMIN_SECRET automatically invalidates
 * every existing session cookie.
 */
const SESSION_CONTEXT = "priora-admin-session-v1";

export function deriveSessionToken(secret: string): string {
  return createHmac("sha256", secret).update(SESSION_CONTEXT).digest("hex");
}

export function isValidSessionToken(token: string | undefined | null, secret: string): boolean {
  if (!token) return false;
  const expected = deriveSessionToken(secret);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual requires equal-length buffers
  return timingSafeEqual(a, b);
}
