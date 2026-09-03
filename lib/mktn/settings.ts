import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

export const MKTN_PROVIDER_IDS = ["nvidia", "hedra", "gemini", "a2e"] as const;
export type MktnProviderId = (typeof MKTN_PROVIDER_IDS)[number];

const ENV_KEYS: Record<MktnProviderId, string> = {
  nvidia: "NVIDIA_API_KEY",
  hedra: "HEDRA_API_KEY",
  gemini: "GEMINI_API_KEY",
  a2e: "A2E_API_KEY",
};

// Reuse the app's established per-provider slots so a key entered in MKTN is
// immediately available to Claw and any existing server-side provider client.
const SETTING_KEYS: Record<MktnProviderId, string> = {
  nvidia: "nvidia_api_key",
  hedra: "hedra_api_key",
  gemini: "gemini_api_key",
  a2e: "a2e_api_key",
};

const settingKey = (provider: MktnProviderId): string => SETTING_KEYS[provider];

function savedSecret(provider: MktnProviderId): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(settingKey(provider)) as { value: string } | undefined;
  if (!row) return null;
  return decryptSecret(row.value);
}

export function getMktnProviderSecret(provider: MktnProviderId): string | null {
  return savedSecret(provider) || process.env[ENV_KEYS[provider]]?.trim() || null;
}

export function saveMktnProviderSecret(provider: MktnProviderId, value: string): void {
  const clean = value.trim();
  if (!clean) throw new TypeError("API key cannot be empty.");
  db.prepare(
    "INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
  ).run(settingKey(provider), encryptSecret(clean));
}

export function clearMktnProviderSecret(provider: MktnProviderId): void {
  db.prepare("DELETE FROM settings WHERE key=?").run(settingKey(provider));
}

export function getMktnProviderStatus(): Record<MktnProviderId, { configured: boolean; source: "saved" | "environment" | "none" }> {
  return Object.fromEntries(MKTN_PROVIDER_IDS.map((provider) => {
    const saved = Boolean(db.prepare("SELECT 1 FROM settings WHERE key=?").get(settingKey(provider)));
    const environment = Boolean(process.env[ENV_KEYS[provider]]?.trim());
    return [provider, { configured: saved || environment, source: saved ? "saved" : environment ? "environment" : "none" }];
  })) as Record<MktnProviderId, { configured: boolean; source: "saved" | "environment" | "none" }>;
}
