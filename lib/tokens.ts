import crypto from "node:crypto";
import { db } from "@/lib/db";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function issueApiToken(name: string) {
  const id = crypto.randomUUID();
  const raw = `ve_live_${crypto.randomBytes(32).toString("base64url")}`;
  const hash = hashToken(raw);
  const prefix = raw.slice(0, 12);
  db.prepare("INSERT INTO api_tokens(id,name,token_hash,token_prefix) VALUES(?,?,?,?)").run(id, name, hash, prefix);
  return { id, name, token: raw, prefix };
}

export function listApiTokens() {
  return db.prepare(
    "SELECT id,name,token_prefix as prefix,created_at as createdAt,last_used_at as lastUsedAt,revoked_at as revokedAt FROM api_tokens WHERE revoked_at IS NULL ORDER BY created_at DESC"
  ).all();
}

export function revokeApiToken(id: string) {
  db.prepare("UPDATE api_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
}

export function verifyApiToken(token: string): boolean {
  if (!token.startsWith("ve_live_")) return false;
  const row = db.prepare(
    "SELECT id, revoked_at FROM api_tokens WHERE token_hash=?"
  ).get(hashToken(token)) as { id: string; revoked_at: string | null } | undefined;
  if (!row || row.revoked_at) return false;
  db.prepare("UPDATE api_tokens SET last_used_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
  return true;
}
