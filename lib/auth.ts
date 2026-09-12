import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const COOKIE = "claw_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return s;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    crypto.timingSafeEqual(right, right);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

/** Env-only admin password. Never accepts a hardcoded unlock code. */
export function adminPasswordMatches(presented: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected.length < 8) return false;
  return timingSafeEqualString(presented, expected);
}

export function sessionIsActive(sessionId: string | undefined | null): boolean {
  if (!sessionId) return false;
  const row = db.prepare(
    `SELECT expires_at, revoked_at FROM sessions WHERE id=?`
  ).get(sessionId) as { expires_at: string; revoked_at: string | null } | undefined;
  if (!row || row.revoked_at) return false;
  return new Date(row.expires_at).getTime() > Date.now();
}

export function createAdminSession(): { id: string; expiresAt: string } {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare("INSERT INTO sessions(id, user_label, expires_at) VALUES(?,?,?)").run(sessionId, "admin", expiresAt);
  return { id: sessionId, expiresAt };
}

export function applySessionCookie(res: NextResponse, sessionId: string) {
  res.cookies.set(COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function readBearerToken(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;
  const raw = authorization.slice(7).trim();
  return raw || null;
}

export async function requireAdmin() {
  try {
    const jar = await cookies();
    if (sessionIsActive(jar.get(COOKIE)?.value)) return true;
  } catch {
    /* cookies() unavailable outside a request scope */
  }
  try {
    const h = await headers();
    const raw = readBearerToken(h.get("authorization"));
    if (raw?.startsWith("ve_live_")) {
      const { verifyApiToken } = await import("@/lib/tokens");
      return verifyApiToken(raw);
    }
  } catch {
    /* headers() unavailable outside a request scope */
  }
  return false;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const sessionCookieName = COOKIE;

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export function createOAuthState(toolkit: string) {
  const payload = Buffer.from(JSON.stringify({ toolkit, exp: Date.now() + OAUTH_STATE_TTL_MS }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function verifyOAuthState(value: string | null | undefined, toolkit: string) {
  if (!value) return false;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return body.toolkit === toolkit && Number(body.exp) > Date.now();
  } catch {
    return false;
  }
}
