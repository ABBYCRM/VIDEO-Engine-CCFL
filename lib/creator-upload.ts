// Shared "take one pre-made video, persist it, schedule it" logic behind
// both /api/creator/upload (multipart form, browser upload) and Claw's
// creator_upload_video tool (a file already attached to the chat via
// lib/claw/store.ts's claw_files). Extracted so both callers write the
// exact same scheduled_posts rows instead of maintaining two copies.

import crypto from "node:crypto";
import { db } from "@/lib/db";
import { computePostHash, findRecentDuplicatePost } from "@/lib/post-dedup";
import { saveUploadedVideo } from "@/lib/upper-videos";

export const CREATOR_UPLOAD_MAX_FILE_BYTES = 250 * 1024 * 1024; // 250MB per file
export const CREATOR_UPLOAD_MAX_FILES = 25;
export const CREATOR_UPLOAD_MAX_TOTAL_BYTES = 1024 * 1024 * 1024; // 1GB per batch

const CONTENT_TYPE_BY_FORMAT: Record<string, string> = {
  reel: "creator-reel",
  story: "creator-story",
  post: "creator-post"
};

export type CreatorUploadFormat = "reel" | "story" | "post";

export function parseCreatorFormats(raw: string | null | undefined): CreatorUploadFormat[] {
  const formats = String(raw || "reel,story,post")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is CreatorUploadFormat => s === "reel" || s === "story" || s === "post");
  return formats;
}

export type CreatorUploadInput = {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
  title?: string | null;
  label?: string;
  formats: CreatorUploadFormat[];
  scheduledAt?: string;
  network?: string;
  autoPost?: boolean;
  caption?: string;
  category?: string;
};

export type CreatorUploadResult = {
  name: string;
  uploadId: string;
  url: string;
  mimeType: string;
  bytes: number;
  title: string;
  scheduledPostIds: string[];
  scheduled: { id: string; contentType: string; network: string; scheduledAt: string; autoPost: boolean; caption: string }[];
};

/**
 * Persist one already-in-memory video and write one scheduled_posts row per
 * requested format. Throws on validation failure (mime, size, no formats) —
 * callers loop over a batch and catch per-file the same way
 * app/api/creator/upload/route.ts always has.
 */
export async function uploadAndScheduleCreatorVideo(input: CreatorUploadInput): Promise<CreatorUploadResult> {
  if (!input.mimeType.startsWith("video/")) throw new Error(`${input.fileName} is not a video`);
  if (input.bytes.length < 1 || input.bytes.length > CREATOR_UPLOAD_MAX_FILE_BYTES) {
    throw new Error(`${input.fileName} must be between 1 byte and ${(CREATOR_UPLOAD_MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)}MB`);
  }
  if (!input.formats.length) throw new Error("Pick at least one format (reel, story, or post)");

  const title = (input.title || input.fileName).slice(0, 180);
  const uploadId = `creator:${crypto.randomUUID()}`;
  const scheduledAt = input.scheduledAt?.trim() || new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const network = (input.network || "instagram").toLowerCase();
  const autoPost = input.autoPost !== false;
  const caption = (input.caption || "").slice(0, 5000);
  const category = (input.category || "ugc").toLowerCase();

  // Fingerprint on the FILE'S OWN BYTES, not the storage URL saveUploadedVideo
  // hands back below -- that url is freshly generated (a new uploadId) even
  // when the exact same file is resubmitted, so hashing it would never catch
  // an accidental double-submit of the same upload.
  const fileHash = crypto.createHash("sha256").update(input.bytes).digest("hex");

  // Check dedup for every requested format BEFORE touching storage: a
  // duplicate submission (same file, same formats, same caption, within the
  // dedup window) must not persist the video bytes again just to then throw
  // the file away when every resulting row turns out to be a dup — this is
  // a bulky upload (up to 250MB), not a cheap text row, so a wasted write
  // here is a real, not just cosmetic, resource leak on every accidental
  // double-submit.
  const existingIds = new Map<CreatorUploadFormat, string>();
  for (const fmt of input.formats) {
    const contentHash = computePostHash({ network, contentType: CONTENT_TYPE_BY_FORMAT[fmt], caption, identity: fileHash });
    const dup = findRecentDuplicatePost(contentHash);
    if (dup) existingIds.set(fmt, dup);
  }

  const allDuplicate = existingIds.size === input.formats.length;
  let saved: { id: string; url: string } | null = null;
  if (!allDuplicate) {
    saved = await saveUploadedVideo({
      bytes: input.bytes,
      title,
      mimeType: input.mimeType,
      label: input.label || "Creator upload",
      id: uploadId
    });
  } else {
    // Every requested format already has a recent duplicate row -- reuse
    // its stored media_url instead of returning an empty one, since no new
    // upload happened.
    const anyDupId = existingIds.values().next().value as string;
    const row = db.prepare("SELECT media_url, source_asset_key FROM scheduled_posts WHERE id=?").get(anyDupId) as { media_url: string | null; source_asset_key: string | null } | undefined;
    saved = { id: row?.source_asset_key || uploadId, url: row?.media_url || "" };
  }

  const ids: string[] = [];
  const inserted: CreatorUploadResult["scheduled"] = [];
  for (const fmt of input.formats) {
    const contentType = CONTENT_TYPE_BY_FORMAT[fmt];
    const dup = existingIds.get(fmt);
    if (dup) {
      ids.push(dup);
      inserted.push({ id: dup, contentType, network, scheduledAt, autoPost, caption });
      continue;
    }
    const contentHash = computePostHash({ network, contentType, caption, identity: fileHash });
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO scheduled_posts(
        id, title, network, scheduled_at, status, auto_post, caption,
        content_type, media_url, media_type, source_asset_key,
        site_id, campaign_id, planning_horizon_days, generation_status,
        category, content_hash
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id,
      `${title}${input.formats.length > 1 ? ` · ${fmt}` : ""}`.slice(0, 180),
      network,
      scheduledAt,
      autoPost ? "approved" : "pending",
      autoPost ? 1 : 0,
      caption,
      contentType,
      saved.url,
      input.mimeType,
      uploadId,
      null,
      null,
      null,
      "ready",
      category,
      contentHash
    );
    ids.push(id);
    inserted.push({ id, contentType, network, scheduledAt, autoPost, caption });
  }

  return {
    name: input.fileName,
    uploadId: saved.id,
    url: saved.url,
    mimeType: input.mimeType,
    bytes: input.bytes.length,
    title,
    scheduledPostIds: ids,
    scheduled: inserted
  };
}
