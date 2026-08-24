import { getActiveConnectedAccountId, getComposio } from "@/lib/composio/client";
import { db } from "@/lib/db";
import { publicLibraryAssetUrl, publicMediaUrl } from "@/lib/publish-media";

const USER_ID = "admin";

function pickId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, any>;
  return (
    obj?.data?.id ||
    obj?.data?.data?.id ||
    obj?.id ||
    obj?.creation_id ||
    obj?.data?.creation_id ||
    null
  );
}

function pickStatus(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const obj = value as Record<string, any>;
  return String(
    obj?.data?.status_code ||
    obj?.data?.status ||
    obj?.data?.data?.status_code ||
    obj?.status_code ||
    obj?.status ||
    ""
  ).toUpperCase();
}

function toolError(label: string, result: unknown): never {
  const obj = result && typeof result === "object" ? (result as Record<string, any>) : {};
  const msg = obj.error || obj.data?.error || obj.message || JSON.stringify(result).slice(0, 400);
  throw new Error(`${label}: ${msg}`);
}

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

async function executeTool(slug: string, args: Record<string, unknown>) {
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
    const statusResult = await executeTool("INSTAGRAM_GET_POST_STATUS", { creation_id: creationId });
    last = pickStatus(statusResult);
    if (last === "FINISHED" || last === "PUBLISHED" || last === "READY" || last === "SUCCESS") return last;
    if (last === "ERROR" || last === "EXPIRED" || last === "FAILED") {
      throw new Error(`Instagram container ${creationId} failed with status ${last}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`Instagram container ${creationId} was not ready in time (last status: ${last || "unknown"})`);
}

export async function publishInstagram(input: {
  jobId?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  caption?: string;
}) {
  const caption = String(input.caption || "").trim().slice(0, 2200);
  let mediaUrl = input.mediaUrl ? publishingUrl(input.mediaUrl) : null;
  let mediaType = input.mediaType || null;
  if (input.jobId) {
    const job = db.prepare("SELECT id,status FROM video_jobs WHERE id=?").get(input.jobId) as { id: string; status: string } | undefined;
    if (!job || job.status !== "succeeded") throw new Error("Video must finish before publishing");
    mediaUrl = publicMediaUrl(input.jobId);
    mediaType = "video/mp4";
  }
  if (!mediaUrl) throw new Error("A generated media asset is required before publishing");

  const info = await executeTool("INSTAGRAM_GET_USER_INFO", {});
  const igUserId = pickId(info);
  if (!igUserId) throw new Error("Could not resolve the connected Instagram Business/Creator account id. Reconnect Instagram in Integrations.");

  const isVideo = String(mediaType || "").startsWith("video/");
  const containerArgs: Record<string, unknown> = {
    ig_user_id: igUserId,
    caption,
    content_type: isVideo ? "reel" : "photo"
  };
  if (isVideo) {
    containerArgs.video_url = mediaUrl;
    containerArgs.media_type = "REELS";
  } else {
    containerArgs.image_url = mediaUrl;
  }

  const created = await executeTool("INSTAGRAM_CREATE_MEDIA_CONTAINER", containerArgs);
  const creationId = pickId(created);
  if (!creationId) throw new Error(`Instagram media container was created without a creation id: ${JSON.stringify(created).slice(0, 400)}`);

  await waitUntilFinished(creationId);

  const published = await executeTool("INSTAGRAM_CREATE_POST", {
    ig_user_id: igUserId,
    creation_id: creationId
  });
  return { creationId, mediaId: pickId(published), result: published };
}
