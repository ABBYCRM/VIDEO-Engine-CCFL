import crypto from "node:crypto";
import { db } from "@/lib/db";

export function issueApiToken(name: string) {
  const id = crypto.randomUUID();
  const raw = `ve_live_${crypto.randomBytes(32).toString("base64url")}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 15);
  db.prepare("INSERT INTO api_tokens(id,name,token_hash,token_prefix) VALUES(?,?,?,?)").run(id, name, hash, prefix);
  return { id, name, token: raw, prefix };
}
export function listApiTokens() {
  return db.prepare("SELECT id,name,token_prefix as prefix,created_at as createdAt,last_used_at as lastUsedAt,revoked_at as revokedAt FROM api_tokens WHERE revoked_at IS NULL ORDER BY created_at DESC").all();
}
export function revokeApiToken(id: string) { db.prepare("DELETE FROM api_tokens WHERE id=?").run(id); }
export function verifyApiToken(raw: string) {
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const row = db.prepare("SELECT id FROM api_tokens WHERE token_hash=? AND revoked_at IS NULL").get(hash) as { id: string } | undefined;
  if (!row) return false;
  db.prepare("UPDATE api_tokens SET last_used_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
  return true;
}
