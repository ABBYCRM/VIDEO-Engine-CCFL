// Composio Instagram toolkit — PRIMARY Instagram MCP for VIDEO-Engine CCFL
// (operator directive 2026-08-29). Official Graph (instagram-mcp) is fallback only.
//
// Slugs verified against Composio's published Instagram toolkit docs
// (docs.composio.dev/toolkits/instagram, 2026-08-29) after a live failure
// ("Unable to retrieve tool with slug INSTAGRAM_LIST_CONVERSATIONS") showed
// the slugs this file had inherited from an older integration no longer
// match Composio's current catalog. Several were flat-out renamed
// (LIST_CONVERSATIONS -> LIST_ALL_CONVERSATIONS, GET_MESSAGES ->
// LIST_ALL_MESSAGES, SEND_MESSAGE -> SEND_TEXT_MESSAGE, GET_COMMENTS ->
// GET_IG_MEDIA_COMMENTS); others (CREATE_MEDIA_CONTAINER, CREATE_POST,
// GET_POST_STATUS, REPLY_TO_COMMENT, GET_USER_MEDIA) are marked deprecated
// in favor of the ones used below. The publish flow also got simpler:
// INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH now polls container-ready status
// internally (max_wait_seconds/poll_interval_seconds), so the old manual
// waitUntilFinished()/GET_POST_STATUS loop is gone.

import { getActiveConnectedAccountId, getComposio, isComposioConfigured } from "@/lib/composio/client";
import { getComposioMediaInsightsArgs } from "@/lib/instagram-composio-args";

const USER_ID = "admin";

function pickId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, any>;
  return obj?.data?.id || obj?.data?.data?.id || obj?.id || obj?.creation_id || obj?.data?.creation_id || null;
}

function toolError(label: string, result: unknown): never {
  const obj = result && typeof result === "object" ? (result as Record<string, any>) : {};
  const msg = obj.error || obj.data?.error || obj.message || JSON.stringify(result).slice(0, 400);
  throw new Error(`${label}: ${msg}`);
}

export function isComposioInstagramConnected(): boolean {
  return isComposioConfigured() && Boolean(getActiveConnectedAccountId("instagram"));
}

export async function executeInstagramComposioTool(slug: string, args: Record<string, unknown>) {
  if (!isComposioConfigured()) throw new Error("Composio is not configured (Instagram unavailable)");
  const composio: any = getComposio();
  const connectedAccountId = getActiveConnectedAccountId("instagram") || undefined;
  const result = await composio.tools.execute(slug, {
    userId: USER_ID,
    connectedAccountId,
    arguments: args,
    dangerouslySkipVersionCheck: true
  });
  if (result && typeof result === "object" && (result as any).successful === false) {
    toolError(slug, result);
  }
  return result;
}

async function resolveIgUserId(): Promise<string> {
  const info = await executeInstagramComposioTool("INSTAGRAM_GET_USER_INFO", {});
  const igUserId = pickId(info);
  if (!igUserId) throw new Error("Composio could not resolve the connected Instagram Business/Creator account id. Reconnect Instagram in Integrations.");
  return igUserId;
}

export async function composioPublishInstagram(input: {
  mediaUrl: string;
  mediaType?: string | null;
  caption?: string;
  postType?: "feed" | "story";
}) {
  const caption = String(input.caption || "").trim().slice(0, 2200);
  const igUserId = await resolveIgUserId();

  const isVideo = String(input.mediaType || "").startsWith("video/");
  const isStory = input.postType === "story";
  const containerArgs: Record<string, unknown> = { ig_user_id: igUserId, caption };
  if (isVideo) {
    containerArgs.video_url = input.mediaUrl;
    containerArgs.media_type = isStory ? "STORIES" : "REELS";
    if (!isStory) containerArgs.share_to_feed = true;
  } else {
    containerArgs.image_url = input.mediaUrl;
    if (isStory) containerArgs.media_type = "STORIES";
  }

  const created = await executeInstagramComposioTool("INSTAGRAM_POST_IG_USER_MEDIA", containerArgs);
  const creationId = pickId(created);
  if (!creationId) throw new Error(`Composio media container had no creation id: ${JSON.stringify(created).slice(0, 400)}`);
  // Publish polls container-ready status internally — no separate wait step.
  const published = await executeInstagramComposioTool("INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH", { ig_user_id: igUserId, creation_id: creationId, max_wait_seconds: 90 });
  return { creationId, mediaId: pickId(published), result: published };
}

export async function composioListMedia(limit = 20) {
  // Live regression found right after the previous slug fix shipped: unlike
  // the deprecated INSTAGRAM_GET_USER_MEDIA it replaced, this slug does NOT
  // auto-resolve the account and rejects the call with "missing ig_user_id"
  // if it's omitted.
  const igUserId = await resolveIgUserId();
  return executeInstagramComposioTool("INSTAGRAM_GET_IG_USER_MEDIA", { ig_user_id: igUserId, limit });
}

export async function composioGetMediaInsights(mediaId: string) {
  // Unlike Graph's own comma-separated metric query string, Composio's
  // "metric" param is a real array, not a string - verified against
  // Composio's own docs after guessing wrong on other slugs earlier today.
  return executeInstagramComposioTool("INSTAGRAM_GET_IG_MEDIA_INSIGHTS", getComposioMediaInsightsArgs(mediaId));
}

export async function composioGetComments(mediaId: string) {
  return executeInstagramComposioTool("INSTAGRAM_GET_IG_MEDIA_COMMENTS", { ig_media_id: mediaId });
}

export async function composioReplyComment(commentId: string, message: string) {
  return executeInstagramComposioTool("INSTAGRAM_POST_IG_COMMENT_REPLIES", { ig_comment_id: commentId, message: message.slice(0, 300) });
}

export async function composioListConversations() {
  const igUserId = await resolveIgUserId();
  return executeInstagramComposioTool("INSTAGRAM_LIST_ALL_CONVERSATIONS", { ig_user_id: igUserId });
}

export async function composioGetMessages(conversationId: string) {
  return executeInstagramComposioTool("INSTAGRAM_LIST_ALL_MESSAGES", { conversation_id: conversationId });
}

export async function composioSendMessage(recipientId: string, text: string) {
  return executeInstagramComposioTool("INSTAGRAM_SEND_TEXT_MESSAGE", { recipient_id: recipientId, text });
}

export async function composioUserInfo() {
  return executeInstagramComposioTool("INSTAGRAM_GET_USER_INFO", {});
}
