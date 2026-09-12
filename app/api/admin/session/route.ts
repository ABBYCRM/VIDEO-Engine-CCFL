import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { parseSessionCookie, sessionCookieName } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const sessionId = parseSessionCookie((await cookies()).get(sessionCookieName)?.value)?.sid;
  if (!sessionId) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const row = db.prepare(
    `SELECT id, user_label, expires_at, revoked_at FROM sessions WHERE id=?`
  ).get(sessionId) as { id: string; user_label: string; expires_at: string; revoked_at: string | null } | undefined;
  if (!row || row.revoked_at) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ authenticated: false, reason: "expired" }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    user: row.user_label,
    expiresAt: row.expires_at,
  });
}
