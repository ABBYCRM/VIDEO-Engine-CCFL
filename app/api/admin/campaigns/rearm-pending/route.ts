import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { startCampaignAutopilotLoop, runCampaignAutopilotOnce } from "@/lib/campaign-autopilot";
import { ensureSplitSurfaceColumns } from "@/lib/split-surface";
import "@/lib/calendar-assets";

ensureSplitSurfaceColumns();

export async function POST(req:Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const campaignId = body.campaignId ? String(body.campaignId) : "";
  const pendingManual = db.prepare(`UPDATE scheduled_posts SET generation_status='pending',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE generation_status='pending_manual'`).run();
  const failedA2e = db.prepare(`
    UPDATE scheduled_posts
    SET generation_status='failed', updated_at=CURRENT_TIMESTAMP
    WHERE generation_status='failed'
      AND media_url IS NULL
      AND error LIKE 'A2E%'
  `).run();
  let resetSplit = { changes: 0 };
  if (body.resetSplitScreen) {
    resetSplit = campaignId
      ? db.prepare(`
          UPDATE scheduled_posts
          SET generation_status='pending', media_url=NULL, media_type=NULL, video_job_id=NULL,
              upper_job_id=NULL, lower_job_id=NULL, error=NULL, source_asset_key=NULL, updated_at=CURRENT_TIMESTAMP
          WHERE campaign_id=? AND content_type='podcast' AND status!='published'
            AND (source_asset_key IS NULL OR source_asset_key NOT LIKE 'composition:%')
        `).run(campaignId)
      : db.prepare(`
          UPDATE scheduled_posts
          SET generation_status='pending', media_url=NULL, media_type=NULL, video_job_id=NULL,
              upper_job_id=NULL, lower_job_id=NULL, error=NULL, source_asset_key=NULL, updated_at=CURRENT_TIMESTAMP
          WHERE content_type='podcast' AND status!='published'
            AND (source_asset_key IS NULL OR source_asset_key NOT LIKE 'composition:%')
        `).run();
  }
  startCampaignAutopilotLoop();
  const tick = await runCampaignAutopilotOnce();
  return NextResponse.json({ ok: true, rearmed: pendingManual.changes, retryableA2e: failedA2e.changes, resetSplit: resetSplit.changes, processed: tick.processed });
}
