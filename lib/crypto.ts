import crypto from "node:crypto";

function encryptionKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be exactly 32 bytes encoded as base64");
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((x) => x.toString("base64url")).join(".");
}

export function decryptSecret(payload: string): string {
  const [iv64, tag64, body64] = payload.split(".");
  if (!iv64 || !tag64 || !body64) throw new Error("Invalid encrypted secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv64, "base64url"));
  decipher.setAuthTag(Buffer.from(tag64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body64, "base64url")), decipher.final()]).toString("utf8");
}
