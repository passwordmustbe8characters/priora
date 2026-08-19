import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { deriveSessionToken } from "../../../lib/admin-session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Admin access is not configured." }, { status: 500 });
  }

  let body: { password?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof body.password !== "string" || body.password !== secret) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("priora_admin_session", deriveSessionToken(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days — this is just for the admin's own convenience, not a security-sensitive session lifetime
  });
  return response;
}
