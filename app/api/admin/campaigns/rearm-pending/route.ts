// Re-arm Calendar slots the autopilot should retry:
//   - pending_manual (Hedra audio / avatar missing)
//   - failed A2E jobs (Seedance out of time / masked "Request failed")
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { startCampaignAutopilotLoop, runCampaignAutopilotOnce } from "@/lib/campaign-autopilot";

export async function POST() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const pendingManual = db.prepare(`UPDATE scheduled_posts SET generation_status='pending',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE generation_status='pending_manual'`).run();
  const failedA2e = db.prepare(`
    UPDATE scheduled_posts
    SET generation_status='failed', updated_at=CURRENT_TIMESTAMP
    WHERE generation_status='failed'
      AND media_url IS NULL
      AND error LIKE 'A2E%'
  `).run();
  startCampaignAutopilotLoop();
  const tick = await runCampaignAutopilotOnce();
  return NextResponse.json({ ok: true, rearmed: pendingManual.changes, retryableA2e: failedA2e.changes, processed: tick.processed });
}
