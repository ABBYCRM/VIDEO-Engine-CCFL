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
  // The scheduled_posts SQLite table has no video_provider / video_model
  // columns (those live on the campaigns table). The campaign-autopilot
  // SELECT in lib/campaign-autopilot.ts LEFT JOINs campaigns so it can
  // read those from c.video_provider / c.video_model; do the same here
  // so we surface the same effective provider/model the loop will use
  // when it picks up the slot.
  const rows = db.prepare(
    `SELECT sp.id, sp.title, sp.content_type, sp.scheduled_at, sp.status, sp.generation_status,
            sp.media_url, sp.media_type, sp.source_asset_key, sp.category, sp.network, sp.auto_post,
            sp.video_job_id, sp.upper_job_id, sp.lower_job_id,
            sp.campaign_id, sp.created_at, sp.error,
            c.video_provider as campaign_video_provider,
            c.video_model as campaign_video_model
     FROM scheduled_posts sp LEFT JOIN campaigns c ON c.id=sp.campaign_id
     WHERE sp.media_url IS NULL
       AND sp.status!='published'
     ORDER BY sp.scheduled_at ASC`
  ).all() as any[];
  const out = rows.map((r) => {
    const eligible =
      r.generation_status === "pending" &&
      r.video_job_id == null &&
      r.upper_job_id == null &&
      r.lower_job_id == null &&
      r.scheduled_at <= horizon;
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
      campaign_video_provider: r.campaign_video_provider || null,
      campaign_video_model: r.campaign_video_model || null,
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
