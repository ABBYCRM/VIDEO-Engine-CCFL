import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { saveUploadedVideo } from "@/lib/upper-videos";
import { db } from "@/lib/db";
import crypto from "node:crypto";
import { filesFromForm, BULK_UPLOAD_MAX_FILE_BYTES, BULK_UPLOAD_MAX_FILES, BULK_UPLOAD_MAX_TOTAL_BYTES } from "@/lib/bulk-upload";

export const runtime = "nodejs";

/**
 * POST /api/creator/upload
 *   multipart/form-data: file=<video> (or files=<video> repeated for a batch),
 *   title=<str>, label=<str>, formats=<"reel,story,post">
 *   Saves each video to the persistent library as a creator upload, then writes
 *   one scheduled_posts row per format the operator selected, per file. Each
 *   row is set to status=pending so the operator can review the schedule
 *   before the publisher auto-posts it.
 *
 * The "formats" param accepts a comma-separated list of:
 *   - "reel"   → instagram (post type, video/mp4, ready to publish as Reel)
 *   - "story"  → instagram (story — separate row so the publisher can fire a
 *                       story at the same scheduled_at with the same media)
 *   - "post"   → instagram (single image / video post, fallback network)
 *
 * Operator can pick all three at once. Each becomes its own scheduled_posts row
 * with content_type="creator-reel|creator-story|creator-post". When multiple
 * files are uploaded in one request, every file gets the same formats/
 * scheduledAt/network/autoPost/caption options — "upload these 10 clips,
 * schedule all of them as Reel+Story at 9am tomorrow" in one call.
 */
const CONTENT_TYPE_BY_FORMAT: Record<string, string> = {
  reel: "creator-reel",
  story: "creator-story",
  post: "creator-post"
};

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await req.formData();
    const files = filesFromForm(form);
    if (!files.length) return NextResponse.json({ error: "A video file is required" }, { status: 400 });
    if (files.length > BULK_UPLOAD_MAX_FILES) return NextResponse.json({ error: `A batch is limited to ${BULK_UPLOAD_MAX_FILES} files` }, { status: 400 });
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > BULK_UPLOAD_MAX_TOTAL_BYTES) return NextResponse.json({ error: `Batch total size ${(totalBytes / (1024 * 1024)).toFixed(0)}MB exceeds the ${(BULK_UPLOAD_MAX_TOTAL_BYTES / (1024 * 1024)).toFixed(0)}MB batch limit` }, { status: 400 });

    const labelBase = String(form.get("label") || "Creator upload").slice(0, 180);
    const titleBase = form.get("title") ? String(form.get("title")).slice(0, 180) : null;
    const formatsRaw = String(form.get("formats") || "reel,story,post");
    const formats = formatsRaw.split(",").map(s => s.trim().toLowerCase()).filter(s => ["reel", "story", "post"].includes(s));
    if (formats.length === 0) {
      return NextResponse.json({ error: "Pick at least one format (reel, story, or post)" }, { status: 400 });
    }
    const scheduledAt = String(form.get("scheduledAt") || "").trim() || new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const network = String(form.get("network") || "instagram").toLowerCase();
    const autoPost = String(form.get("autoPost") || "true").toLowerCase() !== "false";
    const caption = String(form.get("caption") || "").slice(0, 5000);
    const category = String(form.get("category") || "ugc").toLowerCase();
    const subject = String(form.get("subject") || "").slice(0, 200);

    const results: any[] = [];
    const failed: { name: string; error: string }[] = [];

    // Sequential, not Promise.all: bounds peak memory to one file's buffered
    // bytes at a time, same rationale as lib/bulk-upload.ts.
    for (const file of files) {
      try {
        if (!file.type.startsWith("video/")) throw new Error(`${file.name} is not a video`);
        if (file.size < 1 || file.size > BULK_UPLOAD_MAX_FILE_BYTES) throw new Error(`${file.name} must be between 1 byte and ${(BULK_UPLOAD_MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)}MB`);

        const title = (titleBase || file.name).slice(0, 180);
        const uploadId = `creator:${crypto.randomUUID()}`;
        const saved = await saveUploadedVideo({
          bytes: Buffer.from(await file.arrayBuffer()),
          title,
          mimeType: file.type,
          label: labelBase,
          id: uploadId
        });

        const ids: string[] = [];
        const inserted: any[] = [];
        for (const fmt of formats) {
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
            `${title}${formats.length > 1 ? ` · ${fmt}` : ""}`.slice(0, 180),
            network,
            scheduledAt,
            autoPost ? "approved" : "pending",
            autoPost ? 1 : 0,
            caption,
            CONTENT_TYPE_BY_FORMAT[fmt],
            saved.url,
            file.type,
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

        results.push({
          name: file.name,
          uploadId,
          url: saved.url,
          mimeType: file.type,
          bytes: file.size,
          title,
          scheduledPostIds: ids,
          scheduled: inserted
        });
      } catch (e) {
        failed.push({ name: file.name, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
      }
    }

    if (!results.length) return NextResponse.json({ error: failed[0]?.error || "Upload failed" }, { status: 400 });

    const first = results[0];
    return NextResponse.json({
      ok: true,
      // Back-compat top-level fields mirror the single-upload response shape
      // for existing callers that only ever sent one file.
      uploadId: first.uploadId,
      url: first.url,
      mimeType: first.mimeType,
      bytes: first.bytes,
      title: first.title,
      label: labelBase,
      formats,
      subject,
      category,
      scheduledAt,
      autoPost,
      network,
      caption,
      scheduledPostIds: first.scheduledPostIds,
      scheduled: first.scheduled,
      // Full batch detail.
      uploaded: results,
      failed
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
