import { NextResponse } from "next/server";
import { adminPasswordMatches, applySessionCookie, createAdminSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({}));
  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "password is required" }, { status: 400 });
  }
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 8) {
    return NextResponse.json({ error: "Admin password is not configured" }, { status: 503 });
  }
  if (!adminPasswordMatches(password)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  const session = createAdminSession();
  const res = NextResponse.json({ ok: true });
  applySessionCookie(res, session.id);
  return res;
}
