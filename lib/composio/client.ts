// Composio SDK wrapper. The v3 SDK lives at @composio/core (verified at
// runtime against the installed package). We keep this layer thin so call
// sites get:
//   - a single Composio client constructed from the encrypted key
//   - type-narrowed errors so the API routes can return meaningful messages
//   - never throws on init (returns null if no key is configured)

import { Composio } from "@composio/core";
import crypto from "node:crypto";
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

export function getActiveConnectedAccountId(toolkit: string, userId = "admin"): string | null {
  // Prefer the row bound to the requested user_id (the single-operator
  // default is "admin"), but fall back to ANY active row for this toolkit
  // when the requested user has none. A connected Composio account that
  // happens to be bound to a different user_id (e.g. a row created under
  // a playwright-test prefix during a one-off OAuth flow) is still a real,
  // usable connection — refusing to see it would force the operator to
  // re-run the OAuth consent screen for what is, to Composio, the same
  // account. Single-operator app: there's no second user to worry about.
  const exact = db.prepare(
    "SELECT connected_account_id FROM connected_accounts WHERE toolkit=? AND user_id=? AND UPPER(status)='ACTIVE' LIMIT 1"
  ).get(toolkit, userId) as { connected_account_id: string } | undefined;
  if (exact?.connected_account_id) return exact.connected_account_id;
  const fallback = db.prepare(
    // Use COALESCE(last_sync_at, created_at) as the freshness sort key:
    // the table (lib/db.ts CREATE TABLE) has no `updated_at` column. The
    // row inserted by syncConnectedAccounts() bumps last_sync_at on every
    // refresh; rows from a fresh sync on a freshly-created connection
    // have no last_sync_at yet, so created_at is the right fallback. A
    // previous version of this query (the user_id-fallback fix, 2026-08-30)
    // referenced `updated_at` directly and crashed on every Reddit call
    // with "no such column: updated_at". This is the in-place fix.
    "SELECT connected_account_id, user_id FROM connected_accounts WHERE toolkit=? AND UPPER(status)='ACTIVE' ORDER BY (user_id=?) DESC, COALESCE(last_sync_at, created_at) DESC LIMIT 1"
  ).get(toolkit, userId) as { connected_account_id: string; user_id: string } | undefined;
  if (fallback?.connected_account_id) {
    console.warn(`[composio] ${toolkit}: no active row for user_id="${userId}", falling back to user_id="${fallback.user_id}". This is fine for a single-operator app but means the OAuth flow that created this row bound it to a non-default user_id string.`);
    return fallback.connected_account_id;
  }
  return null;
}

export async function syncConnectedAccounts() {
  const USER_ID = "admin";
  const client: any = getComposio();
  const listed = await client.connectedAccounts.list();
  const items: any[] = listed?.items ?? (Array.isArray(listed) ? listed : []);
  const best = new Map<string, { id: string; toolkit: string; status: string; raw: unknown; updated: string; authConfigId?: string }>();
  for (const it of items) {
    const id = it?.id;
    if (!id) continue;
    const userId = it.user_id || it.userId || USER_ID;
    const status = String(it.status || "").toUpperCase();
    if (status !== "ACTIVE") continue;
    const toolkitRaw = it.toolkit?.slug ?? it.toolkit?.name ?? it.toolkit;
    if (!toolkitRaw) continue;
    const meta = getToolkitMeta(String(toolkitRaw));
    if (!COMPOSIO_TOOLKITS.some((t) => t.id === meta.id)) continue;
    const updated = String(it.updated_at || it.updatedAt || "");
    const authConfigId = it.auth_config?.id || it.authConfig?.id;
    // Single-operator app: pull in active connections regardless of which
    // user_id Composio bound them to (some OAuth flows — playwright tests,
    // operator-side re-binds — can land on a non-"admin" string). We
    // re-key them to USER_ID in the row write below so every downstream
    // getActiveConnectedAccountId() lookup finds them under the expected
    // name. Previously this loop filtered non-admin rows out, which made
    // a perfectly-working connection invisible to the rest of the app.
    if (userId !== USER_ID) {
      console.warn(`[composio] ${meta.id}: rebinding connected account ${id} from user_id="${userId}" to user_id="${USER_ID}" (single-operator app, expected for OAuth flows that didn't run with the default user).`);
    }
    const prev = best.get(meta.id);
    if (!prev || updated > prev.updated) {
      best.set(meta.id, { id, toolkit: meta.id, status, raw: it, updated, authConfigId });
    }
  }
  const rows = [...best.values()];
  const insert = db.prepare(
    "INSERT INTO connected_accounts(id, toolkit, connected_account_id, user_id, status, alias, raw_json, last_sync_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(toolkit, user_id) DO UPDATE SET connected_account_id=excluded.connected_account_id, status=excluded.status, raw_json=excluded.raw_json, last_sync_at=CURRENT_TIMESTAMP"
  );
  const tx = db.transaction((batch: typeof rows) => {
    for (const row of batch) {
      insert.run(crypto.randomUUID(), row.toolkit, row.id, USER_ID, row.status, null, JSON.stringify(row.raw));
      if (row.authConfigId) setAuthConfigId(row.toolkit, String(row.authConfigId));
    }
  });
  tx(rows);
  return { mirrored: rows.length, accounts: rows.map((row) => ({ id: row.id, toolkit: row.toolkit, status: row.status })) };
}

// The toolkit catalog. Each one needs an auth config id in the dashboard
// before OAuth can start. publishable=true means we can use this toolkit to
// post content. requiresBusiness=true means the user's account on that
// platform must be a Business/Creator account (Meta's rule, not ours).
export const COMPOSIO_TOOLKITS = [
  { id: "instagram",      label: "Instagram (Composio primary)",    requiresBusiness: true,  publishable: true },
  { id: "facebook",       label: "Facebook Pages",                  requiresBusiness: true,  publishable: true },
  { id: "youtube",        label: "YouTube",                         requiresBusiness: false, publishable: true },
  { id: "googleads",      label: "Google Ads",                      requiresBusiness: false, publishable: false },
  { id: "metaads",        label: "Meta Ads",                        requiresBusiness: true,  publishable: false },
  { id: "linkedin",       label: "LinkedIn Pages",                  requiresBusiness: true,  publishable: true },
  { id: "twitter",        label: "X / Twitter",                     requiresBusiness: false, publishable: true },
  { id: "reddit",         label: "Reddit",                          requiresBusiness: false, publishable: true },
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

/** Generic Composio tool execution against one toolkit's active connected
 *  account, shared by every per-network adapter (x-composio.ts,
 *  linkedin-composio.ts, reddit-composio.ts, instagram-composio.ts). */
export async function executeComposioTool(toolkit: string, slug: string, args: Record<string, unknown>, userId = "admin") {
  if (!isComposioConfigured()) throw new Error(`Composio is not configured (${toolkit} unavailable)`);
  const connectedAccountId = getActiveConnectedAccountId(toolkit, userId) || undefined;
  if (!connectedAccountId) throw new Error(`${getToolkitMeta(toolkit).label} is not connected. Connect it in Integrations first.`);
  const composio: any = getComposio();
  const result = await composio.tools.execute(slug, {
    userId,
    connectedAccountId,
    arguments: args,
    dangerouslySkipVersionCheck: true
  });
  if (result && typeof result === "object" && (result as any).successful === false) {
    const obj = result as Record<string, any>;
    const msg = obj.error || obj.data?.error || obj.message || JSON.stringify(result).slice(0, 400);
    throw new Error(`${slug}: ${msg}`);
  }
  return result;
}
