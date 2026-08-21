// Composio SDK wrapper. The v3 SDK lives at @composio/core (verified at
// runtime against the installed package). We keep this layer thin so call
// sites get:
//   - a single Composio client constructed from the encrypted key
//   - type-narrowed errors so the API routes can return meaningful messages
//   - never throws on init (returns null if no key is configured)

import { Composio } from "@composio/core";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

export const COMPOSIO_SETTING_KEY = "composio_api_key";
export const COMPOSIO_AUTH_CONFIG_KEY_PREFIX = "composio_auth_config_id_";

function getRaw(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

function setRaw(key: string, value: string) {
  db.prepare(
    "INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP"
  ).run(key, value);
}

export class ComposioAuthError extends Error {
  constructor(message: string) { super(message); this.name = "ComposioAuthError"; }
}
export class ComposioUpstreamError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = "ComposioUpstreamError"; this.status = status; }
}

export function getComposioApiKey(): string {
  const encrypted = getRaw(COMPOSIO_SETTING_KEY);
  if (encrypted) return decryptSecret(encrypted);
  if (process.env.COMPOSIO_API_KEY) return process.env.COMPOSIO_API_KEY;
  throw new ComposioAuthError("Composio API key is not configured");
}

export function saveComposioApiKey(value: string) { setRaw(COMPOSIO_SETTING_KEY, encryptSecret(value.trim())); }

export function isComposioConfigured(): boolean {
  return Boolean(getRaw(COMPOSIO_SETTING_KEY) || process.env.COMPOSIO_API_KEY);
}

export function getAuthConfigId(toolkit: string): string | null {
  const v = getRaw(COMPOSIO_AUTH_CONFIG_KEY_PREFIX + toolkit);
  if (v) return v;
  const envName = `COMPOSIO_${toolkit.toUpperCase()}_AUTH_CONFIG_ID`;
  return process.env[envName] || null;
}

export function setAuthConfigId(toolkit: string, id: string) {
  setRaw(COMPOSIO_AUTH_CONFIG_KEY_PREFIX + toolkit, id);
}

let _client: Composio | null = null;
let _clientKey: string | null = null;

export function getComposio(): Composio {
  const key = getComposioApiKey();
  if (_client && _clientKey === key) return _client;
  _client = new Composio({ apiKey: key });
  _clientKey = key;
  return _client;
}

// The toolkit catalog. Each one needs an auth config id in the dashboard
// before OAuth can start. publishable=true means we can use this toolkit to
// post content. requiresBusiness=true means the user's account on that
// platform must be a Business/Creator account (Meta's rule, not ours).
export const COMPOSIO_TOOLKITS = [
  { id: "instagram",      label: "Instagram (Business / Creator)",  requiresBusiness: true,  publishable: true },
  { id: "facebook",       label: "Facebook Pages",                  requiresBusiness: true,  publishable: true },
  { id: "youtube",        label: "YouTube",                         requiresBusiness: false, publishable: true },
  { id: "googleads",      label: "Google Ads",                      requiresBusiness: false, publishable: false },
  { id: "metaads",        label: "Meta Ads",                        requiresBusiness: true,  publishable: false },
  { id: "linkedin",       label: "LinkedIn Pages",                  requiresBusiness: true,  publishable: true },
  { id: "twitter",        label: "X / Twitter",                     requiresBusiness: false, publishable: true },
  { id: "tiktok",         label: "TikTok Ads",                      requiresBusiness: true,  publishable: true },
  { id: "gmb",            label: "Google Business Profile",         requiresBusiness: true,  publishable: true },
  { id: "slack",          label: "Slack",                           requiresBusiness: false, publishable: false },
  { id: "notion",         label: "Notion",                          requiresBusiness: false, publishable: false },
  { id: "hubspot",        label: "HubSpot",                         requiresBusiness: false, publishable: false },
  { id: "mailchimp",      label: "Mailchimp",                       requiresBusiness: false, publishable: false },
  { id: "resend",         label: "Resend (email)",                  requiresBusiness: false, publishable: true },
  { id: "s3",             label: "S3 / Spaces",                     requiresBusiness: false, publishable: false },
  { id: "github",         label: "GitHub",                          requiresBusiness: false, publishable: false },
  { id: "googlecalendar", label: "Google Calendar",                 requiresBusiness: false, publishable: false },
  { id: "google_analytics", label: "Google Analytics",              requiresBusiness: false, publishable: false },
  { id: "canva",          label: "Canva",                           requiresBusiness: false, publishable: true },
  { id: "googlesuper",    label: "Google Workspace (Super Admin)",  requiresBusiness: false, publishable: false }
] as const;

export type ComposioToolkitId = (typeof COMPOSIO_TOOLKITS)[number]["id"];

export function getToolkitMeta(id: string) {
  return COMPOSIO_TOOLKITS.find(t => t.id === id) ?? { id, label: id, requiresBusiness: false, publishable: false };
}
