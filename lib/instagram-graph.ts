// Official Instagram Graph API client, ported from
// https://github.com/adelaidasofia/instagram-mcp (MIT).
// VIDEO-Engine publishes Reels/Stories/feed stills through this path — not Composio.
//
// Fidelity notes vs the Python MCP:
//   - Same hosts (graph.facebook.com / graph.instagram.com), version default v21.0
//   - Same env names: INSTAGRAM_MCP_ACCESS_TOKEN + INSTAGRAM_MCP_IG_USER_ID
//   - access_token + appsecret_proof always go on the query string
//   - POST fields go in the form body; two-step container → poll FINISHED → media_publish
// Tokens are AES-256-GCM in the settings table (or env fallback). Never returned to the client.

import crypto from "node:crypto";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

export const GRAPH_VERSION = process.env.INSTAGRAM_MCP_GRAPH_VERSION || "v21.0";
const ALLOWED_HOSTS = new Set(["graph.facebook.com", "graph.instagram.com"]);
const TOKEN_KEY = "instagram_access_token";
const USER_ID_KEY = "instagram_ig_user_id";
const SECRET_KEY = "instagram_app_secret";
const HOST_KEY = "instagram_base_host";
const DEFAULT_TIMEOUT_MS = Number(process.env.INSTAGRAM_MCP_TIMEOUT || 30) * 1000;

function getRaw(key: string) {
  return (db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined)?.value ?? null;
}
function setRaw(key: string, value: string) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(key, value);
}
function delRaw(key: string) {
  db.prepare("DELETE FROM settings WHERE key=?").run(key);
}

export function sanitizeInstagramError(message: string) {
  return String(message || "")
    .replace(/([?&](?:access_token|appsecret_proof)=)[^&\s]+/gi, "$1***")
    .replace(/EAA[A-Za-z0-9]+/g, "EAA…")
    .replace(/IGQV[A-Za-z0-9]+/g, "IGQV…")
    .replace(/Bearer\s+\S+/gi, "Bearer ***");
}

export class InstagramGraphError extends Error {
  errorClass: string;
  constructor(message: string, errorClass = "upstream_error") {
    super(sanitizeInstagramError(message));
    this.name = "InstagramGraphError";
    this.errorClass = errorClass;
  }
}

export function getInstagramAccessToken(): string {
  const encrypted = getRaw(TOKEN_KEY);
  if (encrypted) return decryptSecret(encrypted);
  if (process.env.INSTAGRAM_MCP_ACCESS_TOKEN) return process.env.INSTAGRAM_MCP_ACCESS_TOKEN;
  throw new InstagramGraphError("Instagram Graph access token is not configured. Save it in Settings.", "auth");
}

export function getInstagramUserId(): string {
  const stored = getRaw(USER_ID_KEY);
  if (stored) return stored;
  if (process.env.INSTAGRAM_MCP_IG_USER_ID) return process.env.INSTAGRAM_MCP_IG_USER_ID;
  throw new InstagramGraphError("Instagram Business Account id is not configured. Save it in Settings.", "auth");
}

export function getInstagramAppSecret(): string | null {
  const encrypted = getRaw(SECRET_KEY);
  if (encrypted) return decryptSecret(encrypted);
  return process.env.INSTAGRAM_MCP_APP_SECRET || null;
}

export function getInstagramBaseHost(): string {
  const stored = getRaw(HOST_KEY) || process.env.INSTAGRAM_MCP_BASE_HOST || "graph.facebook.com";
  return ALLOWED_HOSTS.has(stored) ? stored : "graph.facebook.com";
}

export function isInstagramConfigured(): boolean {
  try {
    return Boolean(getInstagramAccessToken() && getInstagramUserId());
  } catch {
    return false;
  }
}

export function saveInstagramCredentials(input: { accessToken?: string; igUserId?: string; appSecret?: string; baseHost?: string }) {
  if (!input.accessToken && !input.igUserId && !input.appSecret && !input.baseHost) {
    throw new InstagramGraphError("Provide an access token, Business Account id, or app secret to save.", "validation");
  }
  if (input.accessToken) setRaw(TOKEN_KEY, encryptSecret(input.accessToken.trim()));
  if (input.igUserId) {
    const id = input.igUserId.trim();
    if (!/^\d+$/.test(id)) throw new InstagramGraphError("ig_user_id must be the numeric Instagram Business Account id", "validation");
    setRaw(USER_ID_KEY, id);
  }
  if (input.appSecret) setRaw(SECRET_KEY, encryptSecret(input.appSecret.trim()));
  if (input.baseHost) {
    if (!ALLOWED_HOSTS.has(input.baseHost)) throw new InstagramGraphError("base host must be graph.facebook.com or graph.instagram.com", "validation");
    setRaw(HOST_KEY, input.baseHost);
  }
}

export function clearInstagramCredentials() {
  delRaw(TOKEN_KEY);
  delRaw(USER_ID_KEY);
  delRaw(SECRET_KEY);
  delRaw(HOST_KEY);
}

export function isInstagramDmEnabled(): boolean {
  const stored = getRaw("instagram_dm_enabled");
  if (stored === "1" || stored === "true") return true;
  return process.env.INSTAGRAM_MCP_DM_ENABLED === "1" || process.env.INSTAGRAM_MCP_DM_ENABLED === "true";
}

export function setInstagramDmEnabled(on: boolean) {
  setRaw("instagram_dm_enabled", on ? "1" : "0");
}

function appsecretProof(token: string, appSecret: string | null) {
  if (!appSecret) return null;
  return crypto.createHmac("sha256", appSecret).update(token).digest("hex");
}

async function graphRequest(method: "GET" | "POST" | "DELETE", path: string, fields: Record<string, unknown> = {}) {
  const token = getInstagramAccessToken();
  const host = getInstagramBaseHost();
  const url = new URL(`https://${host}/${GRAPH_VERSION}/${String(path).replace(/^\//, "")}`);
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new InstagramGraphError(`refusing egress to non-Meta host ${url.hostname}`, "ssrf_blocked");
  }
  const proof = appsecretProof(token, getInstagramAppSecret());
  url.searchParams.set("access_token", token);
  if (proof) url.searchParams.set("appsecret_proof", proof);

  let body: string | undefined;
  if (method === "GET" || method === "DELETE") {
    for (const [k, v] of Object.entries(fields)) {
      if (v == null || v === "") continue;
      url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
  } else {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(fields)) {
      if (v == null || v === "") continue;
      params.set(k, typeof v === "boolean" ? (v ? "true" : "false") : typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    body = params.toString();
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), Number.isFinite(DEFAULT_TIMEOUT_MS) ? DEFAULT_TIMEOUT_MS : 30_000);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers: body ? { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" } : { Accept: "application/json" },
      body,
      cache: "no-store",
      signal: ac.signal
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new InstagramGraphError("Graph API request timed out after 30s", "timeout");
    throw new InstagramGraphError(e instanceof Error ? e.message : String(e), "network");
  } finally {
    clearTimeout(timer);
  }

  const json = await res.json().catch(() => ({})) as { error?: { message?: string; code?: number; type?: string; error_subcode?: number }; id?: string; status_code?: string };
  if (!res.ok || json.error) {
    const message = json.error?.message || `Graph API HTTP ${res.status}`;
    const code = json.error?.code;
    const type = json.error?.type;
    let errorClass = "upstream_error";
    if (code === 190 || type === "OAuthException") errorClass = "oauth";
    if (code === 4 || code === 17 || code === 32 || code === 613) errorClass = "rate_limited";
    if (code === 10 || code === 200 || code === 803) errorClass = "permission";
    if (code === 100) errorClass = "invalid_param";
    if (res.status === 404) errorClass = "not_found";
    throw new InstagramGraphError(message, errorClass);
  }
  return json as Record<string, any>;
}

/**
 * Business Discovery: look up a PUBLIC Instagram Business/Creator account's
 * profile stats by username, using this app's own connected account as the
 * query anchor. This is the one first-party (non-scraping) discovery path
 * available to the Influencer Agent — no login/token needed for the target
 * account, only for the querying (this app's) account.
 * https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/business-discovery
 */
export async function businessDiscovery(username: string) {
  const clean = username.replace(/^@/, "").trim();
  if (!clean) throw new Error("username is required");
  const igUserId = getInstagramUserId();
  const json = await graphRequest("GET", igUserId, {
    fields: `business_discovery.username(${clean}){username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website}`
  });
  const discovery = json.business_discovery;
  if (!discovery) throw new InstagramGraphError(`No public business/creator account found for @${clean}`, "not_found");
  return discovery as {
    username: string;
    name?: string;
    biography?: string;
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
    profile_picture_url?: string;
    website?: string;
  };
}

export async function instagramHealthcheck() {
  if (!isInstagramConfigured()) {
    return { configured: false, live: false, username: null as string | null, igUserId: null as string | null, error: "not configured", dmEnabled: isInstagramDmEnabled() };
  }
  try {
    const igUserId = getInstagramUserId();
    const me = await graphRequest("GET", igUserId, { fields: "id,username,name,followers_count,media_count" });
    return {
      configured: true,
      live: true,
      username: me.username || null,
      name: me.name || null,
      igUserId,
      followers: me.followers_count ?? null,
      mediaCount: me.media_count ?? null,
      dmEnabled: isInstagramDmEnabled(),
      error: null as string | null
    };
  } catch (e) {
    return {
      configured: true,
      live: false,
      username: null as string | null,
      igUserId: (() => { try { return getInstagramUserId(); } catch { return null; } })(),
      dmEnabled: isInstagramDmEnabled(),
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

export async function createMediaContainer(fields: Record<string, unknown>) {
  const igUserId = getInstagramUserId();
  const created = await graphRequest("POST", `${igUserId}/media`, fields);
  const id = created.id;
  if (!id) throw new InstagramGraphError("Graph create container returned no id", "upstream_error");
  return String(id);
}

export async function waitContainerReady(containerId: string, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    const status = await graphRequest("GET", containerId, { fields: "status_code,status" });
    last = String(status.status_code || "").toUpperCase();
    if (last === "FINISHED") return last;
    if (last === "ERROR" || last === "EXPIRED" || last === "FAILED") {
      throw new InstagramGraphError(`media container ${containerId} processing failed (${last}${status.status ? `: ${status.status}` : ""})`, "upstream_error");
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new InstagramGraphError(`media container ${containerId} not ready after ${timeoutMs}ms (last status: ${last || "unknown"})`, "timeout");
}

export async function publishContainer(containerId: string) {
  const igUserId = getInstagramUserId();
  const published = await graphRequest("POST", `${igUserId}/media_publish`, { creation_id: containerId });
  const mediaId = published.id ? String(published.id) : null;
  return { mediaId, containerId, result: published };
}

export async function listRecentMedia(limit = 50) {
  const igUserId = getInstagramUserId();
  const page = await graphRequest("GET", `${igUserId}/media`, {
    fields: "id,caption,media_type,media_product_type,permalink,timestamp",
    limit: Math.max(1, Math.min(100, limit))
  });
  const items = Array.isArray(page.data) ? page.data : [];
  return items as Array<{ id: string; permalink?: string; media_type?: string }>;
}

export async function getMediaPermalink(mediaId: string) {
  const media = await graphRequest("GET", mediaId, { fields: "id,permalink,media_type,timestamp" });
  return { id: String(media.id || mediaId), permalink: media.permalink ? String(media.permalink) : null };
}

export async function listMedia(limit = 25) {
  const igUserId = getInstagramUserId();
  return graphRequest("GET", `${igUserId}/media`, {
    fields: "id,caption,media_type,media_product_type,permalink,timestamp,comments_count,like_count",
    limit: Math.max(1, Math.min(50, limit))
  });
}

export async function getComments(mediaId: string) {
  return graphRequest("GET", `${mediaId}/comments`, {
    fields: "id,text,timestamp,username,like_count,hidden,replies{id,text,username,timestamp}",
    limit: 50
  });
}

// Media's own fields (listMedia above) never include performance numbers —
// "how many views does each post have" needs a separate call. views
// replaced the deprecated plays/impressions metrics in Graph API v22+
// (2025-04-21); this set matches Composio's own documented default
// (views, reach, saved, shares) plus likes/comments, which are universal
// across media types.
export async function getMediaInsights(mediaId: string) {
  return graphRequest("GET", `${mediaId}/insights`, {
    metric: "views,reach,likes,comments,saved,shares"
  });
}

export async function replyToComment(commentId: string, message: string) {
  const text = String(message || "").trim().slice(0, 2200);
  if (!text) throw new InstagramGraphError("Reply text is required", "validation");
  return graphRequest("POST", `${commentId}/replies`, { message: text });
}

export async function hideComment(commentId: string, hide = true) {
  return graphRequest("POST", commentId, { hide });
}

export async function deleteComment(commentId: string) {
  return graphRequest("DELETE", commentId);
}

/**
 * "Comment INSURANCE and I'll DM you the link" — a private reply to a
 * specific comment. This is Meta's only sanctioned way to send the FIRST
 * message to someone who never DMed the account: POST {ig-user-id}/messages
 * with recipient={comment_id}, one reply per comment ever, within 7 days of
 * the comment. Deliberately NOT gated by isInstagramDmEnabled()/
 * INSTAGRAM_MCP_DM_ENABLED — per Meta's docs this uses
 * instagram_manage_comments (the same permission comment reading/replying
 * already needs here), not instagram_manage_messages. General inbox
 * access (listConversations/getConversationMessages/sendDirectMessage
 * below) is the one that needs the App-Review-gated permission and stays
 * gated.
 */
export async function sendPrivateReplyToComment(commentId: string, message: string) {
  const text = String(message || "").trim().slice(0, 1000);
  if (!text) throw new InstagramGraphError("Reply text is required", "validation");
  if (!commentId) throw new InstagramGraphError("commentId is required", "validation");
  const igUserId = getInstagramUserId();
  return graphRequest("POST", `${igUserId}/messages`, {
    recipient: { comment_id: commentId },
    message: { text }
  });
}

export async function listConversations(limit = 25) {
  if (!isInstagramDmEnabled()) {
    throw new InstagramGraphError(
      "Instagram DMs are gated. After Meta App Review grants instagram_manage_messages, set INSTAGRAM_MCP_DM_ENABLED=1 (or enable DMs in Settings).",
      "permission"
    );
  }
  return graphRequest("GET", "me/conversations", {
    platform: "instagram",
    fields: "id,updated_time,participants",
    limit: Math.max(1, Math.min(50, limit))
  });
}

export async function getConversationMessages(conversationId: string, limit = 40) {
  if (!isInstagramDmEnabled()) {
    throw new InstagramGraphError("Instagram DMs are gated. Enable INSTAGRAM_MCP_DM_ENABLED=1 after App Review.", "permission");
  }
  return graphRequest("GET", `${conversationId}/messages`, {
    fields: "id,created_time,from,to,message",
    limit: Math.max(1, Math.min(50, limit))
  });
}

export async function sendDirectMessage(recipientId: string, text: string) {
  if (!isInstagramDmEnabled()) {
    throw new InstagramGraphError("Instagram DMs are gated. Enable INSTAGRAM_MCP_DM_ENABLED=1 after App Review.", "permission");
  }
  const message = String(text || "").trim().slice(0, 1000);
  if (!message) throw new InstagramGraphError("DM text is required", "validation");
  if (!recipientId) throw new InstagramGraphError("recipient IGSID is required", "validation");
  const igUserId = getInstagramUserId();
  return graphRequest("POST", `${igUserId}/messages`, {
    recipient: { id: recipientId },
    message: { text: message }
  });
}
