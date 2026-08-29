import { db } from "@/lib/db";
import { publicLibraryAssetUrl, publicMediaUrl } from "@/lib/publish-media";
import {
  createMediaContainer,
  isInstagramConfigured,
  publishContainer,
  waitContainerReady
} from "@/lib/instagram-graph";
import { composioPublishInstagram, isComposioInstagramConnected } from "@/lib/instagram-composio";

function absoluteMediaUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("PUBLIC_BASE_URL is required for social publishing");
  return `${base}${url.startsWith("/") ? url : `/${url}`}`;
}

function publishingUrl(url: string) {
  const match = /^\/api\/library\/assets\/([^/]+)\/file(?:\?.*)?$/.exec(url);
  return match ? publicLibraryAssetUrl(decodeURIComponent(match[1])) : absoluteMediaUrl(url);
}

export type InstagramPublishResult = {
  creationId: string;
  mediaId: string | null;
  result: unknown;
  via: "instagram-mcp" | "composio";
  fallbackNote?: string;
};

async function publishViaGraph(input: {
  mediaUrl: string;
  mediaType?: string | null;
  caption?: string;
  postType?: "feed" | "story";
}): Promise<Omit<InstagramPublishResult, "via" | "fallbackNote">> {
  const caption = String(input.caption || "").trim().slice(0, 2200);
  const isVideo = String(input.mediaType || "").startsWith("video/");
  const isStory = input.postType === "story";
  const fields: Record<string, unknown> = {};

  if (isStory) {
    fields.media_type = "STORIES";
    if (isVideo) fields.video_url = input.mediaUrl;
    else fields.image_url = input.mediaUrl;
  } else if (isVideo) {
    fields.media_type = "REELS";
    fields.video_url = input.mediaUrl;
    if (caption) fields.caption = caption;
    fields.share_to_feed = true;
  } else {
    fields.image_url = input.mediaUrl;
    if (caption) fields.caption = caption;
  }

  const creationId = await createMediaContainer(fields);
  if (isVideo) await waitContainerReady(creationId);
  const published = await publishContainer(creationId);
  return { creationId, mediaId: published.mediaId, result: published.result };
}

function resolveMedia(input: {
  jobId?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
}) {
  let mediaUrl = input.mediaUrl ? publishingUrl(input.mediaUrl) : null;
  let mediaType = input.mediaType || null;
  if (input.jobId) {
    const job = db.prepare("SELECT id,status FROM video_jobs WHERE id=?").get(input.jobId) as { id: string; status: string } | undefined;
    if (!job || job.status !== "succeeded") throw new Error("Video must finish before publishing");
    mediaUrl = publicMediaUrl(input.jobId);
    mediaType = "video/mp4";
  }
  if (!mediaUrl) throw new Error("A generated media asset is required before publishing");
  if (!/^https:\/\//i.test(mediaUrl)) throw new Error("Instagram requires a public https media URL");
  return { mediaUrl, mediaType };
}

export async function publishInstagram(input: {
  jobId?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  caption?: string;
  postType?: "feed" | "story";
}): Promise<InstagramPublishResult> {
  const { mediaUrl, mediaType } = resolveMedia(input);
  const payload = { mediaUrl, mediaType, caption: input.caption, postType: input.postType };
  const graphReady = isInstagramConfigured();
  const composioReady = isComposioInstagramConnected();

  // Operator directive 2026-08-29: Composio is the primary Instagram MCP.
  // Try Composio first. Only fall back to official Graph (instagram-mcp) if
  // Composio is not connected or the publish errors.
  if (composioReady) {
    try {
      const result = await composioPublishInstagram(payload);
      return { ...result, via: "composio" };
    } catch (composioErr) {
      const cMsg = composioErr instanceof Error ? composioErr.message : String(composioErr);
      if (!graphReady) throw composioErr;
      try {
        const result = await publishViaGraph(payload);
        return {
          ...result,
          via: "instagram-mcp",
          fallbackNote: `Composio Instagram failed (${cMsg}). Used official Graph (instagram-mcp).`
        };
      } catch (mcpErr) {
        const mcpMsg = mcpErr instanceof Error ? mcpErr.message : String(mcpErr);
        throw new Error(`Instagram publish failed on both paths. Composio: ${cMsg}. Graph (instagram-mcp): ${mcpMsg}`);
      }
    }
  }

  if (graphReady) {
    const result = await publishViaGraph(payload);
    return { ...result, via: "instagram-mcp", fallbackNote: "Composio Instagram is not connected. Used official Graph (instagram-mcp)." };
  }

  throw new Error("Instagram is not configured. Connect Composio Instagram, or save Graph credentials in Settings.");
}
