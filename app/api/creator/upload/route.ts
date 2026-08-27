import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { saveUploadedVideo } from "@/lib/upper-videos";
import { ensureAssetCalendarPost } from "@/lib/calendar-assets";
import { db } from "@/lib/db";
import crypto from "node:crypto";

export const runtime = "nodejs";

/**
 * POST /api/creator/upload
 *   multipart/form-data: file=<video>, title=<str>, label=<str>, formats=<"reel,story,post">
 *   Saves the video to the persistent library as a creator upload, then writes
 *   one scheduled_posts row per format the operator selected. Each row is set
 *   to status=pending so the operator can review the schedule before the
 *   publisher auto-posts it.
 *
 * The "formats" param accepts a comma-separated list of:
 *   - "reel"   → instagram (post type, video/mp4, ready to publish as Reel)
 *   - "story"  → instagram (story — separate row so the publisher can fire a
 *                       story at the same scheduled_at with the same media)
 *   - "post"   → instagram (single image / video post, fallback network)
 *
 * Operator can pick all three at once. Each becomes its own scheduled_posts row
 * with content_type="creator-reel|creator-story|creator-post".
 */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "A video file is required" }, { status: 400 });
    if (!file.type.startsWith("video/")) return NextResponse.json({ error: "Upload a video file" }, { status: 400 });
    if (file.size < 1 || file.size > 250 * 1024 * 1024) return NextResponse.json({ error: "Video must be between 1 byte and 250MB" }, { status: 400 });

    const title = String(form.get("title") || file.name).slice(0, 180);
    const label = String(form.get("label") || "Creator upload").slice(0, 180);
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

    // 1) Persist the video as a persistent library asset
    const uploadId = `creator:${crypto.randomUUID()}`;
    const saved = await saveUploadedVideo({
      bytes: Buffer.from(await file.arrayBuffer()),
      title,
      mimeType: file.type,
      label,
      id: uploadId
    });

    // 2) Insert one scheduled_posts row per format. Each has its own id so the
    //    publisher can fire them independently at the same scheduled_at.
    const contentTypeByFormat: Record<string, string> = {
      reel: "creator-reel",
      story: "creator-story",
      post: "creator-post"
    };
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
        contentTypeByFormat[fmt],
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
      inserted.push({ id, contentType: contentTypeByFormat[fmt], network, scheduledAt, autoPost, caption });
    }

    return NextResponse.json({
      ok: true,
      uploadId,
      url: saved.url,
      mimeType: file.type,
      bytes: file.size,
      title,
      label,
      formats,
      subject,
      category,
      scheduledAt,
      autoPost,
      network,
      caption,
      scheduledPostIds: ids,
      scheduled: inserted
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
