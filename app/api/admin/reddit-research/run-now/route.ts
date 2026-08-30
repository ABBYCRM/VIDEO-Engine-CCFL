import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runRedditMarketResearchOnce } from "@/lib/reddit-research/pipeline";

// Direct pipeline trigger — same pattern as Calendar's "Run autopilot"
// button (app/api/admin/campaigns/rearm-pending). This deliberately bypasses
// Claw's chat/AION tool loop: an operator clicking a dedicated "run this
// now" button is a direct, already-authorized action, not an open-ended
// conversational tool call, so there's no CONFIRM step to wait on — the
// result (published or not) is returned synchronously so the caller can
// show it immediately.
export async function POST() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runRedditMarketResearchOnce("manual");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { listRedditResearchRuns } = await import("@/lib/reddit-research/store");
  return NextResponse.json({ runs: listRedditResearchRuns(10) });
}
