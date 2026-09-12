import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyApiToken } from "@/lib/tokens";

export const SESSION_COOKIE = "claw_session";
/** @deprecated use SESSION_COOKIE */
export const sessionCookieName = SESSION_COOKIE;

const SESSION_TTL_SEC = 7 * 24 * 60 * 60;
const WEAK_PASSWORDS = new Set(["1234", "change-me", "password", "admin", ""]);

function sessionSecret(): string | null {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) return null;
  return s;
}

function secret() {
  const s = sessionSecret();
  if (!s) throw new Error("SESSION_SECRET must be at least 32 characters");
  return s;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function readNamedCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return null;
}

function signJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${header}.${body}`;
  return `${data}.${crypto.createHmac("sha256", secret()).update(data).digest("base64url")}`;
}

function verifyJwt(token: string): { sid: string; exp: number } | null {
  if (!sessionSecret()) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto.createHmac("sha256", secret()).update(`${header}.${body}`).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { sid?: unknown; exp?: unknown };
    if (typeof payload.sid !== "string" || !payload.sid || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 <= Date.now()) return null;
    return { sid: payload.sid, exp: payload.exp };
  } catch {
    return null;
  }
}

function sessionRowLive(sid: string): boolean {
  const row = db.prepare(
    "SELECT id, expires_at, revoked_at FROM sessions WHERE id=?"
  ).get(sid) as { id: string; expires_at: string; revoked_at: string | null } | undefined;
  if (!row || row.revoked_at) return false;
  return new Date(row.expires_at).getTime() > Date.now();
}

export function cookieSecure(): boolean {
  const base = process.env.PUBLIC_BASE_URL || "";
  if (base.startsWith("https://")) return true;
  if (base.startsWith("http://localhost") || base.startsWith("http://127.0.0.1")) return false;
  return process.env.NODE_ENV === "production";
}

export function sessionCookieOptions(maxAge = SESSION_TTL_SEC) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecure(),
    path: "/",
    maxAge
  };
}

export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (WEAK_PASSWORDS.has(password) || WEAK_PASSWORDS.has(expected)) return false;
  if (!expected || expected.length < 8 || !password) return false;
  const left = crypto.createHash("sha256").update(password).digest();
  const right = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(left, right);
}

export function createAdminSession(userLabel = "admin"): { sid: string; token: string; maxAge: number } {
  const sid = crypto.randomUUID();
  const maxAge = SESSION_TTL_SEC;
  const expiresAt = new Date(Date.now() + maxAge * 1000).toISOString();
  db.prepare("INSERT INTO sessions(id, user_label, expires_at) VALUES(?,?,?)").run(sid, userLabel, expiresAt);
  const token = signJwt({ sid, sub: userLabel, exp: Math.floor(Date.now() / 1000) + maxAge });
  return { sid, token, maxAge };
}

export function revokeAdminSession(tokenOrSid: string | null | undefined): void {
  if (!tokenOrSid) return;
  const jwt = verifyJwt(tokenOrSid);
  const sid = jwt?.sid || (tokenOrSid.length === 36 ? tokenOrSid : null);
  if (!sid) return;
  db.prepare("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?").run(sid);
}

export function authorizeFromParts(input: { authorization?: string | null; sessionCookie?: string | null }): boolean {
  const authorization = input.authorization?.trim() || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    if (token.startsWith("ve_live_") && verifyApiToken(token)) return true;
  }
  const cookie = input.sessionCookie?.trim() || "";
  if (!cookie) return false;
  const jwt = verifyJwt(cookie);
  if (!jwt) return false;
  return sessionRowLive(jwt.sid);
}

/**
 * Real gate: JWT session cookie (HS256 via SESSION_SECRET) or ve_live_* Bearer.
 * Must return false when neither is valid. A constant `return true` is a P0 defect.
 */
export async function requireAdmin(req?: Request): Promise<boolean> {
  let authorization: string | null = null;
  let sessionCookie: string | null = null;
  if (req) {
    authorization = req.headers.get("authorization");
    sessionCookie = readNamedCookie(req.headers.get("cookie"), SESSION_COOKIE);
  } else {
    try {
      const hdrs = await headers();
      const jar = await cookies();
      authorization = hdrs.get("authorization");
      sessionCookie = jar.get(SESSION_COOKIE)?.value ?? null;
    } catch {
      return false;
    }
  }
  return authorizeFromParts({ authorization, sessionCookie });
}

export async function unauthorized(req?: Request): Promise<NextResponse | null> {
  if (await requireAdmin(req)) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export function createOAuthState(toolkit: string) {
  const payload = Buffer.from(JSON.stringify({ toolkit, exp: Date.now() + OAUTH_STATE_TTL_MS }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function verifyOAuthState(value: string | null | undefined, toolkit: string) {
  if (!value || !sessionSecret()) return false;
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
