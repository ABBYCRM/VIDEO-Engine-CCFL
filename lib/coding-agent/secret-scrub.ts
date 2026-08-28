// Secret scrubbing for Coding Agent output. Extends AGENTS.md's existing
// "never dump secrets" rule (already enforced for Claw's other tools) to
// this new, higher-risk tool class: any output that could contain a shell
// command's stdout/stderr must never leak this app's own credentials back
// into the chat transcript.

import { decryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { redactSecretPatterns } from "@/lib/coding-agent/secret-patterns";

function rawSetting(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

/** Every secret this app might hold, decrypted once per call. Small,
 *  bounded list — safe to decrypt per invocation rather than caching. */
function configuredSecrets(): string[] {
  const keys = [
    "gemini_api_key",
    "xai_api_key",
    "a2e_api_key",
    "hedra_api_key",
    "nvidia_api_key",
    "composio_api_key",
    "instagram_access_token",
    "instagram_app_secret"
  ];
  const values: string[] = [];
  for (const key of keys) {
    const encrypted = rawSetting(key);
    if (!encrypted) continue;
    try {
      const plain = decryptSecret(encrypted);
      if (plain && plain.length >= 6) values.push(plain);
    } catch { /* ignore malformed entries */ }
  }
  for (const envName of ["GEMINI_API_KEY", "XAI_API_KEY", "A2E_API_KEY", "HEDRA_API_KEY", "NVIDIA_API_KEY", "COMPOSIO_API_KEY", "ADMIN_PASSWORD", "SESSION_SECRET", "APP_ENCRYPTION_KEY", "STEEL_API_KEY", "INSTAGRAM_MCP_ACCESS_TOKEN", "INSTAGRAM_MCP_APP_SECRET"]) {
    const v = process.env[envName];
    if (v && v.length >= 6) values.push(v);
  }
  return values;
}

/** Redact any known configured secret value, plus common secret-shaped
 *  patterns, from a block of text before it can reach a chat transcript or
 *  API response. */
export function scrubSecrets(text: string): string {
  let out = text;
  for (const secret of configuredSecrets()) {
    if (!secret) continue;
    out = out.split(secret).join("***REDACTED***");
  }
  return redactSecretPatterns(out);
}
