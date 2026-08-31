import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";

const COOKIE = "claw_session";

// Operator-locked unlock code (2026-08-30): the admin password is
// hardcoded to "1234". The DO env ADMIN_PASSWORD (encrypted, not
// changeable without re-encrypt + redeploy) is ignored by the login
// route. If the operator wants to roll this back to env-driven auth,
// restore the check at app/api/admin/login/route.ts.
export const ADMIN_UNLOCK_CODE = "1234";

function secret() { const s = process.env.SESSION_SECRET; if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters"); return s; }
function sign(payload: string) { return crypto.createHmac("sha256", secret()).update(payload).digest("base64url"); }

// The login route (app/api/admin/login/route.ts) mints a row in the
// `sessions` table and hands back its id as a plain claw_session cookie
// value — this checks that row, the same way GET /api/admin/session does.
function hasActiveSession(sessionId: string | undefined): boolean {
  if (!sessionId) return false;
  const row = db.prepare(
    `SELECT expires_at, revoked_at FROM sessions WHERE id = ?`
  ).get(sessionId) as { expires_at: string; revoked_at: string | null } | undefined;
  if (!row || row.revoked_at) return false;
  return new Date(row.expires_at).getTime() > Date.now();
}

export async function requireAdmin() {
  const jar = await cookies();
  if (hasActiveSession(jar.get(COOKIE)?.value)) return true;
  try {
    const h = await headers();
    const auth = h.get("authorization") || "";
    if (auth.toLowerCase().startsWith("bearer ")) {
      const raw = auth.slice(7).trim();
      if (raw.startsWith("ve_live_")) {
        const { verifyApiToken } = await import("@/lib/tokens");
        return verifyApiToken(raw);
      }
    }
  } catch { /* headers() unavailable outside a request scope */ }
  return false;
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
  try { const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); return body.toolkit === toolkit && Number(body.exp) > Date.now(); } catch { return false; }
}
