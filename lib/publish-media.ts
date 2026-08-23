import crypto from "node:crypto";

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be configured for publishing");
  return value;
}

function sign(kind: "video" | "asset", id: string, expiresAt: number) {
  return crypto.createHmac("sha256", secret()).update(`${kind}:${id}:${expiresAt}`).digest("hex");
}
function verify(kind: "video" | "asset", id: string, expiresAt: number, signature: string) {
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = sign(kind, id, expiresAt);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function baseUrl() {
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("PUBLIC_BASE_URL is required for social publishing");
  return base;
}

export function signPublishedMedia(jobId: string, expiresAt: number) { return sign("video", jobId, expiresAt); }
export function verifyPublishedMedia(jobId: string, expiresAt: number, signature: string) { return verify("video", jobId, expiresAt, signature); }
export function publicMediaUrl(jobId: string) {
  const expiresAt = Date.now() + 6 * 60 * 60 * 1000;
  return `${baseUrl()}/api/publish/media/${encodeURIComponent(jobId)}?expires=${expiresAt}&sig=${signPublishedMedia(jobId, expiresAt)}`;
}

export function signPublishedAsset(assetId: string, expiresAt: number) { return sign("asset", assetId, expiresAt); }
export function verifyPublishedAsset(assetId: string, expiresAt: number, signature: string) { return verify("asset", assetId, expiresAt, signature); }
export function publicLibraryAssetUrl(assetId: string) {
  const expiresAt = Date.now() + 6 * 60 * 60 * 1000;
  return `${baseUrl()}/api/publish/asset/${encodeURIComponent(assetId)}?expires=${expiresAt}&sig=${signPublishedAsset(assetId, expiresAt)}`;
}
