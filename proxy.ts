import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Gates the internal /admin/* pages behind HTTP Basic Auth, reusing
 * ADMIN_SECRET as the password (username can be anything) — same secret
 * as the /api/admin/* routes' Bearer-token check, just applied via the
 * browser-native auth prompt since these are pages someone visits, not
 * an API a script calls with a header it controls.
 *
 * Named `proxy.ts` (not `middleware.ts`) — Next.js 16 renamed the file
 * convention; see node_modules/next/dist/docs/.../proxy.md.
 */
export function proxy(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return new Response("Admin access is not configured.", { status: 500 });
  }

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const colonIndex = decoded.indexOf(":");
      const password = colonIndex === -1 ? decoded : decoded.slice(colonIndex + 1);
      if (password === secret) {
        return NextResponse.next();
      }
    } catch {
      // fall through to the 401 below
    }
  }

  return new Response("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Priora Admin"' },
  });
}

export const config = {
  matcher: "/admin/:path*",
};
