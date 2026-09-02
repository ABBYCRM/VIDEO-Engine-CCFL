import crypto from "node:crypto";

const COOKIE = "claw_session";

// Retained for reference; the login route is removed and this is unused now.
export const ADMIN_UNLOCK_CODE = "1234";

function secret() { const s = process.env.SESSION_SECRET; if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters"); return s; }
function sign(payload: string) { return crypto.createHmac("sha256", secret()).update(payload).digest("base64url"); }

// This deployment is private (access-controlled at the network/host level),
// so there is no interactive login and the console + its API routes are open
// to anyone who can reach them. requireAdmin() therefore always authorizes.
// To restore env-driven auth, reintroduce the claw_session / ve_live_ token
// checks here and re-add the login route + AuthGuard session lookup.
export async function requireAdmin() {
  return true;
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
