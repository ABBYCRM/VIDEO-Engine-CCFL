import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { verifyApiToken } from "@/lib/tokens";

const COOKIE = "claw_session";

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  return value;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

/**
 * Authorize a protected Claw/admin route.
 *
 * Browser callers authenticate with the HttpOnly claw_session cookie.
 * Programmatic callers may use a valid ve_live_ Bearer token. Missing,
 * revoked, or expired credentials fail closed.
 */
export async function requireAdmin(): Promise<boolean> {
  const requestHeaders = await headers();
  const authorization = requestHeaders.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer && verifyApiToken(bearer)) return true;

  const sessionId = (await cookies()).get(COOKIE)?.value;
  if (!sessionId) return false;

  const row = db.prepare(
    "SELECT expires_at, revoked_at FROM sessions WHERE id = ?"
  ).get(sessionId) as { expires_at: string; revoked_at: string | null } | undefined;
  if (!row || row.revoked_at) return false;

  const expiresAt = Date.parse(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    db.prepare("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL").run(sessionId);
    return false;
  }
  return true;
}

export const sessionCookieName = COOKIE;

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function createOAuthState(toolkit: string) {
  const payload = Buffer.from(
    JSON.stringify({ toolkit, exp: Date.now() + OAUTH_STATE_TTL_MS }),
    "utf8"
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyOAuthState(value: string | null | undefined, toolkit: string) {
  if (!value) return false;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return false;

  const expected = sign(payload);
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;

  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      toolkit?: unknown;
      exp?: unknown;
    };
    return body.toolkit === toolkit && typeof body.exp === "number" && body.exp > Date.now();
  } catch {
    return false;
  }
}
