import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isValidSessionToken } from "./app/lib/admin-session";

/**
 * Gates the internal /admin/* pages behind a real login page
 * (/admin/login) instead of the raw browser Basic-Auth popup — still
 * just the one shared ADMIN_SECRET, no accounts, checked via a signed
 * session cookie (see app/lib/admin-session.ts for why the cookie never
 * holds the raw secret). The /api/admin/* routes are untouched — they
 * still check a Bearer token directly in the route handler, since
 * that's a script calling with a header it controls, not a page a
 * person visits.
 *
 * Named `proxy.ts` (not `middleware.ts`) — Next.js 16 renamed the file
 * convention; see node_modules/next/dist/docs/.../proxy.md.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The login page itself must stay reachable, or nobody could ever log in.
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return new Response("Admin access is not configured.", { status: 500 });
  }

  const sessionCookie = request.cookies.get("priora_admin_session")?.value;
  if (isValidSessionToken(sessionCookie, secret)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: "/admin/:path*",
};
