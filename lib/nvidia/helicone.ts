// Optional Helicone (helicone.ai) LLM observability proxy in front of the
// NVIDIA NIM calls in lib/nvidia/client.ts.
//
// Verified against Helicone's own Gateway docs (2026-08-29): route through
// https://gateway.helicone.ai instead of the provider's own base URL, with
// headers Helicone-Auth: Bearer <key>, Helicone-Target-Url: <real
// upstream URL>, Helicone-Target-Provider: <label>. The original provider
// auth header (Authorization: Bearer NVIDIA_KEY) still goes through too —
// Helicone forwards it to the target.
//
// Deliberately NOT auto-enabled just because HELICONE_API_KEY is present,
// unlike every other provider key in this app. Reason: Helicone's docs
// state that a custom/unapproved target domain (NVIDIA's
// integrate.api.nvidia.com is not one of their pre-approved providers) is
// capped at 1 request/second and 10,000/day on their gateway. Claw is a
// real-time chat a real operator uses live; silently routing every one of
// its NVIDIA calls through an undocumented rate limit the moment a key
// exists would be a bad trade with no warning. Requires a second,
// explicit HELICONE_ENABLED=true (or the equivalent Settings toggle)
// before it activates. Get in touch with Helicone (or check their current
// docs) about approving the domain before relying on this for real
// traffic volume.

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

/**
 * Given the real upstream URL this call would otherwise hit, returns
 * either that same URL unchanged (Helicone off) or the Helicone gateway
 * URL + the extra headers needed to route it there.
 */
export function heliconeRoute(upstreamUrl: string): { url: string; extraHeaders: Record<string, string> } {
  if (!isHeliconeEnabled()) return { url: upstreamUrl, extraHeaders: {} };
  const key = getHeliconeApiKey()!;
  const parsed = new URL(upstreamUrl);
  return {
    url: GATEWAY_BASE + parsed.pathname + parsed.search,
    extraHeaders: {
      "Helicone-Auth": `Bearer ${key}`,
      "Helicone-Target-Url": upstreamUrl,
      "Helicone-Target-Provider": "nvidia"
    }
  };
}
