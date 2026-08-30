import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runCampaignAutopilotOnce, startCampaignAutopilotLoop } from "@/lib/campaign-autopilot";

export const runtime = "nodejs";

// Synchronous trigger of the campaign-autopilot pipeline. Identical
// pattern to the Reddit + Site-IG run-now routes: an operator clicking
// a "Run now" button (or an admin API call) is a direct, already-
// authorized action, so there's no AION CONFIRM gate; the result
// (succeeded/skipped/failed) is returned synchronously. The loop
// itself is started here too so a fresh process whose `lib/db.ts`
// boot-time dynamic import path didn't load this loop yet still gets
// it running before we ask it to do work.
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  startCampaignAutopilotLoop();
  try {
    const body = await req.json().catch(() => ({}));
    const slotId = typeof body?.slotId === "string" ? body.slotId : undefined;
    const result = await runCampaignAutopilotOnce(slotId ? { slotId } : {});
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
