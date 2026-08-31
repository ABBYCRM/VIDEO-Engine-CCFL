import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// Single-credential admin login for the Claw console. Compares the
// supplied password against the APP_ENCRYPTION_KEY-derived
// ADMIN_PASSWORD env (set on DigitalOcean). On success, mints a
// session row in the `sessions` table and returns its id in a
// `claw_session` cookie.
export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({}));
  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "password is required" }, { status: 400 });
  }
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected) {
    return NextResponse.json({ error: "ADMIN_PASSWORD is not set on the server" }, { status: 500 });
  }
  if (password !== expected) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    "INSERT INTO sessions(id, user_label, expires_at) VALUES(?,?,?)"
  ).run(sessionId, "admin", expiresAt);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("claw_session", sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 7 * 24 * 60 * 60
  });
  return res;
}
