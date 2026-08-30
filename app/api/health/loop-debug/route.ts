import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Debug readback: print every scheduled_post's id/title/scheduled_at/status
 *  with the campaign-autopilot filter math. Public, no auth — used to
 *  diagnose why slots stay 'pending' instead of being picked up by the
 *  20s loop. The loop's filter is `scheduled_at <= NOW + 24h AND
 *  media_url IS NULL AND status != 'published' AND generation_status='pending'`,
 *  so if a slot is `pending` but `eligible=false` then something is
 *  wrong with the slot's own state. */
export async function GET() {
  const now = Date.now();
  const horizon = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare(
    `SELECT id, title, content_type, scheduled_at, status, generation_status,
            media_url, media_type, source_asset_key, category, network, auto_post,
            video_job_id, upper_job_id, lower_job_id,
            campaign_id, created_at, error
     FROM scheduled_posts
     WHERE media_url IS NULL
       AND status!='published'
     ORDER BY scheduled_at ASC`
  ).all() as any[];
  const out = rows.map((r) => {
    const eligible =
      r.generation_status === "pending" &&
      r.video_job_id == null &&
      r.upper_job_id == null &&
      r.lower_job_id == null &&
      r.scheduled_at <= horizon &&
      r.campaign_id != null;
    return {
      id: r.id,
      title: r.title,
      content_type: r.content_type,
      category: r.category,
      network: r.network,
      status: r.status,
      generation_status: r.generation_status,
      auto_post: !!r.auto_post,
      scheduled_at: r.scheduled_at,
      horizon: horizon,
      minutes_until_scheduled: Math.round((new Date(r.scheduled_at).getTime() - now) / 60000),
      campaign_id: r.campaign_id ? "yes" : "no",
      has_video_job: !!r.video_job_id,
      has_upper_job: !!r.upper_job_id,
      has_lower_job: !!r.lower_job_id,
      media_url: r.media_url,
      media_type: r.media_type,
      source_asset_key: r.source_asset_key,
      error: r.error,
      eligible
    };
  });
  return NextResponse.json({
    now: new Date(now).toISOString(),
    horizon,
    total: rows.length,
    pending: out.filter((r) => r.generation_status === "pending").length,
    generating: out.filter((r) => r.generation_status === "generating").length,
    failed: out.filter((r) => r.generation_status === "failed").length,
    eligible: out.filter((r) => r.eligible).length,
    posts: out
  });
}
