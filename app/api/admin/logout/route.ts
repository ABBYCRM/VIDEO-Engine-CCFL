import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revokeAdminSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const fromHeader = req.headers.get("cookie");
  const match = fromHeader?.match(/(?:^|;\s*)claw_session=([^;]+)/);
  const jar = await cookies();
  const token = match?.[1] || jar.get(SESSION_COOKIE)?.value;
  revokeAdminSession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  return res;
}
