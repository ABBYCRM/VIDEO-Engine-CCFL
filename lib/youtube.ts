import { db } from "@/lib/db";

/** YouTube Shorts publishing. OAuth client credentials and the refresh token
 *  live in the settings table so the single operator can connect once from
 *  the Settings page and never touch tokens again. */

const KEY_CLIENT_ID = "youtube_client_id";
const KEY_CLIENT_SECRET = "youtube_client_secret";
const KEY_REFRESH_TOKEN = "youtube_refresh_token";
const KEY_CHANNEL_TITLE = "youtube_channel_title";
const KEY_OAUTH_STATE = "youtube_oauth_state";

const OAUTH_SCOPE = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

function getSetting(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined)?.value ?? null;
}
function setSetting(key: string, value: string) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(key, value);
}
function deleteSetting(key: string) {
  db.prepare("DELETE FROM settings WHERE key=?").run(key);
}

export function getYouTubeClient(): { clientId: string; clientSecret: string } | null {
  const clientId = getSetting(KEY_CLIENT_ID) || process.env.YOUTUBE_CLIENT_ID || "";
  const clientSecret = getSetting(KEY_CLIENT_SECRET) || process.env.YOUTUBE_CLIENT_SECRET || "";
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function setYouTubeClient(clientId: string, clientSecret: string) {
  setSetting(KEY_CLIENT_ID, clientId.trim());
  setSetting(KEY_CLIENT_SECRET, clientSecret.trim());
}

export function isYouTubeConnected(): boolean {
  return Boolean(getYouTubeClient() && getSetting(KEY_REFRESH_TOKEN));
}

export function youTubeStatus() {
  return {
    configured: Boolean(getYouTubeClient()),
    connected: isYouTubeConnected(),
    channelTitle: getSetting(KEY_CHANNEL_TITLE)
  };
}

export function disconnectYouTube() {
  deleteSetting(KEY_REFRESH_TOKEN);
  deleteSetting(KEY_CHANNEL_TITLE);
}

export function youTubeRedirectUri(): string {
  const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("PUBLIC_BASE_URL is required for the YouTube OAuth callback");
  return `${base}/api/oauth/youtube/callback`;
}

export function buildYouTubeAuthUrl(): string {
  const client = getYouTubeClient();
  if (!client) throw new Error("Save the YouTube OAuth client ID and secret first");
  const state = crypto.randomUUID();
  setSetting(KEY_OAUTH_STATE, state);
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: youTubeRedirectUri(),
    response_type: "code",
    scope: OAUTH_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function handleYouTubeCallback(code: string, state: string): Promise<{ channelTitle: string | null }> {
  const expected = getSetting(KEY_OAUTH_STATE);
  deleteSetting(KEY_OAUTH_STATE);
  if (!expected || state !== expected) throw new Error("OAuth state mismatch — restart the connection from Settings");
  const client = getYouTubeClient();
  if (!client) throw new Error("YouTube OAuth client is not configured");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: youTubeRedirectUri(),
      grant_type: "authorization_code"
    })
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Google token exchange failed (HTTP ${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  const refreshToken = typeof data.refresh_token === "string" ? data.refresh_token : null;
  if (!refreshToken) throw new Error("Google did not return a refresh token — remove the app's access at myaccount.google.com/permissions and reconnect");
  setSetting(KEY_REFRESH_TOKEN, refreshToken);
  let channelTitle: string | null = null;
  try {
    const accessToken = typeof data.access_token === "string" ? data.access_token : await getAccessToken();
    const ch = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const chData = (await ch.json().catch(() => ({}))) as { items?: { snippet?: { title?: string } }[] };
    channelTitle = chData.items?.[0]?.snippet?.title || null;
    if (channelTitle) setSetting(KEY_CHANNEL_TITLE, channelTitle);
  } catch {}
  return { channelTitle };
}

async function getAccessToken(): Promise<string> {
  const client = getYouTubeClient();
  const refreshToken = getSetting(KEY_REFRESH_TOKEN);
  if (!client || !refreshToken) throw new Error("YouTube is not connected");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      grant_type: "refresh_token"
    })
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (String((data as { error?: string }).error) === "invalid_grant") disconnectYouTube();
    throw new Error(`YouTube token refresh failed (HTTP ${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  const token = typeof data.access_token === "string" ? data.access_token : null;
  if (!token) throw new Error("YouTube token refresh returned no access token");
  return token;
}

function shortsTitle(caption: string): string {
  const firstLine = caption.split("\n").map((l) => l.trim()).find((l) => l.length > 0) || "Case Closed FL";
  const clean = firstLine.replace(/[<>]/g, "").replace(/#\S+/g, "").replace(/\s+/g, " ").trim();
  const base = clean.length > 80 ? `${clean.slice(0, 77).trimEnd()}…` : clean;
  return `${base} #Shorts`.slice(0, 100);
}

/** Resumable upload. Vertical video under 3 minutes is automatically surfaced as a Short. */
export async function uploadYouTubeShort(input: { bytes: Buffer; mimeType?: string; caption: string }): Promise<string> {
  const accessToken = await getAccessToken();
  const description = `${input.caption.replace(/[<>]/g, "").trim()}\n\n#Shorts`.slice(0, 4900);
  const mimeType = input.mimeType || "video/mp4";
  const body = new Uint8Array(input.bytes);
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": mimeType,
      "x-upload-content-length": String(body.byteLength)
    },
    body: JSON.stringify({
      snippet: { title: shortsTitle(input.caption), description, categoryId: "22" },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false }
    })
  });
  if (!init.ok) {
    const text = await init.text().catch(() => "");
    throw new Error(`YouTube upload init failed (HTTP ${init.status}): ${text.slice(0, 300)}`);
  }
  const location = init.headers.get("location");
  if (!location) throw new Error("YouTube upload init returned no session URL");
  const put = await fetch(location, {
    method: "PUT",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": mimeType, "content-length": String(body.byteLength) },
    body
  });
  const data = (await put.json().catch(() => ({}))) as { id?: string };
  if (!put.ok) throw new Error(`YouTube upload failed (HTTP ${put.status}): ${JSON.stringify(data).slice(0, 300)}`);
  if (!data.id) throw new Error("YouTube upload completed without a video id");
  return data.id;
}
