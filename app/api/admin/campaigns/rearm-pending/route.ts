// Admin: re-arm any 'pending_manual' slots in the campaign calendar so the
// autopilot picks them up and routes them through the new Hedra→A2E path.
// Useful after the autopilot policy changes.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { startCampaignAutopilotLoop } from "@/lib/campaign-autopilot";

export async function POST() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = db.prepare(`UPDATE scheduled_posts SET generation_status='pending',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE generation_status='pending_manual'`).run();
  startCampaignAutopilotLoop();
  return NextResponse.json({ ok: true, rearmed: result.changes });
}
