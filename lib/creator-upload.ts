// Shared "take one pre-made video, persist it, schedule it" logic behind
// both /api/creator/upload (multipart form, browser upload) and Claw's
// creator_upload_video tool (a file already attached to the chat via
// lib/claw/store.ts's claw_files). Extracted so both callers write the
// exact same scheduled_posts rows instead of maintaining two copies.

import crypto from "node:crypto";
import { db } from "@/lib/db";
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

  const saved = await saveUploadedVideo({
    bytes: input.bytes,
    title,
    mimeType: input.mimeType,
    label: input.label || "Creator upload",
    id: uploadId
  });

  const ids: string[] = [];
  const inserted: CreatorUploadResult["scheduled"] = [];
  for (const fmt of input.formats) {
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO scheduled_posts(
        id, title, network, scheduled_at, status, auto_post, caption,
        content_type, media_url, media_type, source_asset_key,
        site_id, campaign_id, planning_horizon_days, generation_status,
        category
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id,
      `${title}${input.formats.length > 1 ? ` · ${fmt}` : ""}`.slice(0, 180),
      network,
      scheduledAt,
      autoPost ? "approved" : "pending",
      autoPost ? 1 : 0,
      caption,
      CONTENT_TYPE_BY_FORMAT[fmt],
      saved.url,
      input.mimeType,
      uploadId,
      null,
      null,
      null,
      "ready",
      category
    );
    ids.push(id);
    inserted.push({ id, contentType: CONTENT_TYPE_BY_FORMAT[fmt], network, scheduledAt, autoPost, caption });
  }

  return {
    name: input.fileName,
    uploadId,
    url: saved.url,
    mimeType: input.mimeType,
    bytes: input.bytes.length,
    title,
    scheduledPostIds: ids,
    scheduled: inserted
  };
}
