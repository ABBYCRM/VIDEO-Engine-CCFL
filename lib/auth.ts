import crypto from "node:crypto";

// No login wall. SESSION_SECRET is only used to HMAC Composio OAuth state
// so the callback cannot be forged. It is not a password gate.

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return s;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createOAuthState(toolkit: string) {
  const payload = Buffer.from(JSON.stringify({ toolkit, exp: Date.now() + OAUTH_STATE_TTL_MS }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyOAuthState(value: string | null | undefined, toolkit: string) {
  if (!value) return false;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return false;
  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return body.toolkit === toolkit && Number(body.exp) > Date.now();
  } catch {
    return false;
  }
}
