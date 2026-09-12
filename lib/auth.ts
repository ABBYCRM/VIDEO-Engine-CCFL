import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const COOKIE = "claw_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SessionClaims = { sid: string; exp: number };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return s;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function timingSafeStringEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export function createSessionValue(sessionId: string, ttlMs = SESSION_TTL_MS) {
  const exp = Date.now() + ttlMs;
  const payload = Buffer.from(JSON.stringify({ sid: sessionId, exp }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseSessionCookie(value?: string | null): SessionClaims | null {
  if (!value) return null;
  if (value.includes(".")) {
    const [payload, sig] = value.split(".");
    if (!payload || !sig) return null;
    let expected: string;
    try {
      expected = sign(payload);
    } catch {
      return null;
    }
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
    try {
      const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sid?: string; exp?: number };
      if (!body.sid || typeof body.exp !== "number" || body.exp <= Date.now()) return null;
      return { sid: body.sid, exp: body.exp };
    } catch {
      return null;
    }
  }
  if (UUID_RE.test(value)) return { sid: value, exp: Number.MAX_SAFE_INTEGER };
  return null;
}

export function hasActiveSession(sessionId: string): boolean {
  const row = db.prepare(
    `SELECT expires_at, revoked_at FROM sessions WHERE id = ?`
  ).get(sessionId) as { expires_at: string; revoked_at: string | null } | undefined;
  if (!row || row.revoked_at) return false;
  return new Date(row.expires_at).getTime() > Date.now();
}

export function verifyAdminPassword(password: string): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected.length < 8) {
    return { ok: false, status: 503, error: "ADMIN_PASSWORD is not configured" };
  }
  if (!timingSafeStringEqual(password, expected)) {
    return { ok: false, status: 401, error: "Invalid password" };
  }
  return { ok: true };
}

export async function authorizeAdmin(input: { cookie?: string | null; authorization?: string | null }): Promise<boolean> {
  const claims = parseSessionCookie(input.cookie);
  if (claims && hasActiveSession(claims.sid)) return true;
  const auth = input.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const raw = auth.slice(7).trim();
    if (raw.startsWith("ve_live_")) {
      const { verifyApiToken } = await import("@/lib/tokens");
      return verifyApiToken(raw);
    }
  }
  return false;
}

export async function requireAdmin() {
  try {
    const jar = await cookies();
    const h = await headers();
    return authorizeAdmin({
      cookie: jar.get(COOKIE)?.value,
      authorization: h.get("authorization"),
    });
  } catch {
    return false;
  }
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function sessionCookieSecure() {
  if (process.env.COOKIE_SECURE === "0") return false;
  if (process.env.COOKIE_SECURE === "1") return true;
  return process.env.NODE_ENV === "production";
}

export const sessionCookieName = COOKIE;
export const sessionTtlMs = SESSION_TTL_MS;

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
