import crypto from "node:crypto";
import { cookies, headers } from "next/headers";

const COOKIE = "video_engine_session";
function secret() { const s = process.env.SESSION_SECRET; if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters"); return s; }
function sign(payload: string) { return crypto.createHmac("sha256", secret()).update(payload).digest("base64url"); }
export function createSessionValue() {
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ exp }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function verifySessionValue(value?: string | null) {
  if (!value) return false;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try { const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); return Number(body.exp) > Date.now(); } catch { return false; }
}
export async function requireAdmin() {
  const jar = await cookies();
  if (verifySessionValue(jar.get(COOKIE)?.value)) return true;
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
