// Composio Instagram toolkit — fallback when official Graph (instagram-mcp) fails.
// Same tool slugs the app used before the Graph port.

import { getActiveConnectedAccountId, getComposio, isComposioConfigured } from "@/lib/composio/client";

const USER_ID = "admin";

function pickId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, any>;
  return obj?.data?.id || obj?.data?.data?.id || obj?.id || obj?.creation_id || obj?.data?.creation_id || null;
}

function pickStatus(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const obj = value as Record<string, any>;
  return String(obj?.data?.status_code || obj?.data?.status || obj?.data?.data?.status_code || obj?.status_code || obj?.status || "").toUpperCase();
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
  if (!isComposioConfigured()) throw new Error("Composio is not configured (Instagram fallback unavailable)");
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

async function waitUntilFinished(creationId: string) {
  const deadline = Date.now() + 90_000;
  let last = "";
  while (Date.now() < deadline) {
    const statusResult = await executeInstagramComposioTool("INSTAGRAM_GET_POST_STATUS", { creation_id: creationId });
    last = pickStatus(statusResult);
    if (last === "FINISHED" || last === "PUBLISHED" || last === "READY" || last === "SUCCESS") return last;
    if (last === "ERROR" || last === "EXPIRED" || last === "FAILED") {
      throw new Error(`Composio Instagram container ${creationId} failed with status ${last}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`Composio Instagram container ${creationId} was not ready in time (last status: ${last || "unknown"})`);
}

export async function composioPublishInstagram(input: {
  mediaUrl: string;
  mediaType?: string | null;
  caption?: string;
  postType?: "feed" | "story";
}) {
  const caption = String(input.caption || "").trim().slice(0, 2200);
  const info = await executeInstagramComposioTool("INSTAGRAM_GET_USER_INFO", {});
  const igUserId = pickId(info);
  if (!igUserId) throw new Error("Composio could not resolve the connected Instagram Business/Creator account id. Reconnect Instagram in Integrations.");

  const isVideo = String(input.mediaType || "").startsWith("video/");
  const isStory = input.postType === "story";
  const containerArgs: Record<string, unknown> = {
    ig_user_id: igUserId,
    caption,
    content_type: isStory ? (isVideo ? "video" : "photo") : isVideo ? "reel" : "photo"
  };
  if (isVideo) {
    containerArgs.video_url = input.mediaUrl;
    containerArgs.media_type = isStory ? "STORIES" : "REELS";
  } else {
    containerArgs.image_url = input.mediaUrl;
    if (isStory) containerArgs.media_type = "STORIES";
  }

  const created = await executeInstagramComposioTool("INSTAGRAM_CREATE_MEDIA_CONTAINER", containerArgs);
  const creationId = pickId(created);
  if (!creationId) throw new Error(`Composio media container had no creation id: ${JSON.stringify(created).slice(0, 400)}`);
  await waitUntilFinished(creationId);
  const published = await executeInstagramComposioTool("INSTAGRAM_CREATE_POST", { ig_user_id: igUserId, creation_id: creationId });
  return { creationId, mediaId: pickId(published), result: published };
}

export async function composioListMedia(limit = 20) {
  return executeInstagramComposioTool("INSTAGRAM_GET_USER_MEDIA", { limit });
}

export async function composioGetComments(mediaId: string) {
  return executeInstagramComposioTool("INSTAGRAM_GET_COMMENTS", { media_id: mediaId, ig_media_id: mediaId });
}

export async function composioReplyComment(commentId: string, message: string) {
  try {
    return await executeInstagramComposioTool("INSTAGRAM_REPLY_TO_COMMENT", { comment_id: commentId, message });
  } catch {
    return executeInstagramComposioTool("INSTAGRAM_POST_COMMENT", { comment_id: commentId, message, text: message });
  }
}

export async function composioListConversations() {
  return executeInstagramComposioTool("INSTAGRAM_LIST_CONVERSATIONS", {});
}

export async function composioGetMessages(conversationId: string) {
  return executeInstagramComposioTool("INSTAGRAM_GET_MESSAGES", { conversation_id: conversationId });
}

export async function composioSendMessage(recipientId: string, text: string) {
  return executeInstagramComposioTool("INSTAGRAM_SEND_MESSAGE", { recipient_id: recipientId, text, message: text });
}

export async function composioUserInfo() {
  return executeInstagramComposioTool("INSTAGRAM_GET_USER_INFO", {});
}
