import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import {
  createSessionValue,
  sessionCookieName,
  sessionCookieSecure,
  sessionTtlMs,
  verifyAdminPassword,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({}));
  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "password is required" }, { status: 400 });
  }
  const check = verifyAdminPassword(password);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
  db.prepare(
    "INSERT INTO sessions(id, user_label, expires_at) VALUES(?,?,?)"
  ).run(sessionId, "admin", expiresAt);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookieName, createSessionValue(sessionId), {
    httpOnly: true,
    sameSite: "lax",
    secure: sessionCookieSecure(),
    path: "/",
    maxAge: Math.floor(sessionTtlMs / 1000),
  });
  return res;
}
