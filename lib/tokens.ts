// lib/tokens.ts — optional ve_live_* token verify for automation callers.
// The console itself has no login wall.
import crypto from "node:crypto";
import { db } from "@/lib/db";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verifyApiToken(token: string): boolean {
  if (!token.startsWith("ve_live_")) return false;
  const row = db.prepare(
    "SELECT id, revoked_at FROM api_tokens WHERE token_hash=? AND token_prefix=?"
  ).get(hashToken(token), token.slice(0, 12)) as { id: string; revoked_at: string | null } | undefined;
  if (!row || row.revoked_at) return false;
  db.prepare("UPDATE api_tokens SET last_used_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
  return true;
}
