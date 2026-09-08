import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";
}

function rateLimited(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 0, resetAt: now + WINDOW_MS });
    return false;
  }
  return current.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  current.count += 1;
}

function secureEqual(a: string, b: string) {
  const left = crypto.createHash("sha256").update(a).digest();
  const right = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(left, right);
}

export async function POST(req: Request) {
  const key = clientKey(req);
  if (rateLimited(key)) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429, headers: { "retry-after": "600" } }
    );
  }

  const configured = process.env.ADMIN_PASSWORD;
  if (!configured || configured.length < 12) {
    console.error("ADMIN_PASSWORD is missing or shorter than 12 characters");
    return NextResponse.json({ error: "Admin login is not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null) as { password?: unknown } | null;
  const password = body?.password;
  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "password is required" }, { status: 400 });
  }

  if (!secureEqual(password, configured)) {
    recordFailure(key);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  attempts.delete(key);

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    "INSERT INTO sessions(id, user_label, expires_at) VALUES(?,?,?)"
  ).run(sessionId, "admin", expiresAt);

  const res = NextResponse.json({ ok: true });
  res.cookies.set("claw_session", sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60
  });
  res.headers.set("cache-control", "no-store");
  return res;
}
