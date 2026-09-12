import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { parseSessionCookie, sessionCookieName } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const jar = await cookies();
  const sessionId = parseSessionCookie(jar.get(sessionCookieName)?.value)?.sid;
  if (sessionId) {
    db.prepare("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?").run(sessionId);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookieName, "", { maxAge: 0, path: "/" });
  return res;
}
