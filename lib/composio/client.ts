// Composio SDK wrapper. The v3 SDK lives at @composio/core (verified at
// runtime against the installed package). We keep this layer thin so call
// sites get:
//   - a single Composio client constructed from the encrypted key
//   - type-narrowed errors so the API routes can return meaningful messages
//   - never throws on init (returns null if no key is configured)

import { isConsumerKey, listConsumerTools, callConsumerTool } from "./consumer";
import { Composio } from "@composio/core";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

export const COMPOSIO_SETTING_KEY = "composio_api_key";
export const COMPOSIO_AUTH_CONFIG_KEY_PREFIX = "composio_auth_config_id_";

// All Composio SDK network calls go through `withTimeout` so a slow or
// stuck upstream cannot stall an API route until the platform gateway
// 504s. The DO App Platform HTTP gateway returns 504 after a fixed
// timeout (~30s on healthcheck routes, longer on data routes). Without
// this race the `GET /api/integrations/composio` handler — which the
// Integrations page polls on every load — would hang for the full
// duration and surface as a 504 to the operator even though Composio
// eventually responds. Default 12s gives us three retries in a 30s
// budget if the operator needs to wait.
const DEFAULT_TIMEOUT_MS = 12_000;

export class ComposioTimeoutError extends Error {
  constructor(ms: number) { super(`Composio call timed out after ${ms}ms`); this.name = "ComposioTimeoutError"; }
}

export async function withTimeout<T>(p: Promise<T>, ms = DEFAULT_TIMEOUT_MS, label = "composio"): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ComposioTimeoutError(ms)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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

export function isComposioConsumer(): boolean {
  return isComposioConfigured() && isConsumerKey(getComposioApiKey());
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
  if (isConsumerKey(key)) throw new ComposioAuthError("This consumer key uses Composio Connect. Manage app connections at https://dashboard.composio.dev or through Claw’s Composio tools.");
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
  if (isComposioConsumer()) {
    const tools = await listConsumerTools(getComposioApiKey());
    return { mirrored: 0, accounts: [], mode: "consumer" as const, tools: tools.length };
  }
  const USER_ID = "admin";
  const client: any = getComposio();
  const listed: any = await withTimeout(client.connectedAccounts.list(), DEFAULT_TIMEOUT_MS, "connectedAccounts.list");
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

// ---------------------------------------------------------------------------
// Composio app catalog + operator-chosen ("custom") toolkits.
//
// The fixed COMPOSIO_TOOLKITS list above is the curated set the old build
// shipped. The operator now wants to browse Composio's *entire* catalog,
// search it, add any app to their workspace, and connect it — all from the
// Settings UI. These helpers back that flow:
//   - getComposioCatalog()  : fetch + cache the full app catalog from Composio
//   - searchComposioCatalog(): case-insensitive filter over the catalog
//   - {list,add,remove}CustomToolkits(): persist the operator's chosen apps
//   - authorizeToolkit()    : start an OAuth connection for ANY slug, creating
//                             a Composio-managed auth config on the fly when
//                             the operator hasn't pinned one.
// ---------------------------------------------------------------------------

const COMPOSIO_CUSTOM_TOOLKITS_KEY = "composio_custom_toolkits";

export type CatalogToolkit = {
  slug: string;
  name: string;
  logo: string | null;
  description: string | null;
  categories: string[];
  toolsCount: number | null;
};

export type CustomToolkit = { slug: string; label: string; logo: string | null };

let _catalogCache: { at: number; items: CatalogToolkit[] } | null = null;
const CATALOG_TTL_MS = 10 * 60 * 1000;

function normalizeCatalogItem(it: any): CatalogToolkit | null {
  const slug = String(it?.slug ?? it?.name ?? "").trim().toLowerCase();
  if (!slug) return null;
  const meta = it?.meta ?? {};
  const cats = Array.isArray(meta?.categories)
    ? meta.categories.map((c: any) => String(c?.name ?? c?.slug ?? c)).filter(Boolean)
    : [];
  return {
    slug,
    name: String(it?.name ?? slug),
    logo: meta?.logo ? String(meta.logo) : (it?.logo ? String(it.logo) : null),
    description: meta?.description ? String(meta.description) : null,
    categories: cats,
    toolsCount: typeof meta?.toolsCount === "number" ? meta.toolsCount : null
  };
}

/** Fetch the full Composio app catalog (cached in-memory for 10 min). */
export async function getComposioCatalog(force = false): Promise<CatalogToolkit[]> {
  if (!force && _catalogCache && Date.now() - _catalogCache.at < CATALOG_TTL_MS) {
    return _catalogCache.items;
  }
  const client: any = getComposio();
  // The v3 SDK's toolkits.get({}) returns a (possibly paginated) list. We ask
  // for a generous page sorted by usage; the catalog is a few hundred apps.
  const res: any = await withTimeout(client.toolkits.get({ sortBy: "usage", limit: 500 }), DEFAULT_TIMEOUT_MS, "toolkits.get");
  const rawItems: any[] = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
  const items = rawItems.map(normalizeCatalogItem).filter((x: CatalogToolkit | null): x is CatalogToolkit => Boolean(x));
  // De-dupe by slug, keep first (highest usage) occurrence.
  const seen = new Set<string>();
  const deduped = items.filter((i) => (seen.has(i.slug) ? false : (seen.add(i.slug), true)));
  _catalogCache = { at: Date.now(), items: deduped };
  return deduped;
}

/** Case-insensitive search over the cached catalog by name / slug / category. */
export async function searchComposioCatalog(query: string, limit = 40): Promise<CatalogToolkit[]> {
  const all = await getComposioCatalog();
  const q = query.trim().toLowerCase();
  if (!q) return all.slice(0, limit);
  const scored = all
    .map((t) => {
      const name = t.name.toLowerCase();
      const slug = t.slug.toLowerCase();
      let score = -1;
      if (slug === q || name === q) score = 100;
      else if (name.startsWith(q) || slug.startsWith(q)) score = 80;
      else if (name.includes(q) || slug.includes(q)) score = 60;
      else if (t.categories.some((c) => c.toLowerCase().includes(q))) score = 40;
      return { t, score };
    })
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.t);
}

export function listCustomToolkits(): CustomToolkit[] {
  const raw = getRaw(COMPOSIO_CUSTOM_TOOLKITS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p): CustomToolkit | null => {
        const slug = String(p?.slug ?? "").trim().toLowerCase();
        if (!slug) return null;
        return { slug, label: String(p?.label ?? slug), logo: p?.logo ? String(p.logo) : null };
      })
      .filter((x: CustomToolkit | null): x is CustomToolkit => Boolean(x));
  } catch {
    return [];
  }
}

export function addCustomToolkit(slug: string, label?: string, logo?: string | null) {
  const clean = slug.trim().toLowerCase();
  if (!clean) throw new Error("toolkit slug is required");
  const list = listCustomToolkits();
  if (list.some((t) => t.slug === clean)) return list; // already present
  list.push({ slug: clean, label: label?.trim() || clean, logo: logo ?? null });
  setRaw(COMPOSIO_CUSTOM_TOOLKITS_KEY, JSON.stringify(list));
  return list;
}

export function removeCustomToolkit(slug: string) {
  const clean = slug.trim().toLowerCase();
  const list = listCustomToolkits().filter((t) => t.slug !== clean);
  setRaw(COMPOSIO_CUSTOM_TOOLKITS_KEY, JSON.stringify(list));
  return list;
}

/**
 * Start an OAuth connection for any toolkit slug. When the operator has
 * pinned an auth config id (Settings → advanced), we use it; otherwise we
 * let Composio create/attach a managed auth config on the fly via
 * `toolkits.authorize`. Returns the provider consent URL to open.
 */
export async function authorizeToolkit(slug: string, userId = "admin"): Promise<{ redirectUrl: string; connectionId: string | null }> {
  const clean = slug.trim().toLowerCase();
  if (!clean) throw new Error("toolkit slug is required");
  const client: any = getComposio();
  const savedAuthConfigId = getAuthConfigId(clean) || undefined;
  const conn: any = await withTimeout(client.toolkits.authorize(userId, clean, savedAuthConfigId), DEFAULT_TIMEOUT_MS, "toolkits.authorize");
  const redirectUrl: string | undefined = conn?.redirectUrl ?? conn?.redirect_url;
  if (!redirectUrl) throw new Error(`Composio did not return a consent URL for "${clean}". It may need an auth config id set first.`);
  return { redirectUrl, connectionId: conn?.id ?? null };
}

/** Generic Composio tool execution against one toolkit's active connected
 *  account, shared by every per-network adapter (x-composio.ts,
 *  linkedin-composio.ts, reddit-composio.ts, instagram-composio.ts). */
export async function executeComposioTool(toolkit: string, slug: string, args: Record<string, unknown>, userId = "admin") {
  if (!isComposioConfigured()) throw new Error(`Composio is not configured (${toolkit} unavailable)`);
  if (isComposioConsumer()) {
    const result = await callConsumerTool(getComposioApiKey(), slug, args);
    if (result.isError) throw new Error("Composio tool failed: " + JSON.stringify(result));
    return result;
  }
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

// Claw-facing thin wrappers (added 2026-08-30 "Claw only" repo strip).
// These are the two functions Claw's tools.ts uses; the per-network
// adapters (reddit-composio.ts, instagram-composio.ts, x-composio.ts,
// linkedin-composio.ts) are stripped with the rest of the pre-Claw
// build, so the granular "in and out" Composio passthrough that the
// operator asked for is the only Composio surface left.

export type ComposioHealth = {
  configured: boolean;
  live: boolean;
  toolkits: Array<{ id: string; label: string; status: string; lastSyncAt: string | null }>;
  note?: string;
  mode?: "consumer";
  tools?: Array<{ name: string; description?: string }>;
};

export async function composioHealth(): Promise<ComposioHealth> {
  const configured = isComposioConfigured();
  if (!configured) {
    return {
      configured: false,
      live: false,
      toolkits: [],
      note: "Composio is not configured. Set COMPOSIO_API_KEY in the app env, or save it under the composio_api_key setting."
    };
  }
  if (isComposioConsumer()) {
    try {
      const tools = await listConsumerTools(getComposioApiKey());
      return { configured: true, live: true, mode: "consumer", toolkits: [], tools: tools.map(t => ({ name: t.name, description: t.description?.slice(0, 160) })), note: "Composio Connect authenticated. Call composio_tool_schema for an exact tool name, then use its inputSchema with composio_action; discover app actions through the search tool. App connections are managed by Connect." };
    } catch (e) {
      return { configured: true, live: false, mode: "consumer", toolkits: [], note: e instanceof Error ? e.message : String(e) };
    }
  }
  // ALWAYS sync before reading. The Integrations page calls sync on every load
  // and is served by the primary worker; Claw's app_status and composio_health
  // tools run on any worker, and without a sync their SQLite cache may be stale
  // (showing 0 toolkits even when Instagram and YouTube are connected). A sync
  // is a fast API call; the 12s timeout on connectedAccounts.list keeps it bounded.
  let syncNote: string | undefined;
  try {
    await syncConnectedAccounts();
  } catch (e) {
    syncNote = e instanceof ComposioTimeoutError
      ? `Live sync timed out (${e.message}); showing last known snapshot.`
      : (e instanceof Error ? e.message : String(e));
  }
  const rows = db.prepare(
    `SELECT toolkit, status, last_sync_at FROM connected_accounts WHERE UPPER(status)='ACTIVE' ORDER BY toolkit ASC`
  ).all() as Array<{ toolkit: string; status: string; last_sync_at: string | null }>;
  return {
    configured: true,
    live: !syncNote,
    toolkits: rows.map((r) => {
      const meta = getToolkitMeta(r.toolkit);
      return { id: r.toolkit, label: meta.label, status: r.status, lastSyncAt: r.last_sync_at };
    }),
    ...(syncNote ? { note: syncNote } : {})
  };
}

export type ComposioActionInput = {
  slug: string;
  args: Record<string, unknown>;
  toolkit?: string;
  userId?: string;
};

export type ComposioActionResult =
  | { ok: true; slug: string; toolkit: string | null; data: unknown }
  | { ok: false; slug: string; toolkit: string | null; error: string; code?: string };

/**
 * Call any Composio tool by exact slug. The "in" half is the args dict
 * the operator (or the LLM on the operator's behalf) provides; the
 * "out" half is the raw upstream payload, returned as-is so the
 * operator can see exactly what the upstream returned. Errors are
 * surfaced as { ok:false, error } rather than thrown, so the chat
 * sees the upstream's own message instead of a generic "request
 * failed".
 *
 * If `toolkit` is provided, the call is routed to the active connected
 * account for that toolkit. If `toolkit` is omitted, the slug is
 * matched to a toolkit by Composio's catalog (the underlying SDK
 * handles this); pass it explicitly when ambiguous.
 */
export async function composioAction(input: ComposioActionInput): Promise<ComposioActionResult> {
  const slug = String(input.slug || "").trim();
  if (!slug) return { ok: false, slug: "", toolkit: input.toolkit || null, error: "slug is required" };
  const toolkit = input.toolkit?.trim() || undefined;
  const userId = input.userId?.trim() || "admin";
  if (!isComposioConfigured()) {
    return { ok: false, slug, toolkit: toolkit || null, error: "Composio is not configured (COMPOSIO_API_KEY missing or composio_api_key setting empty)" };
  }
  try {
    if (isComposioConsumer()) {
      const data = await callConsumerTool(getComposioApiKey(), slug, input.args || {});
      if (data.isError) return { ok: false, slug, toolkit: toolkit || null, error: JSON.stringify(data) };
      return { ok: true, slug, toolkit: toolkit || null, data };
    }
    const composio: any = getComposio();
    // Resolve the connected account (if a toolkit was named) before
    // we send the call, so the upstream's "no connected account" error
    // gets surfaced with a useful hint instead of a generic 4xx.
    let connectedAccountId: string | undefined;
    if (toolkit) {
      connectedAccountId = getActiveConnectedAccountId(toolkit, userId) || undefined;
      if (!connectedAccountId) {
        // Surface the list of actually connected toolkits so the operator
        // can self-diagnose: "I said instagram but it returned 'your_toolkit'".
        const rows = db.prepare(
          `SELECT toolkit FROM connected_accounts WHERE UPPER(status)='ACTIVE' ORDER BY toolkit ASC`
        ).all() as Array<{ toolkit: string }>;
        const connected = rows.map(r => r.toolkit);
        const hint = connected.length
          ? ` Connected toolkits: ${connected.join(", ")}.`
          : ` No toolkits are connected — go to /integrations to connect one first.`;
        return { ok: false, slug, toolkit, error: `${toolkit} is not connected.${hint}` };
      }
    }
    const result = await composio.tools.execute(slug, {
      userId,
      connectedAccountId,
      arguments: input.args || {},
      dangerouslySkipVersionCheck: true
    });
    if (result && typeof result === "object" && (result as any).successful === false) {
      const obj = result as Record<string, any>;
      const msg = obj.error || obj.data?.error || obj.message || JSON.stringify(result).slice(0, 400);
      return { ok: false, slug, toolkit: toolkit || null, error: String(msg), code: obj.code || obj.data?.code };
    }
    return { ok: true, slug, toolkit: toolkit || null, data: result };
  } catch (e) {
    return { ok: false, slug, toolkit: toolkit || null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getComposioToolSchema(name: string) {
  if (!isComposioConsumer()) return { error: "Tool schema discovery here is for Composio Connect consumer keys." };
  const tools = await listConsumerTools(getComposioApiKey());
  return tools.find(t => t.name === name) || { error: "Unknown MCP tool name", tools: tools.map(t => t.name) };
}
