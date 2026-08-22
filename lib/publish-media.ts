import crypto from "node:crypto";

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be configured for publishing");
  return value;
}

export function signPublishedMedia(jobId: string, expiresAt: number) {
  return crypto.createHmac("sha256", secret()).update(`${jobId}:${expiresAt}`).digest("hex");
}

export function verifyPublishedMedia(jobId: string, expiresAt: number, signature: string) {
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = signPublishedMedia(jobId, expiresAt);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function publicMediaUrl(jobId: string) {
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("PUBLIC_BASE_URL is required for social publishing");
  const expiresAt = Date.now() + 6 * 60 * 60 * 1000;
  const signature = signPublishedMedia(jobId, expiresAt);
  return `${base}/api/publish/media/${encodeURIComponent(jobId)}?expires=${expiresAt}&sig=${signature}`;
}
