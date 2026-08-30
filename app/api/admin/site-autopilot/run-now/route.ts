import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runSiteAutopilotOnce } from "@/lib/site-autopilot/pipeline";

// Direct pipeline trigger — same pattern as the Reddit sub-agent's
// /api/admin/reddit-research/run-now and Calendar's "Run autopilot" button.
// Bypasses Claw's chat/AION tool loop on purpose: a click on a dedicated
// "run this now" button is a direct, already-authorized action.
export async function POST() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runSiteAutopilotOnce("manual");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { listSiteAutopilotRuns } = await import("@/lib/site-autopilot/store");
  return NextResponse.json({ runs: listSiteAutopilotRuns(10) });
}
