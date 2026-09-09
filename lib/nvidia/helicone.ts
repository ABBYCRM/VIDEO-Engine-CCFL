// Optional Helicone LLM observability proxy in front of Bitdeer calls.

import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

const KEY_SETTING = "helicone_api_key";
const ENABLED_SETTING = "helicone_enabled";
const GATEWAY_BASE = "https://gateway.helicone.ai";

function getRaw(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

function getHeliconeApiKey(): string | null {
  const encrypted = getRaw(KEY_SETTING);
  if (encrypted) return decryptSecret(encrypted);
  return process.env.HELICONE_API_KEY?.trim() || null;
}

export function saveHeliconeApiKey(value: string) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(KEY_SETTING, encryptSecret(value.trim()));
}

export function setHeliconeEnabled(on: boolean) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(ENABLED_SETTING, on ? "1" : "0");
}

export function isHeliconeEnabled(): boolean {
  const stored = getRaw(ENABLED_SETTING);
  const explicitlyEnabled = stored === "1" || process.env.HELICONE_ENABLED === "1" || process.env.HELICONE_ENABLED === "true";
  return explicitlyEnabled && Boolean(getHeliconeApiKey());
}

export function heliconeRoute(upstreamUrl: string): { url: string; extraHeaders: Record<string, string> } {
  if (!isHeliconeEnabled()) return { url: upstreamUrl, extraHeaders: {} };
  const key = getHeliconeApiKey()!;
  const parsed = new URL(upstreamUrl);
  return {
    url: GATEWAY_BASE + parsed.pathname + parsed.search,
    extraHeaders: {
      "Helicone-Auth": `Bearer ${key}`,
      "Helicone-Target-Url": upstreamUrl,
      "Helicone-Target-Provider": "bitdeer"
    }
  };
}
