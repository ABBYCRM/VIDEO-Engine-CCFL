import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createSessionValue, sessionCookieName } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = await req.json();
  const expected = process.env.ADMIN_PASSWORD || "";
  const a = Buffer.from(String(password || ""));
  const b = Buffer.from(expected);
  const ok = expected.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookieName, createSessionValue(), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
  return res;
}
